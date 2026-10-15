"""Configuration settings for NEXUS API."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment or .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
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
    GRAPH_COMPANY: str = "nexus_company"
    GRAPH_TEMPORAL: str = "nexus_temporal"
    GRAPH_DOCS: str = "nexus_docs"
    QUERY_TIMEOUT_MS: int = 5000

    # LLM
    LLM_PROVIDER: str = "openai"
    OPENAI_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4.1-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    SEMAPHORE_LIMIT: int = 4
    GRAPHITI_TELEMETRY_ENABLED: bool = False

    # API
    API_PORT: int = 8000
    ADMIN_TOKEN: str = "change-me"
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Sync simulation
    SYNC_DEFAULT_INTERVAL_MS: int = 600

    # Tracing SQLite DB
    DB_PATH: str = "var/nexus.db"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return Settings()
