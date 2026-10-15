# Build from the repository root: docker build -f api/Dockerfile .
# The image carries fixtures/ and scripts/ so the replay and seed tools work inside the container.
FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# dependencies first, so code changes do not reinstall them
COPY api/pyproject.toml api/uv.lock api/README.md api/
RUN cd api && uv sync --frozen --no-dev --no-install-project

COPY api/nexus_api api/nexus_api
RUN cd api && uv sync --frozen --no-dev

COPY fixtures fixtures
COPY scripts scripts

ENV PATH="/app/api/.venv/bin:${PATH}" \
    PYTHONPATH="/app:/app/api"

RUN useradd --create-home app && mkdir -p /app/api/var /app/var && chown -R app /app/api/var /app/var
USER app
WORKDIR /app/api

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)"

CMD ["uvicorn", "nexus_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
