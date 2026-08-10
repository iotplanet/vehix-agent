"""Vehicle metadata and digital twin ORM models.

Aligns with GB/T 32960.1-2025 terminal registration data fields.
"""

from datetime import datetime

from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Vehicle(Base):
    """Vehicle metadata — GB/T 32960 terminal registration."""

    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vin: Mapped[str] = mapped_column(String(17), unique=True, index=True)
    plate_no: Mapped[str] = mapped_column(String(20))
    oem: Mapped[str] = mapped_column(String(50), default="BYD")
    model: Mapped[str] = mapped_column(String(50), default="Han EV")
    powertrain_type: Mapped[str] = mapped_column(String(10), default="BEV")  # BEV/PHEV/FCEV
    battery_capacity_kwh: Mapped[float] = mapped_column(Float, default=85.0)
    max_speed: Mapped[float] = mapped_column(Float, default=180.0)

    # JT/T 808 extension fields (nullable — only for commercial vehicles)
    protocol_type: Mapped[str] = mapped_column(String(20), default="gb32960")  # gb32960 | jtt808 | jtt1078
    vehicle_category: Mapped[str] = mapped_column(String(30), default="")      # truck | bus | taxi | dangerous
    fuel_type: Mapped[str] = mapped_column(String(20), default="")             # diesel | gasoline | cng | electric
    driver_name: Mapped[str] = mapped_column(String(50), default="")
    driver_ic: Mapped[str] = mapped_column(String(30), default="")

    online_status: Mapped[str] = mapped_column(String(20), default="offline")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    twin: Mapped["VehicleTwin | None"] = relationship(
        "VehicleTwin", back_populates="vehicle", uselist=False,
        cascade="all, delete-orphan",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "vin": self.vin, "plate_no": self.plate_no,
            "oem": self.oem, "model": self.model,
            "powertrain_type": self.powertrain_type,
            "battery_capacity_kwh": self.battery_capacity_kwh,
            "max_speed": self.max_speed,
            "protocol_type": self.protocol_type,
            "vehicle_category": self.vehicle_category,
            "fuel_type": self.fuel_type,
            "driver_name": self.driver_name,
            "online_status": self.online_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class VehicleTwin(Base):
    """Vehicle digital twin — real-time status snapshot (GB/T 32960 Part 3)."""

    __tablename__ = "vehicle_twins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(Integer, ForeignKey("vehicles.id"), unique=True)
    vin: Mapped[str] = mapped_column(String(17), index=True)

    # Whole-vehicle data
    speed: Mapped[float] = mapped_column(Float, default=0.0)
    mileage: Mapped[float] = mapped_column(Float, default=0.0)
    soc: Mapped[float] = mapped_column(Float, default=80.0)
    soh: Mapped[float] = mapped_column(Float, default=100.0)

    # Battery pack data
    battery_voltage: Mapped[float] = mapped_column(Float, default=380.0)
    battery_current: Mapped[float] = mapped_column(Float, default=0.0)
    max_cell_temp: Mapped[float] = mapped_column(Float, default=25.0)
    min_cell_temp: Mapped[float] = mapped_column(Float, default=22.0)
    insulation_resistance: Mapped[float] = mapped_column(Float, default=500.0)

    # Drive motor data
    motor_speed: Mapped[float] = mapped_column(Float, default=0.0)
    motor_torque: Mapped[float] = mapped_column(Float, default=0.0)
    motor_temp: Mapped[float] = mapped_column(Float, default=30.0)

    # Position & alarms
    gps_lng: Mapped[float] = mapped_column(Float, default=116.4074)
    gps_lat: Mapped[float] = mapped_column(Float, default=39.9042)
    alarm_level: Mapped[int] = mapped_column(Integer, default=0)  # 0-3
    active_dtcs: Mapped[str] = mapped_column(Text, default="[]")

    # JT/T 808 extension fields (nullable — only for commercial vehicles)
    fuel_level: Mapped[float] = mapped_column(Float, default=0.0)       # 油量 %
    fuel_consumption: Mapped[float] = mapped_column(Float, default=0.0) # 瞬时油耗 L/100km
    engine_rpm: Mapped[float] = mapped_column(Float, default=0.0)       # 发动机转速
    coolant_temp: Mapped[float] = mapped_column(Float, default=0.0)     # 冷却液温度
    oil_pressure: Mapped[float] = mapped_column(Float, default=0.0)     # 机油压力
    cargo_status: Mapped[str] = mapped_column(String(20), default="")   # empty | loaded
    video_channels: Mapped[int] = mapped_column(Integer, default=0)     # JT/T 1078 视频通道数
    acc_status: Mapped[str] = mapped_column(String(10), default="off")  # ACC: on | off

    last_report_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="twin")

    def to_dict(self) -> dict:
        import json
        return {
            "vin": self.vin, "speed": self.speed, "mileage": self.mileage,
            "soc": self.soc, "soh": self.soh,
            "battery_voltage": self.battery_voltage, "battery_current": self.battery_current,
            "max_cell_temp": self.max_cell_temp, "min_cell_temp": self.min_cell_temp,
            "insulation_resistance": self.insulation_resistance,
            "motor_speed": self.motor_speed, "motor_torque": self.motor_torque,
            "motor_temp": self.motor_temp,
            "gps_lng": self.gps_lng, "gps_lat": self.gps_lat,
            "alarm_level": self.alarm_level,
            "active_dtcs": json.loads(self.active_dtcs) if self.active_dtcs else [],
            # JT/T 808 fields
            "fuel_level": self.fuel_level,
            "fuel_consumption": self.fuel_consumption,
            "engine_rpm": self.engine_rpm,
            "coolant_temp": self.coolant_temp,
            "oil_pressure": self.oil_pressure,
            "cargo_status": self.cargo_status,
            "video_channels": self.video_channels,
            "acc_status": self.acc_status,
            "last_report_at": self.last_report_at.isoformat() if self.last_report_at else None,
        }
