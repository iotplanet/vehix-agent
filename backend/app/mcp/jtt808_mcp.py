"""JT/T 808 MCP Bridge — isolated from core vehix-agent.

All JT/T 808 interaction goes through this module. It calls:
- xtream-codec REST API (when Docker service is available)
- Local Python mock (for development without Docker)

The rest of the system never touches JT/T 808 directly.
"""

import httpx
from app.config import settings
from app.mcp.server import tool_registry
from app.database import async_session
from sqlalchemy import select
from app.models.vehicle import Vehicle, VehicleTwin


# ── Client (isolated from core) ──────────────────────────────────

class JTT808Client:
    """HTTP client for xtream-codec REST API.

    Isolated: all network calls go through this class.
    Mock: falls back to local data when xtream-codec is unavailable.
    """

    def __init__(self, base_url: str = ""):
        self.base_url = base_url or settings.jtt808_base_url
        self._client: httpx.AsyncClient | None = None

    async def _get(self, path: str) -> dict | None:
        """GET request to xtream-codec. Returns None on failure."""
        if not settings.jtt808_enabled:
            return None
        if not self._client:
            self._client = httpx.AsyncClient(timeout=5.0)
        try:
            resp = await self._client.get(f"{self.base_url}{path}")
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return None

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    # ── API methods ──────────────────────────────────────────

    async def get_vehicle_status(self, vin: str) -> dict | None:
        """GET /api/vehicles/{vin}/status — latest location + telemetry"""
        return await self._get(f"/api/vehicles/{vin}/status")

    async def get_vehicle_tracks(self, vin: str, start: str = "", end: str = "") -> dict | None:
        """GET /api/vehicles/{vin}/tracks — historical GPS track"""
        params = ""
        if start and end:
            params = f"?start={start}&end={end}"
        return await self._get(f"/api/vehicles/{vin}/tracks{params}")

    async def get_driver(self, vin: str) -> dict | None:
        """GET /api/vehicles/{vin}/driver — current driver info"""
        return await self._get(f"/api/vehicles/{vin}/driver")

    async def get_video_stream(self, vin: str, channel: int = 1) -> dict | None:
        """GET /api/vehicles/{vin}/media/stream?channel=N — HLS URL"""
        return await self._get(f"/api/vehicles/{vin}/media/stream?channel={channel}")


# Singleton client
_jtt808 = JTT808Client()


# ── MCP Tools ────────────────────────────────────────────────────

@tool_registry.tool(
    name="query_jtt808_vehicle",
    description="查询JT/T 808商用车实时状态（通过xtream-codec）。返回：位置、速度、里程、油量、发动机转速、水温、驾驶员",
)
async def query_jtt808_vehicle(vin: str) -> dict:
    """Query JT/T 808 commercial vehicle status.

    Falls back to local VehicleTwin if xtream-codec is unavailable.
    """
    # Try xtream-codec first
    result = await _jtt808.get_vehicle_status(vin)
    if result:
        return {"source": "xtream-codec", **result}

    # Fallback: local DB (mock data)
    async with async_session() as db:
        result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
        vehicle = result.scalar_one_or_none()
        if not vehicle:
            return {"error": f"未找到车辆: {vin}"}
        if vehicle.protocol_type not in ("jtt808", "jtt1078"):
            return {"error": f"车辆 {vin} 不是JT/T 808协议（当前协议: {vehicle.protocol_type}）"}

        twin_result = await db.execute(select(VehicleTwin).where(VehicleTwin.vin == vin))
        twin = twin_result.scalar_one_or_none()

        return {
            "source": "mock",
            "vin": vin,
            "plate_no": vehicle.plate_no,
            "vehicle_category": vehicle.vehicle_category,
            "driver_name": vehicle.driver_name,
            "twin": twin.to_dict() if twin else None,
        }


@tool_registry.tool(
    name="query_jtt808_track",
    description="查询JT/T 808商用车历史轨迹。返回GPS坐标序列",
)
async def query_jtt808_track(vin: str, hours: int = 24) -> dict:
    """Query JT/T 808 vehicle GPS track history.

    Args:
        vin: 车辆识别码
        hours: 查询最近N小时的轨迹
    """
    result = await _jtt808.get_vehicle_tracks(vin)
    if result:
        return {"source": "xtream-codec", **result}

    # Fallback: mock telemetry history
    from datetime import datetime, timedelta
    from app.models.telemetry import TelemetryRecord

    async with async_session() as db:
        since = datetime.utcnow() - timedelta(hours=hours)
        result = await db.execute(
            select(TelemetryRecord).where(
                TelemetryRecord.vin == vin,
                TelemetryRecord.metric == "speed",
                TelemetryRecord.timestamp >= since,
            ).order_by(TelemetryRecord.timestamp.asc()).limit(300)
        )
        records = result.scalars().all()
        return {
            "source": "mock",
            "vin": vin,
            "hours": hours,
            "points": [r.to_dict() for r in records],
        }


@tool_registry.tool(
    name="query_jtt808_driver",
    description="查询JT/T 808商用车当前驾驶员信息（IC卡）",
)
async def query_jtt808_driver(vin: str) -> dict:
    """Query driver info from IC card."""
    result = await _jtt808.get_driver(vin)
    if result:
        return {"source": "xtream-codec", **result}

    # Fallback: local DB
    async with async_session() as db:
        result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
        vehicle = result.scalar_one_or_none()
        if not vehicle:
            return {"error": f"未找到车辆: {vin}"}
        return {
            "source": "mock",
            "vin": vin,
            "driver_name": vehicle.driver_name or "未登记",
            "driver_ic": vehicle.driver_ic or "",
        }


@tool_registry.tool(
    name="query_jtt1078_stream",
    description="获取JT/T 1078实时视频流地址（HLS URL）",
)
async def query_jtt1078_stream(vin: str, channel: int = 1) -> dict:
    """Get JT/T 1078 live video stream URL.

    Args:
        vin: 车辆识别码
        channel: 视频通道号 (1-4)
    """
    result = await _jtt808.get_video_stream(vin, channel)
    if result:
        return {"source": "xtream-codec", **result}

    return {
        "source": "mock",
        "vin": vin,
        "channel": channel,
        "stream_url": f"{settings.jtt808_base_url}/api/vehicles/{vin}/media/stream?channel={channel}",
        "status": "xtream-codec 未启用，视频流不可用。启动方式: docker compose --profile jtt up -d",
    }
