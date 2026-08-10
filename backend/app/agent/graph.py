"""LangGraph state graph builder.

Topology:
  router → (conditional) → planner / summarizer
  planner → executor
  executor → (conditional) → approver / executor(loop) / summarizer
  approver → summarizer (non-blocking: creates approval, returns immediately)
  summarizer → END
"""

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from app.agent.state import VehixAgentState
from app.agent.nodes.intent_router import IntentRouter
from app.agent.nodes.planner import TaskPlanner
from app.agent.nodes.executor import ToolExecutor
from app.agent.nodes.approver import CommandApprover
from app.agent.nodes.summarizer import ResponseSummarizer


def route_by_intent(state: VehixAgentState) -> str:
    """Route to planner or summarizer based on intent."""
    intent = state.get("intent", "general")
    if intent == "general":
        return "summarizer"
    return "planner"


def route_after_executor(state: VehixAgentState) -> str:
    """Decide next step after tool execution.

    Priority:
      1. requires_approval → approver
      2. more tools to run  → executor (loop)
      3. all done           → summarizer
    """
    if state.get("requires_approval"):
        return "approver"

    tool_calls = state.get("tool_calls", [])
    results = state.get("tool_results", [])

    if len(results) < len(tool_calls):
        return "executor"

    return "summarizer"


def build_vehix_graph() -> StateGraph:
    """Build the Vehix Agent LangGraph state graph."""
    graph = StateGraph(VehixAgentState)

    # ── Nodes ──
    graph.add_node("router", IntentRouter())
    graph.add_node("planner", TaskPlanner())
    graph.add_node("executor", ToolExecutor())
    graph.add_node("approver", CommandApprover())
    graph.add_node("summarizer", ResponseSummarizer())

    # ── Edges ──
    graph.set_entry_point("router")

    graph.add_conditional_edges("router", route_by_intent, {
        "planner": "planner",
        "summarizer": "summarizer",
    })

    graph.add_edge("planner", "executor")

    graph.add_conditional_edges("executor", route_after_executor, {
        "approver": "approver",
        "executor": "executor",
        "summarizer": "summarizer",
    })

    # Non-blocking approver: creates approval → summarizer → user sees "pending"
    graph.add_edge("approver", "summarizer")

    graph.add_edge("summarizer", END)

    return graph.compile(checkpointer=MemorySaver())


# Module-level singleton — compiled once at import time
vehix_graph = build_vehix_graph()


def get_graph():
    """Return the compiled agent graph."""
    return vehix_graph
