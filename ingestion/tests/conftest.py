"""Shared fixtures for ingestion tests.

Mocks the ``kaggle`` package and ``sqlalchemy.create_engine`` **before**
``ingest`` is imported, so tests never need the real Kaggle SDK or a
running database.
"""

from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock

# ── Mock the kaggle package before ingest.py is ever imported ────────────
_kaggle = types.ModuleType("kaggle")
_kaggle_api = types.ModuleType("kaggle.api")
_kaggle_api_ext = types.ModuleType("kaggle.api.kaggle_api_extended")
_kaggle_api_ext.KaggleApi = MagicMock  # type: ignore[attr-defined]

sys.modules.setdefault("kaggle", _kaggle)
sys.modules.setdefault("kaggle.api", _kaggle_api)
sys.modules.setdefault("kaggle.api.kaggle_api_extended", _kaggle_api_ext)

# Remove cached ingest module so re-import picks up the mocked kaggle
for _mod in list(sys.modules):
    if _mod == "ingest":
        del sys.modules[_mod]
