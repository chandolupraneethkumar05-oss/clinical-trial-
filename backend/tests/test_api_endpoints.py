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


def test_cohort_stats_endpoint():
    resp = client.get("/api/v1/cohort/stats")
    assert resp.status_code == 200
    stats = resp.json()
    assert stats["total_patients"] >= 1000
    assert "stages" in stats
    assert "averages" in stats


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
    resp = client.post("/api/v1/cohort/simulate-funnel", json=payload)
    assert resp.status_code == 200
    res = resp.json()
    assert res["final_eligible_count"] > 0
    assert res["screen_failure_rate"] > 0
    assert len(res["sensitivity_opportunities"]) == 3


def test_historical_benchmarks_endpoint():
    resp = client.get("/api/v1/benchmark/historical-trials")
    assert resp.status_code == 200
    data = resp.json()
    assert data["benchmark_count"] >= 3
    assert any(t["actual_status"] == "COMPLETED" for t in data["trials"])
    assert any(t["actual_status"] == "TERMINATED" for t in data["trials"])
