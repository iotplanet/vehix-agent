"""DTC (Diagnostic Trouble Code) records — UDS 0x19 service data."""

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DTCRecord(Base):
    """DTC fault code record — ISO 14229 / SAE J2012."""

    __tablename__ = "dtc_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vin: Mapped[str] = mapped_column(String(17), index=True)
    dtc_code: Mapped[str] = mapped_column(String(10), index=True)  # e.g. "P0A2A"
    status: Mapped[int] = mapped_column(Integer, default=0x09)
    category: Mapped[str] = mapped_column(String(5))  # P / C / B / U
    description: Mapped[str] = mapped_column(String(200))
    severity: Mapped[str] = mapped_column(String(20), default="warning")  # info/warning/critical
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    cleared_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    snapshot_data: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id, "vin": self.vin, "dtc_code": self.dtc_code,
            "status": self.status, "category": self.category,
            "description": self.description, "severity": self.severity,
            "is_active": self.is_active,
            "occurred_at": self.occurred_at.isoformat() if self.occurred_at else None,
            "cleared_at": self.cleared_at.isoformat() if self.cleared_at else None,
            "snapshot_data": self.snapshot_data,
        }
