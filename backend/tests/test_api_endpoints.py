"""
ProtocolShield API Integration Tests
Tests all FastAPI endpoints with TestClient.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root_and_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


def test_get_sample_protocol():
    resp = client.get("/api/v1/protocol/sample")
    assert resp.status_code == 200
    data = resp.json()
    assert data["protocol_id"] == "PS-ONC-2026-001"
    assert len(data["visits"]) > 0
    assert "burden" in data
    assert data["burden"]["composite_pbi_score"] > 0


def test_get_procedures_catalog():
    resp = client.get("/api/v1/protocol/procedures-catalog")
    assert resp.status_code == 200
    catalog = resp.json()
    assert len(catalog) >= 5
    procedure_names = [p["name"] for p in catalog]
    assert any("CT" in name for name in procedure_names)


def get_doctor_auth_headers():
    resp = client.post("/api/v1/auth/signin", json={
        "email": "elena.vance@novartis.com",
        "password": "Novartis2026!"
    })
    assert resp.status_code == 200
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_cohort_stats_endpoint():
    # Verify unauthenticated request rejected with 401
    unauth_resp = client.get("/api/v1/cohort/stats")
    assert unauth_resp.status_code == 401

    # Verify authenticated doctor request succeeds
    headers = get_doctor_auth_headers()
    resp = client.get("/api/v1/cohort/stats", headers=headers)
    assert resp.status_code == 200
    stats = resp.json()
    assert stats["total_patients"] >= 1000
    assert "stages" in stats
    assert "averages" in stats
    assert stats.get("is_synthetic_data") is True


def test_cohort_funnel_simulation_endpoint():
    payload = {
        "min_age": 18,
        "max_age": 75,
        "allowed_stages": ["Stage IV (Oligometastatic)", "Stage IV (Polymetastatic)"],
        "max_ecog": 1,
        "min_anc": 1500.0,
        "min_platelets": 100.0,
        "min_hemoglobin": 9.0,
        "min_egfr": 60.0,
        "max_total_bilirubin": 1.5,
        "max_alt_multiplier": 2.5,
        "max_prior_lines": 0,
        "allow_stable_brain_mets": True,
        "exclude_active_autoimmune": True,
        "target_biomarker_egfr_negative": True
    }
    # Verify unauthenticated request rejected with 401
    unauth_resp = client.post("/api/v1/cohort/simulate-funnel", json=payload)
    assert unauth_resp.status_code == 401

    # Verify authenticated doctor request succeeds
    headers = get_doctor_auth_headers()
    resp = client.post("/api/v1/cohort/simulate-funnel", json=payload, headers=headers)
    assert resp.status_code == 200
    res = resp.json()
    assert res["final_eligible_count"] > 0
    assert res["screen_failure_rate"] > 0
    assert len(res["sensitivity_opportunities"]) == 3
    assert res.get("is_synthetic_data") is True


def test_historical_benchmarks_endpoint():
    # Verify unauthenticated request rejected with 401
    unauth_resp = client.get("/api/v1/benchmark/historical-trials")
    assert unauth_resp.status_code == 401

    # Verify authenticated doctor request succeeds
    headers = get_doctor_auth_headers()
    resp = client.get("/api/v1/benchmark/historical-trials", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["benchmark_count"] >= 3
    assert any(t["actual_status"] == "COMPLETED" for t in data["trials"])
    assert any(t["actual_status"] == "TERMINATED" for t in data["trials"])
    assert data.get("data_source") == "synthetic_benchmark"


def test_retention_curve_endpoint_get_and_post():
    # Verify unauthenticated rejected with 401
    unauth_get = client.get("/api/v1/cohort/retention-curve?enrolled_size=400&composite_pbi=62.5")
    assert unauth_get.status_code == 401

    # Verify authenticated GET
    headers = get_doctor_auth_headers()
    get_resp = client.get("/api/v1/cohort/retention-curve?enrolled_size=400&composite_pbi=62.5", headers=headers)
    assert get_resp.status_code == 200
    assert "retention_curve" in get_resp.json()
    assert len(get_resp.json()["retention_curve"]) > 10
    assert get_resp.json().get("is_synthetic_data") is True

    # Verify authenticated POST
    post_resp = client.post("/api/v1/cohort/retention-curve?enrolled_size=400&composite_pbi=62.5", headers=headers)
    assert post_resp.status_code == 200
    assert "retention_curve" in post_resp.json()
