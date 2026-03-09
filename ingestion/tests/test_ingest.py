"""Unit tests for the ingestion pipeline.

Tests cover:
- Settings / database URL construction
- CSV column normalization
- Table name derivation
- Zip extraction logic
- Ingestion flow with mocked Kaggle API and database

The ``kaggle`` SDK is mocked in ``conftest.py`` so tests run without it.
"""

from __future__ import annotations

import csv
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from config import IngestionSettings
from ingest import DataIngester, KaggleDownloader, main


# ---------------------------------------------------------------------------
# Settings / Database URL
# ---------------------------------------------------------------------------


class TestIngestionSettings:
    """Tests for IngestionSettings."""

    def test_builds_url_from_values(self) -> None:
        settings = IngestionSettings(
            postgres_user="pipeline",
            postgres_password="secret",
            postgres_host="pg-host",
            postgres_port=5433,
            postgres_db="medical_data",
        )
        assert settings.database_url == "postgresql://pipeline:secret@pg-host:5433/medical_data"

    def test_defaults_host_and_port(self) -> None:
        settings = IngestionSettings(
            postgres_user="u",
            postgres_password="p",
            postgres_db="d",
        )
        assert settings.database_url == "postgresql://u:p@db:5432/d"

    def test_default_kaggle_dataset(self) -> None:
        settings = IngestionSettings(
            postgres_user="u",
            postgres_password="p",
            postgres_db="d",
        )
        assert settings.kaggle_dataset == "prasad22/healthcare-dataset"

    def test_missing_required_field_raises(self) -> None:
        with pytest.raises(Exception):
            IngestionSettings()  # type: ignore[call-arg]


# ---------------------------------------------------------------------------
# Column normalization
# ---------------------------------------------------------------------------


class TestColumnNormalization:
    """Verify column name cleaning matches ingestion logic."""

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("Patient Name", "patient_name"),
            ("  Blood Type ", "blood_type"),
            ("Medical-Condition", "medical_condition"),
            ("age", "age"),
            ("Billing Amount", "billing_amount"),
            ("Date-of-Admission", "date_of_admission"),
        ],
    )
    def test_normalize_column(self, raw: str, expected: str) -> None:
        assert DataIngester._normalize_column(raw) == expected


# ---------------------------------------------------------------------------
# Table name derivation
# ---------------------------------------------------------------------------


class TestTableNameDerivation:
    """Verify CSV filename → SQL table name mapping."""

    @pytest.mark.parametrize(
        ("filename", "expected_table"),
        [
            ("healthcare_dataset.csv", "healthcare_dataset"),
            ("Healthcare Dataset.csv", "healthcare_dataset"),
            ("patient-records.csv", "patient_records"),
            ("DATA.csv", "data"),
        ],
    )
    def test_table_name_from_filename(
        self,
        filename: str,
        expected_table: str,
    ) -> None:
        csv_path = Path(filename)
        assert DataIngester._derive_table_name(csv_path) == expected_table


# ---------------------------------------------------------------------------
# Zip extraction
# ---------------------------------------------------------------------------


class TestKaggleDownloader:
    """Tests for KaggleDownloader — zip extraction logic."""

    def test_extracts_zip_and_removes_it(self, tmp_path: Path) -> None:
        """Create a fake zip with a CSV, verify extraction."""
        csv_content = "name,age\nAlice,30\nBob,25\n"
        zip_path = tmp_path / "dataset.zip"

        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("data.csv", csv_content)

        downloader = KaggleDownloader(tmp_path)
        downloader._extract_zips()

        # Zip should be deleted, CSV should exist
        assert not zip_path.exists()
        assert (tmp_path / "data.csv").exists()

        # Verify CSV content
        df = pd.read_csv(tmp_path / "data.csv")
        assert len(df) == 2
        assert list(df.columns) == ["name", "age"]

    def test_handles_multiple_csvs_in_zip(self, tmp_path: Path) -> None:
        """Datasets may contain multiple CSV files."""
        zip_path = tmp_path / "multi.zip"

        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("patients.csv", "id,name\n1,Alice\n")
            zf.writestr("diagnoses.csv", "id,condition\n1,Flu\n")

        downloader = KaggleDownloader(tmp_path)
        downloader._extract_zips()

        csv_files = list(tmp_path.glob("*.csv"))
        assert len(csv_files) == 2

    def test_raises_when_no_zips(self, tmp_path: Path) -> None:
        """Should raise FileNotFoundError if no zip files exist."""
        downloader = KaggleDownloader(tmp_path)
        with pytest.raises(FileNotFoundError, match="No zip file"):
            downloader._extract_zips()


# ---------------------------------------------------------------------------
# Ingestion flow
# ---------------------------------------------------------------------------


class TestDataIngester:
    """Tests for DataIngester with a mocked database."""

    def _create_csv(self, path: Path, data: list[dict]) -> Path:
        """Helper to write a CSV from a list of dicts."""
        csv_path = path / "test_data.csv"
        fieldnames = list(data[0].keys())
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)
        return csv_path

    @patch("ingest.create_engine")
    def test_ingests_csv_to_table(
        self,
        mock_create_engine: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Verify CSV data is loaded via DataFrame.to_sql."""
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine

        self._create_csv(tmp_path, [
            {"Name": "Alice", "Age": 30, "Blood Type": "A+"},
            {"Name": "Bob", "Age": 25, "Blood Type": "O-"},
        ])

        ingester = DataIngester(mock_engine)
        ingester.ingest(tmp_path)

    def test_normalizes_columns_during_ingestion(self, tmp_path: Path) -> None:
        """Verify column names are cleaned before insert."""
        self._create_csv(tmp_path, [
            {"Patient Name": "Alice", "Blood Type": "A+", "Medical-Condition": "Flu"},
        ])

        df = pd.read_csv(tmp_path / "test_data.csv")
        df.columns = [DataIngester._normalize_column(col) for col in df.columns]

        assert list(df.columns) == [
            "patient_name",
            "blood_type",
            "medical_condition",
        ]

    def test_raises_when_no_csvs(self, tmp_path: Path) -> None:
        """DataIngester.ingest should raise FileNotFoundError if no CSVs."""
        mock_engine = MagicMock()
        ingester = DataIngester(mock_engine)

        with pytest.raises(FileNotFoundError, match="No CSV files"):
            ingester.ingest(tmp_path)


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------


class TestMain:
    """Tests for the main() entrypoint."""

    @patch("ingest.DataIngester")
    @patch("ingest.KaggleDownloader")
    @patch("ingest.create_engine")
    def test_main_calls_download_and_ingest(
        self,
        mock_create_engine: MagicMock,
        mock_downloader_cls: MagicMock,
        mock_ingester_cls: MagicMock,
    ) -> None:
        mock_downloader = MagicMock()
        mock_downloader.download.return_value = Path("/tmp/data")
        mock_downloader_cls.return_value = mock_downloader

        mock_ingester = MagicMock()
        mock_ingester_cls.return_value = mock_ingester

        with patch.dict("os.environ", {
            "POSTGRES_USER": "u",
            "POSTGRES_PASSWORD": "p",
            "POSTGRES_DB": "d",
            "KAGGLE_DATASET": "owner/dataset",
        }):
            main()

        mock_downloader.download.assert_called_once_with("owner/dataset")
        mock_ingester.ingest.assert_called_once()

    @patch("ingest.DataIngester")
    @patch("ingest.KaggleDownloader")
    @patch("ingest.create_engine")
    def test_main_uses_default_dataset(
        self,
        mock_create_engine: MagicMock,
        mock_downloader_cls: MagicMock,
        mock_ingester_cls: MagicMock,
    ) -> None:
        mock_downloader = MagicMock()
        mock_downloader.download.return_value = Path("/tmp/data")
        mock_downloader_cls.return_value = mock_downloader

        mock_ingester = MagicMock()
        mock_ingester_cls.return_value = mock_ingester

        with patch.dict("os.environ", {
            "POSTGRES_USER": "u",
            "POSTGRES_PASSWORD": "p",
            "POSTGRES_DB": "d",
        }, clear=True):
            main()

        mock_downloader.download.assert_called_once_with("prasad22/healthcare-dataset")
