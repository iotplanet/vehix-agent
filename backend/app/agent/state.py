"""VehixAgentState — the central state TypedDict for the LangGraph.

Every node reads and writes this state. LangGraph's add_messages reducer
automatically appends to the messages list.
"""

from typing import Annotated, Literal, Optional

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class VehixAgentState(TypedDict):
    """State flowing through the agent graph."""

    # Conversation
    messages: Annotated[list[BaseMessage], add_messages]

    # Intent
    intent: Literal[
        "vehicle_query",
        "fault_diagnosis",
        "command_dispatch",
        "ota_management",
        "predictive_maintain",
        "fleet_stats",
        # JT/T 808
        "jtt808_track",
        "jtt808_driver",
        "jtt1078_video",
        "general",
    ]

    # Context
    vin: Optional[str]
    user_id: Optional[str]
    run_id: Optional[str]

    # Tool execution
    tool_calls: list[dict]
    tool_results: list[dict]

    # Approval gate
    requires_approval: bool
    approval_context: Optional[dict]

    # Output
    final_response: Optional[str]
    error: Optional[str]
