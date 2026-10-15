"""Temporal graph adapter for bi-temporal facts and episodic memory."""

import abc
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings

logger = logging.getLogger(__name__)


class TemporalGraph(abc.ABC):
    """Abstract interface for temporal episodic graph backends."""

    @abc.abstractmethod
    async def add_episode(
        self,
        name: str,
        body: str,
        source_description: str,
        reference_time: str,
        group_id: str,
        facts: list[dict[str, Any]] | None = None,
    ) -> str:
        """Add an episodic event and extract/store temporal facts. Returns episode_uuid."""

    @abc.abstractmethod
    async def search(
        self,
        query: str,
        group_ids: list[str],
        num_results: int = 10,
    ) -> list[dict[str, Any]]:
        """Search temporal facts matching query across group_ids."""

    @abc.abstractmethod
    async def get_entity_edges(
        self,
        entity_name: str,
        group_id: str,
    ) -> list[dict[str, Any]]:
        """Get all temporal RELATES_TO edges connected to an entity."""


class MockTemporal(TemporalGraph):
    """Deterministic mock temporal engine writing Graphiti-compatible schema into FalkorDB."""

    def __init__(self, graph_name: str | None = None) -> None:
        settings = get_settings()
        self.graph_name = graph_name or settings.GRAPH_TEMPORAL
        self.falkor = get_falkor_client()

    async def add_episode(
        self,
        name: str,
        body: str,
        source_description: str,
        reference_time: str,
        group_id: str,
        facts: list[dict[str, Any]] | None = None,
    ) -> str:
        episode_uuid = f"ep_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(UTC).isoformat()

        # Create Episodic node
        create_ep_cypher = """
        MERGE (ep:Episodic {uuid: $uuid, group_id: $group_id})
        SET ep.name = $name,
            ep.body = $body,
            ep.source_description = $source_desc,
            ep.reference_time = $ref_time,
            ep.created_at = $created_at
        RETURN ep.uuid
        """
        self.falkor.query(
            self.graph_name,
            create_ep_cypher,
            {
                "uuid": episode_uuid,
                "group_id": group_id,
                "name": name,
                "body": body[:500],
                "source_desc": source_description,
                "ref_time": reference_time,
                "created_at": now_iso,
            },
        )

        # Ingest facts
        if facts:
            for fact in facts:
                subj = str(fact.get("subject", "")).strip()
                pred = str(fact.get("predicate", "RELATES_TO")).strip()
                obj = str(fact.get("object", "")).strip()
                v_at = fact.get("valid_at") or reference_time
                inv_at = fact.get("invalid_at")

                if not subj or not obj:
                    continue

                fact_text = f"{subj} {pred} {obj}"
                edge_uuid = f"edge_{uuid.uuid4().hex[:10]}"

                # 1. Upsert subject & object entities
                upsert_entities_cypher = """
                MERGE (s:Entity {name: $subj, group_id: $group_id})
                MERGE (o:Entity {name: $obj, group_id: $group_id})
                WITH s, o
                MATCH (ep:Episodic {uuid: $ep_uuid, group_id: $group_id})
                MERGE (ep)-[:MENTIONS]->(s)
                MERGE (ep)-[:MENTIONS]->(o)
                """
                self.falkor.query(
                    self.graph_name,
                    upsert_entities_cypher,
                    {
                        "subj": subj,
                        "obj": obj,
                        "group_id": group_id,
                        "ep_uuid": episode_uuid,
                    },
                )

                # 2. Check if we are invalidating an older matching fact
                if inv_at is not None:
                    invalidate_cypher = """
                    MATCH (s:Entity {name: $subj, group_id: $group_id})-[r:RELATES_TO]->(o:Entity {group_id: $group_id})
                    WHERE r.name = $pred OR r.fact CONTAINS $pred
                    SET r.invalid_at = $inv_at
                    """
                    self.falkor.query(
                        self.graph_name,
                        invalidate_cypher,
                        {
                            "subj": subj,
                            "group_id": group_id,
                            "pred": pred,
                            "inv_at": str(inv_at),
                        },
                    )

                # 3. Create or update fact edge
                edge_cypher = """
                MATCH (s:Entity {name: $subj, group_id: $group_id})
                MATCH (o:Entity {name: $obj, group_id: $group_id})
                CREATE (s)-[r:RELATES_TO {
                    uuid: $uuid,
                    group_id: $group_id,
                    name: $name,
                    fact: $fact,
                    valid_at: $valid_at,
                    invalid_at: $invalid_at,
                    episodes: [$ep_uuid],
                    created_at: $created_at
                }]->(o)
                """
                self.falkor.query(
                    self.graph_name,
                    edge_cypher,
                    {
                        "subj": subj,
                        "obj": obj,
                        "group_id": group_id,
                        "uuid": edge_uuid,
                        "name": pred,
                        "fact": fact_text,
                        "valid_at": str(v_at),
                        "invalid_at": str(inv_at) if inv_at else None,
                        "ep_uuid": episode_uuid,
                        "created_at": now_iso,
                    },
                )

        return episode_uuid

    async def search(
        self,
        query: str,
        group_ids: list[str],
        num_results: int = 10,
    ) -> list[dict[str, Any]]:
        group_id = group_ids[0] if group_ids else "acme"
        query_words = [w.lower() for w in query.split() if len(w) > 2]

        cypher = """
        MATCH (s:Entity {group_id: $group_id})-[r:RELATES_TO]->(o:Entity {group_id: $group_id})
        RETURN s.name AS subject, r.name AS predicate, o.name AS object,
               r.fact AS fact, r.valid_at AS valid_at, r.invalid_at AS invalid_at,
               r.episodes AS episodes, r.uuid AS uuid
        LIMIT $limit
        """
        res = self.falkor.query(
            self.graph_name, cypher, {"group_id": group_id, "limit": num_results * 3}
        )

        results: list[dict[str, Any]] = []
        if res and res.result_set:
            for row in res.result_set:
                fact_dict = {
                    "subject": row[0],
                    "predicate": row[1],
                    "object": row[2],
                    "fact": row[3],
                    "valid_at": row[4],
                    "invalid_at": row[5],
                    "episodes": row[6]
                    if isinstance(row[6], list)
                    else ([row[6]] if row[6] else []),
                    "uuid": row[7],
                }
                # Filter if query words present
                fact_str = f"{fact_dict['subject']} {fact_dict['predicate']} {fact_dict['object']} {fact_dict['fact']}".lower()
                if not query_words or any(w in fact_str for w in query_words):
                    results.append(fact_dict)
                if len(results) >= num_results:
                    break

        return results

    async def get_entity_edges(
        self,
        entity_name: str,
        group_id: str,
    ) -> list[dict[str, Any]]:
        cypher = """
        MATCH (s:Entity {group_id: $group_id})-[r:RELATES_TO]->(o:Entity {group_id: $group_id})
        WHERE toLower(s.name) = toLower($name) OR toLower(o.name) = toLower($name)
        RETURN s.name AS subject, r.name AS predicate, o.name AS object,
               r.fact AS fact, r.valid_at AS valid_at, r.invalid_at AS invalid_at,
               r.episodes AS episodes, r.uuid AS uuid
        """
        res = self.falkor.query(
            self.graph_name, cypher, {"group_id": group_id, "name": entity_name}
        )
        results: list[dict[str, Any]] = []
        if res and res.result_set:
            for row in res.result_set:
                results.append(
                    {
                        "subject": row[0],
                        "predicate": row[1],
                        "object": row[2],
                        "fact": row[3],
                        "valid_at": row[4],
                        "invalid_at": row[5],
                        "episodes": row[6]
                        if isinstance(row[6], list)
                        else ([row[6]] if row[6] else []),
                        "uuid": row[7],
                    }
                )
        return results


class GraphitiTemporal(TemporalGraph):
    """Live Graphiti temporal engine using FalkorDriver."""

    def __init__(self) -> None:
        settings = get_settings()
        self.settings = settings
        self._graphiti: Any = None

    async def _get_graphiti(self) -> Any:
        if self._graphiti is None:
            try:
                from graphiti_core import Graphiti
                from graphiti_core.driver.falkordb_driver import FalkorDriver

                driver = FalkorDriver(
                    host=self.settings.FALKORDB_HOST,
                    port=self.settings.FALKORDB_PORT,
                    username=self.settings.FALKORDB_USERNAME,
                    password=self.settings.FALKORDB_PASSWORD,
                    database=self.settings.GRAPH_TEMPORAL,
                )
                self._graphiti = Graphiti(graph_driver=driver)
                await self._graphiti.build_indices_and_constraints()
            except Exception as exc:
                logger.error("Failed to initialize live Graphiti: %s", exc)
                raise
        return self._graphiti

    async def add_episode(
        self,
        name: str,
        body: str,
        source_description: str,
        reference_time: str,
        group_id: str,
        facts: list[dict[str, Any]] | None = None,
    ) -> str:
        graphiti = await self._get_graphiti()
        ref_dt = datetime.fromisoformat(reference_time.replace("Z", "+00:00"))
        result = await graphiti.add_episode(
            name=name,
            episode_body=body,
            source_description=source_description,
            reference_time=ref_dt,
            group_id=group_id,
        )
        return str(result.episode.uuid)

    async def search(
        self,
        query: str,
        group_ids: list[str],
        num_results: int = 10,
    ) -> list[dict[str, Any]]:
        graphiti = await self._get_graphiti()
        edges = await graphiti.search(
            query=query, group_ids=group_ids, num_results=num_results
        )
        results: list[dict[str, Any]] = []
        for e in edges:
            results.append(
                {
                    "uuid": getattr(e, "uuid", None),
                    "fact": getattr(e, "fact", ""),
                    "name": getattr(e, "name", ""),
                    "valid_at": getattr(e, "valid_at", None),
                    "invalid_at": getattr(e, "invalid_at", None),
                    "episodes": getattr(e, "episodes", []),
                }
            )
        return results

    async def get_entity_edges(
        self,
        entity_name: str,
        group_id: str,
    ) -> list[dict[str, Any]]:
        # Fallback to Mock query directly from FalkorDB
        mock = MockTemporal(self.settings.GRAPH_TEMPORAL)
        return await mock.get_entity_edges(entity_name, group_id)


_temporal_instance: TemporalGraph | None = None


def get_temporal_graph() -> TemporalGraph:
    """Return active TemporalGraph implementation according to MOCK_EXTERNALS setting."""
    global _temporal_instance
    if _temporal_instance is None:
        settings = get_settings()
        if settings.MOCK_EXTERNALS:
            _temporal_instance = MockTemporal()
        else:
            _temporal_instance = GraphitiTemporal()
    return _temporal_instance
