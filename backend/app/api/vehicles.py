"""Vehicle CRUD + fleet list API endpoints.

GET  /api/vehicles          — fleet list (filters: online, alarm_level)
GET  /api/vehicles/{vin}    — vehicle detail + twin
POST /api/vehicles          — register new vehicle
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vehicle import Vehicle, VehicleTwin
from app.models.user import User
from app.auth.dependencies import RequireViewer, RequireAdmin, OptionalUser

router = APIRouter(tags=["vehicles"])


@router.get("/vehicles")
async def list_vehicles(
    online: str | None = Query(None, description="Filter: 'true'/'false'"),
    alarm_level: int | None = Query(None, ge=0, le=3),
    db: AsyncSession = Depends(get_db),
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
async def get_vehicle(vin: str, db: AsyncSession = Depends(get_db)):
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
async def register_vehicle(vehicle_data: dict, db: AsyncSession = Depends(get_db)):
    """Register a new vehicle."""
    vin = vehicle_data.get("vin")
    existing = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Vehicle already exists: {vin}")

    vehicle = Vehicle(
        vin=vin,
        plate_no=vehicle_data.get("plate_no", ""),
        oem=vehicle_data.get("oem", "BYD"),
        model=vehicle_data.get("model", "Han EV"),
        powertrain_type=vehicle_data.get("powertrain_type", "BEV"),
        battery_capacity_kwh=vehicle_data.get("battery_capacity_kwh", 85.0),
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
