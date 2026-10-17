"""Integration test 12: evaluation benchmark and money shot (scripts/eval.py)."""

import asyncio
import json
import os
import sys
from pathlib import Path

import pytest
from scripts.seed import ensure_schema_indexes, seed_events, seed_people_and_services

from nexus_api.adapters.falkor import get_falkor_client


@pytest.mark.asyncio
async def test_integration_12_eval_benchmark() -> None:
    """Integration test 12: scripts/eval.py exits 0, var/eval.json exists, NEXUS accuracy >= 0.9, stale rate == 0.0."""
    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    eval_script = root_dir / "scripts/eval.py"
    eval_json = root_dir / "var/eval.json"

    # 1. Reset and seed full database to ensure NEXUS has complete graph state
    falkor = get_falkor_client()
    falkor.reset_nexus_graphs()
    ensure_schema_indexes()
    seed_people_and_services()
    await seed_events()

    # 2. Run scripts/eval.py as an async subprocess using current python executable
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        str(eval_script),
        cwd=str(root_dir / "api"),
        env={**os.environ, "GROQ_API_KEY": "", "ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": ""},
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_b, stderr_b = await proc.communicate()
    stdout = stdout_b.decode("utf-8")
    stderr = stderr_b.decode("utf-8")

    print("STDOUT:", stdout)
    if proc.returncode != 0:
        print("STDERR:", stderr)

    assert proc.returncode == 0, f"eval.py failed with returncode {proc.returncode}"
    assert eval_json.exists(), f"{eval_json} does not exist"

    # 3. Validate metrics in var/eval.json
    with open(eval_json, encoding="utf-8") as f:
        metrics = json.load(f)

    nexus_metrics = metrics.get("nexus", {})
    flat_rag_metrics = metrics.get("flat_rag", {})

    assert nexus_metrics.get("current_answer_accuracy", 0.0) >= 0.9, (
        f"NEXUS accuracy {nexus_metrics.get('current_answer_accuracy')} < 0.9"
    )
    assert nexus_metrics.get("stale_answer_rate", 1.0) == 0.0, (
        f"NEXUS stale rate {nexus_metrics.get('stale_answer_rate')} != 0.0"
    )
    assert nexus_metrics.get("answers_with_sources", 0.0) >= 0.9
    assert nexus_metrics.get("superseded_sources_flagged", 0.0) >= 0.8

    # Assert flat RAG exhibits stale answers where graph-temporal reasoning is absent
    assert flat_rag_metrics.get("stale_answer_rate", 0.0) >= 0.3, (
        f"Flat RAG stale answer rate {flat_rag_metrics.get('stale_answer_rate')} < 0.3"
    )
    assert flat_rag_metrics.get("superseded_sources_flagged", 1.0) == 0.0
