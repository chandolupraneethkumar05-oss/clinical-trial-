"""
ProtocolShield Public Live Overview Aggregator
Computes strictly non-PII, live DuckDB & mathematical scoring telemetry for the landing page.
Zero hardcoded clinical yields, PBI scores, retention numbers, or currency claims.
"""
import copy
import time
from typing import Any, Dict, List

from app.api.routes_protocol import (
    MAX_PDF_UPLOAD_BYTES,
    SAMPLE_PROTOCOL_MAP,
    get_protocol_template_summaries,
)
from app.db.duckdb_client import db_client
from app.engine.burden_scorer import burden_engine
from app.engine.cohort_simulator import cohort_engine
from app.engine.eligibility import normalize_filter_criteria
from app.engine.optimizer_engine import protocol_optimizer


def _instantiate_sample_protocol(key: str):
    factory_or_proto = SAMPLE_PROTOCOL_MAP[key]
    return factory_or_proto() if callable(factory_or_proto) else copy.deepcopy(factory_or_proto)


def _sample_retention_points(curve: List[Dict[str, Any]], duration_weeks: int) -> List[Dict[str, Any]]:
    if not curve:
        return []
    by_week = {int(pt["week"]): float(pt["retained_percentage"]) for pt in curve}
    target_weeks = sorted(
        {w for w in (0, 4, 8, 12, 16, 24, 36, 48, duration_weeks) if 0 <= w <= duration_weeks and w in by_week}
    )
    if not target_weeks:
        target_weeks = sorted(by_week.keys())[:9]
    return [{"week": w, "retained": round(by_week[w], 1)} for w in target_weeks]


def compute_public_overview() -> Dict[str, Any]:
    """Computes live DuckDB cohort aggregates, modeled retention scenarios, and template summaries."""
    t0 = time.perf_counter()
    with db_client.get_connection() as conn:
        patient_row = conn.execute(
            """
            SELECT
                COUNT(*),
                COALESCE(ROUND(AVG(age), 1), 0.0) AS avg_age,
                COALESCE(ROUND(AVG(egfr_ml_min), 1), 0.0) AS avg_egfr,
                COALESCE(ROUND(AVG(distance_to_center_miles), 1), 0.0) AS avg_dist
            FROM patients
            """
        ).fetchone()
        sql_query_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        total_patients = int(patient_row[0]) if patient_row else 0
        avg_age = float(patient_row[1]) if patient_row else 0.0
        avg_egfr = float(patient_row[2]) if patient_row else 0.0
        avg_distance = float(patient_row[3]) if patient_row else 0.0

        try:
            audit_row = conn.execute("SELECT COUNT(*) FROM audit_logs").fetchone()
            audit_events_count = int(audit_row[0]) if audit_row else 0
        except Exception:
            audit_events_count = 0

        try:
            proto_row = conn.execute("SELECT COUNT(*) FROM uploaded_protocols").fetchone()
            uploaded_protocols_count = int(proto_row[0]) if proto_row else 0
        except Exception:
            uploaded_protocols_count = 0

    # ── Baseline Reference Protocol: NSCLC Template ─────────────────────────
    nsclc = _instantiate_sample_protocol("nsclc")
    duration_weeks = max(4, int(nsclc.study_duration_weeks or 52))
    base_criteria = normalize_filter_criteria(nsclc.eligibility.structured_filters)
    base_burden = nsclc.burden or burden_engine.calculate_protocol_burden(
        nsclc.visits, study_duration_weeks=duration_weeks
    )
    base_funnel = cohort_engine.simulate_eligibility_funnel(base_criteria)
    base_eligible = int(base_funnel["final_eligible_count"])
    base_curve = cohort_engine.simulate_longitudinal_retention(
        enrolled_cohort_size=max(1, base_eligible),
        composite_pbi=float(base_burden.composite_pbi_score),
        study_duration_weeks=duration_weeks,
        peak_burden_weeks=list(base_burden.peak_burden_weeks or []),
    )
    base_ret_end = round(float(base_curve[-1]["retained_percentage"]), 1) if base_curve else 0.0

    # Compute real clause impact diagnostics for Interactive Document Clause Inspector
    relaxed_egfr_val = max(30.0, round(float(base_criteria.min_egfr) - 10.0, 1))
    egfr_funnel = cohort_engine.simulate_eligibility_funnel(
        base_criteria.model_copy(update={"min_egfr": relaxed_egfr_val})
    )
    egfr_gain = max(0, int(egfr_funnel["final_eligible_count"]) - base_eligible)

    relaxed_ecog_val = min(4, int(base_criteria.max_ecog) + 1)
    ecog_funnel = cohort_engine.simulate_eligibility_funnel(
        base_criteria.model_copy(update={"max_ecog": relaxed_ecog_val})
    )
    ecog_gain = max(0, int(ecog_funnel["final_eligible_count"]) - base_eligible)

    # Scenario B: Relaxed eGFR + Decentralized Visits & Optional On-Treatment Biopsy
    decentralized_visits = copy.deepcopy(nsclc.visits)
    converted_count = 0
    for v in decentralized_visits:
        has_biopsy = any("biopsy" in p.name.lower() and "bone" not in p.name.lower() for p in v.procedures)
        if v.week_number > 0 and has_biopsy:
            v.procedures = [
                p for p in v.procedures if "biopsy" not in p.name.lower() or "bone" in p.name.lower()
            ]
        for p in v.procedures:
            if "dense" in p.name.lower() or "serial" in p.name.lower() or p.estimated_duration_minutes >= 300:
                p.estimated_duration_minutes = 60
                p.invasiveness_weight = min(p.invasiveness_weight, 3.0)
                p.fasting_required = False
                converted_count += 1
        has_infusion_or_scan = any(
            any(k in p.name.lower() for k in ("infusion", "ct", "mri", "biopsy"))
            for p in v.procedures
        )
        if v.week_number > 0 and not has_infusion_or_scan and converted_count < 4:
            for p in v.procedures:
                p.fasting_required = False
                p.estimated_duration_minutes = max(10, p.estimated_duration_minutes // 2)
            converted_count += 1

    scen_b_burden = burden_engine.calculate_protocol_burden(
        decentralized_visits,
        study_duration_weeks=duration_weeks,
        estimated_round_trip_minutes=50,
    )
    scen_a_curve = cohort_engine.simulate_longitudinal_retention(
        enrolled_cohort_size=max(1, int(egfr_funnel["final_eligible_count"])),
        composite_pbi=float(base_burden.composite_pbi_score),
        study_duration_weeks=duration_weeks,
        peak_burden_weeks=list(base_burden.peak_burden_weeks or []),
    )
    scen_a_ret_end = round(float(scen_a_curve[-1]["retained_percentage"]), 1) if scen_a_curve else 0.0

    scen_b_curve = cohort_engine.simulate_longitudinal_retention(
        enrolled_cohort_size=max(1, int(egfr_funnel["final_eligible_count"])),
        composite_pbi=float(scen_b_burden.composite_pbi_score),
        study_duration_weeks=duration_weeks,
        peak_burden_weeks=list(scen_b_burden.peak_burden_weeks or []),
    )
    scen_b_ret_end = round(float(scen_b_curve[-1]["retained_percentage"]), 1) if scen_b_curve else 0.0

    hours_saved_b = round(max(0.0, float(base_burden.total_clinic_hours) - float(scen_b_burden.total_clinic_hours)), 1)
    pbi_drop_b = round(max(0.0, float(base_burden.composite_pbi_score) - float(scen_b_burden.composite_pbi_score)), 1)

    visit_previews = [
        {
            "visit_name": v.visit_name,
            "week_number": int(v.week_number),
            "hours": round(float(v.total_clinic_minutes) / 60.0, 1),
        }
        for v in nsclc.visits[:3]
    ]
    if base_burden.peak_burden_weeks:
        pk_week = int(base_burden.peak_burden_weeks[0])
        pk_visit = next((v for v in nsclc.visits if v.week_number == pk_week), None)
    else:
        pk_visit = None

    # ── Live Template Case Studies (NSCLC, TNBC, Myeloma) ───────────────────
    study_meta = [
        ("nsclc", "nsclc", "EGFR / Anti-PD-1 Paradigm"),
        ("tnbc", "breast", "ADC + Immunotherapy Neoadjuvant Paradigm"),
        ("myeloma", "myeloma", "BCMA Bispecific Antibody Paradigm"),
    ]
    case_studies: Dict[str, Any] = {}
    for proto_key, ui_key, target_desc in study_meta:
        proto = _instantiate_sample_protocol(proto_key)
        p_weeks = max(4, int(proto.study_duration_weeks or 52))
        p_crit = normalize_filter_criteria(proto.eligibility.structured_filters)
        p_burden = proto.burden or burden_engine.calculate_protocol_burden(
            proto.visits, study_duration_weeks=p_weeks
        )
        p_funnel = cohort_engine.simulate_eligibility_funnel(p_crit)
        p_proposals = protocol_optimizer.generate_amendments(proto)
        top_lift = max((int(a.candidate_yield_lift) for a in p_proposals), default=0)
        top_pbi_drop = max((float(a.pbi_reduction_points) for a in p_proposals), default=0.0)
        p_base_score = round(float(p_burden.composite_pbi_score), 1)
        p_after_score = round(max(0.0, p_base_score - top_pbi_drop), 1)

        if top_lift > 0 and top_pbi_drop > 0:
            result_summary = (
                f"Optimizer identifies +{top_lift:,} recoverable candidates from eligibility calibration "
                f"and lowers composite PBI by -{round(top_pbi_drop, 1)} pts ({p_base_score} → {p_after_score}) via schedule decentralization."
            )
        elif top_lift > 0:
            result_summary = (
                f"Optimizer identifies +{top_lift:,} recoverable candidates from eligibility calibration "
                f"against the {total_patients:,}-patient DuckDB cohort (baseline PBI {p_base_score}/100)."
            )
        elif top_pbi_drop > 0:
            result_summary = (
                f"Baseline eligibility gates are already calibrated; schedule decentralization reduces "
                f"composite PBI by -{round(top_pbi_drop, 1)} pts ({p_base_score} → {p_after_score})."
            )
        else:
            result_summary = (
                f"Deterministic burden and cohort evaluation completed across {int(p_burden.total_study_visits)} scheduled visits."
            )

        third_or_second_metric = (
            {
                "label": "Recoverable Candidates",
                "value": f"+{top_lift:,}",
            }
            if top_lift > 0
            else {
                "label": "Total Clinic Dwell",
                "value": f"{round(float(p_burden.total_clinic_hours), 1)} hrs",
            }
        )

        case_studies[ui_key] = {
            "key": ui_key,
            "protocol_key": proto_key,
            "protocol_id": proto.protocol_id,
            "title": proto.title,
            "sponsor": f"{proto.phase} Synthetic Protocol Reference",
            "target": f"{proto.indication} ({target_desc})",
            "challenge": (
                f"Screen failure rate of {round(float(p_funnel['screen_failure_rate']), 1)}% leaves "
                f"{int(p_funnel['final_eligible_count']):,} of {total_patients:,} cohort patients eligible, "
                f"with {int(p_burden.total_study_visits)} visits totaling {round(float(p_burden.total_clinic_hours), 1)} clinic hours "
                f"(PBI {p_base_score}/100)."
            ),
            "result": result_summary,
            "metrics": [
                {
                    "label": "Eligible Cohort Yield",
                    "value": f"{int(p_funnel['final_eligible_count']):,} ({round(float(p_funnel['overall_yield_percentage']), 1)}%)",
                },
                third_or_second_metric,
                {
                    "label": "Composite PBI Score",
                    "value": f"{p_base_score} → {p_after_score}" if top_pbi_drop > 0 else f"{p_base_score} / 100",
                },
            ],
        }

    measured_query_ms = sql_query_ms
    on_treatment_biopsy_week = next(
        (
            int(v.week_number)
            for v in nsclc.visits
            if v.week_number > 0
            and any("biopsy" in p.name.lower() and "bone" not in p.name.lower() for p in v.procedures)
        ),
        int(base_burden.peak_burden_weeks[-1]) if base_burden.peak_burden_weeks else 12,
    )

    return {
        "is_synthetic_cohort": True,
        "cohort_patient_count": total_patients,
        "audit_events_count": audit_events_count,
        "uploaded_protocols_count": uploaded_protocols_count,
        "measured_query_ms": measured_query_ms,
        "max_pdf_upload_mb": MAX_PDF_UPLOAD_BYTES // (1024 * 1024),
        "template_summaries": get_protocol_template_summaries(),
        "cohort_averages": {
            "age": avg_age,
            "egfr": avg_egfr,
            "distance_miles": avg_distance,
        },
        "baseline_nsclc": {
            "protocol_id": nsclc.protocol_id,
            "title": nsclc.title,
            "study_duration_weeks": duration_weeks,
            "total_visits": int(base_burden.total_study_visits),
            "total_clinic_hours": round(float(base_burden.total_clinic_hours), 1),
            "avg_visit_hours": round(
                float(base_burden.total_clinic_hours) / max(1, int(base_burden.total_study_visits)), 1
            ),
            "total_biopsies": int(base_burden.total_biopsies),
            "composite_pbi_score": round(float(base_burden.composite_pbi_score), 1),
            "attrition_risk_tier": base_burden.attrition_risk_tier,
            "peak_burden_weeks": list(base_burden.peak_burden_weeks or []),
            "peak_visit_hours": round(float(pk_visit.total_clinic_minutes) / 60.0, 1) if pk_visit else None,
            "total_population": int(base_funnel["total_population"]),
            "eligible_count": base_eligible,
            "overall_yield_percentage": round(float(base_funnel["overall_yield_percentage"]), 2),
            "screen_failure_rate": round(float(base_funnel["screen_failure_rate"]), 1),
            "funnel_stages": base_funnel["funnel_stages"],
            "sensitivity_opportunities": base_funnel["sensitivity_opportunities"],
            "end_retention_pct": base_ret_end,
            "visit_previews": visit_previews,
            "clause_diagnostics": {
                "egfr": {
                    "threshold": f"eGFR < {int(base_criteria.min_egfr)} mL/min",
                    "min_egfr": round(float(base_criteria.min_egfr), 1),
                    "relaxed_egfr": round(float(relaxed_egfr_val), 1),
                    "recoverable_candidates": egfr_gain,
                    "relaxed_eligible_count": int(egfr_funnel["final_eligible_count"]),
                },
                "ecog": {
                    "threshold": f"ECOG > {int(base_criteria.max_ecog)}",
                    "recoverable_candidates": ecog_gain,
                    "relaxed_eligible_count": int(ecog_funnel["final_eligible_count"]),
                },
                "biopsy": {
                    "peak_week": on_treatment_biopsy_week,
                    "pbi_reduction_if_optional": pbi_drop_b,
                    "hours_saved_if_hybrid": hours_saved_b,
                },
            },
        },
        "simulation_scenarios": {
            "baseline": {
                "name": f"{nsclc.phase} Baseline Protocol",
                "color": "#e05a47",
                "retentionAt52": base_ret_end,
                "patientsGained": 0,
                "eligibleCount": base_eligible,
                "compositePbi": round(float(base_burden.composite_pbi_score), 1),
                "description": (
                    f"eGFR >= {int(base_criteria.min_egfr)} mL/min, {int(base_burden.total_study_visits)} site visits "
                    f"({round(float(base_burden.total_clinic_hours), 1)}h), and {int(base_burden.total_biopsies)} biopsies."
                ),
                "data": _sample_retention_points(base_curve, duration_weeks),
            },
            "scenarioA": {
                "name": f"Scenario A: Relaxed eGFR ({int(relaxed_egfr_val)} mL/min)",
                "color": "#d97706",
                "retentionAt52": scen_a_ret_end,
                "patientsGained": egfr_gain,
                "eligibleCount": int(egfr_funnel["final_eligible_count"]),
                "compositePbi": round(float(base_burden.composite_pbi_score), 1),
                "description": (
                    f"Broadens renal gate from {int(base_criteria.min_egfr)} to {int(relaxed_egfr_val)} mL/min, "
                    f"expanding qualified cohort candidates by +{egfr_gain:,} against DuckDB."
                ),
                "data": _sample_retention_points(scen_a_curve, duration_weeks),
            },
            "scenarioB": {
                "name": "Scenario B: Decentralized Visits & Optional Biopsy",
                "color": "#2d6a4f",
                "retentionAt52": scen_b_ret_end,
                "patientsGained": egfr_gain,
                "eligibleCount": int(egfr_funnel["final_eligible_count"]),
                "compositePbi": round(float(scen_b_burden.composite_pbi_score), 1),
                "hoursReduced": hours_saved_b,
                "pbiDelta": pbi_drop_b,
                "description": (
                    f"Converts {converted_count} follow-up visits to telehealth and makes on-treatment biopsy optional, "
                    f"cutting {hours_saved_b}h clinic dwell and lowering PBI by -{pbi_drop_b} pts."
                ),
                "data": _sample_retention_points(scen_b_curve, duration_weeks),
            },
        },
        "case_studies": case_studies,
    }
