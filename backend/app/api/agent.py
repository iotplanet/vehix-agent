"""Agent interaction API — SSE streaming with LLM token output.

POST /api/agent/run → SSE stream:
  node_start/node_end — graph node transitions
  tool_call — tool execution results (direct emit, not via token_queue)
  token — LLM text tokens (from summarizer.llm_stream)
  approval — pending approval
  message — final response (rendered Markdown)
  error / done
"""

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from app.agent.graph import get_graph
from app.agent.state import VehixAgentState
from app.auth.dependencies import RequireViewer
from app.models.user import User

router = APIRouter(tags=["agent"])

logger = logging.getLogger(__name__)


@router.post("/agent/run")
async def agent_run(
    request: Request,
    current_user: User = Depends(RequireViewer),
):
    body = await request.json()
    message = body.get("message", "")
    thread_id = body.get("thread_id") or str(uuid.uuid4())[:8]

    if not message:
        return StreamingResponse(_sse_error("No message provided"), media_type="text/event-stream")

    graph = get_graph()
    llm_token_queue: asyncio.Queue[str] = asyncio.Queue()
    tool_event_queue: asyncio.Queue[dict] = asyncio.Queue()

    config: RunnableConfig = {
        "configurable": {
            "thread_id": thread_id,
            "token_queue": llm_token_queue,       # LLM text tokens only
            "tool_queue": tool_event_queue,        # Tool call events
        },
        "recursion_limit": 50,
    }

    async def event_stream():
        start_ts = time.perf_counter()
        first_token_at: float | None = None
        try:
            username = current_user.username

            # ── Carry forward context from previous turn ─────────
            prev_vin = None
            try:
                prev_state = await graph.aget_state(config)
                if prev_state and prev_state.values:
                    prev_vin = prev_state.values.get("vin")
            except Exception:
                pass

            initial_state: VehixAgentState = {
                "messages": [HumanMessage(content=message)],
                "intent": "general", "vin": prev_vin,  # carry VIN from previous turn
                "user_id": username, "run_id": str(uuid.uuid4())[:8],
                "tool_calls": [], "tool_results": [],
                "requires_approval": False, "approval_context": None,
                "final_response": None, "error": None,
            }

            graph_task = asyncio.create_task(
                _run_graph(graph, initial_state, config, llm_token_queue, tool_event_queue)
            )

            # Concurrent: drain LLM tokens + tool events while graph runs
            while not graph_task.done():
                # LLM text tokens
                try:
                    text = await asyncio.wait_for(llm_token_queue.get(), timeout=0.05)
                    if first_token_at is None:
                        first_token_at = time.perf_counter()
                        logger.info("agent first token after %.2fs (thread=%s)",
                                    first_token_at - start_ts, thread_id)
                    yield _sse("token", {"text": text})
                    continue
                except asyncio.TimeoutError:
                    pass
                # Tool call events
                try:
                    ev = await asyncio.wait_for(tool_event_queue.get(), timeout=0.05)
                    yield _sse(ev["type"], ev["data"])
                except asyncio.TimeoutError:
                    pass

            result = await graph_task
            logger.info("agent graph total %.2fs (thread=%s)",
                        time.perf_counter() - start_ts, thread_id)

            # Post-graph: approval, final message (tool calls already streamed during run)
            if result:
                if result.get("requires_approval"):
                    ctx = result.get("approval_context", {})
                    if ctx:
                        yield _sse("approval", {
                            "approval_id": ctx.get("approval_id", ""),
                            "vin": ctx.get("vin", ""),
                            "command": ctx.get("command", ""),
                            "params": ctx.get("params", {}),
                            "risk_level": ctx.get("risk_level", "unknown"),
                            "operator": ctx.get("operator", ""),
                        })
                if result.get("error"):
                    yield _sse("error", {"message": result["error"]})
                final = result.get("final_response", "处理完成")
                yield _sse("message", {"role": "assistant", "content": final})

            yield _sse("done", {"run_id": thread_id, "thread_id": thread_id})

        except Exception as e:
            yield _sse("error", {"message": str(e)})
            yield _sse("done", {"run_id": None, "thread_id": thread_id})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


async def _run_graph(graph, state, config, token_queue, tool_queue):
    """Execute graph.astream() — push tool events to tool_queue, LLM tokens to token_queue."""
    result = dict(state)
    prev_tool_count = 0
    # LangGraph yields a chunk after each node finishes, so the gap between
    # consecutive yields ≈ that node's duration (first node includes startup).
    prev_ts = time.perf_counter()

    try:
        async for chunk in graph.astream(state, config):
            for node_name, node_output in chunk.items():
                now = time.perf_counter()
                duration_ms = round((now - prev_ts) * 1000, 1)
                prev_ts = now
                ts = datetime.utcnow().isoformat()
                tool_queue.put_nowait({"type": "node_start", "data": {"node": node_name, "ts": ts}})
                tool_queue.put_nowait({"type": "node_end", "data": {"node": node_name, "ts": ts, "duration_ms": duration_ms}})

                # Tool results → tool_queue (NOT token_queue!)
                results = node_output.get("tool_results", [])
                for i in range(prev_tool_count, len(results)):
                    r = results[i]
                    tool_queue.put_nowait({"type": "tool_call", "data": {
                        "tool": r.get("tool", "unknown"),
                        "args": r.get("args", {}),
                        "result": r.get("result", {}),
                    }})
                prev_tool_count = len(results)

                # Accumulate state
                for key in ("tool_results", "tool_calls", "final_response", "error",
                            "requires_approval", "approval_context", "intent", "vin"):
                    if key in node_output:
                        result[key] = node_output[key]

        return result
    except Exception as e:
        tool_queue.put_nowait({"type": "error", "data": {"message": str(e)}})
        return result


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _sse_error(message: str):
    yield _sse("error", {"message": message})
    yield _sse("done", {"run_id": None})
