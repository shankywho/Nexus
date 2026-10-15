"""Ask HTTP routes."""

from fastapi import APIRouter

from nexus_api.models.api import AskRequest, AskResponse
from nexus_api.services.ask_agent import answer_question

router = APIRouter(prefix="/api/ask", tags=["ask"])


@router.post("", response_model=AskResponse)
async def ask_nexus(request: AskRequest) -> AskResponse:
    """Ask NEXUS a question; returns answer with current and superseded sources."""
    return await answer_question(request)
