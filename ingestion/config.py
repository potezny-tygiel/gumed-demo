"""Ingestion pipeline configuration loaded from environment variables."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class IngestionSettings(BaseSettings):
    """Settings for the Kaggle ingestion pipeline.

    Required: ``POSTGRES_USER``, ``POSTGRES_PASSWORD``, ``POSTGRES_DB``.
    Optional: ``POSTGRES_HOST``, ``POSTGRES_PORT``, ``KAGGLE_DATASET``.
    """

    postgres_user: str
    postgres_password: str
    postgres_host: str = "db"
    postgres_port: int = 5432
    postgres_db: str
    kaggle_dataset: str = "prasad22/healthcare-dataset"

    @property
    def database_url(self) -> str:
        """Build the PostgreSQL connection URL."""
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
