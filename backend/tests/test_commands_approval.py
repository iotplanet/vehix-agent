"""Command approval path + clear_dtc requires approval."""

import pytest
from httpx import AsyncClient

from app.models.vehicle import Vehicle, VehicleTwin
from tests.conftest import login, auth_header


@pytest.mark.asyncio
async def test_clear_dtc_requires_approval(client: AsyncClient, db_session):
    v = Vehicle(vin="TESTVINCLR000001", plate_no="测A·CLR1", online_status="online")
    db_session.add(v)
    await db_session.flush()
    db_session.add(VehicleTwin(vehicle_id=v.id, vin=v.vin))
    await db_session.commit()

    op = await login(client, "operator", "operator123")
    res = await client.post(
        "/api/vehicles/TESTVINCLR000001/commands",
        headers=auth_header(op),
        json={"command": "clear_dtc"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "pending_approval"
    assert data.get("approval_required") is True
    assert "approval_id" in data

    viewer = await login(client, "viewer", "viewer123")
    deny = await client.post(
        f"/api/commands/approve/{data['approval_id']}?decision=approve",
        headers=auth_header(viewer),
    )
    assert deny.status_code == 403

    admin = await login(client, "admin", "admin123")
    ok = await client.post(
        f"/api/commands/approve/{data['approval_id']}?decision=approve",
        headers=auth_header(admin),
    )
    assert ok.status_code == 200
    assert ok.json()["dispatched"] is True
