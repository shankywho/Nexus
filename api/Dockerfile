FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml ./
RUN uv pip install --system -r pyproject.toml || true

COPY . .
RUN uv pip install --system -e .

EXPOSE 8000

CMD ["uvicorn", "nexus_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
