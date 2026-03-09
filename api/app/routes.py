"""API routes for the medical data pipeline."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request

from app.database import Database
from app.models import ColumnInfo, TableInfoResponse, TableListResponse, TableRowsResponse

log = logging.getLogger(__name__)

router = APIRouter()


def _get_db(request: Request) -> Database:
    """Retrieve the Database instance from application state."""
    return request.app.state.db


@router.get("/tables", tags=["data"], response_model=TableListResponse)
def list_tables(request: Request) -> TableListResponse:
    """List all available tables in the database."""
    log.info("Listing tables")
    db = _get_db(request)
    tables = db.list_tables()
    # Refresh cached list so other endpoints see newly-ingested tables
    request.app.state.tables = tables
    return TableListResponse(tables=tables)


@router.get("/tables/{table_name}", tags=["data"], response_model=TableInfoResponse)
def get_table_info(request: Request, table_name: str) -> TableInfoResponse:
    """Get metadata for a specific table (columns, row count)."""
    log.info("Getting info for table '%s'", table_name)
    db = _get_db(request)
    # Live check — tables may have been created after startup (e.g. ingestion)
    if table_name not in db.list_tables():
        log.warning("Table '%s' not found", table_name)
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    db = _get_db(request)
    columns = [ColumnInfo(**col) for col in db.get_table_columns(table_name)]
    total_rows = db.count_rows(table_name)

    return TableInfoResponse(
        table=table_name,
        columns=columns,
        total_rows=total_rows,
    )


@router.get("/tables/{table_name}/rows", tags=["data"], response_model=TableRowsResponse)
def get_table_rows(
    request: Request,
    table_name: str,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> TableRowsResponse:
    """Fetch rows from a table with pagination."""
    log.info("Fetching rows from '%s' (limit=%d, offset=%d)", table_name, limit, offset)
    db = _get_db(request)
    # Live check — tables may have been created after startup (e.g. ingestion)
    if table_name not in db.list_tables():
        log.warning("Table '%s' not found", table_name)
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
    rows = db.query_table(table_name, limit=limit, offset=offset)
    total_rows = db.count_rows(table_name)

    return TableRowsResponse(
        table=table_name,
        rows=rows,
        total_rows=total_rows,
        limit=limit,
        offset=offset,
    )
