"""
ProtocolShield Protocol Management & Burden Analysis API Routes
"""
from fastapi import APIRouter, HTTPException
from app.models.protocol import ClinicalTrialProtocol, ProtocolEligibilityCriteria
from app.models.burden import ProtocolVisit, AssessmentProcedure, InvasivenessTier, PatientBurdenBreakdown
from app.engine.burden_scorer import burden_engine, STANDARD_PROCEDURE_CATALOG

router = APIRouter(prefix="/protocol", tags=["Protocol Analysis"])


def get_canonical_nsclc_sample_protocol() -> ClinicalTrialProtocol:
    """
    Constructs a realistic Phase III Oncology Clinical Trial Protocol:
    'A Randomized, Double-Blind Phase 3 Study of Novel Anti-PD-1 Antibody + Chemotherapy 
    vs Placebo + Chemotherapy in Treatment-Naïve Metastatic Non-Small Cell Lung Cancer'
    Duration: 52 Weeks, 18 Visits, Multiple CT Scans, Serial PKs, Safety Monitoring.
    """
    p_vitals = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["vitals"])
    p_ecg = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["ecg"])
    p_labs = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["safety_labs"])
    p_pk = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["pk_serial"])
    p_infusion = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["iv_infusion"])
    p_ct = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["ct_scan"])
    p_mri = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["brain_mri"])
    p_biopsy = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["tumor_biopsy"])
    p_pro = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["pro_survey"])

    visits = [
        ProtocolVisit(
            visit_id="V-01",
            week_number=-2,
            visit_name="Screening & Baseline Workup",
            procedures=[p_vitals, p_ecg, p_labs, p_ct, p_mri, p_biopsy, p_pro]
        ),
        ProtocolVisit(
            visit_id="V-02",
            week_number=0,
            visit_name="Cycle 1 Day 1 (C1D1 - Baseline Infusion & Dense PK)",
            procedures=[p_vitals, p_labs, p_infusion, p_pk, p_ecg]
        ),
        ProtocolVisit(
            visit_id="V-03",
            week_number=3,
            visit_name="Cycle 2 Day 1 (C2D1 - Maintenance)",
            procedures=[p_vitals, p_labs, p_infusion]
        ),
        ProtocolVisit(
            visit_id="V-04",
            week_number=6,
            visit_name="Cycle 3 Day 1 (C3D1 - Restaging CT & PK)",
            procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pk, p_pro]
        ),
        ProtocolVisit(
            visit_id="V-05",
            week_number=9,
            visit_name="Cycle 4 Day 1 (C4D1 - Maintenance)",
            procedures=[p_vitals, p_labs, p_infusion]
        ),
        ProtocolVisit(
            visit_id="V-06",
            week_number=12,
            visit_name="Cycle 5 Day 1 (C5D1 - RECIST Restaging & Repeat Biopsy)",
            procedures=[p_vitals, p_labs, p_infusion, p_ct, p_biopsy, p_pro]
        ),
        ProtocolVisit(
            visit_id="V-07",
            week_number=15,
            visit_name="Cycle 6 Day 1 (C6D1)",
            procedures=[p_vitals, p_labs, p_infusion]
        ),
        ProtocolVisit(
            visit_id="V-08",
            week_number=18,
            visit_name="Cycle 7 Day 1 (C7D1 - Restaging CT)",
            procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]
        ),
        ProtocolVisit(
            visit_id="V-09",
            week_number=24,
            visit_name="Cycle 9 Day 1 (C9D1 - Restaging CT)",
            procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]
        ),
        ProtocolVisit(
            visit_id="V-10",
            week_number=30,
            visit_name="Cycle 11 Day 1 (C11D1)",
            procedures=[p_vitals, p_labs, p_infusion]
        ),
        ProtocolVisit(
            visit_id="V-11",
            week_number=36,
            visit_name="Cycle 13 Day 1 (C13D1 - Restaging CT)",
            procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]
        ),
        ProtocolVisit(
            visit_id="V-12",
            week_number=42,
            visit_name="Cycle 15 Day 1 (C15D1)",
            procedures=[p_vitals, p_labs, p_infusion]
        ),
        ProtocolVisit(
            visit_id="V-13",
            week_number=48,
            visit_name="Cycle 17 Day 1 (C17D1 - Restaging CT)",
            procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]
        ),
        ProtocolVisit(
            visit_id="V-14",
            week_number=52,
            visit_name="Week 52 End of Treatment (EOT) Evaluation",
            procedures=[p_vitals, p_labs, p_ct, p_mri, p_ecg, p_pro]
        ),
    ]

    eligibility = ProtocolEligibilityCriteria(
        inclusion_criteria=[
            "Histologically or cytologically confirmed metastatic Non-Small Cell Lung Cancer (Stage IV)",
            "Age >= 18 and <= 75 years at time of signing informed consent",
            "ECOG performance status 0 or 1",
            "Adequate bone marrow reserve: ANC >= 1,500/uL, Platelets >= 100,000/uL, Hemoglobin >= 9.0 g/dL",
            "Adequate renal function: Serum creatinine <= 1.5 x ULN or eGFR >= 60 mL/min/1.73m2",
            "Adequate hepatic function: Total bilirubin <= 1.5 x ULN, AST/ALT <= 2.5 x ULN (<= 5 x ULN if liver mets)",
            "Measurable disease per RECIST v1.1 criteria",
            "Agreement to provide mandatory baseline archival or fresh core needle tumor biopsy"
        ],
        exclusion_criteria=[
            "Documented EGFR sensitizing mutation or ALK gene rearrangement (eligible for targeted TKIs)",
            "Untreated or symptomatic Central Nervous System (CNS) metastases or leptomeningeal disease",
            "Active autoimmune disease requiring systemic immunosuppressive therapy within 2 years",
            "Prior systemic therapy for metastatic disease (prior adjuvant/neoadjuvant allowed if completed > 6 months prior)",
            "Clinically significant cardiovascular disease: NYHA Class >= II congestive heart failure, unstable angina"
        ],
        structured_filters={
            "min_age": 18,
            "max_age": 75,
            "allowed_stages": ["Stage IV (Oligometastatic)", "Stage IV (Polymetastatic)"],
            "max_ecog": 1,
            "min_anc": 1500.0,
            "min_platelets": 100.0,
            "min_hemoglobin": 9.0,
            "min_egfr": 60.0,
            "max_total_bilirubin": 1.5,
            "max_alt_multiplier": 2.5,
            "max_prior_lines": 0,
            "allow_stable_brain_mets": True,
            "exclude_active_autoimmune": True,
            "target_biomarker_egfr_negative": True
        }
    )

    burden = burden_engine.calculate_protocol_burden(visits, study_duration_weeks=52)

    return ClinicalTrialProtocol(
        protocol_id="PS-ONC-2026-001",
        nct_id="NCT03845296",
        title="A Phase 3, Multicenter Study of Anti-PD-1 Monoclonal Antibody in First-Line Metastatic Non-Small Cell Lung Cancer",
        phase="Phase III",
        indication="Metastatic Non-Small Cell Lung Cancer (NSCLC)",
        study_duration_weeks=52,
        target_enrollment=450,
        visits=visits,
        eligibility=eligibility,
        burden=burden,
        source_filename="MK3475_042_Keynote_Study_Protocol.pdf",
        extracted_page_count=148
    )


@router.get("/sample", response_model=ClinicalTrialProtocol)
async def get_sample_protocol():
    """Returns a fully populated, clinically realistic Phase III oncology protocol."""
    return get_canonical_nsclc_sample_protocol()


@router.post("/score-burden", response_model=PatientBurdenBreakdown)
async def score_protocol_burden(visits: list[ProtocolVisit], duration_weeks: int = 52):
    """Calculates composite Patient Burden Index and friction analytics for submitted visits."""
    try:
        return burden_engine.calculate_protocol_burden(visits, study_duration_weeks=duration_weeks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Burden computation error: {str(e)}")


@router.get("/procedures-catalog")
async def get_procedures_catalog():
    """Returns canonical catalog of standard clinical trial procedures with weights."""
    return list(STANDARD_PROCEDURE_CATALOG.values())
