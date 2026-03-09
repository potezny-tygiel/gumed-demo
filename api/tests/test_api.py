"""Unit tests for the FastAPI application.

These tests use a mocked ``Database`` instance injected via ``app.state.db``
(see ``conftest.py``).  No real PostgreSQL is needed.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------


class TestHealthEndpoint:
    """Tests for GET /health."""

    def test_health_returns_200(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_returns_healthy_status(self, client: TestClient) -> None:
        data = client.get("/health").json()
        assert data == {"status": "healthy"}


# ---------------------------------------------------------------------------
# GET /api/v1/tables
# ---------------------------------------------------------------------------


class TestListTables:
    """Tests for GET /api/v1/tables."""

    def test_returns_200(self, client: TestClient) -> None:
        response = client.get("/api/v1/tables")
        assert response.status_code == 200

    def test_returns_table_list(
        self,
        client: TestClient,
        mock_tables: list[str],
    ) -> None:
        data = client.get("/api/v1/tables").json()
        assert data == {"tables": mock_tables}

    def test_returns_empty_list_when_no_tables(self, app: FastAPI) -> None:
        app.state.db.list_tables.return_value = []
        with TestClient(app) as c:
            data = c.get("/api/v1/tables").json()
        assert data == {"tables": []}


# ---------------------------------------------------------------------------
# GET /api/v1/tables/{table_name}
# ---------------------------------------------------------------------------


class TestGetTableInfo:
    """Tests for GET /api/v1/tables/{table_name}."""

    def test_404_for_unknown_table(self, client: TestClient) -> None:
        response = client.get("/api/v1/tables/nonexistent")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_returns_table_metadata(
        self,
        client: TestClient,
        mock_db: MagicMock,
    ) -> None:
        mock_db.get_table_columns.return_value = [
            {"name": "id", "type": "INTEGER"},
            {"name": "name", "type": "VARCHAR"},
        ]
        mock_db.count_rows.return_value = 42

        response = client.get("/api/v1/tables/healthcare_dataset")
        assert response.status_code == 200

        data = response.json()
        assert data["table"] == "healthcare_dataset"
        assert data["total_rows"] == 42
        assert len(data["columns"]) == 2
        assert data["columns"][0]["name"] == "id"

    def test_returns_zero_rows_for_empty_table(
        self,
        client: TestClient,
        mock_db: MagicMock,
    ) -> None:
        mock_db.get_table_columns.return_value = [{"name": "id", "type": "INTEGER"}]
        mock_db.count_rows.return_value = 0

        data = client.get("/api/v1/tables/healthcare_dataset").json()
        assert data["total_rows"] == 0


# ---------------------------------------------------------------------------
# GET /api/v1/tables/{table_name}/rows
# ---------------------------------------------------------------------------


class TestGetTableRows:
    """Tests for GET /api/v1/tables/{table_name}/rows."""

    def test_404_for_unknown_table(self, client: TestClient) -> None:
        response = client.get("/api/v1/tables/nonexistent/rows")
        assert response.status_code == 404

    def test_returns_rows_with_defaults(
        self,
        client: TestClient,
        mock_db: MagicMock,
    ) -> None:
        mock_db.query_table.return_value = [
            {"id": 1, "name": "Alice"},
            {"id": 2, "name": "Bob"},
        ]
        mock_db.count_rows.return_value = 100

        response = client.get("/api/v1/tables/healthcare_dataset/rows")
        assert response.status_code == 200

        data = response.json()
        assert data["table"] == "healthcare_dataset"
        assert len(data["rows"]) == 2
        assert data["total_rows"] == 100
        assert data["limit"] == 100
        assert data["offset"] == 0

    def test_pagination_params(
        self,
        client: TestClient,
        mock_db: MagicMock,
    ) -> None:
        mock_db.query_table.return_value = [{"id": 3, "name": "Charlie"}]
        mock_db.count_rows.return_value = 50

        response = client.get(
            "/api/v1/tables/healthcare_dataset/rows",
            params={"limit": 10, "offset": 20},
        )
        data = response.json()
        assert data["limit"] == 10
        assert data["offset"] == 20

        mock_db.query_table.assert_called_once_with(
            "healthcare_dataset", limit=10, offset=20,
        )

    def test_limit_validation_too_high(self, client: TestClient) -> None:
        response = client.get(
            "/api/v1/tables/healthcare_dataset/rows",
            params={"limit": 9999},
        )
        assert response.status_code == 422

    def test_limit_validation_zero(self, client: TestClient) -> None:
        response = client.get(
            "/api/v1/tables/healthcare_dataset/rows",
            params={"limit": 0},
        )
        assert response.status_code == 422

    def test_negative_offset_rejected(self, client: TestClient) -> None:
        response = client.get(
            "/api/v1/tables/healthcare_dataset/rows",
            params={"offset": -1},
        )
        assert response.status_code == 422

    def test_empty_result_set(
        self,
        client: TestClient,
        mock_db: MagicMock,
    ) -> None:
        mock_db.query_table.return_value = []
        mock_db.count_rows.return_value = 100

        data = client.get(
            "/api/v1/tables/healthcare_dataset/rows",
            params={"offset": 9999},
        ).json()
        assert data["rows"] == []
        assert data["total_rows"] == 100


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


class TestSettings:
    """Tests for the Settings configuration class."""

    def test_builds_url_from_env(self) -> None:
        settings = Settings(
            postgres_user="myuser",
            postgres_password="mypass",
            postgres_host="dbhost",
            postgres_port=5433,
            postgres_db="mydb",
        )
        assert settings.database_url == "postgresql://myuser:mypass@dbhost:5433/mydb"

    def test_defaults_for_host_and_port(self) -> None:
        settings = Settings(
            postgres_user="u",
            postgres_password="p",
            postgres_db="d",
        )
        assert settings.database_url == "postgresql://u:p@db:5432/d"

    def test_missing_required_field_raises(self) -> None:
        with pytest.raises(Exception):
            Settings()  # type: ignore[call-arg]
