"""Audit logging service — writes security events to audit_logs table."""

import json
from datetime import datetime

from app.database import async_session
from app.models.audit_log import AuditLog


async def log_event(
    event_type: str,
    operator: str = "system",
    role: str = "",
    resource: str = "",
    detail: dict | None = None,
    ip_address: str = "",
):
    """Write an audit event. Fire-and-forget — errors are silently swallowed."""
    try:
        async with async_session() as db:
            entry = AuditLog(
                event_type=event_type,
                operator=operator,
                role=role or "",
                resource=resource,
                detail=json.dumps(detail or {}, ensure_ascii=False),
                ip_address=ip_address,
                created_at=datetime.utcnow(),
            )
            db.add(entry)
            await db.commit()
    except Exception:
        pass  # Audit should never break the main flow
