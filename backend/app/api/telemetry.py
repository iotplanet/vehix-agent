"""Telemetry query API endpoints.

GET /api/vehicles/{vin}/telemetry?metric=soc&hours=24&limit=500
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.telemetry import TelemetryRecord
from app.models.user import User
from app.auth.dependencies import RequireViewer

router = APIRouter(tags=["telemetry"])

VALID_METRICS = {
    "speed", "soc", "soh", "max_cell_temp", "min_cell_temp",
    "motor_temp", "motor_speed", "battery_voltage", "battery_current",
    "insulation_resistance", "alarm_level",
}


@router.get("/vehicles/{vin}/telemetry")
async def get_telemetry(
    vin: str,
    metric: str = Query("soc", description=f"Metric name: {', '.join(sorted(VALID_METRICS))}"),
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(RequireViewer),
):
    """Query vehicle telemetry history for chart rendering."""
    if metric not in VALID_METRICS:
        return {"error": f"Invalid metric: {metric}", "valid": sorted(VALID_METRICS)}

    since = datetime.utcnow() - timedelta(hours=hours)

    result = await db.execute(
        select(TelemetryRecord)
        .where(
            TelemetryRecord.vin == vin,
            TelemetryRecord.metric == metric,
            TelemetryRecord.timestamp >= since,
        )
        .order_by(TelemetryRecord.timestamp.asc())
        .limit(limit)
    )
    records = result.scalars().all()

    points = [r.to_dict() for r in records]

    # Downsample to ~200 points for smooth charts
    if len(points) > 200:
        step = len(points) // 200
        points = points[::step]

    values = [p["value"] for p in points]
    stats = {}
    if values:
        stats = {
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "avg": round(sum(values) / len(values), 2),
            "count": len(values),
        }

    return {"vin": vin, "metric": metric, "hours": hours, "points": points, "stats": stats}
