"""Flat BM25 RAG baseline for comparison against NEXUS graph-temporal RAG."""

import json
import logging
import re
from pathlib import Path
from typing import Any

from rank_bm25 import BM25Okapi

logger = logging.getLogger(__name__)


def _tokenize(text: str) -> list[str]:
    """Tokenize text into lowercase alphanumeric tokens with simple suffix stemming."""
    tokens = []
    for w in re.findall(r"\w+", text.lower()):
        if w.endswith("ies"):
            w = w[:-3] + "y"
        elif w.endswith("es"):
            w = w[:-2]
        elif w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        tokens.append(w)
    return tokens


class BaselineRAG:
    """Flat RAG baseline using BM25Okapi over raw events and docs without graph reasoning."""

    def __init__(self, events_path: Path | None = None, docs_dir: Path | None = None) -> None:
        base_dir = Path(__file__).resolve().parent.parent.parent.parent
        self.events_path = events_path or (base_dir / "fixtures/company/events.jsonl")
        self.docs_dir = docs_dir or (base_dir / "fixtures/company/docs")

        self.documents: list[dict[str, Any]] = []
        self._load_corpus()

        self.corpus_tokens = [_tokenize(doc["text"]) for doc in self.documents]
        self.bm25 = BM25Okapi(self.corpus_tokens) if self.corpus_tokens else None

    def _load_corpus(self) -> None:
        """Load raw events from events.jsonl and markdown docs from docs dir."""
        self.documents = []

        # 1. Load events
        if self.events_path.exists():
            with open(self.events_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            data = json.loads(line)
                            doc_id = data.get("id", "unknown")
                            text = data.get("text", "")
                            self.documents.append(
                                {
                                    "id": doc_id,
                                    "text": text.strip(),
                                    "kind": data.get("kind"),
                                    "ts": data.get("ts"),
                                    "raw": data,
                                }
                            )
                        except json.JSONDecodeError:
                            continue

        # 2. Load markdown docs
        if self.docs_dir.exists():
            for doc_file in self.docs_dir.glob("*.md"):
                doc_id = doc_file.stem
                content = doc_file.read_text(encoding="utf-8")
                self.documents.append(
                    {
                        "id": doc_id,
                        "text": content,
                        "kind": "doc",
                        "ts": None,
                        "raw": {"id": doc_id, "text": content},
                    }
                )

    def search(self, query: str, top_k: int = 3) -> list[dict[str, Any]]:
        """Retrieve top-K ranked documents using BM25."""
        if not self.bm25 or not self.documents:
            return []

        tokens = _tokenize(query)
        if not tokens:
            return []

        scores = self.bm25.get_scores(tokens)
        scored_docs = list(zip(self.documents, scores, strict=False))
        scored_docs.sort(key=lambda x: float(x[1]), reverse=True)

        results: list[dict[str, Any]] = []
        for doc, score in scored_docs[:top_k]:
            results.append(
                {
                    "id": doc["id"],
                    "text": doc["text"],
                    "score": float(score),
                    "kind": doc.get("kind"),
                    "ts": doc.get("ts"),
                }
            )
        return results

    def answer(self, query: str) -> dict[str, Any]:
        """Answer a query using flat BM25 RAG: answer is the top-ranked text."""
        hits = self.search(query, top_k=3)
        if not hits:
            return {
                "answer": "No relevant documents found.",
                "hits": [],
                "current_sources": [],
                "superseded_sources": [],
            }

        top_hit = hits[0]
        return {
            "answer": top_hit["text"],
            "hits": hits,
            "current_sources": [h["id"] for h in hits],
            "superseded_sources": [],  # Flat RAG cannot flag superseded knowledge
        }


_baseline_instance: BaselineRAG | None = None


def get_baseline_rag() -> BaselineRAG:
    """Get singleton BaselineRAG instance."""
    global _baseline_instance
    if _baseline_instance is None:
        _baseline_instance = BaselineRAG()
    return _baseline_instance
