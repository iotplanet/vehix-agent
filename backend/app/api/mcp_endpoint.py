"""Minimal MCP SSE endpoint — exposes ToolRegistry to external MCP clients.

GET  /mcp/sse          — SSE connection endpoint
POST /mcp/messages     — JSON-RPC message endpoint
"""

import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse, JSONResponse

from app.mcp.server import tool_registry

router = APIRouter(tags=["mcp"])

MCP_METHODS = {
    "tools/list": "list_tools",
    "tools/call": "call_tool",
}


@router.get("/mcp/sse")
async def mcp_sse():
    """MCP SSE endpoint — establishes streaming connection."""
    async def stream():
        yield f"event: endpoint\ndata: /mcp/messages\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/mcp/messages")
async def mcp_messages(request: Request):
    """MCP JSON-RPC message endpoint."""
    body = await request.json()
    method = body.get("method", "")
    req_id = body.get("id")

    if method == "tools/list":
        tools = tool_registry.list_tools()
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": tools},
        })

    if method == "tools/call":
        params = body.get("params", {})
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})
        result = await tool_registry.call(tool_name, **arguments)
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]},
        })

    return JSONResponse({
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": -32601, "message": f"Method not found: {method}"},
    }, status_code=404)
