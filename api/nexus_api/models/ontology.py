"""Typed ontology models and enums for nexus_company graph."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class NodeLabel(str, Enum):
    PERSON = "Person"
    TEAM = "Team"
    SERVICE = "Service"
    PROJECT = "Project"
    DECISION = "Decision"
    SLACK_THREAD = "SlackThread"
    TICKET = "Ticket"
    DOCUMENT = "Document"
    PULL_REQUEST = "PullRequest"
    INCIDENT = "Incident"
    SOURCE_EVENT = "SourceEvent"


class EdgeType(str, Enum):
    MEMBER_OF = "MEMBER_OF"
    OWNS = "OWNS"
    MAINTAINS = "MAINTAINS"
    AUTHORED = "AUTHORED"
    PARTICIPATED_IN = "PARTICIPATED_IN"
    DECIDED_IN = "DECIDED_IN"
    TRACKED_BY = "TRACKED_BY"
    DOCUMENTED_IN = "DOCUMENTED_IN"
    IMPLEMENTED_BY = "IMPLEMENTED_BY"
    AFFECTS = "AFFECTS"
    DEPENDS_ON = "DEPENDS_ON"
    SUPERSEDES = "SUPERSEDES"
    REVERSES = "REVERSES"
    TRIGGERED = "TRIGGERED"
    KNOWS_ABOUT = "KNOWS_ABOUT"
    DERIVED_FROM = "DERIVED_FROM"
    HANDOFF = "HANDOFF"
    TOUCHED = "TOUCHED"
    STEP = "STEP"
    ASSIGNED_TO = "ASSIGNED_TO"


class DecisionStatus(str, Enum):
    PROPOSED = "proposed"
    ACTIVE = "active"
    SUPERSEDED = "superseded"


class BaseGraphNode(BaseModel):
    """Base model for every node in nexus_company."""

    model_config = ConfigDict(extra="allow")

    id: str
    org_id: str = "acme"
    source_event_ids: list[str] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None


class PersonNode(BaseGraphNode):
    name: str
    role: str
    email_hash: str


class TeamNode(BaseGraphNode):
    name: str


class ServiceNode(BaseGraphNode):
    name: str
    tier: int = 1
    description: str = ""
    depends_on: list[str] = Field(default_factory=list)


class ProjectNode(BaseGraphNode):
    name: str
    status: str = "active"


class DecisionNode(BaseGraphNode):
    title: str
    summary: str
    status: DecisionStatus = DecisionStatus.PROPOSED
    decided_at: str | None = None
    superseded_at: str | None = None
    superseded_by: str | None = None


class SlackThreadNode(BaseGraphNode):
    channel: str
    ts: str
    summary: str
    url: str


class TicketNode(BaseGraphNode):
    system: str = "linear"  # linear | jira
    title: str
    status: str = "open"
    url: str


class DocumentNode(BaseGraphNode):
    kind: str = "adr"  # adr | notion | runbook
    title: str
    url: str
    doc_path: str | None = None


class PullRequestNode(BaseGraphNode):
    repo: str
    number: int
    merged_at: str | None = None
    url: str


class IncidentNode(BaseGraphNode):
    severity: str = "sev-1"
    started_at: str
    summary: str


class SourceEventNode(BaseGraphNode):
    kind: str
    ts: str
    raw_json: str
    episode_uuid: str | None = None
    ingested_at: str | None = None
    temporal_status: str | None = None


class GraphEdge(BaseModel):
    """Generic edge in nexus_company."""

    model_config = ConfigDict(extra="allow")

    source_id: str
    target_id: str
    rel_type: EdgeType
    props: dict[str, Any] = Field(default_factory=dict)
