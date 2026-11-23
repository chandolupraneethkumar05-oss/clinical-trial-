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
