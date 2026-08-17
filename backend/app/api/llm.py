"""LLM configuration endpoints — status query and key testing.

Simple 12-Factor design: keys live in .env / environment variables.
These endpoints help users verify their setup without editing files blindly.
"""

import time

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.dependencies import RequireAdmin
from app.config import settings
from app.models.user import User

router = APIRouter(tags=["llm"])


class LLMStatus(BaseModel):
    configured: bool
    source: str  # "environment"
    model: str
    base_url: str
    key_preview: str | None  # "sk-****abcd"


class TestRequest(BaseModel):
    api_key: str
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-chat"


class TestResponse(BaseModel):
    ok: bool
    model: str
    latency_ms: float
    error: str | None = None


@router.get("/api/llm/status", response_model=LLMStatus)
async def llm_status(_user: User = Depends(RequireAdmin)):
    """Return current LLM configuration status without exposing the full key."""
    key = settings.llm_api_key
    preview = None
    if key and len(key) > 11:
        preview = f"{key[:7]}****{key[-4:]}"

    return LLMStatus(
        configured=bool(key),
        source="environment",
        model=settings.llm_model,
        base_url=settings.llm_base_url,
        key_preview=preview,
    )


@router.post("/api/llm/test", response_model=TestResponse)
async def llm_test(body: TestRequest, _user: User = Depends(RequireAdmin)):
    """Test an LLM API key before deploying it. Does NOT save the key.

    Sends a minimal chat completion to verify the key works.
    The user should then update VEHIX_LLM_API_KEY in .env and restart.
    """
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{body.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {body.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": body.model,
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 5,
                },
            )
            elapsed = (time.time() - start) * 1000

            if resp.status_code == 200:
                return TestResponse(ok=True, model=body.model, latency_ms=round(elapsed, 1))
            else:
                data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                error_msg = data.get("error", {}).get("message", resp.text[:200])
                return TestResponse(ok=False, model=body.model, latency_ms=round(elapsed, 1), error=error_msg)

    except httpx.ConnectError:
        return TestResponse(ok=False, model=body.model, latency_ms=0, error=f"无法连接到 {body.base_url}")
    except Exception as e:
        return TestResponse(ok=False, model=body.model, latency_ms=0, error=str(e)[:200])
