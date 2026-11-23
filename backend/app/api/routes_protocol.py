"""
ProtocolShield Protocol Management & Burden Analysis API Routes
"""
import logging
import json
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from app.models.protocol import ClinicalTrialProtocol, ProtocolEligibilityCriteria
from app.models.burden import ProtocolVisit, AssessmentProcedure, PatientBurdenBreakdown
from app.engine.burden_scorer import burden_engine, STANDARD_PROCEDURE_CATALOG
from app.engine.pdf_parser import ProtocolPDFParser
from app.core.security import require_role, AuthenticatedUser
from app.db.duckdb_client import db_client

router = APIRouter(prefix="/protocol", tags=["Protocol Analysis"])
logger = logging.getLogger(__name__)


# ── Canonical Sample Protocol Factories ──────────────────────────────────────

def get_canonical_nsclc_sample_protocol() -> ClinicalTrialProtocol:
    """
    Constructs a realistic Phase III Oncology Clinical Trial Protocol:
    'A Randomized, Double-Blind Phase 3 Study of Novel Anti-PD-1 Antibody + Chemotherapy
    vs Placebo + Chemotherapy in Treatment-Naïve Metastatic Non-Small Cell Lung Cancer'
    Duration: 52 Weeks, 14 Visits, Multiple CT Scans, Serial PKs, Safety Monitoring.
    """
    p_vitals   = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["vitals"])
    p_ecg      = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["ecg"])
    p_labs     = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["safety_labs"])
    p_pk       = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["pk_serial"])
    p_infusion = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["iv_infusion"])
    p_ct       = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["ct_scan"])
    p_mri      = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["brain_mri"])
    p_biopsy   = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["tumor_biopsy"])
    p_pro      = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["pro_survey"])

    visits = [
        ProtocolVisit(visit_id="V-01", week_number=-2,
                      visit_name="Screening & Baseline Workup",
                      procedures=[p_vitals, p_ecg, p_labs, p_ct, p_mri, p_biopsy, p_pro]),
        ProtocolVisit(visit_id="V-02", week_number=0,
                      visit_name="Cycle 1 Day 1 (C1D1 - Baseline Infusion & Dense PK)",
                      procedures=[p_vitals, p_labs, p_infusion, p_pk, p_ecg]),
        ProtocolVisit(visit_id="V-03", week_number=3,
                      visit_name="Cycle 2 Day 1 (C2D1 - Maintenance)",
                      procedures=[p_vitals, p_labs, p_infusion]),
        ProtocolVisit(visit_id="V-04", week_number=6,
                      visit_name="Cycle 3 Day 1 (C3D1 - Restaging CT & PK)",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pk, p_pro]),
        ProtocolVisit(visit_id="V-05", week_number=9,
                      visit_name="Cycle 4 Day 1 (C4D1 - Maintenance)",
                      procedures=[p_vitals, p_labs, p_infusion]),
        ProtocolVisit(visit_id="V-06", week_number=12,
                      visit_name="Cycle 5 Day 1 (C5D1 - RECIST Restaging & Repeat Biopsy)",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_biopsy, p_pro]),
        ProtocolVisit(visit_id="V-07", week_number=15,
                      visit_name="Cycle 6 Day 1 (C6D1)",
                      procedures=[p_vitals, p_labs, p_infusion]),
        ProtocolVisit(visit_id="V-08", week_number=18,
                      visit_name="Cycle 7 Day 1 (C7D1 - Restaging CT)",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]),
        ProtocolVisit(visit_id="V-09", week_number=24,
                      visit_name="Cycle 9 Day 1 (C9D1 - Restaging CT)",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]),
        ProtocolVisit(visit_id="V-10", week_number=30,
                      visit_name="Cycle 11 Day 1 (C11D1)",
                      procedures=[p_vitals, p_labs, p_infusion]),
        ProtocolVisit(visit_id="V-11", week_number=36,
                      visit_name="Cycle 13 Day 1 (C13D1 - Restaging CT)",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]),
        ProtocolVisit(visit_id="V-12", week_number=42,
                      visit_name="Cycle 15 Day 1 (C15D1)",
                      procedures=[p_vitals, p_labs, p_infusion]),
        ProtocolVisit(visit_id="V-13", week_number=48,
                      visit_name="Cycle 17 Day 1 (C17D1 - Restaging CT)",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]),
        ProtocolVisit(visit_id="V-14", week_number=52,
                      visit_name="Week 52 End of Treatment (EOT) Evaluation",
                      procedures=[p_vitals, p_labs, p_ct, p_mri, p_ecg, p_pro]),
    ]

    eligibility = ProtocolEligibilityCriteria(
        inclusion_criteria=[
            "Histologically or cytologically confirmed metastatic Non-Small Cell Lung Cancer (Stage IV)",
            "Age >= 18 and <= 75 years at time of signing informed consent",
            "ECOG performance status 0 or 1",
            "Adequate bone marrow reserve: ANC >= 1,500/uL, Platelets >= 100,000/uL, Hemoglobin >= 9.0 g/dL",
            "Adequate renal function: Serum creatinine <= 1.5 x ULN or eGFR >= 60 mL/min/1.73m2",
            "Adequate hepatic function: Total bilirubin <= 1.5 x ULN, AST/ALT <= 2.5 x ULN",
            "Measurable disease per RECIST v1.1 criteria",
            "Agreement to provide mandatory baseline archival or fresh core needle tumor biopsy",
        ],
        exclusion_criteria=[
            "Documented EGFR sensitizing mutation or ALK gene rearrangement",
            "Untreated or symptomatic Central Nervous System (CNS) metastases or leptomeningeal disease",
            "Active autoimmune disease requiring systemic immunosuppressive therapy within 2 years",
            "Prior systemic therapy for metastatic disease",
            "Clinically significant cardiovascular disease: NYHA Class >= II congestive heart failure",
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
            "target_biomarker_egfr_negative": True,
        },
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
        extracted_page_count=148,
    )


def get_canonical_tnbc_sample_protocol() -> ClinicalTrialProtocol:
    """
    Triple-Negative Breast Cancer (TNBC) Phase II ADC + IO Combination:
    'A Phase 2, Open-Label Study of Sacituzumab Govitecan + Pembrolizumab in
    Previously Untreated Metastatic Triple-Negative Breast Cancer'
    Duration: 42 Weeks, 10 Visits, Dense PK on C1D1/C2D1, PRO surveys.
    """
    p_vitals   = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["vitals"])
    p_ecg      = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["ecg"])
    p_labs     = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["safety_labs"])
    p_pk       = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["pk_serial"])
    p_infusion = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["iv_infusion"])
    p_ct       = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["ct_scan"])
    p_biopsy   = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["tumor_biopsy"])
    p_pro      = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["pro_survey"])

    visits = [
        ProtocolVisit(visit_id="V-01", week_number=-2,
                      visit_name="Screening — Baseline Workup & Mandatory Biopsy",
                      procedures=[p_vitals, p_ecg, p_labs, p_ct, p_biopsy, p_pro]),
        ProtocolVisit(visit_id="V-02", week_number=0,
                      visit_name="C1D1 — ADC Infusion & Dense PK Sampling",
                      procedures=[p_vitals, p_labs, p_infusion, p_pk, p_ecg]),
        ProtocolVisit(visit_id="V-03", week_number=1,
                      visit_name="C1D8 — ADC Second Dose",
                      procedures=[p_vitals, p_labs, p_infusion]),
        ProtocolVisit(visit_id="V-04", week_number=3,
                      visit_name="C2D1 — IO + ADC Combo & PK Sparse",
                      procedures=[p_vitals, p_labs, p_infusion, p_pk]),
        ProtocolVisit(visit_id="V-05", week_number=4,
                      visit_name="C2D8 — ADC Maintenance",
                      procedures=[p_vitals, p_labs, p_infusion]),
        ProtocolVisit(visit_id="V-06", week_number=6,
                      visit_name="C3D1 — Restaging CT & PRO Assessment",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]),
        ProtocolVisit(visit_id="V-07", week_number=12,
                      visit_name="C5D1 — Mid-Study CT & Repeat Core Biopsy",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_biopsy, p_pro]),
        ProtocolVisit(visit_id="V-08", week_number=18,
                      visit_name="C7D1 — Restaging CT",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]),
        ProtocolVisit(visit_id="V-09", week_number=30,
                      visit_name="C11D1 — Restaging CT",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]),
        ProtocolVisit(visit_id="V-10", week_number=42,
                      visit_name="End of Treatment (EOT) — Final Safety & Imaging",
                      procedures=[p_vitals, p_labs, p_ct, p_ecg, p_pro]),
    ]

    eligibility = ProtocolEligibilityCriteria(
        inclusion_criteria=[
            "Histologically confirmed metastatic Triple-Negative Breast Cancer (ER-, PR-, HER2-)",
            "Age >= 18 years at time of informed consent",
            "ECOG performance status 0 or 1",
            "No prior systemic chemotherapy for metastatic disease (prior neoadjuvant allowed if >12 months)",
            "Adequate renal function: eGFR >= 50 mL/min/1.73m2",
            "Adequate bone marrow: ANC >= 1,500/uL, Platelets >= 100,000/uL, Hemoglobin >= 9.0 g/dL",
            "Measurable disease per RECIST v1.1",
            "PD-L1 combined positive score (CPS) >= 10 by IHC 22C3 assay (IO cohort arm)",
        ],
        exclusion_criteria=[
            "Known HER2-positive or hormone receptor-positive (ER+/PR+) breast cancer",
            "Prior anthracycline cumulative dose > 360 mg/m2 (doxorubicin equivalent)",
            "Active inflammatory bowel disease or history of Grade >=3 immune-related colitis",
            "Symptomatic CNS metastases requiring urgent treatment",
            "Active autoimmune disease or concurrent immunosuppressive therapy",
            "Known UGT1A1*28 homozygous genotype (SN-38 metabolism risk)",
        ],
        structured_filters={
            "min_age": 18,
            "allowed_stages": ["Stage IV (Oligometastatic)", "Stage IV (Polymetastatic)"],
            "max_ecog": 1,
            "min_egfr": 50.0,
            "min_anc": 1500.0,
            "min_platelets": 100.0,
            "min_hemoglobin": 9.0,
            "max_prior_lines": 0,
            "exclude_active_autoimmune": True,
            "target_biomarker_her2_negative": True,
            "target_biomarker_hormone_receptor_negative": True,
        },
    )

    burden = burden_engine.calculate_protocol_burden(visits, study_duration_weeks=42)

    return ClinicalTrialProtocol(
        protocol_id="PS-ONC-2026-002",
        nct_id="NCT04468321",
        title="Phase 2, Open-Label Study of Sacituzumab Govitecan + Pembrolizumab in Metastatic Triple-Negative Breast Cancer",
        phase="Phase II",
        indication="Metastatic Triple-Negative Breast Cancer (TNBC)",
        study_duration_weeks=42,
        target_enrollment=120,
        visits=visits,
        eligibility=eligibility,
        burden=burden,
        source_filename="ASCENT_IO_Phase2_Protocol_v3.pdf",
        extracted_page_count=112,
    )


def get_canonical_myeloma_sample_protocol() -> ClinicalTrialProtocol:
    """
    Multiple Myeloma Phase III BCMA-directed Bispecific Antibody:
    'A Phase 3, Randomized Study of Teclistamab vs Standard-of-Care in
    Relapsed/Refractory Multiple Myeloma (3+ Prior Lines)'
    Duration: 60 Weeks, 12 Visits. Includes step-up dosing, inpatient monitoring, bone marrow biopsy.
    """
    p_vitals   = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["vitals"])
    p_ecg      = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["ecg"])
    p_labs     = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["safety_labs"])
    p_pk       = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["pk_serial"])
    p_infusion = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["iv_infusion"])
    p_ct       = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["ct_scan"])
    p_bm       = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["bone_marrow_biopsy"])
    p_pro      = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["pro_survey"])

    visits = [
        ProtocolVisit(visit_id="V-01", week_number=-2,
                      visit_name="Screening — Baseline Myeloma Workup",
                      procedures=[p_vitals, p_ecg, p_labs, p_ct, p_bm, p_pro]),
        # Step-up dosing schedule (inpatient monitoring required)
        ProtocolVisit(visit_id="V-02", week_number=0,
                      visit_name="Step-Up Dose 1 (SUD1) — Inpatient 24h Monitoring",
                      procedures=[p_vitals, p_labs, p_infusion, p_pk, p_ecg]),
        ProtocolVisit(visit_id="V-03", week_number=0,
                      visit_name="Step-Up Dose 2 (SUD2) — Inpatient 24h Monitoring",
                      procedures=[p_vitals, p_labs, p_infusion, p_pk]),
        ProtocolVisit(visit_id="V-04", week_number=1,
                      visit_name="C1D1 — Full Therapeutic Dose Initiation",
                      procedures=[p_vitals, p_labs, p_infusion, p_pk, p_ecg]),
        ProtocolVisit(visit_id="V-05", week_number=2,
                      visit_name="C1D8 — Weekly Dosing",
                      procedures=[p_vitals, p_labs, p_infusion]),
        ProtocolVisit(visit_id="V-06", week_number=3,
                      visit_name="C1D15 — Weekly Dosing",
                      procedures=[p_vitals, p_labs, p_infusion]),
        ProtocolVisit(visit_id="V-07", week_number=4,
                      visit_name="C2D1 — Bi-weekly Dosing & Response Assessment",
                      procedures=[p_vitals, p_labs, p_infusion, p_bm, p_pro]),
        ProtocolVisit(visit_id="V-08", week_number=8,
                      visit_name="C3D1 — MRI/CT Restaging",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]),
        ProtocolVisit(visit_id="V-09", week_number=12,
                      visit_name="C4D1 — Bone Marrow Biopsy & Minimal Residual Disease",
                      procedures=[p_vitals, p_labs, p_infusion, p_bm, p_pro]),
        ProtocolVisit(visit_id="V-10", week_number=24,
                      visit_name="C7D1 — Mid-Study Comprehensive Evaluation",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_bm, p_pro]),
        ProtocolVisit(visit_id="V-11", week_number=48,
                      visit_name="C13D1 — Annual Restaging",
                      procedures=[p_vitals, p_labs, p_infusion, p_ct, p_pro]),
        ProtocolVisit(visit_id="V-12", week_number=60,
                      visit_name="End of Treatment (EOT) — Final Response Assessment",
                      procedures=[p_vitals, p_labs, p_ct, p_bm, p_ecg, p_pro]),
    ]

    eligibility = ProtocolEligibilityCriteria(
        inclusion_criteria=[
            "Confirmed diagnosis of Multiple Myeloma per IMWG 2016 criteria",
            "Received >= 3 prior lines of therapy including a proteasome inhibitor, IMiD, and anti-CD38 antibody",
            "Age >= 18 years at time of informed consent",
            "ECOG performance status 0, 1, or 2",
            "Adequate renal function: eGFR >= 40 mL/min/1.73m2 (CKD stage 1-3b eligible)",
            "Measurable disease: serum M-protein >= 0.5 g/dL or urine M-protein >= 200 mg/24h",
            "BCMA expression confirmed by IHC or flow cytometry on bone marrow biopsy",
        ],
        exclusion_criteria=[
            "Prior BCMA-targeted therapy (CAR-T or bispecific antibody) within 6 months",
            "Active plasma cell leukemia (> 20% circulating plasma cells)",
            "Uncontrolled or active CNS myeloma involvement",
            "Clinically significant Cytokine Release Syndrome (CRS) history Grade >= 3",
            "Active infections requiring systemic antimicrobial therapy",
        ],
        structured_filters={
            "min_age": 18,
            "allowed_stages": [
                "Stage I (ISS)", "Stage II (ISS)", "Stage III (ISS)",
                "Stage IV (Oligometastatic)", "Stage IV (Polymetastatic)"
            ],
            "max_ecog": 2,
            "min_egfr": 40.0,
            "max_prior_lines": 10,
            "min_prior_lines": 3,
            "exclude_active_autoimmune": False,
            "target_biomarker_bcma_positive": True,
        },
    )

    burden = burden_engine.calculate_protocol_burden(visits, study_duration_weeks=60)

    return ClinicalTrialProtocol(
        protocol_id="PS-ONC-2026-003",
        nct_id="NCT05231707",
        title="Phase 3, Randomized Study of Teclistamab (BCMA Bispecific) vs Standard-of-Care in Relapsed/Refractory Multiple Myeloma",
        phase="Phase III",
        indication="Relapsed/Refractory Multiple Myeloma (BCMA-directed)",
        study_duration_weeks=60,
        target_enrollment=300,
        visits=visits,
        eligibility=eligibility,
        burden=burden,
        source_filename="MAJESTATIK_Phase3_Protocol_v2.pdf",
        extracted_page_count=187,
    )


# ── Route Handlers ────────────────────────────────────────────────────────────

SAMPLE_PROTOCOL_MAP = {
    "nsclc": get_canonical_nsclc_sample_protocol,
    "tnbc": get_canonical_tnbc_sample_protocol,
    "myeloma": get_canonical_myeloma_sample_protocol,
}


@router.get("/sample", response_model=ClinicalTrialProtocol)
async def get_sample_protocol():
    """Returns a fully populated, clinically realistic Phase III oncology protocol (NSCLC default)."""
    return get_canonical_nsclc_sample_protocol()


@router.get("/sample/{protocol_type}", response_model=ClinicalTrialProtocol)
async def get_sample_protocol_by_type(protocol_type: str):
    """
    Returns one of three built-in clinically calibrated protocol templates.
    protocol_type: 'nsclc' | 'tnbc' | 'myeloma'
    """
    factory = SAMPLE_PROTOCOL_MAP.get(protocol_type.lower())
    if not factory:
        raise HTTPException(
            status_code=404,
            detail=f"Protocol type '{protocol_type}' not found. Valid types: nsclc, tnbc, myeloma"
        )
    return factory()


@router.post("/upload", response_model=ClinicalTrialProtocol)
async def upload_protocol_pdf(
    file: UploadFile = File(...),
    _user: AuthenticatedUser = Depends(require_role(["doctor", "admin"]))
):
    """
    Accepts a clinical trial protocol PDF and extracts:
    - Schedule of Assessments (SoA) with procedure mapping
    - Inclusion/Exclusion eligibility criteria
    - eGFR, ECOG, age thresholds from eligibility text
    - Composite Patient Burden Index (Tufts CSDD scoring)

    Falls back gracefully to enriched canonical defaults when PDF extraction yields sparse data.
    Requires doctor or administrator role.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are accepted. Please upload a .pdf file."
        )

    try:
        file_bytes = await file.read()
        if len(file_bytes) < 1024:
            raise HTTPException(status_code=400, detail="Uploaded file appears to be empty or corrupt.")

        parser = ProtocolPDFParser()
        protocol = parser.parse(file_bytes, file.filename)

        # Persist extracted protocol to DuckDB uploaded_protocols table
        conn = db_client.get_connection()
        try:
            conn.execute(
                """
                INSERT OR REPLACE INTO uploaded_protocols (protocol_id, data_json, uploaded_by, uploaded_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (protocol.protocol_id, protocol.model_dump_json(), _user.email)
            )
        finally:
            conn.close()

        return protocol

    except HTTPException:
        raise
    except Exception:
        logger.exception("Protocol PDF extraction failed for file: %s", file.filename)
        raise HTTPException(
            status_code=500,
            detail="Protocol extraction failed. Please ensure the file is a valid clinical trial protocol PDF."
        )


@router.get("/uploaded", response_model=list[ClinicalTrialProtocol])
async def get_uploaded_protocols(_user: AuthenticatedUser = Depends(require_role(["doctor", "admin"]))):
    """Retrieves all stored uploaded protocols from DuckDB."""
    conn = db_client.get_connection()
    try:
        rows = conn.execute("SELECT data_json FROM uploaded_protocols ORDER BY uploaded_at DESC").fetchall()
        protocols = []
        for r in rows:
            try:
                protocols.append(ClinicalTrialProtocol(**json.loads(r[0])))
            except Exception:
                continue
        return protocols
    finally:
        conn.close()


@router.post("/score-burden", response_model=PatientBurdenBreakdown)
async def score_protocol_burden(
    visits: list[ProtocolVisit],
    duration_weeks: int = 52,
    _user: AuthenticatedUser = Depends(require_role(["doctor", "admin"]))
):
    """Calculates composite Patient Burden Index and friction analytics for submitted visits. Requires doctor or admin role."""
    try:
        return burden_engine.calculate_protocol_burden(visits, study_duration_weeks=duration_weeks)
    except Exception:
        logger.exception("Protocol burden scoring failed")
        raise HTTPException(status_code=500, detail="An unexpected error occurred calculating protocol burden.")


@router.get("/procedures-catalog")
async def get_procedures_catalog():
    """Returns canonical catalog of standard clinical trial procedures with weights."""
    return list(STANDARD_PROCEDURE_CATALOG.values())
