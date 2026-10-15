"""FalkorDB client adapter for NEXUS."""

import logging
from typing import Any

import falkordb
from falkordb.graph import Graph

from nexus_api.config import get_settings

logger = logging.getLogger(__name__)


class FalkorClient:
    """Wrapper around FalkorDB client providing query, health check, and graph management."""

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        username: str | None = None,
        password: str | None = None,
    ) -> None:
        settings = get_settings()
        self.host = host or settings.FALKORDB_HOST
        self.port = port or settings.FALKORDB_PORT
        self.username = username or settings.FALKORDB_USERNAME
        self.password = password or settings.FALKORDB_PASSWORD
        self._client: falkordb.FalkorDB | None = None

    @property
    def client(self) -> falkordb.FalkorDB:
        """Get or initialize the underlying FalkorDB client."""
        if self._client is None:
            self._client = falkordb.FalkorDB(
                host=self.host,
                port=self.port,
                username=self.username,
                password=self.password,
            )
        return self._client

    def ping(self) -> bool:
        """Check connection to FalkorDB."""
        try:
            self.client.connection.ping()
            return True
        except Exception as exc:
            logger.warning("FalkorDB ping failed: %s", exc)
            return False

    def get_graph(self, graph_name: str) -> Graph:
        """Select a named graph."""
        return self.client.select_graph(graph_name)

    def list_graphs(self) -> list[str]:
        """List all active graphs in FalkorDB."""
        try:
            graphs = self.client.list_graphs()
            return [str(g) for g in graphs]
        except Exception as exc:
            logger.warning("Failed to list graphs: %s", exc)
            return []

    def count_nodes(self, graph_name: str) -> int:
        """Count nodes in graph. Returns 0 if graph does not exist."""
        try:
            if graph_name not in self.list_graphs():
                return 0
            g = self.get_graph(graph_name)
            res = g.query("MATCH (n) RETURN count(n) AS cnt")
            if res.result_set and len(res.result_set) > 0:
                row = res.result_set[0]
                if isinstance(row, (list, tuple)) and len(row) > 0:
                    val = row[0]
                    return int(val) if val is not None else 0
            return 0
        except Exception as exc:
            logger.debug("count_nodes failed for %s: %s", graph_name, exc)
            return 0

    def query(
        self,
        graph_name: str,
        cypher: str,
        params: dict[str, Any] | None = None,
    ) -> Any:
        """Execute parameterized Cypher query on specified graph."""
        g = self.get_graph(graph_name)
        return g.query(cypher, params or {})

    def delete_graph(self, graph_name: str) -> bool:
        """Drop a named graph if it exists."""
        try:
            if graph_name in self.list_graphs():
                g = self.get_graph(graph_name)
                g.delete()
                logger.info("Deleted graph %s", graph_name)
                return True
            return False
        except Exception as exc:
            logger.warning("Failed to delete graph %s: %s", graph_name, exc)
            return False

    def reset_nexus_graphs(self) -> dict[str, bool]:
        """Drop all nexus_* graphs."""
        settings = get_settings()
        graphs_to_drop = [
            settings.GRAPH_COMPANY,
            settings.GRAPH_TEMPORAL,
            settings.GRAPH_DOCS,
        ]
        # Also drop any other nexus_* graphs found
        all_graphs = self.list_graphs()
        for g_name in all_graphs:
            if g_name.startswith("nexus_") and g_name not in graphs_to_drop:
                graphs_to_drop.append(g_name)

        results: dict[str, bool] = {}
        for g_name in graphs_to_drop:
            results[g_name] = self.delete_graph(g_name)
        return results


_falkor_instance: FalkorClient | None = None


def get_falkor_client() -> FalkorClient:
    """Get singleton FalkorClient instance."""
    global _falkor_instance
    if _falkor_instance is None:
        _falkor_instance = FalkorClient()
    return _falkor_instance
