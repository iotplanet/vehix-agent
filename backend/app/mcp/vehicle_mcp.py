"""Vehicle MCP tools — query twin, telemetry history, dispatch commands.

References: GB/T 32960 data fields, Geely MCP+SOA command atomization.

Future: high-risk command validation delegates to Rust Command Gateway
(see rust-services/command-gateway/).
"""

from datetime import datetime, timedelta

from sqlalchemy import select

from app.database import async_session
from app.mcp.server import tool_registry
from app.models.vehicle import Vehicle, VehicleTwin
from app.models.telemetry import TelemetryRecord
from app.models.command import CommandRecord

COMMAND_SPEC = {
    "unlock_door":      {"risk": "low",     "desc": "远程解锁车门"},
    "start_hvac":       {"risk": "low",     "desc": "远程启动空调"},
    "charge_control":   {"risk": "low",     "desc": "充电控制"},
    "limit_power":      {"risk": "medium",  "desc": "限制车辆功率"},
    "clear_dtc":        {"risk": "medium",  "desc": "清除故障码"},
    "remote_shutdown":  {"risk": "critical","desc": "紧急远程断电"},
}
HIGH_RISK = {"limit_power", "remote_shutdown"}


@tool_registry.tool(
    name="query_vehicle_twin",
    description="查询车辆孪生实时状态，返回GB/T 32960定义的整车数据、动力电池数据、驱动电机数据",
)
async def query_vehicle_twin(vin: str) -> dict:
    """Query vehicle digital twin."""
    async with async_session() as db:
        result = await db.execute(select(VehicleTwin).where(VehicleTwin.vin == vin))
        twin = result.scalar_one_or_none()
        if not twin:
            return {"error": f"未找到车辆: {vin}"}

        v_result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
        vehicle = v_result.scalar_one_or_none()

        data = twin.to_dict()
        if vehicle:
            data.update({
                "plate_no": vehicle.plate_no, "oem": vehicle.oem,
                "model": vehicle.model, "powertrain_type": vehicle.powertrain_type,
                "online_status": vehicle.online_status,
                "battery_capacity_kwh": vehicle.battery_capacity_kwh,
            })
        return data


@tool_registry.tool(
    name="query_telemetry_history",
    description="查询车辆历史遥测数据，返回指定指标的时间序列用于图表渲染",
)
async def query_telemetry_history(vin: str, metric: str = "soc", hours: int = 24) -> dict:
    """Query telemetry time-series."""
    valid = {"speed", "soc", "soh", "max_cell_temp", "min_cell_temp",
             "motor_temp", "motor_speed", "battery_voltage", "battery_current",
             "insulation_resistance"}
    if metric not in valid:
        return {"error": f"无效指标: {metric}，有效: {sorted(valid)}"}

    async with async_session() as db:
        since = datetime.utcnow() - timedelta(hours=hours)
        result = await db.execute(
            select(TelemetryRecord).where(
                TelemetryRecord.vin == vin,
                TelemetryRecord.metric == metric,
                TelemetryRecord.timestamp >= since,
            ).order_by(TelemetryRecord.timestamp.asc()).limit(500)
        )
        records = result.scalars().all()
        points = [r.to_dict() for r in records]
        if len(points) > 200:
            step = len(points) // 200
            points = points[::step]

        values = [p["value"] for p in points]
        stats = {}
        if values:
            stats = {"min": round(min(values), 2), "max": round(max(values), 2),
                     "avg": round(sum(values) / len(values), 2), "count": len(values)}
        return {"vin": vin, "metric": metric, "hours": hours, "points": points, "stats": stats}


@tool_registry.tool(
    name="dispatch_vehicle_command",
    description="远程下发车控命令，高危命令需要审批。支持: unlock_door/start_hvac/charge_control/limit_power/remote_shutdown",
    approval_required=True,
)
async def dispatch_vehicle_command(
    vin: str, command: str,
    max_power_percent: int = 70,
    target_temp: int = 24,
    action: str = "start",
) -> dict:
    """Dispatch remote vehicle command with risk assessment.

    Validates via rust_bridge.validate_command() which uses Rust when
    rust_command_gateway_enabled, Python fallback otherwise.
    """
    # Security validation via Rust bridge (or Python fallback)
    from app.services.rust_bridge import validate_command
    validation = validate_command(vin=vin, command=command, params={})
    if not validation.get("valid"):
        return {"error": f"命令验证失败: {validation.get('reason', '未知原因')}"}

    spec = COMMAND_SPEC.get(command)
    if not spec:
        return {"error": f"未知命令: {command}，支持: {list(COMMAND_SPEC)}"}

    async with async_session() as db:
        v_result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
        if v_result.scalar_one_or_none() is None:
            return {"error": f"未找到车辆: {vin}"}

        params = {}
        if command == "limit_power":
            params["max_power_percent"] = max_power_percent
        elif command == "start_hvac":
            params["target_temp"] = target_temp
        elif command == "charge_control":
            params["action"] = action

        cmd_record = CommandRecord(
            vin=vin, command=command, params=str(params),
            risk_level=spec["risk"],
            status="pending_approval" if command in HIGH_RISK else "pending",
            operator="agent",
        )
        db.add(cmd_record)
        await db.commit()
        await db.refresh(cmd_record)

        result = {"command_id": cmd_record.id, "vin": vin, "command": command,
                  "params": params, "risk_level": spec["risk"], "description": spec["desc"]}

        if command in HIGH_RISK:
            result["status"] = "pending_approval"
            result["approval_required"] = True
        else:
            cmd_record.status = "dispatched"
            await db.commit()
            result["status"] = "dispatched"

        return result
