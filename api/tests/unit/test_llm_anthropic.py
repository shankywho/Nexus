"""Claude client: JSON extraction, retry, degrade, and provider selection. No network."""

import pytest
from pydantic import BaseModel

from nexus_api.adapters import llm as llm_mod
from nexus_api.adapters.llm import AnthropicLLM, extract_json, llm_mode
from nexus_api.config import get_settings
from nexus_api.services.graph_context import rank_events, tokens


class Out(BaseModel):
    answer: str = ""
    confidence: float = 0.5


def test_extract_json_handles_fences_and_prose() -> None:
    assert extract_json('```json\n{"answer": "x"}\n```') == '{"answer": "x"}'
    assert extract_json('Sure! {"answer": "y"} hope that helps') == '{"answer": "y"}'
    assert extract_json("no json here") == "no json here"


@pytest.mark.asyncio
async def test_generate_json_parses_fenced_reply(monkeypatch: pytest.MonkeyPatch) -> None:
    llm = AnthropicLLM()

    async def fake_ask(system: str, messages: list[dict[str, str]]) -> str:
        return '```json\n{"answer": "Postgres", "confidence": 0.9}\n```'

    monkeypatch.setattr(llm, "_ask", fake_ask)
    out, degraded = await llm.generate_json("sys", "q", Out)
    assert out.answer == "Postgres" and not degraded


@pytest.mark.asyncio
async def test_generate_json_retries_once_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    llm = AnthropicLLM()
    replies = iter(["not json", '{"answer": "ok"}'])

    async def fake_ask(system: str, messages: list[dict[str, str]]) -> str:
        return next(replies)

    monkeypatch.setattr(llm, "_ask", fake_ask)
    out, degraded = await llm.generate_json("sys", "q", Out)
    assert out.answer == "ok" and not degraded


@pytest.mark.asyncio
async def test_generate_json_degrades_after_two_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    llm = AnthropicLLM()

    async def fake_ask(system: str, messages: list[dict[str, str]]) -> str:
        raise RuntimeError("401 invalid x-api-key")

    monkeypatch.setattr(llm, "_ask", fake_ask)
    out, degraded = await llm.generate_json("sys", "q", Out)
    assert degraded and out.answer == ""


def test_llm_mode_follows_key(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    assert llm_mode() == "scripted"
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-test")
    assert llm_mode() == "claude"
    monkeypatch.setattr(llm_mod, "_llm_instance", None)
    assert isinstance(llm_mod.get_llm_client(), AnthropicLLM)
    monkeypatch.setattr(llm_mod, "_llm_instance", None)


def test_rank_events_prefers_matching_text_and_ids() -> None:
    events = [
        {"id": "e1", "ts": "2026-10-01", "text": "Lunch menu for Friday", "refs": {}},
        {"id": "e2", "ts": "2026-10-02", "text": "Redis eviction dropped sessions", "refs": {"decision_id": "DEC-017"}},
        {"id": "e3", "ts": "2026-10-03", "text": "Unrelated", "refs": {"decision_id": "DEC-099"}},
    ]
    picked = rank_events("Why did DEC-017 stop using Redis?", events)
    assert [e["id"] for e in picked] == ["e2"]
    assert "dec-017" in tokens("Why did DEC-017 stop?")


def test_stale_openai_provider_does_not_hide_an_anthropic_key(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-test")
    assert llm_mode() == "claude"
