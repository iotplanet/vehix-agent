"""MCP (Model Context Protocol) tool layer.

Tools are registered on a shared ToolRegistry callable by the LangGraph
executor. Each *_mcp.py module registers its tools at import time.

For production, high-security tools (command dispatch, DTC parsing,
OTA verification) delegate to Rust services under rust-services/.
"""

# Import all MCP tool modules so @tool_registry.tool() decorators fire
from app.mcp import vehicle_mcp       # noqa: F401
from app.mcp import diagnostics_mcp   # noqa: F401
from app.mcp import ota_mcp           # noqa: F401
from app.mcp import fleet_mcp         # noqa: F401
from app.mcp import jtt808_mcp        # noqa: F401 — JT/T 808 bridge
