"""Auth + RBAC matrix smoke tests."""

import pytest
from httpx import AsyncClient

from tests.conftest import login, auth_header


@pytest.mark.asyncio
async def test_vehicles_require_auth(client: AsyncClient):
    res = await client.get("/api/vehicles")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_viewer_can_list_vehicles(client: AsyncClient):
    token = await login(client, "viewer", "viewer123")
    res = await client.get("/api/vehicles", headers=auth_header(token))
    assert res.status_code == 200
    assert "vehicles" in res.json()


@pytest.mark.asyncio
async def test_viewer_cannot_register_vehicle(client: AsyncClient):
    token = await login(client, "viewer", "viewer123")
    res = await client.post(
        "/api/vehicles",
        headers=auth_header(token),
        json={"vin": "TESTVIN000000001", "plate_no": "测A·0001"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_register_and_delete_vehicle(client: AsyncClient):
    token = await login(client, "admin", "admin123")
    headers = auth_header(token)
    res = await client.post(
        "/api/vehicles",
        headers=headers,
        json={"vin": "TESTVIN000000002", "plate_no": "测A·0002"},
    )
    assert res.status_code == 201
    res = await client.delete("/api/vehicles/TESTVIN000000002", headers=headers)
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_llm_requires_admin(client: AsyncClient):
    viewer = await login(client, "viewer", "viewer123")
    res = await client.get("/api/llm/status", headers=auth_header(viewer))
    assert res.status_code == 403

    admin = await login(client, "admin", "admin123")
    res = await client.get("/api/llm/status", headers=auth_header(admin))
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_mcp_disabled_by_default(client: AsyncClient):
    admin = await login(client, "admin", "admin123")
    res = await client.get("/mcp/sse", headers=auth_header(admin))
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_health_no_llm(client: AsyncClient):
    res = await client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert "llm" not in body.get("checks", {})
    assert body["checks"]["database"] == "ok"
