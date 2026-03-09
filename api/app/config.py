"""Application configuration loaded from environment variables."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """PostgreSQL and application settings.

    Values are read from environment variables.  Defaults are provided
    for host and port so that only the three required variables
    (``POSTGRES_USER``, ``POSTGRES_PASSWORD``, ``POSTGRES_DB``) must be set.
    """

    postgres_user: str
    postgres_password: str
    postgres_host: str = "db"
    postgres_port: int = 5432
    postgres_db: str

    @property
    def database_url(self) -> str:
        """Build the PostgreSQL connection URL."""
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
