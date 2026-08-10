"""Command approval gate node.

Non-blocking design:
  1. Creates approval record + queue entry
  2. Returns immediately with approval_id in state
  3. Summarizer tells user "pending approval"
  4. POST /api/commands/approve/{id} triggers actual dispatch
"""

import asyncio
import uuid
from datetime import datetime

from app.agent.state import VehixAgentState


class ApprovalQueue:
    """In-process approval queue."""

    def __init__(self):
        self._pending: dict[str, asyncio.Future] = {}

    async def request(self) -> str:
        """Create a new approval request. Returns approval_id."""
        approval_id = str(uuid.uuid4())[:8]
        self._pending[approval_id] = asyncio.get_event_loop().create_future()
        return approval_id

    async def wait(self, approval_id: str, timeout_s: int = 300) -> bool:
        """Wait for approval decision. Returns True if approved."""
        future = self._pending.get(approval_id)
        if not future:
            return False
        try:
            return await asyncio.wait_for(future, timeout=timeout_s)
        except asyncio.TimeoutError:
            self._pending.pop(approval_id, None)
            return False

    def resolve(self, approval_id: str, approved: bool):
        """Resolve an approval request (called from API endpoint)."""
        future = self._pending.pop(approval_id, None)
        if future and not future.done():
            future.set_result(approved)


# Singleton
approval_queue = ApprovalQueue()


class CommandApprover:
    """Non-blocking approval gate.

    Creates the approval record, stores approval_id in state,
    and returns immediately. The actual dispatch happens when
    the user approves via the API endpoint.
    """

    async def __call__(self, state: VehixAgentState) -> dict:
        """Create approval request, return immediately."""
        ctx = state.get("approval_context", {})
        if not ctx:
            return {
                "requires_approval": False,
                "error": "审批上下文缺失",
                "approval_context": None,
            }

        # Create approval queue entry
        approval_id = await approval_queue.request()

        # Persist to DB
        from app.database import async_session
        from sqlalchemy import select
        from app.models.command import CommandRecord

        command_id = None
        result = ctx.get("result", {})
        if isinstance(result, dict):
            command_id = result.get("command_id")

        if command_id:
            import json
            async with async_session() as db:
                cmd_result = await db.execute(
                    select(CommandRecord).where(CommandRecord.id == command_id))
                cmd = cmd_result.scalar_one_or_none()
                if cmd:
                    cmd.status = "pending_approval"
                    # Persist approval_id so API can find and dispatch on approval
                    cmd.result = json.dumps({"approval_id": approval_id})
                    await db.commit()

        # Use actual risk level from the command result
        risk_level = result.get("risk_level", "medium") if isinstance(result, dict) else "medium"
        ctx["approval_id"] = approval_id
        ctx["risk_level"] = risk_level
        ctx["operator"] = state.get("user_id", "unknown")
        ctx["timestamp"] = datetime.utcnow().isoformat()

        # Return immediately — does NOT block
        return {
            "requires_approval": True,
            "approval_context": ctx,
        }
