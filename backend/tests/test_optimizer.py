"""
ProtocolShield AI Clinical Protocol Optimizer Endpoint Tests
Verifies amendment proposal generation and mutation execution.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def get_doctor_auth_headers():
    resp = client.post("/api/v1/auth/signin", json={
        "email": "elena.vance@novartis.com",
        "password": "Novartis2026!"
    })
    assert resp.status_code == 200
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_propose_amendments():
    # 1. Fetch canonical sample protocol
    sample_resp = client.get("/api/v1/protocol/sample")
    assert sample_resp.status_code == 200
    protocol = sample_resp.json()

    # 2. Verify unauthenticated call is rejected with 401
    unauth_resp = client.post("/api/v1/optimizer/propose-amendments", json=protocol)
    assert unauth_resp.status_code == 401

    # 3. Call optimizer propose-amendments with doctor credentials
    headers = get_doctor_auth_headers()
    opt_resp = client.post("/api/v1/optimizer/propose-amendments", json=protocol, headers=headers)
    assert opt_resp.status_code == 200
    proposals = opt_resp.json()
    assert len(proposals) >= 3

    ids = [p["amendment_id"] for p in proposals]
    assert "AMD-01" in ids  # Renal
    assert "AMD-02" in ids  # ctDNA Liquid Biopsy
    assert "AMD-03" in ids  # Brain Mets

    # Verify model structure
    first = proposals[0]
    assert "target_section" in first
    assert "clinical_evidence_rationale" in first
    assert "regulatory_precedent" in first
    assert "health_equity_diversity_impact" in first
    assert isinstance(first["safety_guardrail_conditions"], list)
    assert len(first["safety_guardrail_conditions"]) > 0


def test_apply_amendment_renal():
    sample_resp = client.get("/api/v1/protocol/sample")
    protocol = sample_resp.json()
    
    payload = {
        "protocol": protocol,
        "amendment_id": "AMD-01"
    }

    # Verify unauthenticated call is rejected with 401
    unauth_resp = client.post("/api/v1/optimizer/apply-amendment", json=payload)
    assert unauth_resp.status_code == 401

    headers = get_doctor_auth_headers()
    resp = client.post("/api/v1/optimizer/apply-amendment", json=payload, headers=headers)
    assert resp.status_code == 200
    updated = resp.json()

    # Verify structured filters updated
    assert updated["eligibility"]["structured_filters"]["min_egfr"] == 50.0
    # Verify inclusion criteria updated with 50 mL/min
    inclusions = updated["eligibility"]["inclusion_criteria"]
    assert any("50 mL/min" in inc for inc in inclusions)


def test_apply_amendment_decentralize_biopsy():
    sample_resp = client.get("/api/v1/protocol/sample")
    protocol = sample_resp.json()
    orig_pbi = protocol["burden"]["composite_pbi_score"]

    payload = {
        "protocol": protocol,
        "amendment_id": "AMD-02"
    }

    # Verify unauthenticated call is rejected with 401
    unauth_resp = client.post("/api/v1/optimizer/apply-amendment", json=payload)
    assert unauth_resp.status_code == 401

    headers = get_doctor_auth_headers()
    resp = client.post("/api/v1/optimizer/apply-amendment", json=payload, headers=headers)
    assert resp.status_code == 200
    updated = resp.json()

    # Verify PBI score reduced
    new_pbi = updated["burden"]["composite_pbi_score"]
    assert new_pbi < orig_pbi

    # Verify Week 12 no longer has tumor biopsy
    w12_visit = next(v for v in updated["visits"] if v["week_number"] == 12)
    assert not any("tumor biopsy" in p["name"].lower() for p in w12_visit["procedures"])
