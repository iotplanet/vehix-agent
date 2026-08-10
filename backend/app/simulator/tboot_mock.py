"""T-Box simulator — GB/T 32960 vehicle terminal mock.

Simulates N BEV vehicles generating periodic telemetry and responding
to remote commands via the in-memory EventBus.
"""

import asyncio
import random
from datetime import datetime

from app.simulator.event_bus import event_bus
from app.simulator.uds_stack import UDSSimulator
from app.simulator.behavior_models import BehaviorModel
from app.simulator.dtc_database import DTC_DATABASE, lookup_dtc

GPS_BOUNDS = {"lng_min": 116.15, "lng_max": 116.60, "lat_min": 39.75, "lat_max": 40.05}


class SimulatedVehicle:
    """A single simulated BEV vehicle with T-Box, ECU, and behavior model."""

    def __init__(self, vin: str, plate_no: str, index: int):
        self.vin = vin
        self.plate_no = plate_no
        self.index = index

        # Initial physical state
        self.soc = random.uniform(45, 95)
        self.soh = random.uniform(92, 100)
        self.speed = 0.0
        self.mileage = random.uniform(5000, 60000)
        self.battery_voltage = 380.0 + random.uniform(-10, 10)
        self.battery_current = random.uniform(-30, 80)
        self.max_cell_temp = 28.0 + random.uniform(-5, 10)
        self.min_cell_temp = 22.0 + random.uniform(-5, 5)
        self.insulation_resistance = random.uniform(200, 600)
        self.motor_speed = 0.0
        self.motor_torque = 0.0
        self.motor_temp = 35.0 + random.uniform(-10, 15)
        self.gps_lng = random.uniform(GPS_BOUNDS["lng_min"], GPS_BOUNDS["lng_max"])
        self.gps_lat = random.uniform(GPS_BOUNDS["lat_min"], GPS_BOUNDS["lat_max"])
        self.heading = random.uniform(0, 360)

        self.ecu = UDSSimulator(vin)
        self.behavior = BehaviorModel(vin, soh=self.soh, mileage=self.mileage)
        self.last_report_at: datetime | None = None

    def generate_telemetry(self) -> dict:
        """Generate one GB/T 32960-format telemetry snapshot."""
        is_moving = random.random() < 0.6 and self.soc > 15

        if is_moving:
            self.speed = max(0, random.gauss(45, 25))
            self.motor_speed = self.speed * random.uniform(30, 50)
            self.motor_torque = random.gauss(80, 30)
            self.motor_temp = 60 + random.gauss(0, 15) + (100 - self.soh) * 0.4
            self.battery_current = random.gauss(50, 20)
            self.soc -= random.uniform(0.01, 0.05)
        else:
            self.speed = self.motor_speed = self.motor_torque = 0.0
            self.motor_temp = max(25, self.motor_temp - random.uniform(0.1, 0.5))
            self.battery_current = random.gauss(-5, 5)

        self.battery_voltage = 380 + (self.soc - 50) * 0.8 + random.gauss(0, 2)
        self.max_cell_temp = 28 + (100 - self.soh) * 0.3 + (self.battery_current / 10) * 0.5 + random.gauss(0, 2)
        self.min_cell_temp = self.max_cell_temp - random.uniform(2, 8)
        self.insulation_resistance = max(50, self.insulation_resistance + random.gauss(0, 5))

        self.behavior.soh = self.soh
        self.behavior.mileage = self.mileage
        self.behavior.degrade()
        self.soh = self.behavior.soh
        self.mileage = self.behavior.mileage

        # GPS drift
        self.gps_lng += random.uniform(-0.001, 0.001)
        self.gps_lat += random.uniform(-0.001, 0.001)
        self.heading = (self.heading + random.uniform(-5, 5)) % 360

        # Alarm level
        active = self.ecu.get_active_codes()
        if any(lookup_dtc(c) and lookup_dtc(c).severity == "critical" for c in active):
            alarm_level = 3
        elif self.max_cell_temp > 55 or self.insulation_resistance < 100:
            alarm_level = 2
        elif active:
            alarm_level = 1
        else:
            alarm_level = 0

        self.last_report_at = datetime.utcnow()

        return {
            "vin": self.vin, "plate_no": self.plate_no,
            "speed": round(self.speed, 1), "mileage": round(self.mileage, 1),
            "soc": round(self.soc, 2), "soh": round(self.soh, 2),
            "battery_voltage": round(self.battery_voltage, 1),
            "battery_current": round(self.battery_current, 1),
            "max_cell_temp": round(self.max_cell_temp, 1),
            "min_cell_temp": round(self.min_cell_temp, 1),
            "insulation_resistance": round(self.insulation_resistance, 1),
            "motor_speed": round(self.motor_speed, 0),
            "motor_torque": round(self.motor_torque, 1),
            "motor_temp": round(self.motor_temp, 1),
            "gps_lng": round(self.gps_lng, 6), "gps_lat": round(self.gps_lat, 6),
            "heading": round(self.heading, 1),
            "alarm_level": alarm_level,
            "active_dtcs": active,
            "timestamp": self.last_report_at.isoformat(),
        }


class TBoxSimulator:
    """Manages a fleet of N simulated T-Box devices.

    Publishes telemetry to event_bus topics:
      vehicles/{vin}/telemetry
      dtc/new
      telemetry/update
    """

    def __init__(self, vehicle_count: int = 10, report_interval: float = 5.0,
                 fault_probability: float = 0.02):
        self.vehicle_count = vehicle_count
        self.report_interval = report_interval
        self.fault_probability = fault_probability
        self.vehicles: dict[str, SimulatedVehicle] = {}
        self._running = False

    async def _create_vehicles(self):
        """
        Create simulated vehicles matching the seed DB records.
        Reads Vehicle table from DB to sync VIN and plate_no.
        """
        from app.database import async_session
        from sqlalchemy import select
        from app.models.vehicle import Vehicle

        async with async_session() as db:
            result = await db.execute(select(Vehicle))
            db_vehicles = result.scalars().all()

        if db_vehicles:
            for i, v in enumerate(db_vehicles):
                self.vehicles[v.vin] = SimulatedVehicle(
                    vin=v.vin, plate_no=v.plate_no, index=i,
                )
        else:
            # Fallback: create vehicles from config
            for i in range(self.vehicle_count):
                vin = f"LSVAU2A0{str(i).zfill(6)}"
                plate_no = f"京A·D{1000 + i}"
                self.vehicles[vin] = SimulatedVehicle(
                    vin=vin, plate_no=plate_no, index=i,
                )

    async def run(self):
        """Main loop: generate telemetry and inject faults."""
        await self._create_vehicles()
        self._running = True

        # Subscribe to command topics
        event_bus.subscribe("vehicles/+/commands", self._handle_command)

        while self._running:
            for vehicle in self.vehicles.values():
                telemetry = vehicle.generate_telemetry()

                # Fault injection
                if random.random() < self.fault_probability:
                    dtc_code = vehicle.behavior.inject_into_ecu(vehicle.ecu)
                    if dtc_code:
                        entry = DTC_DATABASE.get(dtc_code)
                        if entry:
                            await event_bus.publish("dtc/new", {
                                "vin": vehicle.vin, "dtc_code": dtc_code,
                                "category": entry.category,
                                "description": entry.description,
                                "severity": entry.severity,
                                "status": 0x09,
                                "occurred_at": datetime.utcnow().isoformat(),
                            })

                await event_bus.publish(f"vehicles/{vehicle.vin}/telemetry", telemetry)
                await event_bus.publish("telemetry/update", telemetry)

            await asyncio.sleep(self.report_interval)

    async def _handle_command(self, topic: str, payload: dict):
        """Handle remote command for a vehicle."""
        parts = topic.split("/")
        if len(parts) >= 3:
            vin = parts[1]
            vehicle = self.vehicles.get(vin)
            if vehicle:
                result = await self._execute(vehicle, payload.get("command", ""), payload.get("params", {}))
                await event_bus.publish(f"vehicles/{vin}/command_result", {
                    "vin": vin, "command": payload.get("command"),
                    "result": result, "timestamp": datetime.utcnow().isoformat(),
                })

    async def _execute(self, v: SimulatedVehicle, command: str, params: dict) -> dict:
        if command == "unlock_door":
            return {"status": "executed", "detail": "车门已解锁"}
        elif command == "start_hvac":
            return {"status": "executed", "detail": f"空调已启动，目标温度 {params.get('target_temp', 24)}°C"}
        elif command == "charge_control":
            return {"status": "executed", "detail": f"充电{'启动' if params.get('action') == 'start' else '停止'}"}
        elif command == "limit_power":
            pct = params.get("max_power_percent", 70)
            return {"status": "executed", "detail": f"功率已限制至 {pct}%"}
        elif command == "remote_shutdown":
            return {"status": "executed", "detail": "紧急断电已执行"}
        elif command == "clear_dtc":
            v.ecu.service_0x14()
            return {"status": "executed", "detail": "DTC 已清除"}
        else:
            return {"status": "failed", "detail": f"未知命令: {command}"}

    def get(self, vin: str) -> SimulatedVehicle | None:
        return self.vehicles.get(vin)

    def get_all(self) -> list[SimulatedVehicle]:
        return list(self.vehicles.values())

    def stop(self):
        self._running = False
