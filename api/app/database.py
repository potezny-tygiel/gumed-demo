"""Database connection and helpers."""

from __future__ import annotations

import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

log = logging.getLogger(__name__)


class Database:
    """Manages a PostgreSQL connection and provides query helpers."""

    def __init__(self, url: str) -> None:
        self._url = url
        self._engine: Engine | None = None

    @property
    def engine(self) -> Engine:
        """Lazily create and return the SQLAlchemy engine."""
        if self._engine is None:
            log.info("Creating database engine")
            self._engine = create_engine(self._url)
        return self._engine

    def list_tables(self) -> list[str]:
        """Return a list of table names in the database."""
        inspector = inspect(self.engine)
        tables = inspector.get_table_names()
        log.info("Found %d table(s)", len(tables))
        return tables

    def get_table_columns(self, table_name: str) -> list[dict[str, str]]:
        """Return column metadata for a given table."""
        inspector = inspect(self.engine)
        columns = [
            {"name": col["name"], "type": str(col["type"])}
            for col in inspector.get_columns(table_name)
        ]
        log.debug("Table '%s' has %d column(s)", table_name, len(columns))
        return columns

    def query_table(
        self,
        table_name: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """Query rows from a table with pagination."""
        log.debug("Querying '%s' (limit=%d, offset=%d)", table_name, limit, offset)
        stmt = text(f'SELECT * FROM "{table_name}" LIMIT :limit OFFSET :offset')
        with self.engine.connect() as conn:
            result = conn.execute(stmt, {"limit": limit, "offset": offset})
            columns = list(result.keys())
            return [dict(zip(columns, row)) for row in result.fetchall()]

    def count_rows(self, table_name: str) -> int:
        """Return the row count for a table."""
        stmt = text(f'SELECT COUNT(*) FROM "{table_name}"')
        with self.engine.connect() as conn:
            count = conn.execute(stmt).scalar_one()
            log.debug("Table '%s' has %d row(s)", table_name, count)
            return count
