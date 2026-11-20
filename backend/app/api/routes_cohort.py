"""
ProtocolShield Cohort Simulation API Routes
"""
from fastapi import APIRouter, HTTPException, Query
from app.models.patient import CohortFilterCriteria
from app.engine.synthetic_data import seed_database_if_empty, generate_synthetic_cohort
from app.engine.cohort_simulator import cohort_engine
from app.db.duckdb_client import db_client

router = APIRouter(prefix="/cohort", tags=["Cohort Simulation"])


@router.get("/stats")
async def get_cohort_statistics():
    """Returns overview statistics of the synthetic patient population."""
    try:
        count = db_client.count_patients()
        if count == 0:
            count = seed_database_if_empty(10000)

        conn = db_client.get_connection()
        try:
            stage_dist = conn.execute(
                "SELECT cancer_stage, count(*) as count FROM patients GROUP BY cancer_stage ORDER BY count DESC"
            ).fetchall()
            
            ecog_dist = conn.execute(
                "SELECT ecog_score, count(*) as count FROM patients GROUP BY ecog_score ORDER BY ecog_score"
            ).fetchall()

            rurality_dist = conn.execute(
                "SELECT rurality, count(*) as count FROM patients GROUP BY rurality ORDER BY count DESC"
            ).fetchall()

            avg_metrics = conn.execute("""
                SELECT 
                    round(avg(age), 1) as avg_age,
                    round(avg(egfr_ml_min), 1) as avg_egfr,
                    round(avg(distance_to_center_miles), 1) as avg_distance_miles,
                    round(avg(anc), 0) as avg_anc
                FROM patients
            """).fetchone()

            return {
                "total_patients": count,
                "stages": [{"stage": s, "count": c} for s, c in stage_dist],
                "ecog_scores": [{"ecog": e, "count": c} for e, c in ecog_dist],
                "rurality": [{"type": r, "count": c} for r, c in rurality_dist],
                "averages": {
                    "age": avg_metrics[0],
                    "egfr": avg_metrics[1],
                    "distance_miles": avg_metrics[2],
                    "anc": avg_metrics[3]
                }
            }
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query error: {str(e)}")


@router.post("/seed")
async def seed_cohort(total: int = Query(default=10000, ge=100, le=50000)):
    """Forces seeding or re-generation of synthetic cohort."""
    try:
        count = seed_database_if_empty(total_patients=total)
        return {"status": "success", "total_records": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simulate-funnel")
async def simulate_funnel(criteria: CohortFilterCriteria):
    """
    Executes vectorized multi-stage funnel filtering across the 10,000 synthetic cohort
    and identifies parameter sensitivity bottlenecks.
    """
    try:
        # Auto-seed if not seeded yet
        if db_client.count_patients() == 0:
            seed_database_if_empty(10000)

        results = cohort_engine.simulate_eligibility_funnel(criteria)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")


@router.post("/retention-curve")
async def calculate_retention_curve(
    enrolled_size: int = Query(default=400, ge=10, le=10000),
    composite_pbi: float = Query(default=62.5, ge=0.0, le=100.0),
    duration_weeks: int = Query(default=52, ge=4, le=104),
    peak_weeks: list[int] = Query(default=[1, 6, 12, 24])
):
    """
    Calculates week-by-week patient retention and hazard curve over trial duration.
    """
    try:
        curve = cohort_engine.simulate_longitudinal_retention(
            enrolled_cohort_size=enrolled_size,
            composite_pbi=composite_pbi,
            study_duration_weeks=duration_weeks,
            peak_burden_weeks=peak_weeks
        )
        return {"retention_curve": curve}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
