"""
ProtocolShield Audit Trail & Data Persistence Unit Tests
Verifies DuckDB audit log persistence, SHA-256 hashing, RBAC restrictions,
and patient express interest workflows.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def get_token_for(email: str, password: str) -> str:
    resp = client.post("/api/v1/auth/signin", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["token"]


def test_audit_logs_rbac_enforcement():
    # 1. Unauthenticated request rejected
    unauth_resp = client.get("/api/v1/audit/logs")
    assert unauth_resp.status_code == 401

    # 2. Patient role rejected with 403 Forbidden
    patient_token = get_token_for("john.miller@patient.org", "Patient2026!")
    patient_resp = client.get(
        "/api/v1/audit/logs",
        headers={"Authorization": f"Bearer {patient_token}"}
    )
    assert patient_resp.status_code == 403

    # 3. Doctor role allowed with 200 OK
    doctor_token = get_token_for("elena.vance@novartis.com", "Novartis2026!")
    doctor_resp = client.get(
        "/api/v1/audit/logs",
        headers={"Authorization": f"Bearer {doctor_token}"}
    )
    assert doctor_resp.status_code == 200
    data = doctor_resp.json()
    assert isinstance(data, list)
    assert len(data) >= 5
    for item in data:
        assert "verification_hash" in item
        assert item["verification_hash"].startswith("SHA256:")


def test_create_audit_log_entry():
    doctor_token = get_token_for("elena.vance@novartis.com", "Novartis2026!")
    headers = {"Authorization": f"Bearer {doctor_token}"}

    payload = {
        "event_type": "PROTOCOL_AMENDMENT_PROPOSAL",
        "details": "Proposed Amendment AMD-01: Relax eGFR cutoff to 50 mL/min.",
        "resource_type": "PROTOCOL",
        "resource_id": "PS-ONC-2026-001"
    }

    create_resp = client.post("/api/v1/audit/logs", json=payload, headers=headers)
    assert create_resp.status_code == 200
    entry = create_resp.json()
    assert entry["event_type"] == payload["event_type"]
    assert entry["details"] == payload["details"]
    assert "Dr. Elena Vance" in entry["operator"]
    assert entry["verification_hash"].startswith("SHA256:")

    # Verify log appears in GET /audit/logs
    list_resp = client.get("/api/v1/audit/logs", headers=headers)
    assert list_resp.status_code == 200
    ids = [log["id"] for log in list_resp.json()]
    assert entry["id"] in ids


def test_patient_express_interest_lifecycle():
    patient_token = get_token_for("john.miller@patient.org", "Patient2026!")
    headers = {"Authorization": f"Bearer {patient_token}"}

    # 1. Express interest in trial
    payload = {
        "protocol_id": "PS-ONC-2026-001",
        "notes": "Patient expressed strong interest in participating."
    }
    interest_resp = client.post("/api/v1/patient/interest", json=payload, headers=headers)
    assert interest_resp.status_code == 200
    data = interest_resp.json()
    assert data["success"] is True
    assert data["protocol_id"] == "PS-ONC-2026-001"
    assert data["status"] == "SUBMITTED"

    # 2. Duplicate submission returns idempotent success
    dup_resp = client.post("/api/v1/patient/interest", json=payload, headers=headers)
    assert dup_resp.status_code == 200
    assert dup_resp.json()["success"] is True
    assert "already registered" in dup_resp.json()["message"]

    # 3. Patient can retrieve their interests
    my_interests = client.get("/api/v1/patient/interests", headers=headers)
    assert my_interests.status_code == 200
    items = my_interests.json()
    assert len(items) >= 1
    assert any(i["protocol_id"] == "PS-ONC-2026-001" for i in items)

    # 4. Doctor can view all patient interests
    doctor_token = get_token_for("elena.vance@novartis.com", "Novartis2026!")
    doc_interests = client.get("/api/v1/patient/interests", headers={"Authorization": f"Bearer {doctor_token}"})
    assert doc_interests.status_code == 200
    doc_items = doc_interests.json()
    assert any(i["protocol_id"] == "PS-ONC-2026-001" for i in doc_items)


# ── Cryptographic Audit Chain & DuckDB Reliability Tests ─────────────────────

def test_audit_chain_verification_endpoint():
    """
    Verifies that GET /api/v1/audit/verify traverses the SHA-256 hash chain,
    validates genesis linkage, and confirms 100% cryptographic integrity.
    """
    doctor_token = get_token_for("elena.vance@novartis.com", "Novartis2026!")
    patient_token = get_token_for("john.miller@patient.org", "Patient2026!")

    # 1. Patients are forbidden from verification endpoint
    patient_resp = client.get(
        "/api/v1/audit/verify",
        headers={"Authorization": f"Bearer {patient_token}"}
    )
    assert patient_resp.status_code == 403

    # 2. Doctors/investigators receive verified cryptographic report
    resp = client.get(
        "/api/v1/audit/verify",
        headers={"Authorization": f"Bearer {doctor_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True, data.get("details")
    assert data["total_records_verified"] >= 5
    assert data["latest_head_hash"] is not None
    assert "Successfully verified" in data["details"]


def test_audit_chain_tamper_detection():
    """
    Simulates unauthorized direct database modification of an audit record
    and verifies that GET /api/v1/audit/verify detects the break in the chain.
    """
    from app.db.duckdb_client import db_client
    doctor_token = get_token_for("elena.vance@novartis.com", "Novartis2026!")

    # Read original record
    conn = db_client.get_connection()
    try:
        orig = conn.execute("SELECT id, details FROM audit_logs ORDER BY timestamp ASC LIMIT 1").fetchone()
        assert orig is not None
        target_id, orig_details = orig

        # Tamper with the details directly in the database
        conn.execute("UPDATE audit_logs SET details = 'UNAUTHORIZED TAMPERING DETECTED' WHERE id = ?", (target_id,))
    finally:
        conn.close()

    try:
        # Verification endpoint must catch the tampering
        verify_resp = client.get(
            "/api/v1/audit/verify",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        assert verify_resp.status_code == 200
        data = verify_resp.json()
        assert data["valid"] is False
        assert data["tampered_event_id"] == target_id
        assert "tampered" in data["details"].lower() or "mismatch" in data["details"].lower()
    finally:
        # Restore the original details to keep audit log intact
        restore_conn = db_client.get_connection()
        try:
            restore_conn.execute("UPDATE audit_logs SET details = ? WHERE id = ?", (orig_details, target_id))
        finally:
            restore_conn.close()


def test_duckdb_atomic_transaction_rollback():
    """
    Verifies that DuckDBClient.transaction() executes atomically and rolls back
    all uncommitted changes when an exception is raised within the block.
    """
    from app.db.duckdb_client import db_client
    import uuid
    import pytest

    test_email = f"rollback.test.{uuid.uuid4().hex[:6]}@trial.org"
    with pytest.raises(ValueError, match="Simulated crash during transaction"):
        with db_client.transaction() as conn:
            conn.execute(
                """
                INSERT INTO users (id, name, email, password_hash, role)
                VALUES (?, 'Dr. Rollback', ?, 'hashed_pw', 'doctor')
                """,
                (f"usr-{uuid.uuid4().hex[:6]}", test_email)
            )
            # Trigger exception to force rollback
            raise ValueError("Simulated crash during transaction")

    # Confirm record was rolled back and does not exist in the database
    check_conn = db_client.get_connection()
    try:
        row = check_conn.execute("SELECT id FROM users WHERE email = ?", (test_email,)).fetchone()
        assert row is None, "Transaction rollback failed: uncommitted row was persisted!"
    finally:
        check_conn.close()


def test_duckdb_production_startup_fail_closed_on_lock(monkeypatch):
    """
    Verifies that in production mode, DuckDBClient does NOT silently fall back
    to :memory: when a database file is locked, but raises a RuntimeError.
    """
    import duckdb
    from app.core.config import settings
    from app.db.duckdb_client import DuckDBClient
    import pytest

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")

    def mock_locked_connect(path):
        raise duckdb.IOException("File is locked by another process")

    monkeypatch.setattr(duckdb, "connect", mock_locked_connect)

    with pytest.raises(RuntimeError, match=r"\[STARTUP FAILURE\] Production DuckDB database"):
        DuckDBClient(db_path="/tmp/mock_prod.duckdb")

