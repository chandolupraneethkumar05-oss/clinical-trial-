"""
ProtocolShield Clinical Eligibility, CNS Rules, Provenance & Dual-Engine Parity Tests.
Covers:
1. All 7 brain metastasis scenarios across protocol configurations.
2. Clinical data provenance enforcement (patient vs doctor vs synthetic demo vs unknown).
3. Absence of invented clinical defaults and elimination of misleading labels for missing fields.
4. Required field & finite numeric validation (HTTP 422).
5. 1:1 parity between CohortSimulationEngine SQL funnel and individual patient screening.
6. Burden scorer word-boundary fixes, PDF parser stage/CNS extraction, and optimizer 404 safety.
"""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.duckdb_client import DuckDBClient
from app.models.patient import CohortFilterCriteria
from app.engine.cohort_simulator import CohortSimulationEngine
from app.engine.eligibility import (
    PROVENANCE_INVESTIGATOR_VERIFIED,
    PROVENANCE_PATIENT_REPORTED,
    PROVENANCE_SYNTHETIC_DEMO,
    PROVENANCE_UNKNOWN,
    evaluate_cns_eligibility,
    evaluate_patient_against_criteria,
    resolve_patient_provenance,
    stage_matches,
)
from app.engine.burden_scorer import burden_engine
from app.engine.pdf_parser import ProtocolPDFParser
from app.models.burden import AssessmentProcedure, InvasivenessTier, ProtocolVisit

client = TestClient(app)


def _login(email: str, password: str) -> str:
    resp = client.post("/api/v1/auth/signin", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


@pytest.fixture(scope="module")
def patient_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_login('john.miller@patient.org', 'Patient2026!')}"}


@pytest.fixture(scope="module")
def doctor_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_login('elena.vance@novartis.com', 'Novartis2026!')}"}


# ── 1. Brain Metastases Eligibility Matrix (All 7 Scenarios) ─────────────────

def test_cns_1_active_brain_mets_excluded_when_protocol_excludes():
    res = evaluate_cns_eligibility(
        has_active_brain_mets=True,
        has_stable_brain_mets=False,
        exclude_active_brain_mets=True,
        allow_stable_brain_mets=True,
    )
    assert res.status == "FAIL"
    assert res.passed is False
    assert res.is_hard_rule is True
    assert "HARD EXCLUSION" in res.impact_note
    assert "Active" in res.patient_value


def test_cns_2_stable_treated_brain_mets_respects_protocol_flag():
    allowed = evaluate_cns_eligibility(
        has_active_brain_mets=False,
        has_stable_brain_mets=True,
        exclude_active_brain_mets=True,
        allow_stable_brain_mets=True,
    )
    assert allowed.status == "PASS"
    assert allowed.passed is True

    excluded = evaluate_cns_eligibility(
        has_active_brain_mets=False,
        has_stable_brain_mets=True,
        exclude_active_brain_mets=True,
        allow_stable_brain_mets=False,
    )
    assert excluded.status == "FAIL"
    assert excluded.passed is False
    assert "HARD EXCLUSION" in excluded.impact_note


def test_cns_3_no_brain_mets_explicitly_confirmed():
    strict_res = evaluate_cns_eligibility(
        has_active_brain_mets=False,
        has_stable_brain_mets=False,
        exclude_active_brain_mets=True,
        allow_stable_brain_mets=False,
    )
    assert strict_res.status == "PASS"
    assert strict_res.passed is True
    assert "Confirmed Negative" in strict_res.patient_value


def test_cns_4_missing_active_cns_never_defaults_false():
    res = evaluate_cns_eligibility(
        has_active_brain_mets=None,
        has_stable_brain_mets=False,
        exclude_active_brain_mets=True,
        allow_stable_brain_mets=True,
    )
    assert res.status == "NEEDS_INVESTIGATOR_REVIEW"
    assert res.passed is False
    assert "No CNS Mets" not in res.patient_value
    assert "Unknown" in res.patient_value or "Not Provided" in res.patient_value


def test_cns_5_missing_stable_cns_never_defaults_false():
    for allow_stable in (True, False):
        res = evaluate_cns_eligibility(
            has_active_brain_mets=False,
            has_stable_brain_mets=None,
            exclude_active_brain_mets=True,
            allow_stable_brain_mets=allow_stable,
        )
        assert res.status == "NEEDS_INVESTIGATOR_REVIEW"
        assert res.passed is False
        assert "Not Provided" in res.patient_value


def test_cns_6_both_cns_fields_missing_requires_investigator_review():
    res = evaluate_cns_eligibility(
        has_active_brain_mets=None,
        has_stable_brain_mets=None,
        exclude_active_brain_mets=True,
        allow_stable_brain_mets=True,
    )
    assert res.status == "NEEDS_INVESTIGATOR_REVIEW"
    assert res.passed is False
    assert "No CNS Mets" not in res.patient_value
    assert "Unknown" in res.patient_value


def test_cns_7_protocol_allowing_active_cns_mets_honored():
    res = evaluate_cns_eligibility(
        has_active_brain_mets=True,
        has_stable_brain_mets=False,
        exclude_active_brain_mets=False,
        allow_stable_brain_mets=True,
    )
    assert res.status == "PASS"
    assert res.passed is True


# ── 2. Clinical Data Provenance & No Fake Labels / Defaults ──────────────────

def test_provenance_server_side_enforcement(patient_headers, doctor_headers):
    # Unit checks for resolve_patient_provenance
    assert resolve_patient_provenance("patient", "verified_clinical", investigator_verified=True) == PROVENANCE_PATIENT_REPORTED
    assert resolve_patient_provenance("patient", "investigator_verified", investigator_verified=True) == PROVENANCE_PATIENT_REPORTED
    assert resolve_patient_provenance("patient", "unknown") == PROVENANCE_UNKNOWN
    assert resolve_patient_provenance("patient", "patient_reported", is_demo_profile=True) == PROVENANCE_SYNTHETIC_DEMO
    assert resolve_patient_provenance("doctor", "investigator_verified", investigator_verified=True) == PROVENANCE_INVESTIGATOR_VERIFIED

    # API check: Patient attempting to spoof verified_clinical is coerced to patient_reported
    spoof_payload = {
        "data_provenance": "verified_clinical",
        "investigator_verified": True,
        "age": 60,
        "cancer_stage": "Stage IV (Oligometastatic)",
        "ecog_score": 1,
        "egfr_ml_min": 68.0,
    }
    p_resp = client.post("/api/v1/patient/screen-eligibility", json=spoof_payload, headers=patient_headers)
    assert p_resp.status_code == 200, p_resp.text
    p_data = p_resp.json()
    assert p_data["data_provenance"] == PROVENANCE_PATIENT_REPORTED
    assert p_data["provenance_verified"] is False
    assert p_data["is_synthetic_data"] is False

    # Doctor with investigator_verified=True gets investigator_verified provenance
    d_resp = client.post("/api/v1/patient/screen-eligibility", json=spoof_payload, headers=doctor_headers)
    assert d_resp.status_code == 200, d_resp.text
    d_data = d_resp.json()
    assert d_data["data_provenance"] == PROVENANCE_INVESTIGATOR_VERIFIED
    assert d_data["provenance_verified"] is True

    # Patient synthetic demo walkthrough gets synthetic_demo + disclaimer
    demo_payload = {
        "is_demo_profile": True,
        "data_provenance": "synthetic_demo",
        "age": 62,
        "cancer_stage": "Stage IV (Oligometastatic)",
        "ecog_score": 1,
        "egfr_ml_min": 65.0,
    }
    demo_resp = client.post("/api/v1/patient/screen-eligibility", json=demo_payload, headers=patient_headers)
    assert demo_resp.status_code == 200
    demo_data = demo_resp.json()
    assert demo_data["data_provenance"] == PROVENANCE_SYNTHETIC_DEMO
    assert demo_data["is_synthetic_data"] is True
    assert demo_data["provenance_verified"] is False
    assert "synthetic demonstration" in demo_data["data_disclaimer"].lower()


def test_missing_optional_fields_never_invent_defaults_or_misleading_labels(patient_headers):
    minimal_payload = {
        "age": 61,
        "cancer_stage": "Stage IV (Oligometastatic)",
        "ecog_score": 1,
        "egfr_ml_min": 72.0,
    }
    resp = client.post("/api/v1/patient/screen-eligibility", json=minimal_payload, headers=patient_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    for match in data["matches"]:
        # Missing distance_to_center_miles must remain None, never 25.0 or 28.5
        assert match["patient_burden_summary"]["travel_distance_miles"] is None
        assert match["patient_burden_summary"]["study_duration_weeks"] >= 4
        # Missing CNS / autoimmune / EGFR must trigger review (cannot become POTENTIALLY_ELIGIBLE or ELIGIBLE)
        assert match["match_status"] != "POTENTIALLY_ELIGIBLE"

        for chk in match["criteria_breakdown"]:
            if chk["criterion"] in {
                "Central Nervous System (CNS) Status",
                "Autoimmune Disease Status",
                "EGFR Mutation Status",
            }:
                assert chk["status"] == "NEEDS_INVESTIGATOR_REVIEW"
                assert chk["passed"] is False
                # Patient-facing value must never falsely claim negative when missing
                assert chk["patient_value"] not in {
                    "No CNS Mets",
                    "No Active Autoimmune",
                    "EGFR Negative (Wild-Type)",
                    "Confirmed Negative (No Active Autoimmune)",
                    "Confirmed Negative (EGFR Wild-Type)",
                }


def test_patient_screening_rejects_missing_required_and_invalid_numeric_inputs(patient_headers):
    # Missing age / cancer_stage / ecog_score / egfr_ml_min
    resp_missing = client.post(
        "/api/v1/patient/screen-eligibility",
        json={"age": 55, "cancer_stage": "Stage IV"},
        headers=patient_headers,
    )
    assert resp_missing.status_code == 422

    # Blank cancer_stage
    resp_blank_stage = client.post(
        "/api/v1/patient/screen-eligibility",
        json={"age": 55, "cancer_stage": "   ", "ecog_score": 1, "egfr_ml_min": 65.0},
        headers=patient_headers,
    )
    assert resp_blank_stage.status_code == 422

    # Out-of-range eGFR / NaN in JSON
    resp_out_of_range = client.post(
        "/api/v1/patient/screen-eligibility",
        json={"age": 55, "cancer_stage": "Stage IV", "ecog_score": 1, "egfr_ml_min": 999.0},
        headers=patient_headers,
    )
    assert resp_out_of_range.status_code == 422

    resp_bad_nan = client.post(
        "/api/v1/patient/screen-eligibility",
        content='{"age": 55, "cancer_stage": "Stage IV", "ecog_score": 1, "egfr_ml_min": NaN}',
        headers={**patient_headers, "Content-Type": "application/json"},
    )
    assert resp_bad_nan.status_code == 422


def test_stage_matching_prevents_stage_ii_vs_iiib_false_positive():
    assert stage_matches("Stage II", "Stage II") is True
    assert stage_matches("Stage II (Resected)", "Stage II") is True
    assert stage_matches("Stage IV (Oligometastatic)", "Stage IV") is True
    assert stage_matches("Stage II", "Stage IIIB") is False
    assert stage_matches("Stage III", "Stage IIIB") is False
    assert stage_matches("Stage IIIB", "Stage IIIB") is True


# ── 3. 1:1 Individual Screening vs CohortSimulationEngine Consistency ─────────

SYNTHETIC_PARITY_COHORT = [
    # id, age, stage, ecog, anc, plt, hb, egfr, bili, alt, prior, active_cns, stable_cns, autoimm, egfr_mut, pdl1
    ("P01", 62, "Stage IV (Oligometastatic)", 1, 2500.0, 200.0, 11.5, 70.0, 1.0, 40.0, 1, False, False, False, False, 50.0),
    ("P02", 65, "Stage IIIB", 0, 3000.0, 250.0, 12.0, 80.0, 0.9, 35.0, 2, False, True, False, False, 20.0),
    ("P03", 17, "Stage IV", 1, 2500.0, 200.0, 11.5, 70.0, 1.0, 40.0, 1, False, False, False, False, 50.0),  # age < 18
    ("P04", 78, "Stage IV", 1, 2500.0, 200.0, 11.5, 70.0, 1.0, 40.0, 1, False, False, False, False, 50.0),  # age > 75
    ("P05", 58, "Stage II", 0, 2500.0, 200.0, 11.5, 70.0, 1.0, 40.0, 1, False, False, False, False, 50.0),  # Stage II must NOT match IIIB/IV
    ("P06", 59, "Stage IV", 2, 2500.0, 200.0, 11.5, 70.0, 1.0, 40.0, 1, False, False, False, False, 50.0),  # ECOG 2
    ("P07", 59, "Stage IV", 1, 1400.0, 200.0, 11.5, 70.0, 1.0, 40.0, 1, False, False, False, False, 50.0),  # low ANC
    ("P08", 59, "Stage IV", 1, 2500.0, 90.0, 11.5, 70.0, 1.0, 40.0, 1, False, False, False, False, 50.0),   # low Platelets
    ("P09", 59, "Stage IV", 1, 2500.0, 200.0, 8.5, 70.0, 1.0, 40.0, 1, False, False, False, False, 50.0),   # low Hb
    ("P10", 59, "Stage IV", 1, 2500.0, 200.0, 11.5, 45.0, 1.0, 40.0, 1, False, False, False, False, 50.0),  # low eGFR
    ("P11", 59, "Stage IV", 1, 2500.0, 200.0, 11.5, 70.0, 2.0, 40.0, 1, False, False, False, False, 50.0),  # high bilirubin
    ("P12", 59, "Stage IV", 1, 2500.0, 200.0, 11.5, 70.0, 1.0, 130.0, 1, False, False, False, False, 50.0), # high ALT (> 2.5*40=100)
    ("P13", 59, "Stage IV", 1, 2500.0, 200.0, 11.5, 70.0, 1.0, 40.0, 0, False, False, False, False, 50.0),  # prior lines 0 (< min_prior_lines=1)
    ("P14", 59, "Stage IV", 1, 2500.0, 200.0, 11.5, 70.0, 1.0, 40.0, 3, False, False, False, False, 50.0),  # prior lines 3 (> max_prior_lines=2)
    ("P15", 59, "Stage IV", 1, 2500.0, 200.0, 11.5, 70.0, 1.0, 40.0, 1, True, False, False, False, 50.0),  # active brain mets
    ("P16", 59, "Stage IV", 1, 2500.0, 200.0, 11.5, 70.0, 1.0, 40.0, 1, False, False, True, False, 50.0),  # active autoimmune
    ("P17", 59, "Stage IV", 1, 2500.0, 200.0, 11.5, 70.0, 1.0, 40.0, 1, False, False, False, True, 50.0),  # EGFR mutation positive
    ("P18", 59, "Stage IV", 1, 2500.0, 200.0, 11.5, 70.0, 1.0, 40.0, 1, False, False, False, False, 0.5),  # low PD-L1 (< 1.0%)
]


@pytest.mark.parametrize(
    "criteria",
    [
        CohortFilterCriteria(
            min_age=18,
            max_age=75,
            allowed_stages=["Stage IIIB", "Stage IIIC", "Stage IV"],
            max_ecog=1,
            min_anc=1500.0,
            min_platelets=100.0,
            min_hemoglobin=9.0,
            min_egfr=60.0,
            max_total_bilirubin=1.5,
            max_alt_multiplier=2.5,
            min_prior_lines=1,
            max_prior_lines=2,
            exclude_active_brain_mets=True,
            allow_stable_brain_mets=True,
            exclude_active_autoimmune=True,
            target_biomarker_egfr_negative=True,
            min_pdl1_tps=1.0,
        ),
        CohortFilterCriteria(
            min_age=18,
            max_age=75,
            allowed_stages=["Stage IIIB", "Stage IV"],
            max_ecog=1,
            min_egfr=60.0,
            min_prior_lines=0,
            max_prior_lines=2,
            exclude_active_brain_mets=True,
            allow_stable_brain_mets=False,
            exclude_active_autoimmune=True,
            target_biomarker_egfr_negative=True,
            min_pdl1_tps=None,
        ),
        CohortFilterCriteria(
            min_age=18,
            max_age=80,
            allowed_stages=["Stage II", "Stage IIIB", "Stage IV"],
            max_ecog=2,
            min_egfr=50.0,
            min_prior_lines=0,
            max_prior_lines=3,
            exclude_active_brain_mets=False,
            allow_stable_brain_mets=True,
            exclude_active_autoimmune=False,
            target_biomarker_egfr_negative=False,
            min_pdl1_tps=None,
        ),
    ],
)
def test_individual_and_cohort_engines_agree_1_to_1(criteria: CohortFilterCriteria):
    mem_db = DuckDBClient(Path(":memory:"))
    conn = mem_db.get_connection()
    try:
        conn.execute("DELETE FROM patients")
        for row in SYNTHETIC_PARITY_COHORT:
            conn.execute(
                """
                INSERT INTO patients (
                    patient_id, age, cancer_stage, ecog_score, anc, platelets,
                    hemoglobin, egfr_ml_min, total_bilirubin, alt_u_l,
                    prior_lines_therapy, active_brain_metastases,
                    stable_treated_brain_mets, active_autoimmune_disease,
                    egfr_mutation, pdl1_tps_percent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                row,
            )
    finally:
        conn.close()

    sim = CohortSimulationEngine()
    sim.db = mem_db
    funnel = sim.simulate_eligibility_funnel(criteria)

    individually_eligible_ids = []
    for row in SYNTHETIC_PARITY_COHORT:
        patient_obj = SimpleNamespace(
            patient_id=row[0],
            age=row[1],
            cancer_stage=row[2],
            ecog_score=row[3],
            anc=row[4],
            platelets=row[5],
            hemoglobin=row[6],
            egfr_ml_min=row[7],
            total_bilirubin=row[8],
            alt_u_l=row[9],
            prior_lines_therapy=row[10],
            active_brain_metastases=row[11],
            stable_treated_brain_mets=row[12],
            active_autoimmune_disease=row[13],
            egfr_mutation=row[14],
            pdl1_tps_percent=row[15],
        )
        checks, hard_failures, _ = evaluate_patient_against_criteria(patient_obj, criteria)
        if not hard_failures and all(c.passed and c.status == "PASS" for c in checks):
            individually_eligible_ids.append(row[0])

    assert funnel["total_population"] == len(SYNTHETIC_PARITY_COHORT)
    assert funnel["final_eligible_count"] == len(individually_eligible_ids), (
        f"Engine mismatch: SQL count={funnel['final_eligible_count']}, individual eligible={individually_eligible_ids}"
    )


def test_cohort_criteria_model_rejects_invalid_ranges():
    with pytest.raises(ValueError):
        CohortFilterCriteria(min_age=70, max_age=50)
    with pytest.raises(ValueError):
        CohortFilterCriteria(min_prior_lines=3, max_prior_lines=1)


# ── 4. Burden Scorer, PDF Parser & Optimizer Fixes ───────────────────────────

def test_burden_scorer_no_ct_substring_false_positive_and_unique_peak_weeks():
    visits = [
        ProtocolVisit(
            visit_id="V1",
            week_number=4,
            visit_name="Week 4 Cardiopulmonary + Biopsy",
            is_mandatory=True,
            inpatient_stay=True,
            procedures=[
                AssessmentProcedure(name="12-Lead Electrocardiogram (ECG)", category=InvasivenessTier.NON_INVASIVE, invasiveness_weight=1.0, estimated_duration_minutes=20, fasting_required=False),
                AssessmentProcedure(name="Investigational Product Dosing", category=InvasivenessTier.MINIMALLY_INVASIVE, invasiveness_weight=1.5, estimated_duration_minutes=45, fasting_required=False),
                AssessmentProcedure(name="CT Thorax Scan", category=InvasivenessTier.MODERATELY_INVASIVE, invasiveness_weight=3.0, estimated_duration_minutes=45, fasting_required=False),
                AssessmentProcedure(name="Tumor Core Biopsy", category=InvasivenessTier.HIGHLY_INVASIVE, invasiveness_weight=5.0, estimated_duration_minutes=90, fasting_required=True, sedation_or_recovery_required=True),
            ],
        )
    ]
    burden = burden_engine.calculate_protocol_burden(visits, study_duration_weeks=24)
    # Only "CT Thorax Scan" counts as imaging ("Electrocardiogram" & "Product" must NOT match "ct")
    assert burden.total_imaging_scans == 1
    assert burden.total_biopsies == 1
    assert len(burden.peak_burden_weeks) == len(set(burden.peak_burden_weeks))


def test_pdf_parser_stage_boundaries_and_cns_extraction():
    parser = ProtocolPDFParser()
    blanket_cns_text = """
    Phase III NSCLC Study Protocol
    Inclusion Criteria:
    - Age 18 to 75 years with histologically confirmed Stage IIIB or Stage IV NSCLC.
    - eGFR >= 55 mL/min and ECOG 0-1.
    Exclusion Criteria:
    - Any known brain metastases excluded regardless of treatment status.
    Schedule of Assessments:
    - Screening: Vital Signs, CT Scan
    """
    parsed = parser._parse_text(blanket_cns_text, "blanket_cns_nsclc.pdf", 1, file_bytes=b"abc")
    filters = parsed.eligibility.structured_filters
    assert filters["min_egfr"] == 55.0
    assert filters["max_ecog"] == 1
    assert "Stage IIIB" in filters["allowed_stages"]
    assert filters["exclude_active_brain_mets"] is True
    assert filters["allow_stable_brain_mets"] is False

    active_only_text = """
    Phase III NSCLC Study Protocol
    Inclusion Criteria:
    - Age >= 18 years, eGFR >= 60 mL/min.
    Exclusion Criteria:
    - Active or untreated brain metastases (stable treated lesions permitted).
    """
    parsed_active_only = parser._parse_text(active_only_text, "active_only.pdf", 1, file_bytes=b"xyz")
    assert parsed_active_only.eligibility.structured_filters["allow_stable_brain_mets"] is True
    assert parsed.protocol_id != parsed_active_only.protocol_id


def test_optimizer_returns_404_for_unknown_amendment(doctor_headers):
    sample = client.get("/api/v1/protocol/sample").json()
    resp = client.post(
        "/api/v1/optimizer/apply-amendment",
        json={"protocol": sample, "amendment_id": "NON-EXISTENT-AMD-999"},
        headers=doctor_headers,
    )
    assert resp.status_code == 404
