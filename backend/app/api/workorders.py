"""Work order REST API.

GET  /api/workorders              — list (newest first)
GET  /api/workorders/{id}         — detail
PATCH /api/workorders/{id}        — update status / assignment
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.auth.dependencies import RequireOperator, RequireViewer
from app.database import get_db
from app.models.user import User
from app.models.workorder import WorkOrder

router = APIRouter(tags=["workorders"])

VALID_STATUSES = ("pending", "assigned", "in_progress", "completed", "cancelled")
TRANSITIONS = {
    "pending": {"assigned", "in_progress", "cancelled"},
    "assigned": {"in_progress", "cancelled"},
    "in_progress": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}


class WorkOrderUpdateRequest(BaseModel):
    status: str | None = None
    assigned_to: str | None = Field(default=None, max_length=50)
    station: str | None = Field(default=None, max_length=100)


@router.get("/workorders")
async def list_workorders(
    status: str | None = Query(None),
    vin: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db=Depends(get_db),
    _user: User = Depends(RequireViewer),
):
    """List work orders, newest first."""
    query = select(WorkOrder).order_by(WorkOrder.id.desc()).limit(limit)
    if status:
        query = query.where(WorkOrder.status == status)
    if vin:
        query = query.where(WorkOrder.vin == vin)

    result = await db.execute(query)
    items = [w.to_dict() for w in result.scalars().all()]
    return {"total": len(items), "workorders": items}


@router.get("/workorders/{workorder_id}")
async def get_workorder(
    workorder_id: int,
    db=Depends(get_db),
    _user: User = Depends(RequireViewer),
):
    result = await db.execute(select(WorkOrder).where(WorkOrder.id == workorder_id))
    wo = result.scalar_one_or_none()
    if not wo:
        raise HTTPException(404, f"未找到工单: {workorder_id}")
    return wo.to_dict()


@router.patch("/workorders/{workorder_id}")
async def update_workorder(
    workorder_id: int,
    body: WorkOrderUpdateRequest,
    db=Depends(get_db),
    current_user: User = Depends(RequireOperator),
):
    """Update work order status / assignment. Requires operator+."""
    result = await db.execute(select(WorkOrder).where(WorkOrder.id == workorder_id))
    wo = result.scalar_one_or_none()
    if not wo:
        raise HTTPException(404, f"未找到工单: {workorder_id}")

    if body.status is not None:
        if body.status not in VALID_STATUSES:
            raise HTTPException(400, f"无效状态: {body.status}，支持: {', '.join(VALID_STATUSES)}")
        allowed = TRANSITIONS.get(wo.status, set())
        if body.status != wo.status and body.status not in allowed:
            raise HTTPException(
                400,
                f"无法从 {wo.status} 转到 {body.status}，允许: {', '.join(sorted(allowed)) or '无'}",
            )
        wo.status = body.status
        if body.status == "assigned" and not wo.assigned_at:
            wo.assigned_at = datetime.utcnow()
            if not wo.assigned_to:
                wo.assigned_to = current_user.username
        if body.status == "completed":
            wo.completed_at = datetime.utcnow()

    if body.assigned_to is not None:
        wo.assigned_to = body.assigned_to
        if wo.status == "pending":
            wo.status = "assigned"
            wo.assigned_at = datetime.utcnow()

    if body.station is not None:
        wo.station = body.station

    await db.commit()
    await db.refresh(wo)
    return wo.to_dict()
