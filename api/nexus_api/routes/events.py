"""Server-Sent Events (SSE) route."""

from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from nexus_api.services.eventbus import get_eventbus

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("/stream")
async def events_stream() -> StreamingResponse:
    """Stream live events via SSE."""
    eventbus = get_eventbus()

    async def event_generator() -> AsyncIterator[str]:
        async for msg in eventbus.subscribe():
            yield msg

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
