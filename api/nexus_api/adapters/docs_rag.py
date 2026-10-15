"""GraphRAG-SDK adapter for indexing and querying markdown docs in nexus_docs graph."""

import logging
import re
from pathlib import Path
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings

logger = logging.getLogger(__name__)


def _parse_markdown_doc(file_path: Path) -> dict[str, Any]:
    """Parse a markdown document into metadata, sections, and full text."""
    content = file_path.read_text(encoding="utf-8")
    doc_id = file_path.stem
    title = ""
    status = "Active"
    date = ""
    decision_id = ""
    ticket_ref = ""
    supersedes = ""

    lines = content.split("\n")
    if lines and lines[0].startswith("# "):
        title = lines[0].replace("# ", "").strip()

    for line in lines:
        line_clean = line.strip()
        if "**Status:**" in line_clean:
            status_match = re.search(r"\*\*Status:\*\*\s*(.+)", line_clean)
            if status_match:
                status = status_match.group(1).strip()
        elif "**Date:**" in line_clean:
            date_match = re.search(r"\*\*Date:\*\*\s*(.+)", line_clean)
            if date_match:
                date = date_match.group(1).strip()
        elif "**Decision ID:**" in line_clean:
            dec_match = re.search(r"\*\*Decision ID:\*\*\s*(.+)", line_clean)
            if dec_match:
                decision_id = dec_match.group(1).strip()
        elif "**Ticket Ref:**" in line_clean:
            ref_match = re.search(r"\*\*Ticket Ref:\*\*\s*(.+)", line_clean)
            if ref_match:
                ticket_ref = ref_match.group(1).strip()
        elif "**Supersedes:**" in line_clean or "Supersedes ADR-" in line_clean:
            sup_match = re.search(r"ADR-\d+", line_clean)
            if sup_match and sup_match.group(0) != doc_id:
                supersedes = sup_match.group(0)

    # Extract sections
    sections: list[dict[str, str]] = []
    current_sec_title = "Overview"
    current_sec_lines: list[str] = []

    for line in lines[1:]:
        if line.startswith("## "):
            if current_sec_lines:
                sections.append(
                    {
                        "title": current_sec_title,
                        "content": "\n".join(current_sec_lines).strip(),
                    }
                )
                current_sec_lines = []
            current_sec_title = line.replace("## ", "").strip()
        else:
            current_sec_lines.append(line)

    if current_sec_lines:
        sections.append(
            {
                "title": current_sec_title,
                "content": "\n".join(current_sec_lines).strip(),
            }
        )

    # Extract decision section if present
    decision_text = ""
    for sec in sections:
        if sec["title"].lower() == "decision":
            decision_text = sec["content"]
            break

    return {
        "id": doc_id,
        "title": title or doc_id,
        "status": status,
        "date": date,
        "decision_id": decision_id,
        "ticket_ref": ticket_ref,
        "supersedes": supersedes,
        "content": content,
        "decision": decision_text,
        "sections": sections,
        "path": str(file_path),
    }


class DocsRAGAdapter:
    """Manages document indexing into nexus_docs graph and retrieval."""

    def __init__(self, docs_dir: Path | None = None) -> None:
        self.settings = get_settings()
        self.falkor = get_falkor_client()
        self.graph_name = self.settings.GRAPH_DOCS
        base_dir = Path(__file__).resolve().parent.parent.parent.parent
        self.docs_dir = docs_dir or (base_dir / "fixtures/company/docs")
        self._live_rag: Any = None
        self._init_live_rag_if_possible()

    def _init_live_rag_if_possible(self) -> None:
        """Attempt to initialize GraphRAG-SDK if external keys are configured."""
        if self.settings.MOCK_EXTERNALS or not self.settings.OPENAI_API_KEY:
            return

        try:
            import graphrag_sdk

            conn = getattr(graphrag_sdk, "FalkorDBConnection", None)
            rag_cls = getattr(graphrag_sdk, "GraphRAG", None)
            if conn and rag_cls:
                db_conn = conn(
                    host=self.settings.FALKORDB_HOST,
                    port=self.settings.FALKORDB_PORT,
                )
                # GraphRAG 1.4.0 requires LLM and embedder instances when initialized
                logger.info("Found live GraphRAG-SDK with FalkorDBConnection: %s", db_conn)
        except Exception as exc:
            logger.warning(
                "Could not initialize live GraphRAG-SDK (%s). Falling back to graph-indexed text.",
                exc,
            )
            self._live_rag = None

    def index_documents(self) -> int:
        """Index all markdown documents in fixtures/company/docs into nexus_docs graph."""
        if not self.docs_dir.exists():
            logger.warning("Docs directory not found: %s", self.docs_dir)
            return 0

        doc_files = list(self.docs_dir.glob("*.md"))
        indexed_count = 0

        for doc_file in doc_files:
            parsed = _parse_markdown_doc(doc_file)
            doc_id = parsed["id"]

            # Upsert Document node in nexus_docs
            self.falkor.query(
                self.graph_name,
                """
                MERGE (d:Document {id: $id})
                SET d.title = $title,
                    d.status = $status,
                    d.date = $date,
                    d.decision_id = $decision_id,
                    d.ticket_ref = $ticket_ref,
                    d.supersedes = $supersedes,
                    d.content = $content,
                    d.decision = $decision,
                    d.path = $path
                """,
                {
                    "id": doc_id,
                    "title": parsed["title"],
                    "status": parsed["status"],
                    "date": parsed["date"],
                    "decision_id": parsed["decision_id"],
                    "ticket_ref": parsed["ticket_ref"],
                    "supersedes": parsed["supersedes"],
                    "content": parsed["content"],
                    "decision": parsed["decision"],
                    "path": parsed["path"],
                },
            )

            # Store sections
            for idx, sec in enumerate(parsed["sections"]):
                sec_id = f"{doc_id}#sec-{idx}"
                self.falkor.query(
                    self.graph_name,
                    """
                    MATCH (d:Document {id: $doc_id})
                    MERGE (s:Section {id: $sec_id})
                    SET s.title = $title,
                        s.content = $content
                    MERGE (s)-[:SECTION_OF]->(d)
                    """,
                    {
                        "doc_id": doc_id,
                        "sec_id": sec_id,
                        "title": sec["title"],
                        "content": sec["content"],
                    },
                )

            indexed_count += 1

        # Establish SUPERSEDES relationship between documents in nexus_docs
        self.falkor.query(
            self.graph_name,
            """
            MATCH (d1:Document)
            WHERE d1.supersedes IS NOT NULL AND d1.supersedes <> ""
            MATCH (d2:Document {id: d1.supersedes})
            MERGE (d1)-[:SUPERSEDES]->(d2)
            """,
        )

        logger.info("Indexed %d documents into %s graph", indexed_count, self.graph_name)
        return indexed_count

    async def search(self, query: str, top_k: int = 3) -> dict[str, Any]:
        """Search documentation graph for query with temporal/supersession resolution."""
        # 1. If live GraphRAG is active and configured
        if self._live_rag is not None:
            try:
                result = self._live_rag.ask(query)
                return {
                    "document_id": "graphrag-sdk",
                    "title": "GraphRAG-SDK Response",
                    "answer": str(result),
                    "content": str(result),
                    "status": "Active",
                    "hits": [],
                }
            except Exception as exc:
                logger.warning("GraphRAG-SDK ask failed (%s); using graph-indexed fallback", exc)

        # 2. Query nexus_docs graph in FalkorDB
        # Query all documents in nexus_docs
        res = self.falkor.query(
            self.graph_name,
            """
            MATCH (d:Document)
            OPTIONAL MATCH (d)-[:SUPERSEDES]->(sup:Document)
            RETURN d.id, d.title, d.status, d.date, d.decision, d.content, sup.id
            """,
        )

        docs: list[dict[str, Any]] = []
        if res and res.result_set:
            for row in res.result_set:
                docs.append(
                    {
                        "id": str(row[0]),
                        "title": str(row[1]),
                        "status": str(row[2]),
                        "date": str(row[3]),
                        "decision": str(row[4] or ""),
                        "content": str(row[5] or ""),
                        "supersedes": str(row[6] or "") if row[6] else None,
                    }
                )

        # If nexus_docs hasn't been seeded yet, index on-the-fly
        if not docs:
            self.index_documents()
            res = self.falkor.query(
                self.graph_name,
                """
                MATCH (d:Document)
                OPTIONAL MATCH (d)-[:SUPERSEDES]->(sup:Document)
                RETURN d.id, d.title, d.status, d.date, d.decision, d.content, sup.id
                """,
            )
            if res and res.result_set:
                for row in res.result_set:
                    docs.append(
                        {
                            "id": str(row[0]),
                            "title": str(row[1]),
                            "status": str(row[2]),
                            "date": str(row[3]),
                            "decision": str(row[4] or ""),
                            "content": str(row[5] or ""),
                            "supersedes": str(row[6] or "") if row[6] else None,
                        }
                    )

        # Rank documents based on query match and active supersession status
        scored_docs: list[tuple[float, dict[str, Any]]] = []
        tokens = [t.lower() for t in re.findall(r"\w+", query)]

        for d in docs:
            score = 0.0
            doc_text = (d["title"] + " " + d["decision"] + " " + d["content"]).lower()
            for t in tokens:
                if t in doc_text:
                    score += 1.0

            # Boost active and newer documents over superseded ones
            if "active" in d["status"].lower():
                score += 2.0
            if d.get("supersedes"):
                score += 1.5
            if "superseded" in d["status"].lower():
                score -= 1.0

            if score > 0:
                scored_docs.append((score, d))

        scored_docs.sort(key=lambda x: x[0], reverse=True)

        if not scored_docs:
            return {
                "document_id": "none",
                "title": "No matching documents",
                "answer": "No relevant documentation found.",
                "content": "",
                "status": "Unknown",
                "hits": [],
            }

        best_doc = scored_docs[0][1]
        best_answer = (
            best_doc["decision"]
            if best_doc.get("decision")
            else best_doc["content"][:300]
        )

        return {
            "document_id": best_doc["id"],
            "title": best_doc["title"],
            "status": best_doc["status"],
            "date": best_doc.get("date"),
            "decision_id": best_doc.get("decision_id"),
            "answer": best_answer,
            "content": best_doc["content"],
            "supersedes": best_doc.get("supersedes"),
            "hits": [doc[1]["id"] for doc in scored_docs[:top_k]],
        }


_docs_rag_instance: DocsRAGAdapter | None = None


def get_docs_rag() -> DocsRAGAdapter:
    """Get singleton DocsRAGAdapter instance."""
    global _docs_rag_instance
    if _docs_rag_instance is None:
        _docs_rag_instance = DocsRAGAdapter()
    return _docs_rag_instance


async def docs_search(query: str, top_k: int = 3) -> dict[str, Any]:
    """Execute docs search returning active document and extracted answer."""
    rag = get_docs_rag()
    return await rag.search(query, top_k=top_k)
