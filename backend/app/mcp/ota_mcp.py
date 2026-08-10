"""OTA MCP tools — gray release with batch computation + progress simulation."""

import json
import random
from datetime import datetime

from sqlalchemy import select

from app.database import async_session
from app.mcp.server import tool_registry
from app.models.ota_task import OTATask
from app.models.vehicle import Vehicle

STAGES = ["notified", "downloading", "installing", "completed"]


def _compute_batches(vins: list[str], strategy: str) -> list[dict]:
    """Compute a batch plan for the given strategy."""
    total = len(vins)
    if total == 0:
        return []

    if strategy == "gray_release":
        b1 = max(1, total // 5)           # 20% canary
        b2 = max(1, total // 3)           # ~33% extended
        b3 = total - b1 - b2              # remaining
        batches = [{"batch_no": 1, "size": b1, "status": "active"}]
        if b2 > 0:
            batches.append({"batch_no": 2, "size": b2, "status": "pending"})
        if b3 > 0:
            batches.append({"batch_no": 3, "size": max(0, b3), "status": "pending"})
        return batches

    if strategy == "batch":
        batch_size = max(1, total // 3)
        batches = []
        remaining = total
        for i in range(3):
            sz = min(batch_size, remaining)
            if sz <= 0:
                break
            batches.append({"batch_no": i + 1, "size": sz, "status": "active" if i == 0 else "pending"})
            remaining -= sz
        return batches

    # full
    return [{"batch_no": 1, "size": total, "status": "active"}]


async def _advance_ota_progress():
    """Advance one vehicle in each active OTA task. Called periodically from main.py."""
    async with async_session() as db:
        result = await db.execute(
            select(OTATask).where(OTATask.status.in_(["created", "in_progress"]))
        )
        tasks = result.scalars().all()

        for task in tasks:
            if task.status == "created":
                task.status = "in_progress"
                task.current_batch = 1

            vins = json.loads(task.target_vins) if task.target_vins else []
            completed = json.loads(task.completed_vins) if task.completed_vins else []
            vprog = json.loads(task.vehicle_progress) if task.vehicle_progress else {}
            batches = json.loads(task.batch_plan) if task.batch_plan else []

            # Find current batch's vins that are still pending
            active_batch = task.current_batch
            batch_start = sum(b["size"] for b in batches if b["batch_no"] < active_batch)
            batch_end = batch_start + next((b["size"] for b in batches if b["batch_no"] == active_batch), 0)
            batch_vins = vins[batch_start:batch_end]

            pending = [v for v in batch_vins if v not in completed]
            if not pending:
                # Current batch done → advance to next batch
                for b in batches:
                    if b["batch_no"] == active_batch:
                        b["status"] = "completed"
                next_batch = active_batch + 1
                has_next = any(b["batch_no"] == next_batch for b in batches)
                if has_next:
                    for b in batches:
                        if b["batch_no"] == next_batch:
                            b["status"] = "active"
                    task.current_batch = next_batch
                    task.batch_plan = json.dumps(batches, ensure_ascii=False)
                    await db.commit()
                else:
                    task.status = "completed"
                    task.completed_at = datetime.utcnow()
                    task.progress_percent = 100.0
                    task.batch_plan = json.dumps(batches, ensure_ascii=False)
                    await db.commit()
                continue

            # Advance one random vehicle
            vin = random.choice(pending)
            current_stage_idx = STAGES.index(vprog.get(vin, "notified"))
            if current_stage_idx < len(STAGES) - 1:
                vprog[vin] = STAGES[current_stage_idx + 1]
            else:
                completed.append(vin)
                vprog[vin] = "completed"

            task.vehicle_progress = json.dumps(vprog, ensure_ascii=False)
            task.completed_vins = json.dumps(completed, ensure_ascii=False)
            task.progress_percent = round(len(completed) / len(vins) * 100, 1) if vins else 0
            task.batch_plan = json.dumps(batches, ensure_ascii=False)

            await db.commit()


@tool_registry.tool(
    name="create_ota_task",
    description="创建OTA升级任务。支持灰度发布(gray_release)、分批(batch)、全量(full)策略。自动计算批次计划并开始推送",
)
async def create_ota_task(
    target_vins: str,
    software_version: str,
    strategy: str = "gray_release",
    name: str = "",
) -> dict:
    try:
        vins = json.loads(target_vins) if isinstance(target_vins, str) else target_vins
    except json.JSONDecodeError:
        return {"error": f"target_vins 格式错误: {target_vins}"}

    if strategy not in ("gray_release", "batch", "full"):
        return {"error": f"无效策略: {strategy}，支持: gray_release/batch/full"}

    async with async_session() as db:
        result = await db.execute(select(Vehicle.vin).where(Vehicle.vin.in_(vins)))
        valid_vins = [r[0] for r in result.all()]
        if len(valid_vins) == 0:
            return {"error": "没有有效的目标车辆"}

        batches = _compute_batches(valid_vins, strategy)
        task = OTATask(
            name=name or f"OTA {software_version}",
            software_version=software_version,
            strategy=strategy,
            status="created",
            target_vins=json.dumps(valid_vins),
            completed_vins="[]",
            batch_plan=json.dumps(batches, ensure_ascii=False),
            vehicle_progress="{}",
            current_batch=0,
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)

        data = task.to_dict()
        data["message"] = (
            f"OTA 任务已创建。" +
            (f"灰度发布：首批 {batches[0]['size']} 台 → 观察 → 第2批 {batches[1]['size']} 台 → 全量 {batches[2]['size']} 台"
             if strategy == "gray_release" and len(batches) >= 3 else
             f"分批发布：共 {len(batches)} 批，首批 {batches[0]['size']} 台"
             if strategy == "batch" else
             f"全量发布：{batches[0]['size']} 台同时升级")
        )
        return data


@tool_registry.tool(
    name="track_ota_task",
    description="查询OTA任务的执行进度和状态，包含每台车的升级阶段",
)
async def track_ota_task(task_id: int) -> dict:
    async with async_session() as db:
        result = await db.execute(select(OTATask).where(OTATask.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return {"error": f"未找到OTA任务: {task_id}"}
        return task.to_dict()


@tool_registry.tool(
    name="rollback_ota",
    description="回滚OTA升级任务",
)
async def rollback_ota(task_id: int) -> dict:
    async with async_session() as db:
        result = await db.execute(select(OTATask).where(OTATask.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return {"error": f"未找到OTA任务: {task_id}"}
        task.status = "rolled_back"
        task.completed_at = datetime.utcnow()
        await db.commit()
        return {"task_id": task_id, "status": "rolled_back", "message": f"OTA任务 {task_id} 已回滚"}
