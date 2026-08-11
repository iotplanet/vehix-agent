"""Diagnostics MCP tools — UDS DTC read, snapshot, clear.

Simulates UDS protocol services 0x19 / 0x14.

Future: DTC code parsing/validation delegated to Rust UDS Parser
(see rust-services/uds-parser/) for zero-copy, memory-safe parsing.
"""

import json
from datetime import datetime

from sqlalchemy import select

from app.database import async_session
from app.mcp.server import tool_registry
from app.models.dtc import DTCRecord
from app.models.vehicle import VehicleTwin

# ── DTC description enrichment ───────────────────────────────────
try:
    from app.simulator.dtc_database import DTC_DATABASE
except ImportError:
    DTC_DATABASE = {}


@tool_registry.tool(
    name="read_dtc",
    description="读取车辆DTC故障码 (UDS 0x19服务)。status_mask: 0x09=当前激活, 0x08=历史, 0xFF=全部",
)
async def read_dtc(vin: str, status_mask: int = 0x09) -> dict:
    """Read DTC fault codes from a vehicle."""
    async with async_session() as db:
        query = select(DTCRecord).where(DTCRecord.vin == vin)
        if status_mask == 0x09:
            query = query.where(DTCRecord.is_active == True)
        elif status_mask == 0x08:
            query = query.where(DTCRecord.is_active == False)

        result = await db.execute(query.order_by(DTCRecord.occurred_at.desc()))
        dtcs = result.scalars().all()

        # Enrich with database descriptions
        dtc_list = []
        for d in dtcs:
            entry = d.to_dict()
            if d.dtc_code in DTC_DATABASE:
                ref = DTC_DATABASE[d.dtc_code]
                entry.setdefault("description", ref.description)
                entry.setdefault("severity", ref.severity)
                entry.setdefault("category", ref.category)
                entry.setdefault("system", ref.system)
            dtc_list.append(entry)

        # Summary stats
        critical_count = sum(1 for d in dtc_list if d.get("severity") == "critical")
        warning_count = sum(1 for d in dtc_list if d.get("severity") == "warning")

        return {
            "vin": vin, "status_mask": status_mask,
            "total_count": len(dtcs),
            "critical_count": critical_count,
            "warning_count": warning_count,
            "dtcs": dtc_list,
        }


@tool_registry.tool(
    name="read_dtc_snapshot",
    description="读取DTC冻结帧数据 (UDS 0x19 0x04)。获取故障发生时刻的环境数据快照",
)
async def read_dtc_snapshot(vin: str, dtc_code: str) -> dict:
    """Read DTC freeze-frame snapshot."""
    async with async_session() as db:
        result = await db.execute(
            select(DTCRecord).where(DTCRecord.vin == vin, DTCRecord.dtc_code == dtc_code.upper()))
        dtc = result.scalar_one_or_none()
        if not dtc:
            return {"error": f"未找到故障码 {dtc_code} (VIN: {vin})"}
        resp = dtc.to_dict()
        if dtc.snapshot_data:
            try:
                resp["snapshot"] = json.loads(dtc.snapshot_data)
            except json.JSONDecodeError:
                resp["snapshot"] = dtc.snapshot_data
        return resp


@tool_registry.tool(
    name="clear_dtc",
    description="清除车辆DTC故障码 (UDS 0x14服务)。生产环境需安全访问解锁 (UDS 0x27)",
)
async def clear_dtc(vin: str) -> dict:
    """Clear all active DTCs for a vehicle."""
    async with async_session() as db:
        result = await db.execute(
            select(DTCRecord).where(DTCRecord.vin == vin, DTCRecord.is_active == True))
        active = result.scalars().all()
        cleared = 0
        for dtc in active:
            dtc.is_active = False
            dtc.cleared_at = datetime.utcnow()
            cleared += 1

        twin_result = await db.execute(select(VehicleTwin).where(VehicleTwin.vin == vin))
        twin = twin_result.scalar_one_or_none()
        if twin:
            twin.active_dtcs = "[]"

        await db.commit()
        return {"vin": vin, "cleared": True, "cleared_count": cleared}


@tool_registry.tool(
    name="create_workorder",
    description="创建维修工单。根据故障诊断结果生成维修任务，包含建议备件和维修站",
)
async def create_workorder(
    vin: str,
    title: str = "",
    diagnosis_result: str = "",
    suggested_parts: str = "",
    priority: str = "medium",
) -> dict:
    """Create a maintenance work order after fault diagnosis.

    Args:
        vin: 车辆识别码
        title: 工单标题
        diagnosis_result: 诊断结论
        suggested_parts: 建议备件 (JSON list string)
        priority: 优先级 low/medium/high/critical
    """
    from app.database import async_session
    from sqlalchemy import select
    from app.models.vehicle import Vehicle
    from app.models.workorder import WorkOrder

    async with async_session() as db:
        v_result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
        vehicle = v_result.scalar_one_or_none()
        if not vehicle:
            return {"error": f"未找到车辆: {vin}"}

        wo = WorkOrder(
            vin=vin,
            plate_no=vehicle.plate_no,
            title=title or f"{vehicle.plate_no} 故障维修",
            diagnosis_result=diagnosis_result,
            suggested_parts=suggested_parts,
            priority=priority,
            status="pending",
        )
        db.add(wo)
        await db.commit()
        await db.refresh(wo)
        return {"workorder": wo.to_dict(), "message": f"工单 WO-{wo.id:04d} 已创建"}
