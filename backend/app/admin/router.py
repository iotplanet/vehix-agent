"""Admin API — system config status + audit log viewing."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.audit_log import AuditLog
from app.auth.dependencies import RequireAdmin, RequireSuperuser
from app.config import settings

router = APIRouter(tags=["admin"])


@router.get("/api/admin/config")
async def get_config(current_user: User = Depends(RequireAdmin)):
    """Return non-sensitive system configuration status."""
    return {
        "llm": {
            "configured": bool(settings.llm_api_key),
            "model": settings.llm_model,
            "source": "environment",
        },
        "simulator": {
            "enabled": settings.simulator_enabled,
            "vehicle_count": settings.simulator_vehicle_count,
            "fault_probability": settings.simulator_fault_probability,
        },
        "jtt808": {
            "enabled": settings.jtt808_enabled,
            "mock_enabled": settings.jtt808_mock_enabled,
        },
        "rust": {
            "command_gateway": settings.rust_command_gateway_enabled,
            "uds_parser": settings.rust_uds_parser_enabled,
            "ota_verifier": settings.rust_ota_verifier_enabled,
        },
    }


@router.get("/api/admin/audit")
async def list_audit_logs(
    event_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireSuperuser),
):
    """List audit log entries. Requires superuser."""
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if event_type:
        query = query.where(AuditLog.event_type == event_type)

    result = await db.execute(query)
    logs = result.scalars().all()

    # Count
    count_result = await db.execute(select(func.count(AuditLog.id)))
    total = count_result.scalar() or 0

    return {"total": total, "logs": [log.to_dict() for log in logs]}
