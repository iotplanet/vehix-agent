"""LLM client wrapper — OpenAI-compatible (DeepSeek, OpenAI, etc.)."""

from collections.abc import AsyncIterator

from langchain_openai import ChatOpenAI
from app.config import settings


def get_llm(temperature: float = 0.3) -> ChatOpenAI | None:
    """Return a configured ChatOpenAI instance, or None if no API key."""
    if not settings.llm_api_key:
        return None

    return ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=temperature,
        max_tokens=1024,
        streaming=True,  # Enable token-level streaming
    )


async def llm_invoke(prompt: str, system: str = "", temperature: float = 0.3) -> str | None:
    """Invoke LLM, returning the full response text or None."""
    llm = get_llm(temperature=temperature)
    if llm is None:
        return None

    from langchain_core.messages import SystemMessage, HumanMessage

    messages = []
    if system:
        messages.append(SystemMessage(content=system))
    messages.append(HumanMessage(content=prompt))

    response = await llm.ainvoke(messages)
    return response.content if hasattr(response, "content") else str(response)


async def llm_stream(
    prompt: str, system: str = "", temperature: float = 0.3
) -> AsyncIterator[str] | None:
    """Stream LLM tokens. Yields one token chunk at a time. Returns None if LLM unavailable."""
    llm = get_llm(temperature=temperature)
    if llm is None:
        return None

    from langchain_core.messages import SystemMessage, HumanMessage

    messages = []
    if system:
        messages.append(SystemMessage(content=system))
    messages.append(HumanMessage(content=prompt))

    async def _stream():
        async for chunk in llm.astream(messages):
            content = chunk.content if hasattr(chunk, "content") else str(chunk)
            if content:
                yield content

    return _stream()

