"""JT/T 808 Terminal Simulator — isolated from GB/T 32960 modules.

Simulates N commercial vehicles (trucks/buses) reporting via JT/T 808
protocol over the event bus. Data fields mirror JT/T 808 0x0200
location report: position, speed, fuel, engine, driver info.

Isolated: does NOT import any GB/T 32960 modules.
"""

import asyncio
import random
from datetime import datetime

from app.simulator.event_bus import event_bus

# Commercial vehicle profiles
COMMERCIAL_PROFILES = [
    {"cat": "truck", "fuel": "diesel", "cargo": "loaded", "oem": "FAW", "model": "J6P 牵引车"},
    {"cat": "truck", "fuel": "diesel", "cargo": "empty", "oem": "Dongfeng", "model": "天龙"},
    {"cat": "bus", "fuel": "diesel", "cargo": "", "oem": "Yutong", "model": "ZK6127"},
    {"cat": "taxi", "fuel": "cng", "cargo": "", "oem": "Volkswagen", "model": "Jetta"},
    {"cat": "dangerous", "fuel": "diesel", "cargo": "loaded", "oem": "Sinotruk", "model": "HOWO"},
]


class SimulatedCommercialVehicle:
    """A single simulated JT/T 808 commercial vehicle."""

    def __init__(self, vin: str, plate_no: str, profile: dict, index: int):
        self.vin = vin
        self.plate_no = plate_no
        self.profile = profile
        self.index = index

        # JT/T 808 0x0200 fields
        self.speed = 0.0
        self.mileage = random.uniform(50000, 300000)
        self.gps_lng = 116.3 + random.uniform(-0.2, 0.2)
        self.gps_lat = 39.85 + random.uniform(-0.1, 0.1)
        self.heading = random.uniform(0, 360)

        # Engine & fuel
        self.fuel_level = random.uniform(30, 90)     # %
        self.fuel_consumption = 0.0                   # L/100km
        self.engine_rpm = 0.0
        self.coolant_temp = 85.0 + random.uniform(-10, 10)
        self.oil_pressure = 3.5 + random.uniform(-1, 1)
        self.acc_status = "on"

        # Driver
        self.driver_name = f"司机{index + 1:02d}"

        self.last_report_at: datetime | None = None

    def generate_telemetry(self) -> dict:
        """Generate JT/T 808 0x0200 location report data."""
        is_moving = random.random() < 0.5

        if is_moving:
            self.speed = max(0, random.gauss(60, 20))
            self.engine_rpm = self.speed * random.uniform(25, 35)
            self.fuel_consumption = 15 + random.gauss(0, 5)
            self.fuel_level -= random.uniform(0, 0.02)
            self.mileage += self.speed / 3600 * 5  # 5 second interval
        else:
            self.speed = 0.0
            self.engine_rpm = random.uniform(600, 800) if self.acc_status == "on" else 0
            self.fuel_consumption = self.engine_rpm * 0.002 if self.engine_rpm > 0 else 0
            self.coolant_temp = max(70, self.coolant_temp - random.uniform(0.1, 0.5))

        self.gps_lng += random.uniform(-0.002, 0.002)
        self.gps_lat += random.uniform(-0.002, 0.002)
        self.heading = (self.heading + random.uniform(-5, 5)) % 360
        self.coolant_temp += random.gauss(0, 0.5)
        self.oil_pressure += random.gauss(0, 0.05)
        self.fuel_level = max(5, self.fuel_level)

        self.last_report_at = datetime.utcnow()

        # Alarm level for commercial vehicles
        alarm = 0
        if self.fuel_level < 15:
            alarm = max(alarm, 1)
        if self.coolant_temp > 105:
            alarm = max(alarm, 2)
        if self.oil_pressure < 1.5:
            alarm = max(alarm, 3)

        return {
            "vin": self.vin,
            "plate_no": self.plate_no,
            "speed": round(self.speed, 1),
            "mileage": round(self.mileage, 1),
            "gps_lng": round(self.gps_lng, 6),
            "gps_lat": round(self.gps_lat, 6),
            "heading": round(self.heading, 1),
            # Commercial-specific fields
            "fuel_level": round(self.fuel_level, 1),
            "fuel_consumption": round(self.fuel_consumption, 1),
            "engine_rpm": round(self.engine_rpm, 0),
            "coolant_temp": round(self.coolant_temp, 1),
            "oil_pressure": round(self.oil_pressure, 2),
            "cargo_status": self.profile.get("cargo", ""),
            "acc_status": self.acc_status,
            "driver_name": self.driver_name,
            # Common
            "alarm_level": alarm,
            "active_dtcs": [],
            "timestamp": self.last_report_at.isoformat(),
        }


class JTT808Simulator:
    """Manages a fleet of simulated JT/T 808 commercial vehicles.

    Isolated from TBoxSimulator (GB/T 32960). Uses the same event_bus
    with different topics: vehicles/{vin}/jtt808/telemetry
    """

    def __init__(self, vehicle_count: int = 5, report_interval: float = 10.0):
        self.vehicle_count = vehicle_count
        self.report_interval = report_interval
        self.vehicles: dict[str, SimulatedCommercialVehicle] = {}
        self._running = False

    async def _create_vehicles(self):
        """Create commercial vehicles synced from DB."""
        from app.database import async_session
        from sqlalchemy import select
        from app.models.vehicle import Vehicle

        async with async_session() as db:
            result = await db.execute(
                select(Vehicle).where(Vehicle.protocol_type.in_(["jtt808", "jtt1078"]))
            )
            db_vehicles = result.scalars().all()

        if db_vehicles:
            for v in db_vehicles:
                profile = COMMERCIAL_PROFILES[len(self.vehicles) % len(COMMERCIAL_PROFILES)]
                self.vehicles[v.vin] = SimulatedCommercialVehicle(
                    vin=v.vin, plate_no=v.plate_no, profile=profile,
                    index=len(self.vehicles),
                )
        else:
            # Fallback: create from defaults
            for i in range(self.vehicle_count):
                vin = f"LJTT808{str(i).zfill(6)}"
                plate = f"京B·F{2000 + i}"
                profile = COMMERCIAL_PROFILES[i % len(COMMERCIAL_PROFILES)]
                self.vehicles[vin] = SimulatedCommercialVehicle(
                    vin=vin, plate_no=plate, profile=profile, index=i,
                )

    async def run(self):
        """Main loop: publish JT/T 808 telemetry."""
        await self._create_vehicles()
        self._running = True

        while self._running:
            for vehicle in self.vehicles.values():
                telemetry = vehicle.generate_telemetry()
                await event_bus.publish(
                    f"vehicles/{vehicle.vin}/jtt808/telemetry", telemetry
                )
                await event_bus.publish("telemetry/update", telemetry)
            await asyncio.sleep(self.report_interval)

    def get(self, vin: str) -> SimulatedCommercialVehicle | None:
        return self.vehicles.get(vin)

    def get_all(self) -> list[SimulatedCommercialVehicle]:
        return list(self.vehicles.values())

    def stop(self):
        self._running = False
