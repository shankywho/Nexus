"""Router agent for question classification and entity extraction."""

import re

from nexus_api.models.api import RouterOutput


def route_question(
    question: str, known_services: list[str] | None = None
) -> RouterOutput:
    """Classify user question and extract known entities."""
    q_lower = question.lower()
    intents: list[str] = []

    if re.search(
        r"\b(own|owns|owner|owners|maintains|maintainer|maintainers|ownership)\b",
        q_lower,
    ):
        intents.append("ownership")
    if re.search(
        r"\b(who knows|knows|expert|experts|expertise|bus factor|sme)\b", q_lower
    ):
        intents.append("expertise")
    if re.search(
        r"\b(why|decid|decide|decides|decided|decision|decisions|adr|adrs|ratif|ratify|ratified)\b",
        q_lower,
    ):
        intents.append("decision")
    if re.search(
        r"\b(still|current|stale|outdated|supersed|supersedes|superseded|valid)\b",
        q_lower,
    ):
        intents.append("staleness")

    if not intents:
        intents.append("general")

    # Extract services
    service_map = {
        "session store": "session-store",
        "session-store": "session-store",
        "sessions": "session-store",
        "auth gateway": "auth-gateway",
        "auth-gateway": "auth-gateway",
        "ledger": "ledger",
        "payouts": "payouts",
        "fraud scorer": "fraud-scorer",
        "fraud-scorer": "fraud-scorer",
        "notifications": "notifications",
        "web checkout": "web-checkout",
        "web-checkout": "web-checkout",
        "metrics pipeline": "metrics-pipeline",
        "metrics-pipeline": "metrics-pipeline",
    }
    extracted_services: list[str] = []
    entities: list[str] = []
    for phrase, s_id in service_map.items():
        if phrase in q_lower:
            if s_id not in extracted_services:
                extracted_services.append(s_id)
            if phrase not in entities:
                entities.append(phrase)

    # Extract decisions
    dec_matches = re.findall(r"\b(dec-\d+)\b", q_lower)
    extracted_decisions = [m.upper() for m in dec_matches]

    # Time scope
    time_scope = "current"
    if "historical" in q_lower or "past" in q_lower:
        time_scope = "historical"
    elif "as of" in q_lower:
        time_scope = "as_of"

    return RouterOutput(
        intents=intents,
        entities=entities,
        service_ids=extracted_services,
        decision_ids=extracted_decisions,
        time_scope=time_scope,
        as_of=None,
    )
