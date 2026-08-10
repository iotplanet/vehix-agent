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
import uuid
from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from app.agent.graph import get_graph
from app.agent.state import VehixAgentState

router = APIRouter(tags=["agent"])


@router.post("/agent/run")
async def agent_run(request: Request):
    body = await request.json()
    message = body.get("message", "")
    thread_id = body.get("thread_id", str(uuid.uuid4())[:8])

    if not message:
        return StreamingResponse(_sse_error("No message provided"), media_type="text/event-stream")

    # Resolve user from JWT (optional)
    current_user = None
    try:
        from app.database import async_session
        from app.auth.jwt import decode_token
        from sqlalchemy import select
        from app.models.user import User
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            payload = decode_token(auth_header[7:])
            if payload and payload.get("type") == "access":
                async with async_session() as db:
                    result = await db.execute(select(User).where(User.id == int(payload.get("sub", 0))))
                    current_user = result.scalar_one_or_none()
    except Exception:
        pass

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
        try:
            username = current_user.username if current_user else None
            initial_state: VehixAgentState = {
                "messages": [HumanMessage(content=message)],
                "intent": "general", "vin": None,
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

            # Post-graph: tool calls, approval, final message
            if result:
                for tc in result.get("tool_results", []):
                    yield _sse("tool_call", {
                        "tool": tc.get("tool", "unknown"),
                        "args": tc.get("args", {}),
                        "result": tc.get("result", {}),
                    })
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

            yield _sse("done", {"run_id": thread_id})

        except Exception as e:
            yield _sse("error", {"message": str(e)})
            yield _sse("done", {"run_id": None})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


async def _run_graph(graph, state, config, token_queue, tool_queue):
    """Execute graph.astream() — push tool events to tool_queue, LLM tokens to token_queue."""
    result = dict(state)
    prev_tool_count = 0

    try:
        async for chunk in graph.astream(state, config):
            for node_name, node_output in chunk.items():
                ts = datetime.utcnow().isoformat()
                tool_queue.put_nowait({"type": "node_start", "data": {"node": node_name, "ts": ts}})
                tool_queue.put_nowait({"type": "node_end", "data": {"node": node_name, "ts": ts}})

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
