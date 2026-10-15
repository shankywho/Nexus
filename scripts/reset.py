#!/usr/bin/env python3
"""Reset script: drops all nexus_* graphs and wipes SQLite trace database."""

import sys
from pathlib import Path

api_dir = Path(__file__).resolve().parent.parent / "api"
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.services.tracing import get_tracing_store


def main() -> None:
    falkor = get_falkor_client()
    dropped = falkor.reset_nexus_graphs()
    print("Dropped graphs:", dropped)

    tracing = get_tracing_store()
    tracing.reset_runs()
    print("Reset SQLite tracing runs and steps.")


if __name__ == "__main__":
    main()
