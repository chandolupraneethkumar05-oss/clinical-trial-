"""
ProtocolShield Core Engine Unit & Integration Tests
Verifies DuckDB analytical queries, synthetic data seeding,
Tufts CSDD burden scoring, and cohort simulation funnel.
"""
import pytest
from app.db.duckdb_client import db_client
from app.engine.synthetic_data import generate_synthetic_cohort, seed_database_if_empty
from app.engine.burden_scorer import burden_engine, STANDARD_PROCEDURE_CATALOG
from app.models.burden import ProtocolVisit, AssessmentProcedure
from app.models.patient import CohortFilterCriteria
from app.engine.cohort_simulator import cohort_engine


def test_synthetic_cohort_generation():
    df = generate_synthetic_cohort(total_patients=500, seed=123)
    assert len(df) == 500
    assert "patient_id" in df.columns
    assert "anc" in df.columns
    assert "egfr_ml_min" in df.columns
    
    # Check clinical physiological boundaries
    assert df["age"].min() >= 18
    assert df["age"].max() <= 95
    assert df["ecog_score"].min() >= 0
    assert df["ecog_score"].max() <= 4


def test_duckdb_seeding_and_counts():
    count = seed_database_if_empty(total_patients=1000)
    assert count >= 1000
    assert db_client.count_patients() >= 1000


def test_burden_scoring_engine():
    p_labs = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["safety_labs"])
    p_ct = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["ct_scan"])
    p_biopsy = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["tumor_biopsy"])

    visits = [
        ProtocolVisit(
            visit_id="V-01",
            week_number=-1,
            visit_name="Screening",
            procedures=[p_labs, p_ct, p_biopsy]
        ),
        ProtocolVisit(
            visit_id="V-02",
            week_number=3,
            visit_name="Cycle 1",
            procedures=[p_labs]
        )
    ]

    breakdown = burden_engine.calculate_protocol_burden(visits, study_duration_weeks=12)
    assert breakdown.total_study_visits == 2
    assert breakdown.total_biopsies == 1
    assert breakdown.total_imaging_scans == 1
    assert breakdown.composite_pbi_score > 0.0


def test_cohort_simulation_funnel():
    seed_database_if_empty(total_patients=1000)
    criteria = CohortFilterCriteria(
        min_age=18,
        max_age=80,
        allowed_stages=["Stage IIIB", "Stage IIIC", "Stage IV (Oligometastatic)", "Stage IV (Polymetastatic)"],
        max_ecog=1,
        min_anc=1500.0,
        min_platelets=100.0,
        min_egfr=50.0,
        max_total_bilirubin=1.5
    )
    result = cohort_engine.simulate_eligibility_funnel(criteria)
    assert result["total_population"] >= 1000
    assert result["final_eligible_count"] > 0
    assert result["final_eligible_count"] <= result["total_population"]
    assert len(result["funnel_stages"]) == 5
    assert len(result["sensitivity_opportunities"]) == 3
