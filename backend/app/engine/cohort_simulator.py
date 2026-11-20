"""
ProtocolShield Cohort Simulation & Longitudinal Attrition Engine
Runs vectorized SQL execution across 10,000 patient records in DuckDB
and models Kaplan-Meier style patient retention over the trial duration.
"""
import numpy as np
from typing import Any
from app.db.duckdb_client import db_client
from app.models.patient import CohortFilterCriteria


class CohortSimulationEngine:
    def __init__(self):
        self.db = db_client

    def simulate_eligibility_funnel(self, criteria: CohortFilterCriteria) -> dict[str, Any]:
        """
        Executes multi-stage vectorized funnel filtering and determines
        exact attrition at each clinical eligibility step.
        """
        conn = self.db.get_connection()
        try:
            total_pool = conn.execute("SELECT count(*) FROM patients").fetchone()[0]

            # Stage 1: Age & Allowed Stage
            stages_in = "', '".join(criteria.allowed_stages)
            q_stage1 = f"""
                SELECT count(*) FROM patients
                WHERE age >= {criteria.min_age} AND age <= {criteria.max_age}
                  AND cancer_stage IN ('{stages_in}')
            """
            stage1_passed = conn.execute(q_stage1).fetchone()[0]

            # Stage 2: ECOG Performance Status
            q_stage2 = f"""
                {q_stage1}
                  AND ecog_score <= {criteria.max_ecog}
            """
            stage2_passed = conn.execute(q_stage2).fetchone()[0]

            # Stage 3: Hematologic & Renal/Hepatic Lab Cutoffs
            max_alt = criteria.max_alt_multiplier * 56.0  # ULN 56 U/L
            q_stage3 = f"""
                {q_stage2}
                  AND anc >= {criteria.min_anc}
                  AND platelets >= {criteria.min_platelets}
                  AND hemoglobin >= {criteria.min_hemoglobin}
                  AND egfr_ml_min >= {criteria.min_egfr}
                  AND total_bilirubin <= {criteria.max_total_bilirubin}
                  AND alt_u_l <= {max_alt}
            """
            stage3_passed = conn.execute(q_stage3).fetchone()[0]

            # Stage 4: Prior Lines & Comorbidities (Final Eligible)
            brain_clause = "" if criteria.allow_stable_brain_mets else "AND active_brain_metastases = FALSE AND stable_treated_brain_mets = FALSE"
            autoimmune_clause = "AND active_autoimmune_disease = FALSE" if criteria.exclude_active_autoimmune else ""
            
            q_final = f"""
                {q_stage3}
                  AND prior_lines_therapy <= {criteria.max_prior_lines}
                  {brain_clause}
                  {autoimmune_clause}
            """
            if criteria.target_biomarker_egfr_negative:
                q_final += " AND egfr_mutation = FALSE"
            if criteria.min_pdl1_tps is not None:
                q_final += f" AND pdl1_tps_percent >= {criteria.min_pdl1_tps}"

            final_eligible = conn.execute(q_final).fetchone()[0]

            # Bottleneck Sensitivity Analysis:
            # Measure impact of single-parameter relaxations
            # 1. eGFR relaxed by 10 mL/min
            q_egfr_relaxed = q_final.replace(f"egfr_ml_min >= {criteria.min_egfr}", f"egfr_ml_min >= {max(30.0, criteria.min_egfr - 10.0)}")
            egfr_gain = conn.execute(q_egfr_relaxed).fetchone()[0] - final_eligible

            # 2. ECOG relaxed by 1 level
            q_ecog_relaxed = q_final.replace(f"ecog_score <= {criteria.max_ecog}", f"ecog_score <= {min(4, criteria.max_ecog + 1)}")
            ecog_gain = conn.execute(q_ecog_relaxed).fetchone()[0] - final_eligible

            # 3. Bilirubin relaxed to 2.0
            q_bili_relaxed = q_final.replace(f"total_bilirubin <= {criteria.max_total_bilirubin}", "total_bilirubin <= 2.0")
            bili_gain = conn.execute(q_bili_relaxed).fetchone()[0] - final_eligible

            return {
                "total_population": total_pool,
                "final_eligible_count": final_eligible,
                "overall_yield_percentage": round((final_eligible / max(1, total_pool)) * 100.0, 2),
                "screen_failure_rate": round(100.0 - ((final_eligible / max(1, total_pool)) * 100.0), 2),
                "funnel_stages": [
                    {"stage": "Total Monitored Cohort", "count": total_pool, "pass_rate": 100.0},
                    {"stage": "Age & Cancer Stage", "count": stage1_passed, "pass_rate": round((stage1_passed / total_pool) * 100, 1)},
                    {"stage": "ECOG Performance (<= " + str(criteria.max_ecog) + ")", "count": stage2_passed, "pass_rate": round((stage2_passed / total_pool) * 100, 1)},
                    {"stage": "Organ & Lab Functions (eGFR, ANC, ALT)", "count": stage3_passed, "pass_rate": round((stage3_passed / total_pool) * 100, 1)},
                    {"stage": "Comorbidity & Final Eligibility", "count": final_eligible, "pass_rate": round((final_eligible / total_pool) * 100, 1)},
                ],
                "sensitivity_opportunities": [
                    {
                        "parameter": "Renal Cutoff (eGFR)",
                        "current_rule": f"eGFR >= {criteria.min_egfr} mL/min",
                        "proposed_relaxation": f"eGFR >= {max(30.0, criteria.min_egfr - 10.0)} mL/min",
                        "additional_candidates": egfr_gain,
                        "relative_gain_percent": round((egfr_gain / max(1, final_eligible)) * 100, 1)
                    },
                    {
                        "parameter": "ECOG Performance Status",
                        "current_rule": f"ECOG <= {criteria.max_ecog}",
                        "proposed_relaxation": f"ECOG <= {min(4, criteria.max_ecog + 1)}",
                        "additional_candidates": ecog_gain,
                        "relative_gain_percent": round((ecog_gain / max(1, final_eligible)) * 100, 1)
                    },
                    {
                        "parameter": "Total Bilirubin",
                        "current_rule": f"Bilirubin <= {criteria.max_total_bilirubin} mg/dL",
                        "proposed_relaxation": "Bilirubin <= 2.0 mg/dL",
                        "additional_candidates": bili_gain,
                        "relative_gain_percent": round((bili_gain / max(1, final_eligible)) * 100, 1)
                    }
                ]
            }
        finally:
            conn.close()

    def simulate_longitudinal_retention(
        self,
        enrolled_cohort_size: int,
        composite_pbi: float,
        study_duration_weeks: int = 52,
        peak_burden_weeks: list[int] = None
    ) -> list[dict[str, Any]]:
        """
        Computes weekly survival curves (Kaplan-Meier analogue) over 52 weeks
        based on cumulative patient fatigue and procedure intensity spikes.
        """
        peak_burden_weeks = peak_burden_weeks or []
        
        # Baseline annual dropout in oncology ~15% without heavy trial burden
        baseline_weekly_hazard = 0.15 / 52.0
        
        # Protocol fatigue coefficient scaled by PBI (0 - 100)
        fatigue_multiplier = 1.0 + ((composite_pbi / 100.0) ** 1.6) * 3.8

        retention_curve = []
        current_active = float(enrolled_cohort_size)

        for week in range(0, study_duration_weeks + 1):
            if week == 0:
                retention_curve.append({
                    "week": 0,
                    "active_patients": int(current_active),
                    "retained_percentage": 100.0,
                    "cumulative_dropouts": 0,
                    "weekly_dropout_hazard": 0.0,
                    "is_peak_burden_week": False
                })
                continue

            # Check if this week has clustered invasive assessments
            is_peak = week in peak_burden_weeks
            spike_factor = 2.4 if is_peak else 1.0
            
            weekly_hazard = min(0.08, baseline_weekly_hazard * fatigue_multiplier * spike_factor)
            dropouts_this_week = current_active * weekly_hazard
            current_active = max(0.0, current_active - dropouts_this_week)
            
            cumulative_dropouts = int(enrolled_cohort_size - current_active)
            retained_pct = round((current_active / max(1, enrolled_cohort_size)) * 100.0, 1)

            retention_curve.append({
                "week": week,
                "active_patients": int(np.round(current_active)),
                "retained_percentage": retained_pct,
                "cumulative_dropouts": cumulative_dropouts,
                "weekly_dropout_hazard": round(weekly_hazard * 100, 2),
                "is_peak_burden_week": is_peak
            })

        return retention_curve


cohort_engine = CohortSimulationEngine()
