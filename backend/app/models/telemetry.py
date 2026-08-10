"""GB/T 32960 telemetry time-series records."""

from datetime import datetime

from sqlalchemy import String, Float, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TelemetryRecord(Base):
    """Time-series telemetry data — GB/T 32960 compliant."""

    __tablename__ = "telemetry_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vin: Mapped[str] = mapped_column(String(17), index=True)
    metric: Mapped[str] = mapped_column(String(50), index=True)
    value: Mapped[float] = mapped_column(Float)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "vin": self.vin, "metric": self.metric, "value": self.value,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }
