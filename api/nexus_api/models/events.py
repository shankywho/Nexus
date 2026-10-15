"""Tolerant event schemas for NEXUS ingestion."""

from pydantic import BaseModel, ConfigDict, Field


class FactItem(BaseModel):
    """Temporal fact extracted or mock-provided for an event."""

    model_config = ConfigDict(extra="allow")

    subject: str
    predicate: str
    object: str
    valid_at: str | None = None
    invalid_at: str | None = None


class EventRefs(BaseModel):
    """Entity references attached to an event."""

    model_config = ConfigDict(extra="allow")

    service_ids: list[str] = Field(default_factory=list)
    decision_id: str | None = None
    ticket_id: str | None = None
    doc_id: str | None = None
    pr_id: str | None = None


class SourceEventIn(BaseModel):
    """Tolerant input schema for ingested events."""

    model_config = ConfigDict(extra="allow")

    id: str | None = None
    org_id: str = "acme"
    kind: str | None = None
    ts: str | None = None
    actor: str | None = None
    channel: str | None = None
    thread_id: str | None = None
    text: str | None = None
    refs: EventRefs = Field(default_factory=EventRefs)
    supersedes: str | None = None
    reverses: str | None = None
    facts: list[FactItem] = Field(default_factory=list)


class IngestResult(BaseModel):
    """Response returned by /api/ingest/event."""

    status: str
    event_id: str
    duplicate: bool = False
    run_id: str
    step: str = "completed"
    error: str | None = None
