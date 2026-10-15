"""LLM client adapter with deterministic mock mode, repair retry, and graceful degradation."""

import abc
import logging
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


_llm_instance: LLMClient | None = None


def get_llm_client() -> LLMClient:
    """Return configured LLMClient instance."""
    global _llm_instance
    if _llm_instance is None:
        settings = get_settings()
        if settings.MOCK_EXTERNALS or not settings.OPENAI_API_KEY:
            _llm_instance = MockLLM()
        else:
            _llm_instance = OpenAILLM()
    return _llm_instance
