.PHONY: help setup up down logs seed baseline reset eval test lint

help:
	@echo "up       build and start FalkorDB, API, web and MCP in Docker"
	@echo "seed     load the full dataset (76 events) into the running stack"
	@echo "baseline load the company as of Sep 30 plus sample memory, then click Replay sync in the UI"
	@echo "eval     run the 12-question benchmark against the running API"
	@echo "reset    wipe graphs and run history"
	@echo "logs     follow container logs"
	@echo "down     stop the stack"
	@echo "setup    local development: create .env, install Python and Node dependencies"
	@echo "test     unit tests for api and web (no services needed)"
	@echo "lint     ruff, mypy and eslint"

setup:
	bash scripts/setup.sh

up:
	docker compose up -d --build
	@echo "Web:  http://localhost:$${NEXUS_WEB_PORT:-3000}"
	@echo "API:  http://localhost:$${NEXUS_API_PORT:-8000}/docs"

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

seed:
	docker compose exec -T api python /app/scripts/seed.py --reset

baseline:
	docker compose exec -T api python /app/scripts/seed.py --reset --until 2026-09-30
	docker compose exec -T api python /app/scripts/seed_memory.py

reset:
	docker compose exec -T api python /app/scripts/reset.py

eval:
	docker compose exec -T api python /app/scripts/eval.py

test:
	cd api && uv run pytest tests/unit
	cd web && npm test

lint:
	cd api && uv run ruff check .
	cd api && uv run mypy nexus_api
	cd web && npm run lint
