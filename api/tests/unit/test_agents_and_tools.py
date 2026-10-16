"""Unit tests for agent tools registry, algorithms, and MCP dispatch."""

import pytest

from nexus_api.agents.tools import (
    TOOL_DEFINITIONS,
    TOOLS_BY_NAME,
    blast_radius,
    criticality_rank,
    decision_trace,
    find_experts,
    who_owns,
)


def test_tools_registry_contains_all_core_tools() -> None:
    expected_tools = {
        "blast_radius",
        "who_owns",
        "decision_trace",
        "criticality_rank",
        "find_experts",
        "recall",
        "remember",
        "open_ticket",
        "page_owner",
        "flag_decision_for_review",
    }
    assert expected_tools.issubset(set(TOOLS_BY_NAME.keys()))
    names_in_defs = {t["name"] for t in TOOL_DEFINITIONS}
    assert expected_tools.issubset(names_in_defs)


def test_who_owns_returns_explainable_cypher_and_rows() -> None:
    res = who_owns("session-store", org_id="acme")
    assert "result" in res
    assert "cypher" in res
    assert "MATCH (s:Service" in res["cypher"]
    assert "rows" in res
    assert "ms" in res
    assert "session-store" in res["touched_ids"]


def test_blast_radius_traversal() -> None:
    res = blast_radius("session-store", org_id="acme")
    assert "result" in res
    assert "cypher" in res
    assert "DEPENDS_ON" in res["cypher"]
    assert res["result"]["root_service"] == "session-store"


def test_criticality_rank_executes_algorithm() -> None:
    res = criticality_rank(org_id="acme")
    assert "result" in res
    assert "cypher" in res
    assert len(res["result"]) > 0


def test_decision_trace_finds_supersession() -> None:
    res = decision_trace("DEC-017", org_id="acme")
    assert "result" in res
    assert "cypher" in res
    assert "DEC-017" in res["touched_ids"]
