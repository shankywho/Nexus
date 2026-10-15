"""Integration test 9: GraphRAG-SDK and docs_rag adapter (nexus_docs graph)."""

import contextlib

import pytest

from nexus_api.adapters.docs_rag import docs_search, get_docs_rag
from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings


@pytest.mark.asyncio
async def test_integration_9_docs_rag_session_store() -> None:
    """Integration test 9: docs_search returns ADR-042 for 'session store' and contains Postgres."""
    settings = get_settings()
    falkor = get_falkor_client()

    # 1. Reset nexus_docs graph and index documents
    with contextlib.suppress(Exception):
        falkor.query(settings.GRAPH_DOCS, "MATCH (n) DETACH DELETE n")

    rag = get_docs_rag()
    count = rag.index_documents()
    assert count >= 3, f"Expected at least 3 documents indexed, got {count}"

    # 2. Query nexus_docs graph for 'session store'
    result = await docs_search("session store")

    assert result is not None
    assert result["document_id"] == "ADR-042", f"Expected ADR-042, got {result['document_id']}"
    assert "ADR-042" in result["title"]
    assert "Active" in result["status"]

    # 3. Verify content or answer explicitly specifies Postgres
    content_and_answer = (result["content"] + " " + result["answer"]).lower()
    assert "postgres" in content_and_answer, "ADR-042 must confirm Postgres for session store"
    assert "supersedes" in content_and_answer or result.get("supersedes") == "ADR-038"

    # 4. Check that hits contain all relevant docs with ADR-042 ranked first
    hits = result.get("hits", [])
    assert len(hits) >= 1
    assert hits[0] == "ADR-042"
