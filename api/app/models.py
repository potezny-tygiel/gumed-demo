"""Pydantic response models for the API."""

from __future__ import annotations

from pydantic import BaseModel


class ColumnInfo(BaseModel):
    """Metadata for a single database column."""

    name: str
    type: str


class TableListResponse(BaseModel):
    """Response for GET /tables."""

    tables: list[str]


class TableInfoResponse(BaseModel):
    """Response for GET /tables/{table_name}."""

    table: str
    columns: list[ColumnInfo]
    total_rows: int


class TableRowsResponse(BaseModel):
    """Response for GET /tables/{table_name}/rows."""

    table: str
    rows: list[dict]
    total_rows: int
    limit: int
    offset: int


class HealthResponse(BaseModel):
    """Response for GET /health."""

    status: str
