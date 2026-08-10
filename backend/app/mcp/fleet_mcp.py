"""Fleet MCP tools — fleet-wide queries and statistics."""

from sqlalchemy import select, func

from app.database import async_session
from app.mcp.server import tool_registry
from app.models.vehicle import Vehicle, VehicleTwin


@tool_registry.tool(
    name="query_fleet",
    description="查询车队车辆列表，可按在线状态和告警等级筛选",
)
async def query_fleet(online_only: str = "false", min_alarm_level: int = 0) -> dict:
    """Query fleet vehicle list.

    Args:
        online_only: "true" to filter online vehicles only
        min_alarm_level: Minimum alarm level (0-3)
    """
    async with async_session() as db:
        query = select(Vehicle, VehicleTwin).join(VehicleTwin, Vehicle.id == VehicleTwin.vehicle_id)
        if online_only.lower() == "true":
            query = query.where(Vehicle.online_status == "online")
        if min_alarm_level > 0:
            query = query.where(VehicleTwin.alarm_level >= min_alarm_level)

        result = await db.execute(query)
        rows = result.all()

        vehicles = []
        for vehicle, twin in rows:
            vd = vehicle.to_dict()
            if twin:
                vd["twin"] = twin.to_dict()
            vehicles.append(vd)

        return {"total": len(vehicles), "vehicles": vehicles}


@tool_registry.tool(
    name="query_fleet_stats",
    description="查询车队统计摘要：按状态/告警等级分布、平均SOC/SOH",
)
async def query_fleet_stats() -> dict:
    """Query fleet aggregate statistics."""
    async with async_session() as db:
        total_result = await db.execute(select(func.count(Vehicle.id)))
        total = total_result.scalar() or 0

        online_result = await db.execute(
            select(func.count(Vehicle.id)).where(Vehicle.online_status == "online"))
        online = online_result.scalar() or 0

        twin_result = await db.execute(select(
            func.avg(VehicleTwin.soc), func.avg(VehicleTwin.soh),
            func.max(VehicleTwin.alarm_level),
        ))
        avg_soc, avg_soh, max_alarm = twin_result.one()

        return {
            "total_vehicles": total,
            "online_vehicles": online,
            "offline_vehicles": total - online,
            "avg_soc": round(float(avg_soc or 0), 2),
            "avg_soh": round(float(avg_soh or 0), 2),
            "max_alarm_level": int(max_alarm or 0),
        }


@tool_registry.tool(
    name="query_fleet_by_condition",
    description="按条件查询车辆：SOH低于/高于阈值、告警等级、SOC范围等",
)
async def query_fleet_by_condition(
    soh_lt: float = 100.0,
    soh_gt: float = 0.0,
    min_alarm_level: int = 0,
    soc_lt: float = 100.0,
) -> dict:
    """Query vehicles by SOH/SOC/alarm conditions.

    Args:
        soh_lt: SOH less than this value
        soh_gt: SOH greater than this value
        min_alarm_level: Minimum alarm level (0-3)
        soc_lt: SOC less than this value
    """
    async with async_session() as db:
        query = (
            select(Vehicle, VehicleTwin)
            .join(VehicleTwin, Vehicle.id == VehicleTwin.vehicle_id)
            .where(VehicleTwin.soh < soh_lt)
            .where(VehicleTwin.soh > soh_gt)
            .where(VehicleTwin.soc < soc_lt)
        )
        if min_alarm_level > 0:
            query = query.where(VehicleTwin.alarm_level >= min_alarm_level)

        result = await db.execute(query)
        rows = result.all()

        vehicles = []
        for vehicle, twin in rows:
            vd = vehicle.to_dict()
            if twin:
                vd["twin"] = twin.to_dict()
            vehicles.append(vd)

        return {"total": len(vehicles), "vehicles": vehicles}
