"""MCP tool registry smoke tests."""

import pytest

# Ensure tools are registered
import app.mcp.vehicle_mcp  # noqa: F401
import app.mcp.diagnostics_mcp  # noqa: F401
import app.mcp.fleet_mcp  # noqa: F401
import app.mcp.ota_mcp  # noqa: F401
import app.mcp.jtt808_mcp  # noqa: F401

from app.mcp.server import tool_registry
from app.services.rust_bridge import HIGH_RISK_COMMANDS


def test_tool_registry_has_core_tools():
    names = {t["name"] for t in tool_registry.list_tools()}
    expected = {
        "query_vehicle_twin",
        "dispatch_vehicle_command",
        "read_dtc",
        "clear_dtc",
        "create_workorder",
        "create_ota_task",
        "pause_ota_task",
        "resume_ota_task",
    }
    assert expected.issubset(names)


def test_clear_dtc_in_approval_set():
    assert "clear_dtc" in HIGH_RISK_COMMANDS
