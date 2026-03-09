"""Ingest a Kaggle medical dataset into PostgreSQL."""

from __future__ import annotations

import logging
import zipfile
from pathlib import Path

import pandas as pd
from kaggle.api.kaggle_api_extended import KaggleApi
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from config import IngestionSettings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


class KaggleDownloader:
    """Downloads and extracts a Kaggle dataset."""

    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir

    def download(self, dataset: str) -> Path:
        """Download and extract a Kaggle dataset, return the data directory."""
        log.info("Authenticating with Kaggle API...")
        api = KaggleApi()
        api.authenticate()

        self._data_dir.mkdir(parents=True, exist_ok=True)

        log.info("Downloading dataset: %s", dataset)
        api.dataset_download_files(dataset, path=str(self._data_dir), unzip=False)

        self._extract_zips()
        return self._data_dir

    def _extract_zips(self) -> None:
        """Extract and remove all zip files in the data directory."""
        zip_files = list(self._data_dir.glob("*.zip"))
        if not zip_files:
            log.error("No zip file found after download")
            raise FileNotFoundError("No zip file found after download")

        for zf in zip_files:
            log.info("Extracting %s", zf.name)
            with zipfile.ZipFile(zf, "r") as z:
                z.extractall(self._data_dir)
            zf.unlink()


class DataIngester:
    """Loads CSV files into PostgreSQL."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def ingest(self, data_dir: Path) -> None:
        """Load all CSV files from *data_dir* into PostgreSQL tables."""
        csv_files = list(data_dir.glob("*.csv"))

        if not csv_files:
            log.error("No CSV files found in %s", data_dir)
            raise FileNotFoundError(f"No CSV files found in {data_dir}")

        for csv_file in csv_files:
            self._ingest_file(csv_file)

        log.info("All CSV files ingested successfully")

    def _ingest_file(self, csv_file: Path) -> None:
        """Read a single CSV and write it to a PostgreSQL table."""
        table_name = self._derive_table_name(csv_file)
        log.info("Ingesting %s → table '%s'", csv_file.name, table_name)

        df = pd.read_csv(csv_file)
        log.info("  Rows: %d, Columns: %d", len(df), len(df.columns))

        df.columns = [self._normalize_column(col) for col in df.columns]
        df.to_sql(table_name, self._engine, if_exists="replace", index=False)
        log.info("  ✓ Table '%s' created successfully", table_name)

    @staticmethod
    def _derive_table_name(csv_file: Path) -> str:
        """Convert a CSV filename to a valid SQL table name."""
        return csv_file.stem.lower().replace(" ", "_").replace("-", "_")

    @staticmethod
    def _normalize_column(name: str) -> str:
        """Normalize a column name to lowercase with underscores."""
        return name.strip().lower().replace(" ", "_").replace("-", "_")


def main() -> None:
    """Entrypoint: download a Kaggle dataset and ingest into PostgreSQL."""
    settings = IngestionSettings()  # type: ignore[call-arg]

    log.info("Starting ingestion pipeline")
    log.info("Dataset: %s", settings.kaggle_dataset)

    data_dir = Path("/app/data")
    downloader = KaggleDownloader(data_dir)
    data_dir = downloader.download(settings.kaggle_dataset)

    engine = create_engine(settings.database_url)
    ingester = DataIngester(engine)
    ingester.ingest(data_dir)

    log.info("Ingestion pipeline complete")


if __name__ == "__main__":
    main()
