"""Remote command and audit trail records."""

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CommandRecord(Base):
    """Remote vehicle command with audit trail."""

    __tablename__ = "command_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vin: Mapped[str] = mapped_column(String(17), index=True)
    command: Mapped[str] = mapped_column(String(50))
    params: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(30), default="pending_approval")
    risk_level: Mapped[str] = mapped_column(String(20), default="low")
    operator: Mapped[str] = mapped_column(String(50), default="agent")
    result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def to_dict(self) -> dict:
        import json
        return {
            "id": self.id, "vin": self.vin, "command": self.command,
            "params": json.loads(self.params) if self.params else {},
            "status": self.status, "risk_level": self.risk_level,
            "operator": self.operator, "result": self.result,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "executed_at": self.executed_at.isoformat() if self.executed_at else None,
        }
