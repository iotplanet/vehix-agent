"""Audit log — tracks security-relevant operations."""

from datetime import datetime

from sqlalchemy import String, Integer, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditLog(Base):
    """Immutable audit trail for security-relevant operations."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(50), index=True)   # auth.login / command.dispatch / ota.create ...
    operator: Mapped[str] = mapped_column(String(50), index=True)     # username
    role: Mapped[str] = mapped_column(String(20))                     # role at time of operation
    resource: Mapped[str] = mapped_column(String(200), default="")    # VIN, task_id, etc.
    detail: Mapped[str] = mapped_column(Text, default="")             # JSON detail
    ip_address: Mapped[str] = mapped_column(String(45), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, index=True, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "event_type": self.event_type,
            "operator": self.operator,
            "role": self.role,
            "resource": self.resource,
            "detail": self.detail,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
