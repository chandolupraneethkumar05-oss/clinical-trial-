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


# ── 5. Clinical Safety & Consistency: Missing Data & Score Non-Override ────

def test_missing_clinical_data_yields_requires_review_never_pass(patient_token):
    """
    Candidate with undocumented lab values (e.g. unrecorded ALT and total bilirubin)
    must evaluate to REQUIRES_REVIEW (never POTENTIALLY_ELIGIBLE), with
    criterion status UNKNOWN and passed=False.
    """
    partial_patient = {
        "patient_id": "PT-MISSING-LABS-01",
        "age": 62,
        "cancer_stage": "Stage IV (Oligometastatic)",
        "ecog_score": 1,
        "egfr_ml_min": 75.0,
        "anc": 2800.0,
        "platelets": 200.0,
        "hemoglobin": 13.0,
        # Omit total_bilirubin and alt_u_l
        "has_active_brain_mets": False,
        "has_stable_brain_mets": False,
        "has_active_autoimmune": False,
        "prior_lines": 1,
        "distance_to_center_miles": 20.0
    }
    resp = client.post(
        "/api/v1/patient/screen-eligibility",
        json=partial_patient,
        headers={"Authorization": f"Bearer {patient_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    for match in data["matches"]:
        # When critical labs are missing, match_status cannot be POTENTIALLY_ELIGIBLE
        assert match["match_status"] in ["REQUIRES_REVIEW", "NOT_ELIGIBLE"]
        assert match["match_status"] != "POTENTIALLY_ELIGIBLE"

        # ALT criterion check must be UNKNOWN and passed=False
        alt_check = next((c for c in match["criteria_breakdown"] if "ALT" in c["criterion"]), None)
        assert alt_check is not None
        assert alt_check["status"] == "UNKNOWN"
        assert alt_check["passed"] is False

        # Bilirubin criterion check must be UNKNOWN and passed=False
        bili_check = next((c for c in match["criteria_breakdown"] if "Bilirubin" in c["criterion"]), None)
        assert bili_check is not None
        assert bili_check["status"] == "UNKNOWN"
        assert bili_check["passed"] is False


def test_high_numerical_score_cannot_override_mandatory_criteria_failure(patient_token):
    """
    Candidate satisfies 13 of 14 criteria (92.8% passing score), but fails
    the mandatory cancer_stage criterion (Stage II instead of Stage IV).
    Clinical rule: Numerical score > 90% must NEVER override mandatory criterion failure.
    Outcome must be NOT_ELIGIBLE.
    """
    patient_wrong_stage = {
        "patient_id": "PT-HIGH-SCORE-STAGE-II",
        "age": 55,
        "cancer_stage": "Stage II",  # Mandatory criteria for Stage IV trials
        "ecog_score": 0,
        "egfr_ml_min": 90.0,
        "anc": 3500.0,
        "platelets": 250.0,
        "hemoglobin": 14.0,
        "total_bilirubin": 0.6,
        "alt_u_l": 28.0,
        "has_active_brain_mets": False,
        "has_stable_brain_mets": False,
        "has_active_autoimmune": False,
        "prior_lines": 1,
        "distance_to_center_miles": 15.0
    }
    resp = client.post(
        "/api/v1/patient/screen-eligibility",
        json=patient_wrong_stage,
        headers={"Authorization": f"Bearer {patient_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    # All trials must evaluate to NOT_ELIGIBLE (either due to stage mismatch or prior lines)
    for match in data["matches"]:
        assert match["match_status"] == "NOT_ELIGIBLE"

    # Specifically for Stage IV protocols (NSCLC and TNBC), the stage criterion itself must FAIL
    stage_iv_matches = [m for m in data["matches"] if m["protocol_id"] in ["PS-ONC-2026-001", "PS-ONC-2026-002"]]
    assert len(stage_iv_matches) >= 2
    for match in stage_iv_matches:
        stage_check = next((c for c in match["criteria_breakdown"] if "Stage" in c["criterion"]), None)
        assert stage_check is not None
        assert stage_check["status"] == "FAIL"
        assert stage_check["passed"] is False


def test_cohort_simulator_and_screening_alt_consistency():
    """
    Verifies that the CohortSimulationEngine query logic and the individual patient screening logic
    use consistent ALT thresholds based on alt_uln_reference (56 U/L).
    """
    from app.engine.cohort_simulator import CohortSimulationEngine
    from app.models.patient import CohortFilterCriteria

    sim = CohortSimulationEngine()
    criteria = CohortFilterCriteria(
        max_alt_multiplier=2.5,
        alt_uln_reference=56.0
    )
    query, params = sim._build_filter_query(criteria, stage_level=3)
    # 2.5 * 56.0 = 140.0
    assert 140.0 in params or any(p == 140.0 for p in params)
    assert "alt_u_l <= ?" in query


def test_minimal_clinical_profile_screening_evaluates_unknown_safely(patient_token):
    """
    Verifies that when a patient submits only minimal required fields (age, cancer_stage,
    ecog_score, egfr_ml_min) with zero optional laboratory values provided (None or omitted),
    the screening engine safely processes the request without error, assigns UNKNOWN to
    the missing lab criteria, and evaluates eligible candidates to REQUIRES_REVIEW (never
    false-positive POTENTIALLY_ELIGIBLE).
    """
    minimal_patient = {
        "patient_id": "PT-MINIMAL-PROFILE-01",
        "age": 60,
        "cancer_stage": "Stage IV",
        "ecog_score": 1,
        "egfr_ml_min": 65.0,
        "has_active_brain_mets": False,
        "has_stable_brain_mets": False,
        "has_active_autoimmune": False,
        "prior_lines": 1,
        "distance_to_center_miles": 25.0
        # All lab biomarkers (anc, platelets, hemoglobin, total_bilirubin, alt_u_l) omitted
    }
    resp = client.post(
        "/api/v1/patient/screen-eligibility",
        json=minimal_patient,
        headers={"Authorization": f"Bearer {patient_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "matches" in data
    assert len(data["matches"]) > 0

    # Because lab criteria are missing, candidate cannot be POTENTIALLY_ELIGIBLE
    for match in data["matches"]:
        assert match["match_status"] in ["REQUIRES_REVIEW", "NOT_ELIGIBLE"]
        assert match["match_status"] != "POTENTIALLY_ELIGIBLE"

        # Check that missing labs are marked UNKNOWN
        breakdown = match["criteria_breakdown"]
        anc_check = next((c for c in breakdown if "ANC" in c["criterion"]), None)
        if anc_check:
            assert anc_check["status"] == "UNKNOWN"
            assert anc_check["passed"] is False

        plt_check = next((c for c in breakdown if "Platelets" in c["criterion"] or "PLT" in c["criterion"]), None)
        if plt_check:
            assert plt_check["status"] == "UNKNOWN"
            assert plt_check["passed"] is False

    # Investigator disclaimer must be present
    assert "investigator_disclaimer" in data
    assert "investigator" in data["investigator_disclaimer"].lower()


