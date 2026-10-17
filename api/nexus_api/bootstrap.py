"""Optional startup seeding for hosts without a shell (set AUTO_SEED=baseline or full)."""

import asyncio
import logging
import sys
from pathlib import Path

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings

logger = logging.getLogger(__name__)

BASELINE_UNTIL = "2026-09-30"


def _graph_is_empty() -> bool:
    settings = get_settings()
    return get_falkor_client().count_nodes(settings.GRAPH_COMPANY) == 0


async def seed_if_empty() -> None:
    """Load the sample company when nexus_company has no nodes. Never touches a populated graph."""
    mode = get_settings().AUTO_SEED.strip().lower()
    if mode not in {"baseline", "full"}:
        logger.warning("AUTO_SEED=%r ignored; use 'baseline' or 'full'", mode)
        return
    try:
        if not await asyncio.to_thread(_graph_is_empty):
            logger.info("AUTO_SEED skipped: nexus_company already has data")
            return
        root = str(
            Path(__file__).resolve().parents[2]
        )  # repo root (or /app in Docker) holds scripts/
        if root not in sys.path:
            sys.path.insert(0, root)
        from scripts.seed import (
            ensure_schema_indexes,
            seed_events,
            seed_people_and_services,
        )
        from scripts.seed_memory import ACME, GLOBEX, fill

        logger.info("AUTO_SEED=%s: loading sample data", mode)
        await asyncio.to_thread(ensure_schema_indexes)
        await asyncio.to_thread(seed_people_and_services)
        count = await seed_events(until=BASELINE_UNTIL if mode == "baseline" else None)
        await asyncio.to_thread(fill, "acme", ACME, "on-call owner")
        await asyncio.to_thread(fill, "globex", GLOBEX, "on-call owner")
        logger.info("AUTO_SEED done: %d events", count)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("AUTO_SEED failed")
