#!/usr/bin/env python3
"""Cross-platform repository sanitization script for NEXUS."""

import json
import os
import re
import shutil
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent


def log_warning_to_decisions(warning: str) -> None:
    """Log warning to DECISIONS.md if a file to be modified is missing."""
    decisions_file = root_dir / "DECISIONS.md"
    if decisions_file.exists():
        with open(decisions_file, "a", encoding="utf-8") as f:
            f.write(f"\n> **Warning (Sanitization):** {warning}\n")
    print(f"WARNING: {warning}")


def purge_caches_and_history() -> None:
    """Safely delete caches, build artifacts, virtualenvs, and .git history."""
    print("Purging caches, build artifacts, and history...")

    # Explicit directory paths to delete
    dirs_to_delete = [
        root_dir / ".git",
        root_dir / "web/.next",
        root_dir / "web/out",
        root_dir / "web/node_modules",
        root_dir / "api/.venv",
    ]

    for d in dirs_to_delete:
        if d.exists():
            print(f"  Removing directory: {d}")
            try:
                shutil.rmtree(d, ignore_errors=True)
            except Exception as e:
                print(f"  Failed to remove {d}: {e}")

    # Recursive __pycache__ directories
    for pycache in root_dir.rglob("__pycache__"):
        if pycache.is_dir():
            print(f"  Removing __pycache__: {pycache}")
            shutil.rmtree(pycache, ignore_errors=True)

    # Recursive .DS_Store files
    for ds_store in root_dir.rglob(".DS_Store"):
        if ds_store.is_file():
            print(f"  Removing .DS_Store: {ds_store}")
            try:
                ds_store.unlink(missing_ok=True)
            except Exception as e:
                print(f"  Failed to remove {ds_store}: {e}")

    # var/*.db and var/*.json
    var_dir = root_dir / "var"
    if var_dir.exists():
        for f in var_dir.glob("*.db"):
            print(f"  Removing db file: {f}")
            f.unlink(missing_ok=True)
        for f in var_dir.glob("*.json"):
            print(f"  Removing json file: {f}")
            f.unlink(missing_ok=True)


def sanitize_frontend_metadata() -> None:
    """Update web/package.json name to nexus-telemetry-hud and author to Shankar."""
    pkg_file = root_dir / "web/package.json"
    if not pkg_file.exists():
        log_warning_to_decisions("web/package.json not found during frontend metadata sanitization.")
        return

    print("Sanitizing web/package.json...")
    with open(pkg_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    data["name"] = "nexus-telemetry-hud"
    data["author"] = "Shankar"

    with open(pkg_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print("  web/package.json updated: name='nexus-telemetry-hud', author='Shankar'")


def sanitize_backend_metadata() -> None:
    """Update api/pyproject.toml name to nexus-api."""
    toml_file = root_dir / "api/pyproject.toml"
    if not toml_file.exists():
        log_warning_to_decisions("api/pyproject.toml not found during backend metadata sanitization.")
        return

    print("Sanitizing api/pyproject.toml...")
    content = toml_file.read_text(encoding="utf-8")
    new_content = re.sub(
        r'(?m)^name\s*=\s*"[^"]*"',
        'name = "nexus-api"',
        content,
        count=1,
    )
    toml_file.write_text(new_content, encoding="utf-8")
    print("  api/pyproject.toml updated: name = 'nexus-api'")


def strip_upstream_ui_watermarks() -> None:
    """Update title in web/app/layout.tsx to 'NEXUS // Organizational Telemetry'."""
    layout_file = root_dir / "web/app/layout.tsx"
    if not layout_file.exists():
        log_warning_to_decisions("web/app/layout.tsx not found during UI watermark sanitization.")
        return

    print("Sanitizing web/app/layout.tsx title...")
    content = layout_file.read_text(encoding="utf-8")

    # Replace metadata title
    new_content = re.sub(
        r'title:\s*"[^"]*"',
        'title: "NEXUS // Organizational Telemetry"',
        content,
    )
    # Replace <title> tag if present
    new_content = re.sub(
        r'<title>[^<]*</title>',
        '<title>NEXUS // Organizational Telemetry</title>',
        new_content,
    )

    layout_file.write_text(new_content, encoding="utf-8")
    print("  web/app/layout.tsx updated with title 'NEXUS // Organizational Telemetry'")


def main() -> None:
    purge_caches_and_history()
    sanitize_frontend_metadata()
    sanitize_backend_metadata()
    strip_upstream_ui_watermarks()
    print("Repository sanitization complete.")


if __name__ == "__main__":
    main()
