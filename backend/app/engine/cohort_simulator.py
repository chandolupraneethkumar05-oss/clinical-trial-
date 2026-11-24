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

    def _build_filter_query(self, criteria: CohortFilterCriteria, stage_level: int = 4) -> tuple[str, list[Any]]:
        """
        Builds fully parameterized SQL queries for cohort eligibility evaluation.
        Eliminates SQL injection and provides deterministic filtering.
        """
        clauses = []
        params = []

        # Stage 1: Age & Allowed Stage
        clauses.append("age >= ?")
        params.append(criteria.min_age)
        clauses.append("age <= ?")
        params.append(criteria.max_age)

        if criteria.allowed_stages:
            placeholders = ", ".join(["?"] * len(criteria.allowed_stages))
            clauses.append(f"cancer_stage IN ({placeholders})")
            params.extend(criteria.allowed_stages)
        else:
            clauses.append("1 = 0")

        if stage_level >= 2:
            # Stage 2: ECOG Performance Status
            clauses.append("ecog_score <= ?")
            params.append(criteria.max_ecog)

        if stage_level >= 3:
            # Stage 3: Hematologic & Renal/Hepatic Lab Cutoffs
            if criteria.max_alt_u_l is not None:
                max_alt = criteria.max_alt_u_l
            else:
                alt_uln = getattr(criteria, "alt_uln_reference", 56.0)
                max_alt = criteria.max_alt_multiplier * alt_uln
            clauses.append("anc >= ?")
            params.append(criteria.min_anc)
            clauses.append("platelets >= ?")
            params.append(criteria.min_platelets)
            clauses.append("hemoglobin >= ?")
            params.append(criteria.min_hemoglobin)
            clauses.append("egfr_ml_min >= ?")
            params.append(criteria.min_egfr)
            clauses.append("total_bilirubin <= ?")
            params.append(criteria.max_total_bilirubin)
            clauses.append("alt_u_l <= ?")
            params.append(max_alt)

        if stage_level >= 4:
            # Stage 4: Prior Lines & Comorbidities (Final Eligible)
            clauses.append("prior_lines_therapy <= ?")
            params.append(criteria.max_prior_lines)

            if not criteria.allow_stable_brain_mets:
                clauses.append("active_brain_metastases = FALSE AND stable_treated_brain_mets = FALSE")
            if criteria.exclude_active_autoimmune:
                clauses.append("active_autoimmune_disease = FALSE")
            if criteria.target_biomarker_egfr_negative:
                clauses.append("egfr_mutation = FALSE")
            if criteria.min_pdl1_tps is not None:
                clauses.append("pdl1_tps_percent >= ?")
                params.append(criteria.min_pdl1_tps)

        where_sql = " AND ".join(clauses)
        query = f"SELECT count(*) FROM patients WHERE {where_sql}"
        return query, params

    def simulate_eligibility_funnel(self, criteria: CohortFilterCriteria) -> dict[str, Any]:
        """
        Executes multi-stage vectorized funnel filtering and determines
        exact attrition at each clinical eligibility step.
        """
        conn = self.db.get_connection()
        try:
            total_pool = conn.execute("SELECT count(*) FROM patients").fetchone()[0]

            # Stage 1: Age & Allowed Stage
            q1, p1 = self._build_filter_query(criteria, stage_level=1)
            stage1_passed = conn.execute(q1, p1).fetchone()[0]

            # Stage 2: ECOG Performance Status
            q2, p2 = self._build_filter_query(criteria, stage_level=2)
            stage2_passed = conn.execute(q2, p2).fetchone()[0]

            # Stage 3: Hematologic & Renal/Hepatic Lab Cutoffs
            q3, p3 = self._build_filter_query(criteria, stage_level=3)
            stage3_passed = conn.execute(q3, p3).fetchone()[0]

            # Stage 4: Prior Lines & Comorbidities (Final Eligible)
            q_final, p_final = self._build_filter_query(criteria, stage_level=4)
            final_eligible = conn.execute(q_final, p_final).fetchone()[0]

            # Bottleneck Sensitivity Analysis:
            # Robust, parameterized counter-factual re-queries
            # 1. eGFR relaxed by 10 mL/min
            crit_egfr = criteria.model_copy(update={"min_egfr": max(30.0, criteria.min_egfr - 10.0)})
            q_egfr, p_egfr = self._build_filter_query(crit_egfr, stage_level=4)
            egfr_gain = conn.execute(q_egfr, p_egfr).fetchone()[0] - final_eligible

            # 2. ECOG relaxed by 1 level
            crit_ecog = criteria.model_copy(update={"max_ecog": min(4, criteria.max_ecog + 1)})
            q_ecog, p_ecog = self._build_filter_query(crit_ecog, stage_level=4)
            ecog_gain = conn.execute(q_ecog, p_ecog).fetchone()[0] - final_eligible

            # 3. Bilirubin relaxed to 2.0
            crit_bili = criteria.model_copy(update={"max_total_bilirubin": 2.0})
            q_bili, p_bili = self._build_filter_query(crit_bili, stage_level=4)
            bili_gain = conn.execute(q_bili, p_bili).fetchone()[0] - final_eligible

            safe_pool = max(1, total_pool)
            return {
                "total_population": total_pool,
                "final_eligible_count": final_eligible,
                "overall_yield_percentage": round((final_eligible / safe_pool) * 100.0, 2),
                "screen_failure_rate": round(100.0 - ((final_eligible / safe_pool) * 100.0), 2),
                "funnel_stages": [
                    {"stage": "Total Monitored Cohort", "count": total_pool, "pass_rate": 100.0},
                    {"stage": "Age & Cancer Stage", "count": stage1_passed, "pass_rate": round((stage1_passed / safe_pool) * 100, 1)},
                    {"stage": "ECOG Performance (<= " + str(criteria.max_ecog) + ")", "count": stage2_passed, "pass_rate": round((stage2_passed / safe_pool) * 100, 1)},
                    {"stage": "Organ & Lab Functions (eGFR, ANC, ALT)", "count": stage3_passed, "pass_rate": round((stage3_passed / safe_pool) * 100, 1)},
                    {"stage": "Comorbidity & Final Eligibility", "count": final_eligible, "pass_rate": round((final_eligible / safe_pool) * 100, 1)},
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
