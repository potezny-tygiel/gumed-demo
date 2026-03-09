"""Shared fixtures for API tests.

Builds a test FastAPI app with a mocked Database instance so tests
never need a running PostgreSQL.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, Generator
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database import Database
from app.models import HealthResponse
from app.routes import router


# ── fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture()
def mock_tables() -> list[str]:
    """Simulated list of tables present in the database."""
    return ["healthcare_dataset", "patients"]


@pytest.fixture()
def mock_db() -> MagicMock:
    """A mocked Database instance with sensible defaults."""
    db = MagicMock(spec=Database)
    db.list_tables.return_value = ["healthcare_dataset", "patients"]
    db.get_table_columns.return_value = [
        {"name": "id", "type": "INTEGER"},
        {"name": "name", "type": "VARCHAR"},
    ]
    db.count_rows.return_value = 100
    db.query_table.return_value = [
        {"id": 1, "name": "Alice"},
        {"id": 2, "name": "Bob"},
    ]
    return db


@pytest.fixture()
def app(mock_tables: list[str], mock_db: MagicMock) -> FastAPI:
    """Build a fresh FastAPI app for testing (no real lifespan / DB)."""

    @asynccontextmanager
    async def _test_lifespan(application: FastAPI) -> AsyncIterator[None]:
        """No-op lifespan – state is injected by fixtures."""
        yield

    test_app = FastAPI(
        title="Test Medical Data Pipeline API",
        lifespan=_test_lifespan,
    )
    test_app.include_router(router, prefix="/api/v1")

    @test_app.get("/health", tags=["health"])
    def health_check() -> HealthResponse:
        return HealthResponse(status="healthy")

    test_app.state.tables = mock_tables
    test_app.state.db = mock_db
    return test_app


@pytest.fixture()
def client(app: FastAPI) -> Generator[TestClient, None, None]:
    """TestClient that uses the test app with no-op lifespan."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
