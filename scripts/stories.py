"""Three more correlated storylines for the Acme Payments fixtures (evt-0051 onward).

Auth Gateway: JWTs signed with a shared HS256 secret (DEC-030), a secret leak (INC-81), then RS256 with
KMS-backed rotation (DEC-033, supersedes DEC-030).
Notifications: one SMS provider (DEC-028), an outage (INC-79), then a primary plus fallback (DEC-032,
supersedes DEC-028).
Metrics pipeline: an OpenTelemetry collector decision (DEC-035) that is still active.
"""

from typing import Any

_n = 50


def _ev(
    kind: str,
    ts: str,
    actor: str,
    channel: str,
    text: str,
    services: list[str],
    *,
    thread: str | None = None,
    decision: str | None = None,
    ticket: str | None = None,
    doc: str | None = None,
    pr: str | None = None,
    supersedes: str | None = None,
    facts: list[tuple[str, str, str]] | None = None,
) -> dict[str, Any]:
    global _n
    _n += 1
    return {
        "id": f"evt-{_n:04d}",
        "org_id": "acme",
        "kind": kind,
        "ts": ts,
        "actor": actor,
        "channel": channel,
        "thread_id": thread,
        "text": text,
        "refs": {"service_ids": services, "decision_id": decision, "ticket_id": ticket, "doc_id": doc, "pr_id": pr},
        "supersedes": supersedes,
        "reverses": None,
        "facts": [
            {"subject": s, "predicate": p, "object": o, "valid_at": ts, "invalid_at": None} for s, p, o in (facts or [])
        ],
    }


def story_events() -> list[dict[str, Any]]:
    global _n
    _n = 50
    t_auth = "slack:eng-security:1757664000"
    t_sms = "slack:growth-ops:1757750400"
    t_otel = "slack:sre-platform:1758009600"
    a = ["auth-gateway"]
    n = ["notifications"]
    m = ["metrics-pipeline"]
    return [
        # --- Auth Gateway: HS256 shared secret (DEC-030) -> RS256 with rotation (DEC-033) ---
        _ev("slack_message", "2026-09-12T09:00:00Z", "vikram", "eng-security",
            "Every gateway pod validates JWTs with one shared HS256 secret from the config map. Simple, but rotating it means a full redeploy.",
            a, thread=t_auth, decision="DEC-030", facts=[("auth-gateway", "SIGNS_JWT_WITH", "HS256-shared-secret")]),
        _ev("slack_message", "2026-09-12T09:20:00Z", "arjun", "eng-security",
            "Fine for now, we ship PCI scope reduction first. Let's write it down as the signing decision and revisit after the audit.",
            a, thread=t_auth, decision="DEC-030"),
        _ev("linear_ticket", "2026-09-14T10:00:00Z", "vikram", "linear",
            "LIN-361: Standardize JWT signing on HS256 with a shared secret across auth-gateway pods.",
            a, decision="DEC-030", ticket="LIN-361", facts=[("auth-gateway", "TRACKED_BY", "LIN-361")]),
        _ev("adr", "2026-09-16T14:00:00Z", "vikram", "docs",
            "ADR-031: JWT signing with a shared HS256 secret in auth-gateway.",
            a, decision="DEC-030", ticket="LIN-361", doc="ADR-031",
            facts=[("auth-gateway", "DOCUMENTED_IN", "ADR-031")]),
        _ev("github_pr", "2026-09-18T16:30:00Z", "vikram", "github",
            "PR-1131: Validate gateway JWTs with the shared HS256 secret and cache verified claims for 60s.",
            a, decision="DEC-030", ticket="LIN-361", doc="ADR-031", pr="PR-1131"),
        _ev("incident", "2026-10-08T02:40:00Z", "meera", "incident-ops",
            "INC-81: The shared HS256 signing secret was printed to a debug log in an unrelated service. Any holder could mint valid tokens until rotation.",
            a, facts=[("auth-gateway", "EXPOSED", "HS256-shared-secret")]),
        _ev("slack_message", "2026-10-08T03:05:00Z", "arjun", "incident-ops",
            "Rotating the secret needs a redeploy of every pod and would log out all users. We cannot keep a single shared secret. Moving to asymmetric keys.",
            a, thread="slack:incident-ops:1759891500"),
        _ev("linear_ticket", "2026-10-09T09:30:00Z", "vikram", "linear",
            "LIN-418: Move gateway JWT signing to RS256 with per-pod keys rotated through KMS every 24 hours.",
            a, decision="DEC-033", ticket="LIN-418", supersedes="DEC-030",
            facts=[("auth-gateway", "SIGNS_JWT_WITH", "RS256-KMS-rotation")]),
        _ev("adr", "2026-10-11T15:00:00Z", "vikram", "docs",
            "ADR-049: Gateway JWTs are signed with RS256 and rotated through KMS (supersedes ADR-031). Invalidates the shared HS256 secret.",
            a, decision="DEC-033", ticket="LIN-418", doc="ADR-049", supersedes="DEC-030",
            facts=[("auth-gateway", "DOCUMENTED_IN", "ADR-049")]),
        _ev("github_pr", "2026-10-12T17:45:00Z", "leo", "github",
            "PR-1203: Roll out RS256 signing and KMS key rotation in auth-gateway; remove the HS256 secret from the config map.",
            a, decision="DEC-033", ticket="LIN-418", doc="ADR-049", pr="PR-1203", supersedes="DEC-030"),
        # --- Notifications: single SMS provider (DEC-028) -> primary plus fallback (DEC-032) ---
        _ev("slack_message", "2026-09-13T11:00:00Z", "david", "growth-ops",
            "SwiftSMS quoted us a volume discount if we route all OTP and receipt texts through them. One vendor keeps the dispatcher simple.",
            n, thread=t_sms, decision="DEC-028", facts=[("notifications", "SENDS_SMS_VIA", "SwiftSMS")]),
        _ev("slack_message", "2026-09-13T11:25:00Z", "sarah", "growth-ops",
            "Checkout depends on the OTP text arriving. Is there a fallback if they have a bad day?",
            n, thread=t_sms, decision="DEC-028"),
        _ev("slack_message", "2026-09-13T11:40:00Z", "david", "growth-ops",
            "Their SLA is 99.95 percent. We accept the single-provider risk for the discount.",
            n, thread=t_sms, decision="DEC-028"),
        _ev("linear_ticket", "2026-09-15T13:00:00Z", "david", "linear",
            "LIN-366: Route all notification-dispatcher SMS traffic through SwiftSMS.",
            n, decision="DEC-028", ticket="LIN-366"),
        _ev("adr", "2026-09-19T10:00:00Z", "david", "docs",
            "ADR-033: Single SMS provider (SwiftSMS) for the notification dispatcher.",
            n, decision="DEC-028", ticket="LIN-366", doc="ADR-033",
            facts=[("notifications", "DOCUMENTED_IN", "ADR-033")]),
        _ev("incident", "2026-10-05T14:10:00Z", "sarah", "incident-ops",
            "INC-79: SwiftSMS had a regional outage for two hours. 41 percent of checkout OTP texts failed and conversion dropped.",
            n + ["web-checkout"], facts=[("notifications", "FAILED_DUE_TO", "SwiftSMS-outage")]),
        _ev("slack_message", "2026-10-06T09:15:00Z", "david", "growth-ops",
            "We should never have run on one carrier. Adding BeamSMS as an automatic fallback behind SwiftSMS.",
            n, thread="slack:growth-ops:1759742100"),
        _ev("linear_ticket", "2026-10-07T10:30:00Z", "david", "linear",
            "LIN-415: Send SMS through SwiftSMS first with automatic failover to BeamSMS after two consecutive errors.",
            n, decision="DEC-032", ticket="LIN-415", supersedes="DEC-028",
            facts=[("notifications", "SENDS_SMS_VIA", "SwiftSMS-with-BeamSMS-failover")]),
        _ev("adr", "2026-10-09T16:00:00Z", "david", "docs",
            "ADR-048: SMS uses SwiftSMS with automatic BeamSMS failover (supersedes ADR-033). Invalidates the single-provider setup.",
            n, decision="DEC-032", ticket="LIN-415", doc="ADR-048", supersedes="DEC-028",
            facts=[("notifications", "DOCUMENTED_IN", "ADR-048")]),
        _ev("github_pr", "2026-10-10T18:00:00Z", "david", "github",
            "PR-1198: Add provider failover and a health probe to the notification dispatcher.",
            n, decision="DEC-032", ticket="LIN-415", doc="ADR-048", pr="PR-1198", supersedes="DEC-028"),
        # --- Metrics pipeline: OpenTelemetry collector (DEC-035), still active ---
        _ev("slack_message", "2026-09-16T10:00:00Z", "aisha", "sre-platform",
            "Each team ships its own metrics agent and label scheme. Dashboards break whenever a service renames a label.",
            m, thread=t_otel),
        _ev("slack_message", "2026-09-16T10:18:00Z", "meera", "sre-platform",
            "One OpenTelemetry collector in front of the pipeline would give us one schema and one place to drop noisy series.",
            m, thread=t_otel, facts=[("metrics-pipeline", "COLLECTS_VIA", "OpenTelemetry-collector")]),
        _ev("linear_ticket", "2026-09-22T09:00:00Z", "aisha", "linear",
            "LIN-420: Deploy a shared OpenTelemetry collector and migrate service agents to it.",
            m, decision="DEC-035", ticket="LIN-420"),
        _ev("adr", "2026-09-30T13:00:00Z", "aisha", "docs",
            "ADR-050: Adopt the OpenTelemetry collector as the single ingestion path for metrics-pipeline.",
            m, decision="DEC-035", ticket="LIN-420", doc="ADR-050",
            facts=[("metrics-pipeline", "DOCUMENTED_IN", "ADR-050")]),
        _ev("github_pr", "2026-10-07T15:20:00Z", "aisha", "github",
            "PR-1190: Add the OpenTelemetry collector deployment and a label-normalising processor.",
            m, decision="DEC-035", ticket="LIN-420", doc="ADR-050", pr="PR-1190"),
        _ev("slack_message", "2026-10-13T12:00:00Z", "meera", "sre-platform",
            "Collector migration is done for payments-core and platform. Growth services move next sprint. Dashboards no longer break on label renames.",
            m, thread="slack:sre-platform:1760356800", decision="DEC-035"),
    ]
