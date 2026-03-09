"""FastAPI application serving the medical dataset."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from app.config import Settings
from app.database import Database
from app.models import HealthResponse
from app.routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialise the database connection and discover tables on startup."""
    settings = Settings()  # type: ignore[call-arg]
    db = Database(url=settings.database_url)
    app.state.db = db
    app.state.tables = db.list_tables()
    log.info("Discovered %d table(s): %s", len(app.state.tables), app.state.tables)
    yield
    log.info("Application shutting down")


app = FastAPI(
    title="Medical Data Pipeline API",
    description="REST API serving a Kaggle medical dataset from PostgreSQL",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(router, prefix="/api/v1")


@app.get("/health", tags=["health"], response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy")
