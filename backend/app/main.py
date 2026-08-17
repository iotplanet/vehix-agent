"""Vehix Agent — FastAPI application entry point."""

import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db, close_db
from app.logging_config import setup_logging, get_logger

setup_logging()
logger = get_logger("vehix")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: init DB, seed data, start simulator."""
    # ── Startup ──
    logger.info("Starting Vehix Agent", extra={"version": "0.2.0"})
    if settings.is_default_jwt_secret:
        logger.warning(
            "VEHIX_JWT_SECRET is using the insecure default — set a unique secret "
            "before any non-local deployment (openssl rand -hex 32)"
        )
    await init_db()
    logger.info("Database initialized")
    await _seed_users()
    await _seed_vehicles()

    # Start simulator (if enabled)
    sim_task = None
    jtt808_task = None
    ota_task = None
    if settings.simulator_enabled:
        from app.simulator.event_bus import event_bus
        from app.simulator.tboot_mock import TBoxSimulator

        await event_bus.start()

        # Subscribe to telemetry events → update VehicleTwin in DB
        event_bus.subscribe("telemetry/update", _ingest_telemetry)
        event_bus.subscribe("dtc/new", _ingest_dtc)

        simulator = TBoxSimulator(
            vehicle_count=settings.simulator_vehicle_count,
            report_interval=settings.simulator_telemetry_interval_s,
            fault_probability=settings.simulator_fault_probability,
        )
        sim_task = asyncio.create_task(simulator.run())
        app.state.event_bus = event_bus
        app.state.simulator = simulator

        # Start JT/T 808 simulator (isolated from GB/T 32960)
        jtt808_task = None
        if settings.jtt808_enabled or settings.jtt808_mock_enabled:
            from app.simulator.jtt808_mock import JTT808Simulator
            jtt808_sim = JTT808Simulator(
                vehicle_count=5, report_interval=settings.simulator_telemetry_interval_s * 2,
            )
            jtt808_task = asyncio.create_task(jtt808_sim.run())
            app.state.jtt808_simulator = jtt808_sim

        # Start OTA progress simulator
        ota_task = asyncio.create_task(_run_ota_progress())

    yield

    # ── Shutdown ──
    if sim_task:
        sim_task.cancel()
        try: await sim_task
        except asyncio.CancelledError: pass
    if jtt808_task:
        jtt808_task.cancel()
        try: await jtt808_task
        except asyncio.CancelledError: pass
    if ota_task:
        ota_task.cancel()
        try: await ota_task
        except asyncio.CancelledError: pass
    logger.info("Vehix Agent shutting down")
    await close_db()


app = FastAPI(
    title="Vehix Agent",
    description="New Energy Vehicle Fleet Intelligent Operations Agent",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Register API Routers (deferred import to avoid circular deps) ──
def _register_routers():
    from app.api.vehicles import router as vehicles_router
    from app.api.telemetry import router as telemetry_router
    from app.api.commands import router as commands_router
    from app.api.agent import router as agent_router
    from app.api.mcp_endpoint import router as mcp_router
    from app.auth.router import router as auth_router
    from app.api.llm import router as llm_router
    from app.admin.router import router as admin_router
    from app.api.ota import router as ota_router
    from app.api.workorders import router as workorders_router

    app.include_router(auth_router)  # /api/auth/*
    app.include_router(llm_router)   # /api/llm/*
    app.include_router(admin_router) # /api/admin/*
    app.include_router(vehicles_router, prefix="/api")
    app.include_router(telemetry_router, prefix="/api")
    app.include_router(commands_router, prefix="/api")
    app.include_router(agent_router, prefix="/api")
    app.include_router(ota_router, prefix="/api")
    app.include_router(workorders_router, prefix="/api")
    app.include_router(mcp_router)


_register_routers()


@app.get("/api/health")
async def health():
    """Liveness/readiness — DB + simulator only (no external LLM calls)."""
    status = {"service": "vehix-agent", "version": "0.2.0"}
    checks = {}

    # DB check
    try:
        from app.database import async_session
        from sqlalchemy import text
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"

    # Simulator check
    sim = getattr(app.state, "simulator", None)
    if sim:
        checks["simulator"] = {"running": sim._running, "vehicles": len(sim.vehicles)}
    else:
        checks["simulator"] = "disabled"

    all_ok = checks.get("database") == "ok"
    status["status"] = "ok" if all_ok else "degraded"
    status["checks"] = checks
    return status


# ── Seed Data ──

async def _seed_users():
    """Create default users if none exist."""
    from sqlalchemy import select
    from app.database import async_session
    from app.models.user import User
    from app.auth.jwt import hash_password

    async with async_session() as db:
        result = await db.execute(select(User).limit(1))
        if result.scalar_one_or_none() is not None:
            return

        users = [
            User(username="superuser", password_hash=hash_password(settings.initial_superuser_password),
                 role="superuser", display_name="超级管理员"),
            User(username="admin", password_hash=hash_password(settings.initial_admin_password),
                 role="admin", display_name="管理员"),
            User(username="operator", password_hash=hash_password(settings.initial_operator_password),
                 role="operator", display_name="操作员"),
            User(username="viewer", password_hash=hash_password(settings.initial_viewer_password),
                 role="viewer", display_name="查看者"),
        ]
        db.add_all(users)
        await db.commit()


async def _seed_vehicles():
    """Create demo BEV vehicles if none exist.

    Includes the specific plates used in design doc examples plus
    additional fleet vehicles for realistic testing.
    """
    from sqlalchemy import select
    from app.database import async_session
    from app.models.vehicle import Vehicle, VehicleTwin
    async with async_session() as db:
        result = await db.execute(select(Vehicle).limit(1))
        if result.scalar_one_or_none() is not None:
            return  # already seeded

        oems = ["BYD", "NIO", "XPeng", "Li Auto", "Zeekr"]
        models = ["Han EV", "ET7", "P7", "L9", "001"]

        # Curated plates: include design doc examples + fleet
        plates = [
            # Design doc examples (always present)
            ("京A·D1024", "BYD", "Han EV"),
            ("京B·F3056", "NIO", "ET7"),
            ("京C·E7890", "XPeng", "P7"),
            # Fleet vehicles
            ("京A·D1000", "BYD", "Han EV"),
            ("京A·D1001", "BYD", "Han EV"),
            ("京B·F2000", "NIO", "ET7"),
            ("京B·F2001", "NIO", "ET7"),
            ("京C·E3000", "XPeng", "P7"),
            ("京D·A4000", "Li Auto", "L9"),
            ("京D·A4001", "Li Auto", "L9"),
            ("京E·B5000", "Zeekr", "001"),
            ("京A·D1002", "BYD", "Han EV"),
            ("京B·F2002", "NIO", "ET7"),
            ("京C·E3001", "XPeng", "P7"),
            ("京D·A4002", "Li Auto", "L9"),
        ]

        vehicles = []
        for i, (plate, oem, model) in enumerate(plates[:max(settings.simulator_vehicle_count, len(plates))]):
            vehicles.append(Vehicle(
                vin=f"LSVAU2A0{str(i).zfill(6)}",
                plate_no=plate,
                oem=oem,
                model=model,
                powertrain_type="BEV",
                battery_capacity_kwh=85.0,
                online_status="online",
            ))

        # ── Commercial vehicles (JT/T 808) ──────────────────────
        commercial = [
            ("京B·F2000", "FAW", "J6P 牵引车", "jtt808", "truck", "diesel", "司机01"),
            ("京B·F2001", "Dongfeng", "天龙", "jtt808", "truck", "diesel", "司机02"),
            ("京C·B3000", "Yutong", "ZK6127", "jtt808", "bus", "diesel", "司机03"),
            ("京D·T4000", "Volkswagen", "Jetta", "jtt808", "taxi", "cng", "司机04"),
            ("京E·H5000", "Sinotruk", "HOWO", "jtt1078", "dangerous", "diesel", "司机05"),
        ]
        for plate, oem, model, proto, cat, fuel, driver in commercial:
            v = Vehicle(
                vin=f"LJTT808{len(vehicles):06d}",
                plate_no=plate, oem=oem, model=model,
                powertrain_type="ICE", protocol_type=proto,
                vehicle_category=cat, fuel_type=fuel,
                driver_name=driver, online_status="online",
            )
            vehicles.append(v)

        db.add_all(vehicles)
        await db.flush()

        twins = [VehicleTwin(vehicle_id=v.id, vin=v.vin) for v in vehicles]
        db.add_all(twins)
        await db.commit()


# ── Telemetry Ingestion ───────────────────────────────────────────

async def _ingest_telemetry(topic: str, payload: dict):
    """Handle telemetry/update events: update VehicleTwin + insert TelemetryRecord."""
    from app.database import async_session
    from sqlalchemy import select
    from app.models.vehicle import Vehicle, VehicleTwin
    from app.models.telemetry import TelemetryRecord

    vin = payload.get("vin")
    if not vin:
        return

    async with async_session() as db:
        # Update VehicleTwin
        result = await db.execute(select(VehicleTwin).where(VehicleTwin.vin == vin))
        twin = result.scalar_one_or_none()
        if twin:
            twin.speed = payload.get("speed", twin.speed)
            twin.mileage = payload.get("mileage", twin.mileage)
            twin.soc = payload.get("soc", twin.soc)
            twin.soh = payload.get("soh", twin.soh)
            twin.battery_voltage = payload.get("battery_voltage", twin.battery_voltage)
            twin.battery_current = payload.get("battery_current", twin.battery_current)
            twin.max_cell_temp = payload.get("max_cell_temp", twin.max_cell_temp)
            twin.min_cell_temp = payload.get("min_cell_temp", twin.min_cell_temp)
            twin.insulation_resistance = payload.get("insulation_resistance", twin.insulation_resistance)
            twin.motor_speed = payload.get("motor_speed", twin.motor_speed)
            twin.motor_torque = payload.get("motor_torque", twin.motor_torque)
            twin.motor_temp = payload.get("motor_temp", twin.motor_temp)
            twin.gps_lng = payload.get("gps_lng", twin.gps_lng)
            twin.gps_lat = payload.get("gps_lat", twin.gps_lat)
            twin.alarm_level = payload.get("alarm_level", twin.alarm_level)
            twin.active_dtcs = json.dumps(payload.get("active_dtcs", []), ensure_ascii=False)

            # JT/T 808 commercial vehicle fields (no-op for GB/T 32960)
            twin.fuel_level = payload.get("fuel_level", twin.fuel_level)
            twin.fuel_consumption = payload.get("fuel_consumption", twin.fuel_consumption)
            twin.engine_rpm = payload.get("engine_rpm", twin.engine_rpm)
            twin.coolant_temp = payload.get("coolant_temp", twin.coolant_temp)
            twin.oil_pressure = payload.get("oil_pressure", twin.oil_pressure)
            twin.cargo_status = payload.get("cargo_status", twin.cargo_status or "")
            twin.acc_status = payload.get("acc_status", twin.acc_status or "off")

            from datetime import datetime
            twin.last_report_at = datetime.utcnow()

            # Also update vehicle online status
            v_result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
            vehicle = v_result.scalar_one_or_none()
            if vehicle:
                vehicle.online_status = "online"

        # Insert key metrics as telemetry records
        from datetime import datetime
        now = datetime.utcnow()
        metrics = ["soc", "soh", "speed", "max_cell_temp", "motor_temp", "battery_voltage"]
        records = []
        for metric in metrics:
            value = payload.get(metric)
            if value is not None:
                records.append(TelemetryRecord(
                    vin=vin, metric=metric, value=float(value), timestamp=now,
                ))
        if records:
            db.add_all(records)

        await db.commit()


async def _ingest_dtc(topic: str, payload: dict):
    """Handle dtc/new events: insert DTCRecord into DB."""
    from app.database import async_session
    from app.models.dtc import DTCRecord

    async with async_session() as db:
        dtc = DTCRecord(
            vin=payload.get("vin", ""),
            dtc_code=payload.get("dtc_code", ""),
            status=payload.get("status", 0x09),
            category=payload.get("category", "P"),
            description=payload.get("description", ""),
            severity=payload.get("severity", "warning"),
            is_active=True,
            occurred_at=payload.get("occurred_at"),
        )
        db.add(dtc)
        await db.commit()


async def _run_ota_progress():
    """Periodically advance OTA task progress (one vehicle per tick)."""
    while True:
        try:
            from app.mcp.ota_mcp import _advance_ota_progress
            await _advance_ota_progress()
        except Exception:
            pass
        await asyncio.sleep(settings.simulator_telemetry_interval_s)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
