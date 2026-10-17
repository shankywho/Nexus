"""Unit tests for FalkorDB native agent memory engine (Track 02)."""


from nexus_api.memory.store import get_memory_store


def test_atomic_task_claim_prevents_double_handling() -> None:
    store = get_memory_store(tenant="test_acme")
    task_id = store.create_task("Test Task", "Desc", "INC-TEST", "Scout")
    
    # First claim must succeed
    claimed_first = store.claim_task_atomic(task_id, "Agent_1")
    assert claimed_first is True

    # Second claim must fail
    claimed_second = store.claim_task_atomic(task_id, "Agent_2")
    assert claimed_second is False


def test_semantic_fact_supersession() -> None:
    store = get_memory_store(tenant="test_acme")
    f1 = store.save_fact("auth-service", "ALGORITHM", "HS256")
    f2 = store.save_fact("auth-service", "ALGORITHM", "RS256")

    facts = store.list_facts(active_only=False)
    target_facts = [f for f in facts if f["subject"] == "auth-service"]
    
    assert len(target_facts) >= 2
    active = next(f for f in target_facts if f["id"] == f2)
    superseded = next(f for f in target_facts if f["id"] == f1)

    assert active["status"] == "active"
    assert active["invalid_at"] is None
    assert superseded["status"] == "superseded"
    assert superseded["invalid_at"] is not None


def test_procedural_memory_playbook_reuse() -> None:
    store = get_memory_store(tenant="test_acme")
    pattern = "incident_checkout_pattern"
    tools = ["blast_radius", "who_owns", "page_owner"]

    proc_id = store.register_procedure(pattern, tools)
    assert proc_id is not None

    lookup = store.find_procedure(pattern)
    assert lookup is not None
    assert lookup["tool_sequence"] == tools
    assert lookup["success_count"] >= 1


def test_tenant_memory_isolation() -> None:
    acme_store = get_memory_store(tenant="tenant_alpha")
    globex_store = get_memory_store(tenant="tenant_beta")

    # Clear both test graphs
    acme_store.reset()
    globex_store.reset()

    # Record in Alpha
    acme_store.record_episode("INC-ALPHA", "Goal Alpha", "Resolved Alpha", ["svc-alpha"])

    # Alpha must find it
    alpha_eps = acme_store.recall_episodes(["svc-alpha"])
    assert len(alpha_eps) == 1

    # Beta must find nothing
    beta_eps = globex_store.recall_episodes(["svc-alpha"])
    assert len(beta_eps) == 0


def test_conversation_history_persistence() -> None:
    store = get_memory_store(tenant="test_acme")
    conv_id = "conv_123"
    store.append_turn(conv_id, "user_1", "user", "What happened to sessions?")
    store.append_turn(conv_id, "user_1", "assistant", "Sessions moved back to Postgres per ADR-042.")

    turns = store.get_conversation_history(conv_id)
    assert len(turns) >= 2
    assert turns[0]["role"] == "user"
    assert turns[1]["role"] == "assistant"
