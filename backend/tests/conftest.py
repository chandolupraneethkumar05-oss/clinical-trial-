"""
Global Pytest Isolation Configuration
Redirects DuckDB storage to an isolated temporary database directory per test session so automated
test runs never mutate or corrupt the developer's persistent backend/data/protocolshield_cohort.duckdb.
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import pytest

_TEST_TMP_DIR: str | None = None


def pytest_configure(config):  # noqa: ARG001
    global _TEST_TMP_DIR
    _TEST_TMP_DIR = tempfile.mkdtemp(prefix="protocolshield_pytest_")
    test_db_path = str(Path(_TEST_TMP_DIR) / "pytest_cohort.duckdb")
    os.environ["DB_PATH"] = test_db_path
    # Keep unit tests deterministic and offline unless a specific test explicitly mocks/sets keys
    os.environ["GEMINI_API_KEY"] = ""
    os.environ["EMAIL_PROVIDER"] = ""


def pytest_unconfigure(config):  # noqa: ARG001
    global _TEST_TMP_DIR
    if _TEST_TMP_DIR:
        try:
            from app.db.duckdb_client import db_client
            if getattr(db_client, "_shared_conn", None) is not None:
                db_client._shared_conn.close()
        except Exception:
            pass
        shutil.rmtree(_TEST_TMP_DIR, ignore_errors=True)
        _TEST_TMP_DIR = None


@pytest.fixture(scope="session", autouse=True)
def _bootstrap_isolated_test_database():
    """Ensures the isolated temporary DuckDB database is seeded identically to app lifespan startup."""
    from app.api.routes_audit import _seed_audit_logs_if_empty
    from app.api.routes_auth import seed_default_users_if_empty
    from app.core.config import settings
    from app.db.duckdb_client import db_client
    from app.engine.synthetic_data import seed_database_if_empty

    settings.GEMINI_API_KEY = ""
    settings.EMAIL_PROVIDER = ""
    seed_database_if_empty(total_patients=10000)
    seed_default_users_if_empty()
    conn = db_client.get_connection()
    try:
        _seed_audit_logs_if_empty(conn)
    finally:
        conn.close()
