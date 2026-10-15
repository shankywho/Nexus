.PHONY: help setup up down seed sync eval test lint reset

help:
	@grep -E '^[a-z]+:' Makefile | cut -d: -f1 | tr '\n' ' '; echo

setup:
	bash scripts/setup.sh

up:
	docker compose up -d --build

down:
	docker compose down

seed:
	cd api && uv run python ../scripts/seed.py

sync:
	cd api && uv run python ../scripts/replay.py --mode simulate

eval:
	cd api && uv run python ../scripts/eval.py

test:
	cd api && uv run pytest
	cd web && npm test

lint:
	cd api && uv run ruff check .
	cd api && uv run mypy nexus_api
	cd web && npm run lint

reset:
	cd api && uv run python ../scripts/reset.py
	rm -rf var/*.db
