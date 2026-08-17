"""Shared pytest fixtures — isolated in-memory DB, no simulator."""

import os

# Must set before app imports
os.environ["VEHIX_SIMULATOR_ENABLED"] = "false"
os.environ["VEHIX_JTT808_MOCK_ENABLED"] = "false"
os.environ["VEHIX_JWT_SECRET"] = "test-secret-for-pytest-only-32chars!!"
os.environ["VEHIX_DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["VEHIX_MCP_HTTP_ENABLED"] = "false"
os.environ["VEHIX_LLM_API_KEY"] = ""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Clear settings cache so env above takes effect
from app.config import get_settings
get_settings.cache_clear()

from app import database as db_mod
from app.database import Base, get_db
from app.main import app
from app.models.user import User
from app.auth.jwt import hash_password


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Point app DB globals at the test engine (shared by health + get_db)
    db_mod.engine = engine
    db_mod.async_session = session_factory

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db

    async with session_factory() as session:
        session.add_all([
            User(username="viewer", password_hash=hash_password("viewer123"),
                 role="viewer", display_name="查看者"),
            User(username="operator", password_hash=hash_password("operator123"),
                 role="operator", display_name="操作员"),
            User(username="admin", password_hash=hash_password("admin123"),
                 role="admin", display_name="管理员"),
        ])
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(client):
    """Session bound to the same engine as `client`."""
    async with db_mod.async_session() as session:
        yield session


async def login(client: AsyncClient, username: str, password: str) -> str:
    res = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
