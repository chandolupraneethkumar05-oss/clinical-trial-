"""
ProtocolShield Shared Clinical Eligibility & Provenance Rules Engine
Single source of truth shared between individual patient screening and vectorized cohort simulation.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from app.models.patient import CohortFilterCriteria

# Canonical clinical data provenance classifications
PROVENANCE_PATIENT_REPORTED = "patient_reported"
PROVENANCE_INVESTIGATOR_VERIFIED = "investigator_verified"
PROVENANCE_SYNTHETIC_DEMO = "synthetic_demo"
PROVENANCE_UNKNOWN = "unknown"

VALID_PROVENANCES = {
    PROVENANCE_PATIENT_REPORTED,
    PROVENANCE_INVESTIGATOR_VERIFIED,
    PROVENANCE_SYNTHETIC_DEMO,
    PROVENANCE_UNKNOWN,
}


def resolve_patient_provenance(
    user_role: str,
    requested_provenance: Optional[str] = None,
    is_demo_profile: Optional[bool] = None,
    investigator_verified: Optional[bool] = None,
) -> str:
    """
    Establishes clinical data provenance strictly on the server based on
    authenticated role and explicit authorized workflow flags.

    Security invariants:
    - Patients can NEVER mark their own data as investigator-verified.
    - Frontend-supplied 'verified_clinical' / 'investigator_verified' strings are ignored for patients.
    - Synthetic demonstration profiles remain explicitly tagged as 'synthetic_demo'.
    """
    role = (user_role or "").lower().strip()
    req = (requested_provenance or "").lower().strip()

    if is_demo_profile is True or req == PROVENANCE_SYNTHETIC_DEMO:
        return PROVENANCE_SYNTHETIC_DEMO

    if role in {"doctor", "admin"}:
        if investigator_verified is True:
            return PROVENANCE_INVESTIGATOR_VERIFIED
        if req in {PROVENANCE_PATIENT_REPORTED, PROVENANCE_UNKNOWN}:
            return req
        if req in {PROVENANCE_INVESTIGATOR_VERIFIED, "verified_clinical"}:
            # Doctors/admins using explicit authorized clinical submission workflow
            return PROVENANCE_INVESTIGATOR_VERIFIED
        return PROVENANCE_UNKNOWN

    # Patient role: always patient_reported (or unknown if explicitly unknown);
    # NEVER trusted to assert investigator_verified or verified_clinical.
    if req == PROVENANCE_UNKNOWN:
        return PROVENANCE_UNKNOWN
    return PROVENANCE_PATIENT_REPORTED


def stage_matches(patient_stage: str, allowed_stage: str) -> bool:
    """
    Token-aware oncology stage comparison preventing substring false positives
    (e.g. 'Stage II' does NOT match 'Stage IIIB', while 'Stage IV' matches 'Stage IV (Oligometastatic)').
    """
    p_norm = patient_stage.strip().lower()
    a_norm = allowed_stage.strip().lower()
    if not p_norm or not a_norm:
        return False
    if p_norm == a_norm:
        return True
    if a_norm.startswith(p_norm + " ") or a_norm.startswith(p_norm + "("):
        return True
    if p_norm.startswith(a_norm + " ") or p_norm.startswith(a_norm + "("):
        return True
    return False


def compute_max_alt_u_l(criteria: CohortFilterCriteria) -> tuple[float, str]:
    """Returns (max_alt_u_l, human_readable_threshold_description) identically for both engines."""
    if criteria.max_alt_u_l is not None:
        max_alt = float(criteria.max_alt_u_l)
        return max_alt, f"<= {max_alt:.0f} U/L"
    alt_uln = float(criteria.alt_uln_reference)
    max_alt_mult = float(criteria.max_alt_multiplier)
    max_alt = max_alt_mult * alt_uln
    return max_alt, f"<= {max_alt:.0f} U/L ({max_alt_mult}x ULN [ref {alt_uln} U/L])"


def normalize_filter_criteria(structured_filters: Optional[dict[str, Any]]) -> CohortFilterCriteria:
    """
    Normalizes protocol structured_filters dictionary into a validated CohortFilterCriteria instance
    using the exact same defaults across cohort simulation and individual patient screening.
    """
    raw = structured_filters or {}
    clean: dict[str, Any] = {}
    for field_name in CohortFilterCriteria.model_fields:
        if field_name in raw and raw[field_name] is not None:
            clean[field_name] = raw[field_name]
        elif field_name == "allowed_stages" and field_name in raw and raw[field_name] == []:
            clean["allowed_stages"] = []
    return CohortFilterCriteria(**clean)


@dataclass
class CriterionEvaluation:
    criterion: str
    category: str
    status: str  # "PASS" | "FAIL" | "UNKNOWN" | "NEEDS_INVESTIGATOR_REVIEW"
    passed: bool
    patient_value: str
    required_threshold: str
    impact_note: str
    is_hard_rule: bool = False
    is_mandatory: bool = True
    hard_failure_reason: Optional[str] = None


def evaluate_cns_eligibility(
    has_active_brain_mets: Optional[bool],
    has_stable_brain_mets: Optional[bool],
    exclude_active_brain_mets: bool = True,
    allow_stable_brain_mets: bool = True,
) -> CriterionEvaluation:
    """
    Deterministic protocol-driven CNS metastases evaluation.

    Rules:
    - Active brain metastases are evaluated against exclude_active_brain_mets (hard exclusion when True).
    - Stable treated brain metastases are evaluated against allow_stable_brain_mets.
    - Missing active or missing stable CNS information NEVER silently defaults to False;
      it yields NEEDS_INVESTIGATOR_REVIEW (unless another confirmed exclusion already fails).
    """
    if exclude_active_brain_mets and allow_stable_brain_mets:
        required_desc = "No Active CNS Mets (Stable Treated Permitted)"
    elif exclude_active_brain_mets and not allow_stable_brain_mets:
        required_desc = "No Active or Stable CNS Mets"
    elif not exclude_active_brain_mets and allow_stable_brain_mets:
        required_desc = "CNS Mets Permitted by Protocol"
    else:
        required_desc = "No Stable CNS Mets (Active Permitted by Protocol)"

    # 1. Active brain metastases present
    if has_active_brain_mets is True:
        if exclude_active_brain_mets:
            if has_stable_brain_mets is True:
                p_val = "Confirmed Positive: Active CNS Mets (with Prior Treated CNS History)"
            elif has_stable_brain_mets is False:
                p_val = "Confirmed Positive: Active CNS Mets"
            else:
                p_val = "Confirmed Positive: Active CNS Mets (Stable CNS Not Provided)"
            return CriterionEvaluation(
                criterion="Central Nervous System (CNS) Status",
                category="SAFETY_COMORBIDITY",
                status="FAIL",
                passed=False,
                patient_value=p_val,
                required_threshold=required_desc,
                impact_note=(
                    "HARD EXCLUSION: Untreated or active brain metastases exclude participation under protocol criteria. "
                    "This cannot be overridden by overall score."
                ),
                is_hard_rule=True,
                is_mandatory=True,
                hard_failure_reason="Active brain metastases (hard exclusion)",
            )
        # Protocol explicitly permits active brain metastases
        if has_stable_brain_mets is True and not allow_stable_brain_mets:
            return CriterionEvaluation(
                criterion="Central Nervous System (CNS) Status",
                category="SAFETY_COMORBIDITY",
                status="FAIL",
                passed=False,
                patient_value="Confirmed Positive: Active & Stable Treated CNS Mets",
                required_threshold=required_desc,
                impact_note="HARD EXCLUSION: Protocol excludes stable treated brain metastases.",
                is_hard_rule=True,
                is_mandatory=True,
                hard_failure_reason="Stable treated brain metastases excluded by protocol",
            )
        if has_stable_brain_mets is None and not allow_stable_brain_mets:
            return CriterionEvaluation(
                criterion="Central Nervous System (CNS) Status",
                category="SAFETY_COMORBIDITY",
                status="NEEDS_INVESTIGATOR_REVIEW",
                passed=False,
                patient_value="Active CNS Confirmed Positive; Stable CNS Unknown / Not Provided",
                required_threshold=required_desc,
                impact_note="Stable treated CNS history not provided; investigator review required.",
                is_hard_rule=True,
                is_mandatory=True,
            )
        return CriterionEvaluation(
            criterion="Central Nervous System (CNS) Status",
            category="SAFETY_COMORBIDITY",
            status="PASS",
            passed=True,
            patient_value="Confirmed Positive: Active CNS Mets (Permitted by Protocol)",
            required_threshold=required_desc,
            impact_note="Protocol explicitly allows active CNS metastases.",
            is_hard_rule=True,
            is_mandatory=True,
        )

    # 2. Active brain metastases missing (None)
    if has_active_brain_mets is None:
        if has_stable_brain_mets is True and not allow_stable_brain_mets:
            return CriterionEvaluation(
                criterion="Central Nervous System (CNS) Status",
                category="SAFETY_COMORBIDITY",
                status="FAIL",
                passed=False,
                patient_value="Confirmed Positive: Stable Treated CNS (Active CNS Unknown / Not Provided)",
                required_threshold=required_desc,
                impact_note=(
                    "HARD EXCLUSION: Protocol excludes all brain metastases including stable treated CNS lesions. "
                    "Active CNS status is also not documented."
                ),
                is_hard_rule=True,
                is_mandatory=True,
                hard_failure_reason="Stable treated brain metastases excluded by protocol",
            )
        if has_stable_brain_mets is True:
            p_val = "Stable Treated CNS Confirmed; Active CNS Unknown / Not Provided"
        elif has_stable_brain_mets is False:
            p_val = "Active CNS Unknown / Not Provided; Stable CNS Confirmed Negative"
        else:
            p_val = "Unknown / Not Provided (Investigator Verification Required)"
        return CriterionEvaluation(
            criterion="Central Nervous System (CNS) Status",
            category="SAFETY_COMORBIDITY",
            status="NEEDS_INVESTIGATOR_REVIEW",
            passed=False,
            patient_value=p_val,
            required_threshold=required_desc,
            impact_note="Active CNS metastatic status is not documented. Requires brain MRI/CT confirmation by investigator.",
            is_hard_rule=True,
            is_mandatory=True,
        )

    # 3. Active brain metastases explicitly confirmed negative (False)
    if has_stable_brain_mets is None:
        return CriterionEvaluation(
            criterion="Central Nervous System (CNS) Status",
            category="SAFETY_COMORBIDITY",
            status="NEEDS_INVESTIGATOR_REVIEW",
            passed=False,
            patient_value="Active CNS Confirmed Negative; Stable Treated CNS Unknown / Not Provided",
            required_threshold=required_desc,
            impact_note=(
                "Prior treated/stable CNS lesion history is not provided. "
                "Requires investigator verification of CNS imaging history."
            ),
            is_hard_rule=True,
            is_mandatory=True,
        )

    if has_stable_brain_mets is True:
        if allow_stable_brain_mets:
            return CriterionEvaluation(
                criterion="Central Nervous System (CNS) Status",
                category="SAFETY_COMORBIDITY",
                status="PASS",
                passed=True,
                patient_value="Confirmed Stable Treated CNS Mets (No Active CNS)",
                required_threshold=required_desc,
                impact_note="Stable treated brain metastases permitted under protocol guidelines.",
                is_hard_rule=True,
                is_mandatory=True,
            )
        return CriterionEvaluation(
            criterion="Central Nervous System (CNS) Status",
            category="SAFETY_COMORBIDITY",
            status="FAIL",
            passed=False,
            patient_value="Confirmed Stable Treated CNS Mets (No Active CNS)",
            required_threshold=required_desc,
            impact_note="HARD EXCLUSION: Protocol excludes brain metastases; candidate may be eligible under Amendment AMD-03.",
            is_hard_rule=True,
            is_mandatory=True,
            hard_failure_reason="Stable treated brain metastases excluded by protocol",
        )

    # 4. Explicitly confirmed negative for BOTH active and stable CNS metastases
    return CriterionEvaluation(
        criterion="Central Nervous System (CNS) Status",
        category="SAFETY_COMORBIDITY",
        status="PASS",
        passed=True,
        patient_value="Confirmed Negative (No Active or Stable CNS Mets)",
        required_threshold=required_desc,
        impact_note="Confirmed no central nervous system involvement.",
        is_hard_rule=True,
        is_mandatory=True,
    )


def evaluate_patient_against_criteria(
    patient: Any,
    criteria: CohortFilterCriteria,
) -> tuple[list[CriterionEvaluation], list[str], bool]:
    """
    Evaluates a patient profile (PatientScreeningInput, PatientCohortRecord, or compatible object)
    against normalized CohortFilterCriteria using deterministic 4-state logic.
    Returns: (evaluations, hard_exclusion_failures, borderline_egfr)
    """
    checks: list[CriterionEvaluation] = []
    hard_exclusion_failures: list[str] = []

    age = getattr(patient, "age", None)
    cancer_stage = getattr(patient, "cancer_stage", None)
    ecog_score = getattr(patient, "ecog_score", None)
    egfr_ml_min = getattr(patient, "egfr_ml_min", None)
    anc = getattr(patient, "anc", None)
    platelets = getattr(patient, "platelets", None)
    hemoglobin = getattr(patient, "hemoglobin", None)
    total_bilirubin = getattr(patient, "total_bilirubin", None)
    alt_u_l = getattr(patient, "alt_u_l", None)

    prior_lines = getattr(patient, "prior_lines", None)
    if prior_lines is None and hasattr(patient, "prior_lines_therapy"):
        prior_lines = getattr(patient, "prior_lines_therapy", None)

    has_active_brain_mets = getattr(patient, "has_active_brain_mets", None)
    if has_active_brain_mets is None and hasattr(patient, "active_brain_metastases"):
        has_active_brain_mets = getattr(patient, "active_brain_metastases", None)

    has_stable_brain_mets = getattr(patient, "has_stable_brain_mets", None)
    if has_stable_brain_mets is None and hasattr(patient, "stable_treated_brain_mets"):
        has_stable_brain_mets = getattr(patient, "stable_treated_brain_mets", None)

    has_active_autoimmune = getattr(patient, "has_active_autoimmune", None)
    if has_active_autoimmune is None and hasattr(patient, "active_autoimmune_disease"):
        has_active_autoimmune = getattr(patient, "active_autoimmune_disease", None)

    has_egfr_mut = getattr(patient, "has_egfr_sensitizing_mutation", None)
    if has_egfr_mut is None and hasattr(patient, "egfr_mutation"):
        has_egfr_mut = getattr(patient, "egfr_mutation", None)

    pdl1_tps_percent = getattr(patient, "pdl1_tps_percent", None)

    # 1. Age
    if age is None:
        checks.append(CriterionEvaluation(
            criterion="Age Eligibility",
            category="DEMOGRAPHICS",
            status="UNKNOWN",
            passed=False,
            patient_value="Unknown / Not Provided",
            required_threshold=f"{criteria.min_age} - {criteria.max_age} years",
            impact_note="Age not documented in clinical submission. Requires investigator verification.",
        ))
    else:
        age_ok = criteria.min_age <= age <= criteria.max_age
        checks.append(CriterionEvaluation(
            criterion="Age Eligibility",
            category="DEMOGRAPHICS",
            status="PASS" if age_ok else "FAIL",
            passed=age_ok,
            patient_value=f"{age} years",
            required_threshold=f"{criteria.min_age} - {criteria.max_age} years",
            impact_note="Within approved trial age range." if age_ok else "Outside study age boundary.",
        ))

    # 2. Cancer Stage
    allowed_stages = criteria.allowed_stages
    if not cancer_stage or not str(cancer_stage).strip():
        checks.append(CriterionEvaluation(
            criterion="Cancer Stage",
            category="CLINICAL_ONCOLOGY",
            status="UNKNOWN",
            passed=False,
            patient_value="Unknown / Not Provided",
            required_threshold=", ".join(allowed_stages) if allowed_stages else "None Allowed",
            impact_note="Cancer stage unrecorded in profile.",
        ))
    else:
        stage_ok = bool(allowed_stages) and any(stage_matches(cancer_stage, s) for s in allowed_stages)
        checks.append(CriterionEvaluation(
            criterion="Cancer Stage",
            category="CLINICAL_ONCOLOGY",
            status="PASS" if stage_ok else "FAIL",
            passed=stage_ok,
            patient_value=cancer_stage,
            required_threshold=", ".join(allowed_stages) if allowed_stages else "None Allowed",
            impact_note="Matching histological staging." if stage_ok else "Stage mismatch for this specific protocol.",
        ))

    # 3. ECOG Performance Status
    if ecog_score is None:
        checks.append(CriterionEvaluation(
            criterion="ECOG Performance Status",
            category="PHYSICAL_STAMINA",
            status="UNKNOWN",
            passed=False,
            patient_value="Unknown / Not Provided",
            required_threshold=f"ECOG <= {criteria.max_ecog}",
            impact_note="ECOG functional status unrecorded.",
        ))
    else:
        ecog_ok = ecog_score <= criteria.max_ecog
        checks.append(CriterionEvaluation(
            criterion="ECOG Performance Status",
            category="PHYSICAL_STAMINA",
            status="PASS" if ecog_ok else "FAIL",
            passed=ecog_ok,
            patient_value=f"ECOG {ecog_score}",
            required_threshold=f"ECOG <= {criteria.max_ecog}",
            impact_note="Good functional mobility." if ecog_ok else "Performance fatigue exceeds protocol ceiling.",
        ))

    # 4. Renal Function (eGFR)
    borderline_egfr = False
    if egfr_ml_min is None:
        checks.append(CriterionEvaluation(
            criterion="Renal Clearance (eGFR)",
            category="ORGAN_FUNCTION",
            status="UNKNOWN",
            passed=False,
            patient_value="Unknown / Not Provided",
            required_threshold=f"eGFR >= {criteria.min_egfr:.0f} mL/min",
            impact_note="Renal clearance (eGFR) unrecorded.",
        ))
    else:
        egfr_ok = egfr_ml_min >= criteria.min_egfr
        borderline_egfr = (not egfr_ok) and (egfr_ml_min >= 50.0)
        egfr_status = "PASS" if egfr_ok else ("NEEDS_INVESTIGATOR_REVIEW" if borderline_egfr else "FAIL")
        egfr_note = (
            "Adequate kidney clearance."
            if egfr_ok
            else (
                "Borderline renal clearance (eGFR 50-59 mL/min). Candidate may be eligible under proposed Amendment AMD-01."
                if borderline_egfr
                else "Renal cutoff not met."
            )
        )
        checks.append(CriterionEvaluation(
            criterion="Renal Clearance (eGFR)",
            category="ORGAN_FUNCTION",
            status=egfr_status,
            passed=egfr_ok,
            patient_value=f"{egfr_ml_min:.1f} mL/min",
            required_threshold=f"eGFR >= {criteria.min_egfr:.0f} mL/min",
            impact_note=egfr_note,
        ))

    # 5. Hematology: ANC
    if anc is None:
        checks.append(CriterionEvaluation(
            criterion="Absolute Neutrophil Count (ANC)",
            category="HEMATOLOGY",
            status="UNKNOWN",
            passed=False,
            patient_value="Unknown / Not Provided",
            required_threshold=f">= {criteria.min_anc:.0f} /uL",
            impact_note="Absolute Neutrophil Count unrecorded.",
        ))
    else:
        anc_ok = anc >= criteria.min_anc
        checks.append(CriterionEvaluation(
            criterion="Absolute Neutrophil Count (ANC)",
            category="HEMATOLOGY",
            status="PASS" if anc_ok else "FAIL",
            passed=anc_ok,
            patient_value=f"{anc:.0f} /uL",
            required_threshold=f">= {criteria.min_anc:.0f} /uL",
            impact_note="Adequate bone marrow reserve." if anc_ok else "Low neutrophil count (neutropenia risk).",
        ))

    # 6. Hematology: Platelets
    if platelets is None:
        checks.append(CriterionEvaluation(
            criterion="Platelet Count",
            category="HEMATOLOGY",
            status="UNKNOWN",
            passed=False,
            patient_value="Unknown / Not Provided",
            required_threshold=f">= {criteria.min_platelets:.0f} x10^3/uL",
            impact_note="Platelet count unrecorded.",
        ))
    else:
        plat_ok = platelets >= criteria.min_platelets
        checks.append(CriterionEvaluation(
            criterion="Platelet Count",
            category="HEMATOLOGY",
            status="PASS" if plat_ok else "FAIL",
            passed=plat_ok,
            patient_value=f"{platelets:.0f} x10^3/uL",
            required_threshold=f">= {criteria.min_platelets:.0f} x10^3/uL",
            impact_note=(
                "Adequate platelet count for systemic therapy."
                if plat_ok
                else "Thrombocytopenia: Platelet count below protocol cutoff."
            ),
        ))

    # 7. Hematology: Hemoglobin
    if hemoglobin is None:
        checks.append(CriterionEvaluation(
            criterion="Hemoglobin Concentration",
            category="HEMATOLOGY",
            status="UNKNOWN",
            passed=False,
            patient_value="Unknown / Not Provided",
            required_threshold=f">= {criteria.min_hemoglobin:.1f} g/dL",
            impact_note="Hemoglobin concentration unrecorded.",
        ))
    else:
        hb_ok = hemoglobin >= criteria.min_hemoglobin
        checks.append(CriterionEvaluation(
            criterion="Hemoglobin Concentration",
            category="HEMATOLOGY",
            status="PASS" if hb_ok else "FAIL",
            passed=hb_ok,
            patient_value=f"{hemoglobin:.1f} g/dL",
            required_threshold=f">= {criteria.min_hemoglobin:.1f} g/dL",
            impact_note=(
                "Hemoglobin adequate for trial intervention."
                if hb_ok
                else "Anemia: Hemoglobin below safe protocol threshold."
            ),
        ))

    # 8. Hepatic: Total Bilirubin
    if total_bilirubin is None:
        checks.append(CriterionEvaluation(
            criterion="Total Bilirubin",
            category="HEPATIC_FUNCTION",
            status="UNKNOWN",
            passed=False,
            patient_value="Unknown / Not Provided",
            required_threshold=f"<= {criteria.max_total_bilirubin:.1f} mg/dL",
            impact_note="Total bilirubin unrecorded.",
        ))
    else:
        bili_ok = total_bilirubin <= criteria.max_total_bilirubin
        checks.append(CriterionEvaluation(
            criterion="Total Bilirubin",
            category="HEPATIC_FUNCTION",
            status="PASS" if bili_ok else "FAIL",
            passed=bili_ok,
            patient_value=f"{total_bilirubin:.1f} mg/dL",
            required_threshold=f"<= {criteria.max_total_bilirubin:.1f} mg/dL",
            impact_note=(
                "Bilirubin clearance within safe limits."
                if bili_ok
                else "Hyperbilirubinemia: Hepatic clearance impaired."
            ),
        ))

    # 9. Hepatic: ALT Transaminase
    max_alt, alt_thresh_desc = compute_max_alt_u_l(criteria)
    if alt_u_l is None:
        checks.append(CriterionEvaluation(
            criterion="Alanine Aminotransferase (ALT)",
            category="HEPATIC_FUNCTION",
            status="UNKNOWN",
            passed=False,
            patient_value="Unknown / Not Provided",
            required_threshold=alt_thresh_desc,
            impact_note="Alanine Aminotransferase (ALT) level unrecorded. Requires lab draw.",
        ))
    else:
        alt_ok = alt_u_l <= max_alt
        checks.append(CriterionEvaluation(
            criterion="Alanine Aminotransferase (ALT)",
            category="HEPATIC_FUNCTION",
            status="PASS" if alt_ok else "FAIL",
            passed=alt_ok,
            patient_value=f"{alt_u_l:.0f} U/L",
            required_threshold=alt_thresh_desc,
            impact_note=(
                "Liver enzyme transaminase within acceptable parameters."
                if alt_ok
                else "Elevated ALT transaminase exceeds safety threshold."
            ),
        ))

    # 10. Prior Lines of Therapy (min and max consistent with CohortSimulationEngine)
    min_lines = criteria.min_prior_lines
    max_lines = criteria.max_prior_lines
    lines_thresh = f"{min_lines} - {max_lines} prior lines" if min_lines > 0 else f"<= {max_lines} prior lines"
    if prior_lines is None:
        checks.append(CriterionEvaluation(
            criterion="Prior Lines of Systemic Therapy",
            category="TREATMENT_HISTORY",
            status="UNKNOWN",
            passed=False,
            patient_value="Unknown / Not Provided",
            required_threshold=lines_thresh,
            impact_note="Prior lines of therapy unrecorded.",
        ))
    else:
        lines_ok = min_lines <= prior_lines <= max_lines
        if lines_ok:
            lines_note = "Eligible treatment line history."
        elif prior_lines < min_lines:
            lines_note = f"Below minimum required prior systemic therapy lines (>= {min_lines})."
        else:
            lines_note = f"Exceeds maximum prior therapy line allowance (<= {max_lines})."
        checks.append(CriterionEvaluation(
            criterion="Prior Lines of Systemic Therapy",
            category="TREATMENT_HISTORY",
            status="PASS" if lines_ok else "FAIL",
            passed=lines_ok,
            patient_value=f"{prior_lines} prior lines",
            required_threshold=lines_thresh,
            impact_note=lines_note,
        ))

    # 11. CNS Metastases
    cns_eval = evaluate_cns_eligibility(
        has_active_brain_mets=has_active_brain_mets,
        has_stable_brain_mets=has_stable_brain_mets,
        exclude_active_brain_mets=criteria.exclude_active_brain_mets,
        allow_stable_brain_mets=criteria.allow_stable_brain_mets,
    )
    if cns_eval.hard_failure_reason:
        hard_exclusion_failures.append(cns_eval.hard_failure_reason)
    checks.append(cns_eval)

    # 12. Autoimmune Disease Status
    exclude_autoimmune = criteria.exclude_active_autoimmune
    if has_active_autoimmune is None:
        auto_status = "NEEDS_INVESTIGATOR_REVIEW"
        auto_ok = False
        auto_value = "Unknown / Not Provided (Investigator Review Required)"
        auto_note = "Autoimmune history undocumented. Requires medical records review."
    elif has_active_autoimmune is True and exclude_autoimmune:
        auto_status = "FAIL"
        auto_ok = False
        auto_value = "Confirmed Positive (Active Autoimmune Disease)"
        hard_exclusion_failures.append("Active autoimmune disease (hard exclusion)")
        auto_note = "HARD EXCLUSION: Active systemic autoimmune disease requires exclusion under immunotherapy safety guidelines."
    elif has_active_autoimmune is True:
        auto_status = "PASS"
        auto_ok = True
        auto_value = "Confirmed Positive (Permitted by Protocol)"
        auto_note = "Autoimmune history permitted under protocol criteria."
    else:
        auto_status = "PASS"
        auto_ok = True
        auto_value = "Confirmed Negative (No Active Autoimmune)"
        auto_note = "Confirmed no active autoimmune contraindications."

    checks.append(CriterionEvaluation(
        criterion="Autoimmune Disease Status",
        category="SAFETY_COMORBIDITY",
        status=auto_status,
        passed=auto_ok,
        patient_value=auto_value,
        required_threshold="No Active Autoimmune" if exclude_autoimmune else "Allowed",
        impact_note=auto_note,
        is_hard_rule=True,
        is_mandatory=True,
    ))

    # 13. Molecular Biomarker: EGFR Mutation (only when protocol targets EGFR wild-type)
    if criteria.target_biomarker_egfr_negative:
        if has_egfr_mut is None:
            egfr_mut_status = "NEEDS_INVESTIGATOR_REVIEW"
            egfr_mut_ok = False
            egfr_mut_value = "Unknown / Not Provided (Investigator Review Required)"
            egfr_mut_note = "EGFR molecular pathology status pending."
        elif has_egfr_mut is True:
            egfr_mut_status = "FAIL"
            egfr_mut_ok = False
            egfr_mut_value = "Confirmed Positive (EGFR Sensitizing Mutation)"
            egfr_mut_note = "EGFR sensitizing mutation excludes participation."
        else:
            egfr_mut_status = "PASS"
            egfr_mut_ok = True
            egfr_mut_value = "Confirmed Negative (EGFR Wild-Type)"
            egfr_mut_note = "Matches wild-type protocol requirement."

        checks.append(CriterionEvaluation(
            criterion="EGFR Mutation Status",
            category="MOLECULAR_BIOMARKER",
            status=egfr_mut_status,
            passed=egfr_mut_ok,
            patient_value=egfr_mut_value,
            required_threshold="EGFR Negative (Wild-Type)",
            impact_note=egfr_mut_note,
            is_mandatory=True,
        ))

    # 14. Molecular Biomarker: PD-L1 TPS Expression
    if criteria.min_pdl1_tps is not None:
        min_pdl1 = float(criteria.min_pdl1_tps)
        if pdl1_tps_percent is None:
            pdl1_status = "NEEDS_INVESTIGATOR_REVIEW"
            pdl1_ok = False
            pdl1_value = "Unknown / Not Provided"
            pdl1_note = "PD-L1 IHC expression unrecorded."
        else:
            pdl1_ok = pdl1_tps_percent >= min_pdl1
            pdl1_status = "PASS" if pdl1_ok else "FAIL"
            pdl1_value = f"{pdl1_tps_percent:.1f}%"
            pdl1_note = (
                "Meets biomarker expression cutoff."
                if pdl1_ok
                else f"Below minimum required PD-L1 expression ({min_pdl1:.0f}%)."
            )

        checks.append(CriterionEvaluation(
            criterion="PD-L1 Expression (TPS)",
            category="MOLECULAR_BIOMARKER",
            status=pdl1_status,
            passed=pdl1_ok,
            patient_value=pdl1_value,
            required_threshold=f">= {min_pdl1:.1f}%",
            impact_note=pdl1_note,
            is_mandatory=True,
        ))

    return checks, hard_exclusion_failures, borderline_egfr
