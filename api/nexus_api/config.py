"""Configuration settings for NEXUS API."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment or .env file."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Core
    MOCK_EXTERNALS: bool = True
    NEXUS_ORG_ID: str = "acme"
    LOG_LEVEL: str = "info"

    # FalkorDB
    FALKORDB_HOST: str = "localhost"
    FALKORDB_PORT: int = 6379
    FALKORDB_USERNAME: str | None = None
    FALKORDB_PASSWORD: str | None = None
    FALKORDB_SSL: bool = False  # true for hosted FalkorDB that requires TLS
    GRAPH_COMPANY: str = "nexus_company"
    GRAPH_TEMPORAL: str = "nexus_temporal"
    GRAPH_DOCS: str = "nexus_docs"
    QUERY_TIMEOUT_MS: int = 5000

    # LLM
    LLM_PROVIDER: str = "groq"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-5-5"
    OPENAI_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4.1-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    SEMAPHORE_LIMIT: int = 4
    GRAPHITI_TELEMETRY_ENABLED: bool = False

    # API
    API_PORT: int = 8000
    ADMIN_TOKEN: str = "change-me"
    INGEST_TOKEN: str = ""  # when set, POST /api/ingest/event requires it as X-Ingest-Token
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    CORS_ORIGIN_REGEX: str = ""  # optional, e.g. https://nexus-.*\.vercel\.app for preview deploys
    AUTO_SEED: str = ""  # "baseline" or "full": load sample data on startup when the graph is empty

    # Sync simulation
    SYNC_DEFAULT_INTERVAL_MS: int = 600

    # Tracing SQLite DB
    DB_PATH: str = "var/nexus.db"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return Settings()
