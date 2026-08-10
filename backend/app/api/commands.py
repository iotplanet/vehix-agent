"""Vehicle command + approval API endpoints.

POST /api/vehicles/{vin}/commands         — dispatch command
GET  /api/commands/{id}                   — query command status
POST /api/commands/approve/{id}          — approve/reject pending command
"""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.command import CommandRecord
from app.models.vehicle import Vehicle
from app.models.user import User
from app.agent.nodes.approver import approval_queue
from app.auth.dependencies import RequireOperator, RequireAdmin, OptionalUser

router = APIRouter(tags=["commands"])

COMMAND_SPEC = {
    "unlock_door":      {"risk": "low",     "desc": "远程解锁车门"},
    "start_hvac":       {"risk": "low",     "desc": "远程启动空调"},
    "charge_control":   {"risk": "low",     "desc": "充电控制"},
    "limit_power":      {"risk": "medium",  "desc": "限制车辆功率"},
    "clear_dtc":        {"risk": "medium",  "desc": "清除故障码"},
    "remote_shutdown":  {"risk": "critical","desc": "紧急远程断电"},
}
HIGH_RISK = {"limit_power", "remote_shutdown"}


def _publish_to_simulator(vin: str, command: str, params: dict):
    """Publish a command to the simulator via event_bus."""
    try:
        from app.simulator.event_bus import event_bus
        import asyncio
        asyncio.ensure_future(
            event_bus.publish(f"vehicles/{vin}/commands", {
                "vin": vin,
                "command": command,
                "params": params,
                "timestamp": datetime.utcnow().isoformat(),
            })
        )
    except Exception:
        pass  # Simulator may not be running


@router.post("/vehicles/{vin}/commands")
async def dispatch_command(
    vin: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireOperator),
):
    """Dispatch a remote command to a vehicle. Requires operator+ role."""
    command = body.get("command", "")
    spec = COMMAND_SPEC.get(command)
    if not spec:
        raise HTTPException(400, f"Unknown command: {command}. Valid: {list(COMMAND_SPEC)}")

    # Verify vehicle exists
    result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
    if result.scalar_one_or_none() is None:
        raise HTTPException(404, f"Vehicle not found: {vin}")

    params = {k: v for k, v in body.items() if k not in ("command", "vin")}

    is_high_risk = command in HIGH_RISK
    cmd_record = CommandRecord(
        vin=vin, command=command, params=json.dumps(params, ensure_ascii=False),
        risk_level=spec["risk"],
        status="pending_approval" if is_high_risk else "dispatched",
        operator=current_user.username,
    )
    db.add(cmd_record)
    await db.commit()
    await db.refresh(cmd_record)

    # Low-risk commands: publish to simulator immediately
    if not is_high_risk:
        _publish_to_simulator(vin, command, params)
        cmd_record.status = "dispatched"
        cmd_record.executed_at = datetime.utcnow()
        await db.commit()

    # Audit
    from app.services.audit import log_event
    await log_event("command.dispatch", operator=current_user.username,
                    role=current_user.role, resource=vin,
                    detail={"command": command, "risk": spec["risk"], "status": cmd_record.status})

    response = cmd_record.to_dict()
    response["description"] = spec["desc"]

    if is_high_risk:
        response["approval_required"] = True
        approval_id = await approval_queue.request()
        response["approval_id"] = approval_id
        # Store approval_id on the command record
        cmd_record.result = json.dumps({"approval_id": approval_id})
        await db.commit()

    return response


@router.get("/commands/{command_id}")
async def get_command_status(command_id: int, db: AsyncSession = Depends(get_db)):
    """Query command status."""
    result = await db.execute(select(CommandRecord).where(CommandRecord.id == command_id))
    cmd = result.scalar_one_or_none()
    if not cmd:
        raise HTTPException(404, f"Command not found: {command_id}")
    return cmd.to_dict()


@router.post("/commands/approve/{approval_id}")
async def approve_command(
    approval_id: str,
    decision: str = Query("approve", pattern="^(approve|reject)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireAdmin),
):
    """Approve or reject a pending command. Requires admin+ role."""
    approved = decision == "approve"

    # Find the command record with this approval_id
    result = await db.execute(
        select(CommandRecord).where(CommandRecord.result.contains(approval_id))
    )
    cmd = result.scalar_one_or_none()

    if cmd and approved:
        cmd.status = "dispatched"
        cmd.approved_at = datetime.utcnow()
        cmd.executed_at = datetime.utcnow()
        params = json.loads(cmd.params) if cmd.params else {}
        _publish_to_simulator(cmd.vin, cmd.command, params)
        await db.commit()
    elif cmd:
        cmd.status = "rejected"
        await db.commit()

    # Resolve the approval queue (for agent flow)
    approval_queue.resolve(approval_id, approved)

    # Audit
    from app.services.audit import log_event
    await log_event("command.approve", operator=current_user.username,
                    role=current_user.role, resource=cmd.vin if cmd else "",
                    detail={"decision": decision, "command": cmd.command if cmd else "", "dispatched": approved})

    return {
        "approval_id": approval_id,
        "decision": decision,
        "operator": current_user.username,
        "dispatched": approved and cmd is not None,
        "timestamp": datetime.utcnow().isoformat(),
    }
