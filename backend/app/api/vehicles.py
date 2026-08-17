"""Vehicle CRUD + fleet list API endpoints.

GET    /api/vehicles          — fleet list (filters: online, alarm_level)
GET    /api/vehicles/{vin}    — vehicle detail + twin
POST   /api/vehicles          — register new vehicle
DELETE /api/vehicles/{vin}    — delete vehicle
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vehicle import Vehicle, VehicleTwin
from app.models.user import User
from app.auth.dependencies import RequireViewer, RequireAdmin

router = APIRouter(tags=["vehicles"])


class VehicleCreateRequest(BaseModel):
    vin: str = Field(min_length=8, max_length=17)
    plate_no: str = Field(default="", max_length=20)
    oem: str = Field(default="BYD", max_length=50)
    model: str = Field(default="Han EV", max_length=50)
    powertrain_type: str = Field(default="BEV", max_length=10)
    battery_capacity_kwh: float = Field(default=85.0, ge=0, le=1000)


@router.get("/vehicles")
async def list_vehicles(
    online: str | None = Query(None, description="Filter: 'true'/'false'"),
    alarm_level: int | None = Query(None, ge=0, le=3),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(RequireViewer),
):
    """List fleet vehicles with optional filtering."""
    query = select(Vehicle, VehicleTwin).outerjoin(VehicleTwin, Vehicle.id == VehicleTwin.vehicle_id)

    if online is not None:
        query = query.where(Vehicle.online_status == ("online" if online.lower() == "true" else "offline"))

    result = await db.execute(query)
    rows = result.all()

    vehicles = []
    for vehicle, twin in rows:
        vd = vehicle.to_dict()
        if twin:
            vd["twin"] = twin.to_dict()
        vehicles.append(vd)

    return {"total": len(vehicles), "vehicles": vehicles}


@router.get("/vehicles/{vin}")
async def get_vehicle(
    vin: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(RequireViewer),
):
    """Get vehicle detail + digital twin."""
    result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle not found: {vin}")

    twin_result = await db.execute(select(VehicleTwin).where(VehicleTwin.vin == vin))
    twin = twin_result.scalar_one_or_none()

    data = vehicle.to_dict()
    if twin:
        data["twin"] = twin.to_dict()
    return data


@router.post("/vehicles", status_code=201)
async def register_vehicle(
    body: VehicleCreateRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(RequireAdmin),
):
    """Register a new vehicle. Requires admin+ role."""
    vin = body.vin.strip().upper()
    existing = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Vehicle already exists: {vin}")

    vehicle = Vehicle(
        vin=vin,
        plate_no=body.plate_no,
        oem=body.oem,
        model=body.model,
        powertrain_type=body.powertrain_type,
        battery_capacity_kwh=body.battery_capacity_kwh,
        online_status="offline",
    )
    db.add(vehicle)
    await db.flush()

    twin = VehicleTwin(vehicle_id=vehicle.id, vin=vehicle.vin)
    db.add(twin)
    await db.commit()
    await db.refresh(vehicle)

    data = vehicle.to_dict()
    data["twin"] = twin.to_dict()
    return data


@router.delete("/vehicles/{vin}")
async def delete_vehicle(
    vin: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireAdmin),
):
    """Delete a vehicle and its twin. Related telemetry/DTC/commands by VIN are cleaned up."""
    result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle not found: {vin}")

    from app.models.telemetry import TelemetryRecord
    from app.models.dtc import DTCRecord
    from app.models.command import CommandRecord
    from app.models.workorder import WorkOrder

    await db.execute(delete(TelemetryRecord).where(TelemetryRecord.vin == vin))
    await db.execute(delete(DTCRecord).where(DTCRecord.vin == vin))
    await db.execute(delete(CommandRecord).where(CommandRecord.vin == vin))
    await db.execute(delete(WorkOrder).where(WorkOrder.vin == vin))
    await db.delete(vehicle)
    await db.commit()

    from app.services.audit import log_event
    await log_event(
        "vehicle.delete",
        operator=current_user.username,
        role=current_user.role,
        resource=vin,
        detail={"plate_no": vehicle.plate_no},
    )

    return {"ok": True, "vin": vin, "message": f"车辆已删除: {vin}"}
