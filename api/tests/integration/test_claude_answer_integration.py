"""Integration: a Claude answer is grounded in graph context and its invented ids are dropped."""

import json

import pytest
from httpx import AsyncClient
from scripts.seed import ensure_schema_indexes, seed_events, seed_people_and_services

from nexus_api.adapters import llm as llm_mod
from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings


@pytest.mark.asyncio
async def test_claude_answer_is_validated_against_graph(
    async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    falkor = get_falkor_client()
    falkor.reset_nexus_graphs()
    ensure_schema_indexes()
    seed_people_and_services()
    await seed_events()

    settings = get_settings()
    monkeypatch.setattr(settings, "LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setattr(llm_mod, "_llm_instance", None)

    seen: dict[str, list[str]] = {}

    async def fake_ask(self: llm_mod.AnthropicLLM, system: str, messages: list[dict[str, str]]) -> str:
        ctx = json.loads(messages[0]["content"])["graph_context"]
        seen["decisions"] = [d["id"] for d in ctx["decisions"]]
        return json.dumps(
            {
                "answer": "Gateway JWTs use RS256 with KMS rotation (DEC-033).",
                "current_sources": [{"id": "ADR-049", "label": "ADR-049"}, {"id": "ADR-999", "label": "invented"}],
                "superseded_sources": [{"id": "ADR-031", "label": "ADR-031", "reason": "Replaced by ADR-049"}],
                "path": ["DEC-033", "DEC-404"],
                "owners": [],
                "confidence": 0.9,
            }
        )

    monkeypatch.setattr(llm_mod.AnthropicLLM, "_ask", fake_ask)

    res = await async_client.post("/api/ask", json={"question": "Which JWT signing algorithm does auth-gateway use?"})
    monkeypatch.setattr(llm_mod, "_llm_instance", None)
    data = res.json()

    assert data["mode"] == "claude"
    assert "DEC-033" in seen["decisions"]
    assert [s["id"] for s in data["current_sources"]] == ["ADR-049"]
    assert data["path"] == ["DEC-033"]
