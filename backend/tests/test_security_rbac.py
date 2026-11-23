"""
ProtocolShield Enterprise RBAC, Security Guardrails & Clinical Safety Test Suite
Validates strict role enforcement, clinical hard exclusions, token hygiene, and zero data leakage.
"""
import uuid
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)


def get_token_for(email: str, password: str) -> str:
    resp = client.post("/api/v1/auth/signin", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Failed to login as {email}: {resp.text}"
    return resp.json()["token"]


@pytest.fixture(scope="module")
def patient_token():
    return get_token_for("john.miller@patient.org", "Patient2026!")


@pytest.fixture(scope="module")
def doctor_token():
    return get_token_for("elena.vance@novartis.com", "Novartis2026!")


@pytest.fixture(scope="module")
def admin_token():
    return get_token_for("sarah.jenkins@iqvia.com", "IQVIA2026!")


# ── 1. Role-Based Access Control (RBAC) Enforcement ─────────────────────────

def test_patient_cannot_access_optimizer_propose(patient_token):
    sample = client.get("/api/v1/protocol/sample").json()
    resp = client.post(
        "/api/v1/optimizer/propose-amendments",
        json=sample,
        headers={"Authorization": f"Bearer {patient_token}"}
    )
    # Patient role is strictly forbidden from optimizer
    assert resp.status_code == 403
    assert "Access denied" in resp.json()["detail"] or "Insufficient permissions" in resp.json()["detail"]


def test_patient_cannot_access_optimizer_apply(patient_token):
    sample = client.get("/api/v1/protocol/sample").json()
    resp = client.post(
        "/api/v1/optimizer/apply-amendment",
        json={"protocol": sample, "amendment_id": "AMD-01"},
        headers={"Authorization": f"Bearer {patient_token}"}
    )
    assert resp.status_code == 403


def test_patient_cannot_access_cohort_stats(patient_token):
    resp = client.get(
        "/api/v1/cohort/stats",
        headers={"Authorization": f"Bearer {patient_token}"}
    )
    assert resp.status_code == 403


def test_doctor_cannot_call_admin_seed(doctor_token):
    # /cohort/seed requires admin role, doctor must be rejected with 403
    resp = client.post(
        "/api/v1/cohort/seed?total=100",
        headers={"Authorization": f"Bearer {doctor_token}"}
    )
    assert resp.status_code == 403


def test_admin_can_call_cohort_seed(admin_token):
    resp = client.post(
        "/api/v1/cohort/seed?total=100",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    assert resp.json().get("status") == "success"
    assert resp.json().get("is_synthetic_data") is True


# ── 2. Public Signup Privilege Escalation Prevention ────────────────────────

def test_signup_forces_patient_role_ignoring_requested_role():
    email = f"attacker.{uuid.uuid4().hex[:6]}@adversary.org"
    for privileged_role in ["admin", "doctor", "INVESTIGATOR", "superuser"]:
        resp = client.post("/api/v1/auth/signup", json={
            "name": "Attacker Role Test",
            "email": f"{privileged_role}.{email}",
            "password": "ValidPassword2026!",
            "role": privileged_role,
            "organization": "Security Testing Group"
        })
        assert resp.status_code == 200
        user_role = resp.json()["user"]["role"]
        # MUST ALWAYS be patient regardless of what was passed
        assert user_role == "patient"


# ── 3. Clinical Safety: Hard Exclusions Cannot Be Overridden by Score ───────

def test_active_brain_metastases_hard_exclusion_unconditional_not_eligible(patient_token):
    """
    Patient has ideal lab values across all parameters (ANC, platelets, eGFR, ECOG 0),
    yielding a numerical score >= 85%, BUT has untreated active brain metastases.
    Clinical safety rule: MUST evaluate to NOT_ELIGIBLE unconditionally.
    """
    ideal_patient_with_active_cns = {
        "patient_id": "PT-SAFETY-001",
        "age": 55,
        "cancer_stage": "Stage IV (Oligometastatic)",
        "ecog_score": 0,
        "egfr_ml_min": 90.0,
        "anc": 3500.0,
        "platelets": 250.0,
        "hemoglobin": 13.5,
        "total_bilirubin": 0.8,
        "prior_lines": 0,
        "has_active_brain_mets": True,   # HARD EXCLUSION
        "has_stable_brain_mets": False,
        "has_active_autoimmune": False,
        "distance_to_center_miles": 10.0
    }

    resp = client.post(
        "/api/v1/patient/screen-eligibility",
        json=ideal_patient_with_active_cns,
        headers={"Authorization": f"Bearer {patient_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()

    # Verify that all trials evaluate to NOT_ELIGIBLE due to active brain mets
    for match in data["matches"]:
        assert match["match_status"] == "NOT_ELIGIBLE", (
            f"Trial {match['protocol_id']} allowed active brain mets! Status was {match['match_status']}"
        )
        cns_check = next((c for c in match["criteria_breakdown"] if "CNS" in c["criterion"]), None)
        assert cns_check is not None
        assert cns_check["passed"] is False
        assert "HARD EXCLUSION" in cns_check["impact_note"]


def test_active_autoimmune_hard_exclusion_evaluates_not_eligible(patient_token):
    """
    Patient with active autoimmune disease must be excluded from immunotherapy protocols.
    """
    patient_with_autoimmune = {
        "patient_id": "PT-SAFETY-002",
        "age": 58,
        "cancer_stage": "Stage IV (Oligometastatic)",
        "ecog_score": 0,
        "egfr_ml_min": 85.0,
        "anc": 3000.0,
        "platelets": 220.0,
        "hemoglobin": 12.8,
        "total_bilirubin": 0.7,
        "prior_lines": 0,
        "has_active_brain_mets": False,
        "has_stable_brain_mets": False,
        "has_active_autoimmune": True,  # Autoimmune hard exclusion
        "distance_to_center_miles": 15.0
    }

    resp = client.post(
        "/api/v1/patient/screen-eligibility",
        json=patient_with_autoimmune,
        headers={"Authorization": f"Bearer {patient_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()

    # The NSCLC protocol (PS-ONC-2026-001) excludes active autoimmune
    nsclc = next(m for m in data["matches"] if "NSCLC" in m.get("indication", "") or m["protocol_id"] == "PS-ONC-2026-001")
    assert nsclc["match_status"] == "NOT_ELIGIBLE"


def test_investigator_disclaimer_present_on_all_screening_responses(patient_token):
    resp = client.post(
        "/api/v1/patient/screen-eligibility",
        json={
            "patient_id": "PT-DISCLAIMER-TEST",
            "age": 60,
            "cancer_stage": "Stage IV (Oligometastatic)",
            "ecog_score": 1,
            "egfr_ml_min": 70.0
        },
        headers={"Authorization": f"Bearer {patient_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "investigator_disclaimer" in data
    assert "clinical investigator" in data["investigator_disclaimer"].lower()

    for m in data["matches"]:
        assert m.get("investigator_confirmation_required") is True
        assert "investigator_disclaimer" in m


# ── 4. Exception Leakage Prevention ─────────────────────────────────────────

def test_google_auth_without_client_id_does_not_leak_internals():
    # Calling Google auth when not configured should return a clean 503, never stack trace
    resp = client.post("/api/v1/auth/google", json={"id_token": "mock_google_id_token_123456789"})
    assert resp.status_code in [401, 503]
    detail = resp.json()["detail"]
    assert "Traceback" not in detail
    assert "Exception" not in detail
