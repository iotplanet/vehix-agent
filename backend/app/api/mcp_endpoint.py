"""Minimal MCP SSE endpoint — exposes ToolRegistry to external MCP clients.

Disabled by default. Enable with VEHIX_MCP_HTTP_ENABLED=true.
When enabled, endpoints require authenticated admin+.

GET  /mcp/sse          — SSE connection endpoint
POST /mcp/messages     — JSON-RPC message endpoint
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse, JSONResponse

from app.auth.dependencies import RequireAdmin
from app.config import settings
from app.mcp.server import tool_registry
from app.models.user import User

router = APIRouter(tags=["mcp"])


def _ensure_mcp_enabled():
    if not settings.mcp_http_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MCP HTTP 端点未启用。设置 VEHIX_MCP_HTTP_ENABLED=true 后重启。",
        )


@router.get("/mcp/sse")
async def mcp_sse(_user: User = Depends(RequireAdmin)):
    """MCP SSE endpoint — establishes streaming connection."""
    _ensure_mcp_enabled()

    async def stream():
        yield f"event: endpoint\ndata: /mcp/messages\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/mcp/messages")
async def mcp_messages(request: Request, _user: User = Depends(RequireAdmin)):
    """MCP JSON-RPC message endpoint."""
    _ensure_mcp_enabled()

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
