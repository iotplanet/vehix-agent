"""OTA task management REST API.

GET  /api/ota/tasks                — list tasks (newest first)
POST /api/ota/tasks                — create task (empty target_vins → all vehicles)
GET  /api/ota/tasks/{task_id}      — task detail (batch plan + per-vehicle stages)
POST /api/ota/tasks/{task_id}/rollback — rollback an active task

Creation/batch/rollback logic is shared with the MCP tools in
app/mcp/ota_mcp.py (the tool decorator returns the original function,
so it can be called directly from here).
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.auth.dependencies import RequireOperator, RequireViewer
from app.database import get_db
from app.models.ota_task import OTATask
from app.models.user import User
from app.models.vehicle import Vehicle

router = APIRouter(tags=["ota"])

VALID_STRATEGIES = ("gray_release", "batch", "full")


class OTACreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    software_version: str = Field(min_length=1, max_length=50)
    strategy: str = "gray_release"
    target_vins: list[str] = []


@router.get("/ota/tasks")
async def list_ota_tasks(
    db=Depends(get_db),
    _user: User = Depends(RequireViewer),
):
    """List all OTA tasks, newest first."""
    result = await db.execute(select(OTATask).order_by(OTATask.id.desc()))
    tasks = [t.to_dict() for t in result.scalars().all()]
    return {"total": len(tasks), "tasks": tasks}


@router.post("/ota/tasks")
async def create_ota_task(
    body: OTACreateRequest,
    db=Depends(get_db),
    current_user: User = Depends(RequireOperator),
):
    """Create an OTA task. Empty target_vins means all vehicles."""
    if body.strategy not in VALID_STRATEGIES:
        raise HTTPException(400, f"无效策略: {body.strategy}，支持: {', '.join(VALID_STRATEGIES)}")

    vins = [v.strip() for v in body.target_vins if v.strip()]
    if not vins:
        # 留空 → 全量目标
        result = await db.execute(select(Vehicle.vin))
        vins = [row[0] for row in result.all()]

    from app.mcp.ota_mcp import create_ota_task as _mcp_create
    data = await _mcp_create(
        target_vins=json.dumps(vins, ensure_ascii=False),
        software_version=body.software_version,
        strategy=body.strategy,
        name=body.name,
    )
    if isinstance(data, dict) and data.get("error"):
        raise HTTPException(400, data["error"])
    return data


@router.get("/ota/tasks/{task_id}")
async def get_ota_task(
    task_id: int,
    _user: User = Depends(RequireViewer),
):
    """Get one OTA task with batch plan and per-vehicle stages."""
    from app.mcp.ota_mcp import track_ota_task
    data = await track_ota_task(task_id)
    if isinstance(data, dict) and data.get("error"):
        raise HTTPException(404, data["error"])
    return data


@router.post("/ota/tasks/{task_id}/rollback")
async def rollback_ota_task(
    task_id: int,
    db=Depends(get_db),
    current_user: User = Depends(RequireOperator),
):
    """Rollback an active or paused OTA task."""
    result = await db.execute(select(OTATask).where(OTATask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, f"未找到OTA任务: {task_id}")
    if task.status not in ("created", "in_progress", "paused"):
        raise HTTPException(400, f"任务状态为 {task.status}，无法回滚")

    from app.mcp.ota_mcp import rollback_ota
    data = await rollback_ota(task_id)
    if isinstance(data, dict) and data.get("error"):
        raise HTTPException(400, data["error"])
    return data


@router.post("/ota/tasks/{task_id}/pause")
async def pause_ota_task(
    task_id: int,
    _user: User = Depends(RequireOperator),
):
    """Pause an active OTA task."""
    from app.mcp.ota_mcp import pause_ota_task as _mcp_pause
    data = await _mcp_pause(task_id)
    if isinstance(data, dict) and data.get("error"):
        raise HTTPException(400, data["error"])
    return data


@router.post("/ota/tasks/{task_id}/resume")
async def resume_ota_task(
    task_id: int,
    _user: User = Depends(RequireOperator),
):
    """Resume a paused OTA task."""
    from app.mcp.ota_mcp import resume_ota_task as _mcp_resume
    data = await _mcp_resume(task_id)
    if isinstance(data, dict) and data.get("error"):
        raise HTTPException(400, data["error"])
    return data
