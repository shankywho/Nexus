"""FastAPI application entrypoint for NEXUS."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from nexus_api.config import get_settings
from nexus_api.routes.admin import router as admin_router
from nexus_api.routes.ask import router as ask_router
from nexus_api.routes.audits import router as audits_router
from nexus_api.routes.events import router as events_router
from nexus_api.routes.graph import router as graph_router
from nexus_api.routes.health import router as health_router
from nexus_api.routes.ingest import router as ingest_router
from nexus_api.routes.provenance import router as provenance_router
from nexus_api.routes.runs import router as runs_router
from nexus_api.routes.sources import router as sources_router
from nexus_api.routes.sync import router as sync_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Lifespan context manager for startup and shutdown tasks."""
    Path("var").mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="NEXUS API",
        description="Organizational Telemetry & Decision Graph",
        version="0.1.0",
        lifespan=lifespan,
    )

    origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
    if not origins:
        origins = ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(health_router)
    app.include_router(ingest_router)
    app.include_router(sync_router)
    app.include_router(audits_router)
    app.include_router(ask_router)
    app.include_router(provenance_router)
    app.include_router(graph_router)
    app.include_router(runs_router)
    app.include_router(events_router)
    app.include_router(admin_router)
    app.include_router(sources_router)

    # Static /debug mounting
    static_dir = Path(__file__).parent / "static"
    static_dir.mkdir(parents=True, exist_ok=True)
    debug_file = static_dir / "debug.html"

    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/debug", response_class=HTMLResponse)
    def debug_page() -> HTMLResponse:
        content = debug_file.read_text(encoding="utf-8") if debug_file.exists() else "<h1>NEXUS Debug</h1>"
        return HTMLResponse(content=content)

    return app


app = create_app()
