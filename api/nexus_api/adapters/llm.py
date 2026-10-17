"""LLM client adapter with deterministic mock mode, repair retry, and graceful degradation."""

import abc
import json
import logging
import re
from typing import Any, TypeVar

from pydantic import BaseModel

from nexus_api.config import get_settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class LLMClient(abc.ABC):
    """Abstract interface for LLM calls returning structured Pydantic models."""

    @abc.abstractmethod
    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: type[T],
    ) -> tuple[T, bool]:
        """Generate structured output matching schema. Returns (model, is_degraded)."""


class MockLLM(LLMClient):
    """Deterministic Mock LLM producing predefined outputs for benchmarks and offline testing."""

    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: type[T],
    ) -> tuple[T, bool]:
        # Simple schema-based mock generator
        # For router:
        if schema.__name__ == "RouterOutput":
            from nexus_api.agents.router import route_question

            result = route_question(user_prompt)
            return result, False  # type: ignore[return-value]

        # For AskResponse:
        from nexus_api.models.api import AskRequest
        from nexus_api.services.ask_agent import answer_question

        ans = await answer_question(AskRequest(question=user_prompt))
        return ans, False  # type: ignore[return-value]


class OpenAILLM(LLMClient):
    """Live OpenAI / Gemini compatible client with 1 repair retry and graceful degrade."""

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.OPENAI_API_KEY or settings.GOOGLE_API_KEY
        self.model = settings.LLM_MODEL
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(api_key=self.api_key)
        return self._client

    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: type[T],
    ) -> tuple[T, bool]:
        client = self._get_client()
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        try:
            # First attempt
            resp = await client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.0,
            )
            raw_text = resp.choices[0].message.content or "{}"
            parsed = schema.model_validate_json(raw_text)
            return parsed, False
        except Exception as first_exc:
            logger.warning(
                "First LLM generation attempt failed: %s; attempting repair retry",
                first_exc,
            )
            # One repair retry
            try:
                repair_messages = list(messages)
                repair_messages.append(
                    {"role": "assistant", "content": "Error during JSON parsing"}
                )
                repair_messages.append(
                    {
                        "role": "user",
                        "content": f"The previous output failed validation: {first_exc}. Please return only valid JSON strictly matching the schema.",
                    }
                )
                resp = await client.chat.completions.create(
                    model=self.model,
                    messages=repair_messages,
                    response_format={"type": "json_object"},
                    temperature=0.0,
                )
                raw_text = resp.choices[0].message.content or "{}"
                parsed = schema.model_validate_json(raw_text)
                return parsed, False
            except Exception as retry_exc:
                logger.error("Repair retry failed: %s; gracefully degrading", retry_exc)
                # Graceful degrade: construct minimal empty schema
                empty_instance = schema.model_validate({})
                return empty_instance, True



def extract_json(text: str) -> str:
    """Pull the JSON object out of a model reply, tolerating code fences and surrounding prose."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        return text[start : end + 1]
    return text


class AnthropicLLM(LLMClient):
    """Live Claude client using the Messages API, with one repair retry and graceful degrade."""

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.ANTHROPIC_API_KEY
        self.model = settings.ANTHROPIC_MODEL
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            from anthropic import AsyncAnthropic

            self._client = AsyncAnthropic(api_key=self.api_key)
        return self._client

    async def _ask(self, system_prompt: str, messages: list[dict[str, str]]) -> str:
        client = self._get_client()
        resp = await client.messages.create(
            model=self.model,
            max_tokens=1500,
            system=system_prompt,
            messages=messages,
        )
        return "".join(getattr(b, "text", "") for b in resp.content)

    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: type[T],
    ) -> tuple[T, bool]:
        system = (
            f"{system_prompt}\n\nReturn one JSON object only, with no prose and no code fences. "
            f"It must match this JSON schema:\n{json.dumps(schema.model_json_schema())}"
        )
        messages = [{"role": "user", "content": user_prompt}]
        try:
            raw = await self._ask(system, messages)
            return schema.model_validate_json(extract_json(raw)), False
        except Exception as first_exc:
            logger.warning("Claude reply failed validation: %s; retrying once", first_exc)
            try:
                retry = [
                    *messages,
                    {"role": "assistant", "content": "{"},
                    {
                        "role": "user",
                        "content": f"That reply failed validation: {first_exc}. Return only the corrected JSON object.",
                    },
                ]
                raw = await self._ask(system, retry)
                return schema.model_validate_json(extract_json(raw)), False
            except Exception as retry_exc:
                logger.error("Claude retry failed: %s; degrading", retry_exc)
                return schema.model_validate({}), True



class GroqLLM(LLMClient):
    """Groq's OpenAI-compatible chat API in JSON mode, with one repair retry and graceful degrade."""

    URL = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.GROQ_API_KEY
        self.model = settings.GROQ_MODEL

    async def _ask(self, system_prompt: str, messages: list[dict[str, str]]) -> str:
        import httpx

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                self.URL,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "temperature": 0.0,
                    "max_tokens": 1500,
                    "response_format": {"type": "json_object"},
                    "messages": [{"role": "system", "content": system_prompt}, *messages],
                },
            )
            resp.raise_for_status()
            return str(resp.json()["choices"][0]["message"]["content"] or "")

    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: type[T],
    ) -> tuple[T, bool]:
        system = (
            f"{system_prompt}\n\nReturn one JSON object only. "
            f"It must match this JSON schema:\n{json.dumps(schema.model_json_schema())}"
        )
        messages = [{"role": "user", "content": user_prompt}]
        try:
            raw = await self._ask(system, messages)
            return schema.model_validate_json(extract_json(raw)), False
        except Exception as first_exc:
            logger.warning("Groq reply failed: %s; retrying once", first_exc)
            try:
                retry = [
                    *messages,
                    {"role": "user", "content": f"That reply failed validation: {first_exc}. Return only the corrected JSON object."},
                ]
                raw = await self._ask(system, retry)
                return schema.model_validate_json(extract_json(raw)), False
            except Exception as retry_exc:
                logger.error("Groq retry failed: %s; degrading", retry_exc)
                return schema.model_validate({}), True


_llm_instance: LLMClient | None = None


def llm_mode() -> str:
    """Which engine answers questions: "groq", "claude", "openai" or "scripted" (offline answers).

    A configured key decides. LLM_PROVIDER picks the preferred engine when several keys are set, and a
    stale provider name cannot hide a key that is set for another engine.
    """
    settings = get_settings()
    have = {
        "groq": bool(settings.GROQ_API_KEY),
        "claude": bool(settings.ANTHROPIC_API_KEY),
        "openai": bool(settings.OPENAI_API_KEY) and not settings.MOCK_EXTERNALS,
    }
    preferred = {"anthropic": "claude"}.get(settings.LLM_PROVIDER, settings.LLM_PROVIDER)
    if have.get(preferred):
        return preferred
    for mode in ("groq", "claude", "openai"):
        if have[mode]:
            return mode
    return "scripted"


def llm_model_name() -> str | None:
    """Model id used by the active engine, for display."""
    settings = get_settings()
    return {"groq": settings.GROQ_MODEL, "claude": settings.ANTHROPIC_MODEL, "openai": settings.LLM_MODEL}.get(
        llm_mode()
    )


def get_llm_client() -> LLMClient:
    """Return configured LLMClient instance for the current mode."""
    mode = llm_mode()
    if mode == "groq":
        return GroqLLM()
    if mode == "claude":
        return AnthropicLLM()
    if mode == "openai":
        return OpenAILLM()
    return MockLLM()

