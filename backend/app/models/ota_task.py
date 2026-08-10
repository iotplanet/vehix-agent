"""OTA software update task records.

Cloud-to-vehicle upgrade management with gray release support.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, DateTime, Text, Float
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OTATask(Base):
    """OTA upgrade task — cloud-tube-car three-layer architecture."""

    __tablename__ = "ota_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    software_version: Mapped[str] = mapped_column(String(50))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    strategy: Mapped[str] = mapped_column(String(30), default="gray_release")
    status: Mapped[str] = mapped_column(String(30), default="created")
    target_vins: Mapped[str] = mapped_column(Text, default="[]")
    completed_vins: Mapped[str] = mapped_column(Text, default="[]")
    batch_plan: Mapped[str] = mapped_column(Text, default="[]")       # JSON: [{batch_no, size, status}]
    vehicle_progress: Mapped[str] = mapped_column(Text, default="{}") # JSON: {vin: "notified"|"downloading"|"installing"|"completed"|"failed"}
    progress_percent: Mapped[float] = mapped_column(Float, default=0.0)
    current_batch: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def to_dict(self) -> dict:
        import json
        return {
            "id": self.id, "name": self.name,
            "software_version": self.software_version,
            "description": self.description,
            "strategy": self.strategy, "status": self.status,
            "target_vins": json.loads(self.target_vins) if self.target_vins else [],
            "completed_vins": json.loads(self.completed_vins) if self.completed_vins else [],
            "batch_plan": json.loads(self.batch_plan) if self.batch_plan else [],
            "vehicle_progress": json.loads(self.vehicle_progress) if self.vehicle_progress else {},
            "target_count": len(json.loads(self.target_vins)) if self.target_vins else 0,
            "completed_count": len(json.loads(self.completed_vins)) if self.completed_vins else 0,
            "progress_percent": self.progress_percent,
            "current_batch": self.current_batch,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
