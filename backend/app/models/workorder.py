"""Work Order (工单) ORM model — maintenance task lifecycle."""

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WorkOrder(Base):
    """Maintenance work order — created after fault diagnosis."""

    __tablename__ = "work_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vin: Mapped[str] = mapped_column(String(17), index=True)
    plate_no: Mapped[str] = mapped_column(String(20), default="")

    # Status lifecycle: pending → assigned → in_progress → completed → cancelled
    status: Mapped[str] = mapped_column(String(30), default="pending")

    # Diagnosis info
    title: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    diagnosis_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    suggested_parts: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list

    # Priority: low / medium / high / critical
    priority: Mapped[str] = mapped_column(String(20), default="medium")

    # Assignment
    assigned_to: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    station: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "vin": self.vin,
            "plate_no": self.plate_no,
            "status": self.status,
            "title": self.title,
            "description": self.description,
            "diagnosis_result": self.diagnosis_result,
            "suggested_parts": self.suggested_parts,
            "priority": self.priority,
            "assigned_to": self.assigned_to,
            "station": self.station,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "assigned_at": self.assigned_at.isoformat() if self.assigned_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
