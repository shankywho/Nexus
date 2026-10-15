#!/usr/bin/env bash
set -euo pipefail

echo "==> Setting up NEXUS environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Copied .env.example to .env"
fi

mkdir -p var fixtures/company/docs docs/img

echo "==> Syncing Python dependencies in api/..."
(cd api && uv sync)

echo "==> Installing Node dependencies in web/..."
(cd web && npm ci)

echo "==> NEXUS setup complete."
