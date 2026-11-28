"""
ProtocolShield Clinical Protocol Optimization Engine
Analyzes clinical trial protocols for patient friction bottlenecks and non-essential exclusions.
Computes counterfactual eligibility yields, demographic equity shifts, visit PBI deltas,
and simulated retention gains dynamically against DuckDB and BurdenScoringEngine.
Zero hardcoded cost or demographic percentages are returned.
"""
from __future__ import annotations

import copy
from app.models.protocol import ClinicalTrialProtocol
from app.models.amendment import ProtocolAmendmentProposal
from app.engine.burden_scorer import burden_engine
from app.engine.cohort_simulator import cohort_engine
from app.engine.eligibility import normalize_filter_criteria


def _simulate_count(filters: dict) -> int:
    criteria = normalize_filter_criteria(filters)
    res = cohort_engine.simulate_eligibility_funnel(criteria)
    return int(res.get("final_eligible_count", 0))


def _compute_demographic_counts(filters: dict) -> dict[str, int]:
    """Queries actual DuckDB `patients` demographic breakdown under the supplied criteria."""
    criteria = normalize_filter_criteria(filters)
    base_query, params = cohort_engine._build_filter_query(criteria, stage_level=4)
    # _build_filter_query returns "SELECT count(*) FROM patients WHERE ..."
    where_clause = base_query.split(" WHERE ", 1)[1]
    sql = f"""
        SELECT
            COUNT(*) AS total_cnt,
            COALESCE(SUM(CASE WHEN age >= 65 THEN 1 ELSE 0 END), 0) AS seniors_cnt,
            COALESCE(SUM(CASE WHEN race_ethnicity != 'White' THEN 1 ELSE 0 END), 0) AS minority_cnt,
            COALESCE(SUM(CASE WHEN rurality = 'Rural' THEN 1 ELSE 0 END), 0) AS rural_cnt
        FROM patients
        WHERE {where_clause}
    """
    conn = cohort_engine.db.get_connection()
    try:
        row = conn.execute(sql, params).fetchone()
    finally:
        conn.close()

    if not row:
        return {"total": 0, "seniors": 0, "minority": 0, "rural": 0}
    return {
        "total": int(row[0] or 0),
        "seniors": int(row[1] or 0),
        "minority": int(row[2] or 0),
        "rural": int(row[3] or 0),
    }


def _format_demographic_impact(base_stats: dict[str, int], rel_stats: dict[str, int], context_note: str) -> str:
    def _delta_str(label: str, before: int, after: int) -> str:
        diff = after - before
        pct = round((diff / max(1, before)) * 100.0, 1)
        if diff > 0:
            return f"{label}: {before:,} → {after:,} (+{pct}%)"
        return f"{label}: {after:,}"

    parts = [
        _delta_str("age >= 65", base_stats["seniors"], rel_stats["seniors"]),
        _delta_str("underrepresented groups", base_stats["minority"], rel_stats["minority"]),
        _delta_str("rural residents", base_stats["rural"], rel_stats["rural"]),
    ]
    return f"DuckDB cohort measurement ({context_note}) — " + "; ".join(parts) + "."


def _compute_end_retention(enrolled: int, pbi_score: float, duration_weeks: int, peak_weeks: list[int]) -> float:
    curve = cohort_engine.simulate_longitudinal_retention(
        enrolled_cohort_size=max(1, enrolled),
        composite_pbi=pbi_score,
        study_duration_weeks=duration_weeks,
        peak_burden_weeks=peak_weeks,
    )
    if not curve:
        return 0.0
    return float(curve[-1].get("retained_percentage", 0.0))


class ProtocolOptimizationAdvisor:
    """
    Evaluates protocol clauses & visit schedules dynamically against DuckDB & BurdenScoringEngine
    aligned with FDA/ASCO modernization guidelines and FDORA equity tracking.
    """

    def generate_amendments(self, protocol: ClinicalTrialProtocol) -> list[ProtocolAmendmentProposal]:
        proposals: list[ProtocolAmendmentProposal] = []
        filters = protocol.eligibility.structured_filters or {}
        duration_weeks = max(4, protocol.study_duration_weeks or 52)
        study_months = duration_weeks / 4.33

        baseline_burden = protocol.burden or burden_engine.calculate_protocol_burden(
            protocol.visits, study_duration_weeks=duration_weeks
        )
        baseline_pbi = float(baseline_burden.composite_pbi_score)
        baseline_stats = _compute_demographic_counts(filters)
        baseline_count = baseline_stats["total"]
        baseline_retention = _compute_end_retention(
            enrolled=max(1, baseline_count),
            pbi_score=baseline_pbi,
            duration_weeks=duration_weeks,
            peak_weeks=list(baseline_burden.peak_burden_weeks or []),
        )

        # ── 1. Renal Function (eGFR) Calibration ──────────────────────────────
        current_egfr = filters.get("min_egfr", 60.0)
        if current_egfr >= 55.0:
            test_filters = copy.deepcopy(filters)
            test_filters["min_egfr"] = 50.0
            rel_stats = _compute_demographic_counts(test_filters)
            relaxed_count = rel_stats["total"]
            lift_count = max(0, relaxed_count - baseline_count)
            lift_pct = round((lift_count / max(1, baseline_count)) * 100.0, 1)
            est_months = round(study_months * (lift_count / max(1, relaxed_count)) * 0.5, 1) if lift_count > 0 else 0.0

            proposals.append(
                ProtocolAmendmentProposal(
                    amendment_id="AMD-01",
                    category="RENAL_FUNCTION",
                    title="KDIGO Renal Clearance Threshold Calibration (eGFR 60 → 50 mL/min)",
                    target_section="Section 4.2.1 — Renal Function Eligibility Criteria",
                    current_clause=f"Adequate renal function defined as serum creatinine <= 1.5 x ULN or eGFR >= {int(current_egfr)} mL/min/1.73m².",
                    proposed_clause="Adequate renal function defined as eGFR >= 50 mL/min/1.73m² (CKD Stage 3a eligible) with mandatory serum creatinine & electrolyte monitoring on C1D1, C2D1, and C3D1.",
                    clinical_evidence_rationale=(
                        f"Counterfactual SQL slicing across the loaded cohort shows lowering eGFR from {int(current_egfr)} to 50 mL/min "
                        f"recovers +{lift_count} eligible candidates (+{lift_pct}% relative expansion). Consistent with ASCO / Friends of Cancer Research "
                        "consensus when investigative drugs are not primarily renally cleared."
                    ),
                    regulatory_precedent="FDA Guidance for Industry: Cancer Clinical Trial Eligibility Criteria: Renal Function (Dec 2020) advises setting creatinine clearance cutoffs to >= 50 mL/min for non-renally excreted agents.",
                    candidate_yield_lift=lift_count,
                    yield_lift_percentage=lift_pct,
                    pbi_reduction_points=0.0,
                    estimated_accrual_acceleration_months=est_months,
                    projected_sponsor_cost_savings_usd=0.0,
                    health_equity_diversity_impact=_format_demographic_impact(
                        baseline_stats, rel_stats, f"eGFR {int(current_egfr)} → 50 mL/min"
                    ),
                    safety_guardrail_conditions=[
                        "Assess serum creatinine and spot urine protein:creatinine ratio on Day 1 of Cycles 1-3",
                        "Withhold study drug if eGFR drops > 25% from baseline until recovery to >= 45 mL/min",
                        "Permit pre-dose hydration for subjects with borderline creatinine clearance (50-55 mL/min)",
                    ],
                    filter_mutations={"min_egfr": 50.0},
                    is_recommended=lift_count > 0,
                )
            )

        # ── 2. Mandatory On-Treatment Core Tumor Re-Biopsy ────────────────────
        on_treatment_biopsy_visit = None
        for v in protocol.visits:
            if v.week_number > 0 and any(
                "biopsy" in p.name.lower() and "bone" not in p.name.lower() for p in v.procedures
            ):
                on_treatment_biopsy_visit = v
                break

        if on_treatment_biopsy_visit:
            v_name = on_treatment_biopsy_visit.visit_name
            w_num = on_treatment_biopsy_visit.week_number

            sim_visits = copy.deepcopy(protocol.visits)
            for sv in sim_visits:
                if sv.week_number == w_num:
                    sv.procedures = [
                        p
                        for p in sv.procedures
                        if "biopsy" not in p.name.lower() or "bone marrow" in p.name.lower()
                    ]
            new_burden = burden_engine.calculate_protocol_burden(sim_visits, study_duration_weeks=duration_weeks)
            pbi_drop = round(max(0.0, baseline_pbi - float(new_burden.composite_pbi_score)), 1)
            new_retention = _compute_end_retention(
                enrolled=max(1, baseline_count),
                pbi_score=float(new_burden.composite_pbi_score),
                duration_weeks=duration_weeks,
                peak_weeks=list(new_burden.peak_burden_weeks or []),
            )
            ret_gain = round(max(0.0, new_retention - baseline_retention), 1)
            est_months = round(study_months * (ret_gain / 100.0) * 0.5, 1) if ret_gain > 0 else 0.0

            proposals.append(
                ProtocolAmendmentProposal(
                    amendment_id="AMD-02",
                    category="RE_BIOPSY",
                    title=f"Decentralize Week {w_num} Mandatory Tumor Re-Biopsy to Circulating Tumor DNA (ctDNA)",
                    target_section=f"Section 4.3 & Schedule of Assessments (Week {w_num} / {v_name})",
                    current_clause=f"At Week {w_num}, subject must consent to mandatory core needle tumor re-biopsy concurrent with radiographic restaging.",
                    proposed_clause=f"At Week {w_num}, mandatory core needle biopsy is replaced by serial circulating tumor DNA (ctDNA) liquid biopsy plasma collection (2 x 10 mL Streck tubes). Core needle re-biopsy is converted to optional exploratory translational sub-study.",
                    clinical_evidence_rationale=(
                        f"Re-scoring the Schedule of Assessments via BurdenScoringEngine lowers composite PBI by -{pbi_drop} points "
                        f"({baseline_pbi} → {new_burden.composite_pbi_score}) and increases modeled Week {duration_weeks} retention by +{ret_gain} percentage points "
                        f"({baseline_retention}% → {new_retention}%)."
                    ),
                    regulatory_precedent="FDA Modernization Act 2.0 & Biomarker Qualification Program recognizes ctDNA kinetics as pharmacodynamic biomarkers where tissue re-biopsy is not essential for safety.",
                    candidate_yield_lift=0,
                    yield_lift_percentage=0.0,
                    pbi_reduction_points=pbi_drop,
                    estimated_accrual_acceleration_months=est_months,
                    projected_sponsor_cost_savings_usd=0.0,
                    health_equity_diversity_impact=(
                        f"Removes interventional radiology facility dependency on Week {w_num} (modeled Week {duration_weeks} retention {baseline_retention}% → {new_retention}%; "
                        f"current cohort contains {baseline_stats['rural']:,} eligible rural candidates)."
                    ),
                    safety_guardrail_conditions=[
                        "Collect 2 x 10 mL Streck Cell-Free DNA BCT tubes during routine safety lab phlebotomy",
                        "Archive FFPE blocks from initial diagnostic biopsy for baseline comparison",
                        "Core needle biopsy remains voluntary with separate informed consent addendum",
                    ],
                    procedure_modifications={
                        "target_week": w_num,
                        "remove_procedure_key": "tumor_biopsy",
                        "add_procedure_key": "pro_survey",
                    },
                    is_recommended=pbi_drop > 0,
                )
            )

        # ── 3. Stable Treated Central Nervous System (CNS) Metastases ────────
        allow_brain_mets = filters.get("allow_stable_brain_mets", True)
        has_cns_exclusion = any(
            "cns" in crit.lower() or "brain" in crit.lower()
            for crit in protocol.eligibility.exclusion_criteria
        )

        if not allow_brain_mets or has_cns_exclusion:
            test_filters = copy.deepcopy(filters)
            test_filters["allow_stable_brain_mets"] = True
            rel_stats = _compute_demographic_counts(test_filters)
            relaxed_count = rel_stats["total"]
            lift_count = max(0, relaxed_count - baseline_count)
            lift_pct = round((lift_count / max(1, baseline_count)) * 100.0, 1)
            est_months = round(study_months * (lift_count / max(1, relaxed_count)) * 0.5, 1) if lift_count > 0 else 0.0

            proposals.append(
                ProtocolAmendmentProposal(
                    amendment_id="AMD-03",
                    category="STABLE_CNS",
                    title="Permit Treated & Asymptomatic Brain Metastases",
                    target_section="Section 4.2.2 — Central Nervous System (CNS) Exclusion Criteria",
                    current_clause="Exclusion: Known or suspected central nervous system metastases or leptomeningeal disease, regardless of prior treatment status.",
                    proposed_clause="Exclusion: Untreated or symptomatic CNS metastases. Subjects with treated, radiographically stable brain metastases (no progression >= 4 weeks post-SRS/RT, off anticonvulsants, steroid <= 10 mg prednisone daily for >= 14 days) are eligible.",
                    clinical_evidence_rationale=(
                        f"Dynamic SQL comparison shows permitting stable treated CNS lesions adjusts eligible cohort by +{lift_count} candidates (+{lift_pct}%). "
                        "Modern stereotactic radiosurgery enables neurological stability while keeping untreated/active CNS involvement excluded."
                    ),
                    regulatory_precedent="FDA Guidance: Cancer Clinical Trial Eligibility Criteria: Brain Metastases (Jul 2020) urges sponsors to include patients with treated and neurologically stable brain metastases.",
                    candidate_yield_lift=lift_count,
                    yield_lift_percentage=lift_pct,
                    pbi_reduction_points=0.0,
                    estimated_accrual_acceleration_months=est_months,
                    projected_sponsor_cost_savings_usd=0.0,
                    health_equity_diversity_impact=_format_demographic_impact(
                        baseline_stats, rel_stats, "allow_stable_brain_mets=True"
                    ),
                    safety_guardrail_conditions=[
                        "Baseline contrast-enhanced Brain MRI within 28 days prior to Cycle 1 Day 1",
                        "Repeat brain imaging every 12 weeks concurrent with RECIST v1.1 systemic disease assessment",
                        "Maintenance of systemic corticosteroid dose <= 10 mg prednisone equivalent daily",
                    ],
                    filter_mutations={"allow_stable_brain_mets": True, "exclude_active_brain_mets": True},
                    is_recommended=True,
                )
            )

        # ── 4. Dense PK Phlebotomy Decentralization ──────────────────────────
        dense_pk_visit = None
        for v in protocol.visits:
            if any(
                "dense" in p.name.lower() or "serial" in p.name.lower() or p.estimated_duration_minutes >= 300
                for p in v.procedures
            ):
                dense_pk_visit = v
                break

        if dense_pk_visit:
            v_name = dense_pk_visit.visit_name
            sim_visits = copy.deepcopy(protocol.visits)
            for sv in sim_visits:
                for p in sv.procedures:
                    if (
                        "dense" in p.name.lower()
                        or "serial" in p.name.lower()
                        or p.estimated_duration_minutes >= 300
                    ):
                        p.estimated_duration_minutes = 60
                        p.name = "Baseline Clinic Infusion + Decentralized In-Home Serial PK"

            new_burden = burden_engine.calculate_protocol_burden(sim_visits, study_duration_weeks=duration_weeks)
            pbi_drop = round(max(0.0, baseline_pbi - float(new_burden.composite_pbi_score)), 1)
            new_retention = _compute_end_retention(
                enrolled=max(1, baseline_count),
                pbi_score=float(new_burden.composite_pbi_score),
                duration_weeks=duration_weeks,
                peak_weeks=list(new_burden.peak_burden_weeks or []),
            )
            ret_gain = round(max(0.0, new_retention - baseline_retention), 1)
            est_months = round(study_months * (ret_gain / 100.0) * 0.5, 1) if ret_gain > 0 else 0.0

            proposals.append(
                ProtocolAmendmentProposal(
                    amendment_id="AMD-04",
                    category="TELEHEALTH_PK",
                    title="Decentralized Mobile Nursing for Dense Pharmacokinetic Sampling",
                    target_section=f"Schedule of Assessments ({v_name})",
                    current_clause=f"Subject must remain at clinical site for 6-8 continuous hours during {v_name} to complete serial PK draws.",
                    proposed_clause=f"{v_name} on-site dwell is capped at baseline infusion + immediate PK (60 min PK dwell). Later serial timepoints (4, 6, 8, 24 hours) are collected via certified mobile research nurse.",
                    clinical_evidence_rationale=(
                        f"Shortening protracted PK clinic dwell to 60 minutes drops computed PBI by -{pbi_drop} points "
                        f"({baseline_pbi} → {new_burden.composite_pbi_score}) and raises modeled Week {duration_weeks} retention by +{ret_gain} percentage points."
                    ),
                    regulatory_precedent="FDA Guidance: Decentralized Clinical Trials for Drugs, Biological Products, and Devices (Sep 2024) supports qualified home phlebotomy.",
                    candidate_yield_lift=0,
                    yield_lift_percentage=0.0,
                    pbi_reduction_points=pbi_drop,
                    estimated_accrual_acceleration_months=est_months,
                    projected_sponsor_cost_savings_usd=0.0,
                    health_equity_diversity_impact=(
                        f"Reduces full-day travel barriers for hourly workers & rural participants "
                        f"({baseline_stats['rural']:,} eligible rural candidates in cohort; modeled retention {baseline_retention}% → {new_retention}%)."
                    ),
                    safety_guardrail_conditions=[
                        "Mobile phlebotomists trained on study-specific centrifuge and cold-chain logistics",
                        "Electronic visit documentation with immediate sample temperature tracking logs",
                        "Emergency clinic contact line accessible 24/7 during home observation",
                    ],
                    is_recommended=pbi_drop > 0,
                )
            )

        return proposals

    def apply_amendment_to_protocol(
        self, protocol: ClinicalTrialProtocol, amendment_id: str
    ) -> ClinicalTrialProtocol:
        """
        Applies the selected amendment directly to the protocol, mutating clauses,
        structured filters, Schedule of Assessments, and recalculating Tufts PBI.
        """
        proposals = self.generate_amendments(protocol)
        target = next((p for p in proposals if p.amendment_id == amendment_id), None)
        if not target:
            raise ValueError(
                f"Amendment '{amendment_id}' is not applicable or does not exist for protocol '{protocol.protocol_id}'."
            )

        updated_protocol = copy.deepcopy(protocol)

        if target.filter_mutations:
            for k, v in target.filter_mutations.items():
                updated_protocol.eligibility.structured_filters[k] = v

        if target.category == "RENAL_FUNCTION":
            new_inclusions = []
            for inc in updated_protocol.eligibility.inclusion_criteria:
                if "renal" in inc.lower() or "egfr" in inc.lower() or "creatinine" in inc.lower():
                    new_inclusions.append(target.proposed_clause)
                else:
                    new_inclusions.append(inc)
            updated_protocol.eligibility.inclusion_criteria = new_inclusions

        elif target.category == "STABLE_CNS":
            new_exclusions = []
            for exc in updated_protocol.eligibility.exclusion_criteria:
                if "cns" in exc.lower() or "brain" in exc.lower():
                    new_exclusions.append(target.proposed_clause)
                else:
                    new_exclusions.append(exc)
            updated_protocol.eligibility.exclusion_criteria = new_exclusions

        elif target.category == "RE_BIOPSY":
            if target.procedure_modifications:
                target_wk = target.procedure_modifications.get("target_week")
                for v in updated_protocol.visits:
                    if v.week_number == target_wk:
                        v.procedures = [
                            p
                            for p in v.procedures
                            if "biopsy" not in p.name.lower() or "bone marrow" in p.name.lower()
                        ]

        elif target.category == "TELEHEALTH_PK":
            for v in updated_protocol.visits:
                for p in v.procedures:
                    if (
                        "dense" in p.name.lower()
                        or "serial" in p.name.lower()
                        or p.estimated_duration_minutes >= 300
                    ):
                        p.estimated_duration_minutes = 60
                        p.name = "Baseline Clinic Infusion + Decentralized In-Home Serial PK"

        updated_burden = burden_engine.calculate_protocol_burden(
            updated_protocol.visits,
            updated_protocol.study_duration_weeks,
        )
        updated_protocol.burden = updated_burden

        return updated_protocol


protocol_optimizer = ProtocolOptimizationAdvisor()
