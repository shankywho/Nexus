"""API request and response schemas."""

from pydantic import BaseModel, ConfigDict, Field


class RouterOutput(BaseModel):
    """Structured router output identifying intents and entities."""

    model_config = ConfigDict(extra="allow")

    intents: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)
    service_ids: list[str] = Field(default_factory=list)
    decision_ids: list[str] = Field(default_factory=list)
    time_scope: str = "current"
    as_of: str | None = None


class SourceRef(BaseModel):
    """Source reference for current or superseded answers."""

    model_config = ConfigDict(extra="allow")

    id: str
    label: str
    date: str | None = None
    via: str | None = None
    reason: str | None = None


class OwnerRef(BaseModel):
    """Owner or maintainer reference."""

    person: str
    role: str


class AskRequest(BaseModel):
    """Request payload for /api/ask."""

    question: str
    as_of: str | None = None


class AskResponse(BaseModel):
    """Response payload for /api/ask."""

    model_config = ConfigDict(extra="allow")

    answer: str
    current_sources: list[SourceRef] = Field(default_factory=list)
    superseded_sources: list[SourceRef] = Field(default_factory=list)
    path: list[str] = Field(default_factory=list)
    owners: list[OwnerRef] = Field(default_factory=list)
    confidence: float = 0.9
    degraded: bool = False
    run_id: str = ""
