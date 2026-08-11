"""Application configuration via .env file and environment variables.

Priority: env vars > .env file > defaults.
All settings use VEHIX_ prefix.
Sensitive values (API keys) MUST be set in .env, never committed.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

# Find .env relative to this file: backend/app/config.py → backend/.env
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    """Application settings — loaded from .env and environment."""

    # ── Database ──
    # SQLite (default, zero-config)
    database_url: str = "sqlite+aiosqlite:///./vehix.db"
    # PostgreSQL (取消注释 + 启动 postgres 容器即可切换):
    # database_url: str = "postgresql+asyncpg://xtream:xtream@localhost:5432/xtream"

    # ── LLM (sensitive — configure via .env) ──
    llm_api_key: str = ""
    llm_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-chat"

    # ── Simulator ──
    simulator_enabled: bool = True
    simulator_vehicle_count: int = 10
    simulator_telemetry_interval_s: float = 5.0
    simulator_fault_probability: float = 0.02

    # ── Approval ──
    approval_ttl_s: int = 300

    # ── Auth ──
    jwt_secret: str = "change-me-in-production-use-openssl-rand-hex-32"
    jwt_expire_minutes: int = 15
    jwt_refresh_days: int = 7
    initial_superuser_password: str = "admin123"

    # ── Server ──
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        # Production: your HTTPS domain
        # "https://your-domain.com",
    ]

    # ── JT/T 808 Bridge (xtream-codec integration) ──
    jtt808_enabled: bool = False
    jtt808_base_url: str = "http://localhost:8808"
    jtt808_mock_enabled: bool = True  # Use local Python mock when xtream-codec unavailable

    # ── Rust Services (future) ──
    rust_command_gateway_enabled: bool = False
    rust_uds_parser_enabled: bool = False
    rust_ota_verifier_enabled: bool = False

    model_config = {
        "env_prefix": "VEHIX_",
        "env_nested_delimiter": "__",
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
    }


@lru_cache()
def get_settings() -> Settings:
    """Return cached settings singleton."""
    return Settings()


settings = get_settings()
