"""In-process asynchronous event bus for SSE and internal notifications."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

logger = logging.getLogger(__name__)


class EventBus:
    """Pub/sub event bus supporting real-time SSE event broadcast."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._lock = asyncio.Lock()

    async def publish(self, event_type: str, data: dict[str, Any]) -> None:
        """Publish an event to all active subscribers."""
        event_payload = {
            "type": event_type,
            "data": data,
        }
        async with self._lock:
            dead_subscribers: list[asyncio.Queue[dict[str, Any]]] = []
            for queue in self._subscribers:
                try:
                    queue.put_nowait(event_payload)
                except asyncio.QueueFull:
                    dead_subscribers.append(queue)
                except Exception as exc:
                    logger.debug("Error putting event into subscriber queue: %s", exc)
                    dead_subscribers.append(queue)

            for dead in dead_subscribers:
                self._subscribers.discard(dead)

    async def subscribe(self, max_queue_size: int = 256) -> AsyncIterator[str]:
        """Subscribe to the event stream, yielding formatted SSE strings."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=max_queue_size)
        async with self._lock:
            self._subscribers.add(queue)

        try:
            while True:
                event = await queue.get()
                event_type = event.get("type", "message")
                data_json = json.dumps(event.get("data", {}))
                yield f"event: {event_type}\ndata: {data_json}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            async with self._lock:
                self._subscribers.discard(queue)


_eventbus_instance: EventBus | None = None


def get_eventbus() -> EventBus:
    """Get singleton EventBus instance."""
    global _eventbus_instance
    if _eventbus_instance is None:
        _eventbus_instance = EventBus()
    return _eventbus_instance
