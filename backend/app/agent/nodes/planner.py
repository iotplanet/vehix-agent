"""Task planning node.

Given the classified intent, creates an ordered execution plan
of MCP tool calls. Falls back to deterministic plan templates.
"""

from app.agent.state import VehixAgentState

# Deterministic plan templates per intent
INTENT_PLANS: dict[str, list[dict]] = {
    "vehicle_query": [
        {"tool": "query_vehicle_twin", "args_from": "vin"},
    ],
    "fault_diagnosis": [
        {"tool": "read_dtc", "args": {"status_mask": 0x09}},
        {"tool": "read_dtc_snapshot", "args_from_dtc": True},
        {"tool": "query_vehicle_twin", "args_from": "vin"},
        {"tool": "query_telemetry_history", "args": {"metric": "max_cell_temp", "hours": 24}},
        {"tool": "create_workorder", "args": {"priority": "medium"}},
    ],
    "command_dispatch": [
        {"tool": "dispatch_vehicle_command", "args_from": "vin"},
    ],
    "fleet_stats": [
        {"tool": "query_fleet_stats"},
        {"tool": "query_fleet"},
    ],
    "ota_management": [
        {"tool": "query_fleet_by_condition"},
        {"tool": "create_ota_task", "args_from": "context"},
    ],
    "predictive_maintain": [
        {"tool": "query_fleet_by_condition", "args": {"soh_lt": 92}},
        {"tool": "query_vehicle_twin", "args_from": "vin"},
        {"tool": "query_telemetry_history", "args": {"metric": "soh", "hours": 720}},
        {"tool": "query_telemetry_history", "args": {"metric": "max_cell_temp", "hours": 168}},
    ],
    # ── JT/T 808 commercial vehicle intents ─────────────────────
    "jtt808_track": [
        {"tool": "query_jtt808_track", "args": {"hours": 24}},
    ],
    "jtt808_driver": [
        {"tool": "query_jtt808_driver", "args_from": "vin"},
    ],
    "jtt1078_video": [
        {"tool": "query_jtt1078_stream", "args": {"channel": 1}},
    ],
    "general": [],
}


class TaskPlanner:
    """Creates an execution plan from the classified intent.

    With LLM available, generates a dynamic plan based on the user's
    specific question. Falls back to pre-built templates otherwise.
    """

    async def __call__(self, state: VehixAgentState) -> dict:
        """Generate execution plan for the given intent."""
        intent = state.get("intent", "general")
        plan = INTENT_PLANS.get(intent, [])

        # Resolve VIN from plate_no if needed
        vin = state.get("vin")
        if not vin and plan:
            # Try to extract VIN from messages
            from app.agent.nodes.intent_router import extract_plate
            user_msg = ""
            for m in reversed(state.get("messages", [])):
                if hasattr(m, "type") and m.type == "human":
                    user_msg = str(m.content)
                    break

            plate = extract_plate(user_msg)
            if plate:
                # Will be resolved to VIN during execution
                vin = None  # executor resolves plate → VIN

        return {
            "tool_calls": plan,
            "vin": vin,
            "requires_approval": False,
        }
