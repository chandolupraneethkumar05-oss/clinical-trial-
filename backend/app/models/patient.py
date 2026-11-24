"""
ProtocolShield Synthetic Patient & Clinical Phenotype Models
Structured according to FHIR R4 clinical observation & oncology profiles.
"""
from typing import Optional
from pydantic import BaseModel, Field


class PatientCohortRecord(BaseModel):
    patient_id: str = Field(..., description="Unique de-identified synthetic patient ID")
    age: int = Field(..., ge=18, le=95, description="Patient age in years")
    gender: str = Field(..., description="Biological sex (Male, Female)")
    race_ethnicity: str = Field(..., description="Self-reported demographic category")
    rurality: str = Field(..., description="Residential classification: Urban, Suburban, Rural")
    
    # Clinical Oncology Profile
    primary_cancer_type: str = Field(default="NSCLC", description="Histological cancer subtype")
    cancer_stage: str = Field(..., description="TNM Stage (e.g. Stage IIIB, Stage IV)")
    ecog_score: int = Field(..., ge=0, le=4, description="ECOG Performance Status (0=Asymptomatic to 4=Bedbound)")
    
    # Molecular & Biomarker Alterations
    egfr_mutation: bool = Field(default=False, description="Presence of sensitizing EGFR mutation (Ex19del/L858R)")
    alk_rearrangement: bool = Field(default=False, description="Presence of ALK fusion oncogene")
    kras_g12c: bool = Field(default=False, description="KRAS p.G12C activating mutation")
    pdl1_tps_percent: float = Field(..., ge=0.0, le=100.0, description="PD-L1 Tumor Proportion Score percentage")
    
    # Hematologic & Hepatorenal Biomarker Labs
    anc: float = Field(..., description="Absolute Neutrophil Count (cells/uL, normal > 1500)")
    platelets: float = Field(..., description="Platelet count (x10^3/uL, normal 150-450)")
    hemoglobin: float = Field(..., description="Hemoglobin concentration (g/dL, normal 12-16)")
    egfr_ml_min: float = Field(..., description="Estimated Glomerular Filtration Rate (mL/min/1.73m2, normal > 60)")
    serum_creatinine: float = Field(..., description="Serum Creatinine (mg/dL)")
    alt_u_l: float = Field(..., description="Alanine Aminotransferase (U/L, normal 7-56)")
    ast_u_l: float = Field(..., description="Aspartate Aminotransferase (U/L, normal 10-40)")
    total_bilirubin: float = Field(..., description="Total Bilirubin (mg/dL, normal 0.2-1.2)")
    
    # Clinical History & Comorbidities
    prior_lines_therapy: int = Field(..., ge=0, le=6, description="Number of prior lines of systemic therapy")
    prior_checkpoint_inhibitor: bool = Field(default=False, description="Previous exposure to anti-PD1/PD-L1")
    active_brain_metastases: bool = Field(default=False, description="Untreated or active central nervous system metastases")
    stable_treated_brain_mets: bool = Field(default=False, description="Radiologically stable treated CNS lesions")
    active_autoimmune_disease: bool = Field(default=False, description="History of active systemic autoimmune disease requiring steroids")
    nyha_heart_failure_class: int = Field(default=0, ge=0, le=4, description="NYHA Heart Failure Functional Class")
    
    # Socioeconomic & Travel Friction Factors
    distance_to_center_miles: float = Field(..., ge=1.0, le=150.0, description="Distance from residence to clinical trial investigative site")
    caregiver_accompanied: bool = Field(default=True, description="Whether patient has dedicated family/caregiver support for visits")


class CohortFilterCriteria(BaseModel):
    """Filter criteria passed to simulate real-time patient eligibility."""
    min_age: int = 18
    max_age: int = 80
    allowed_stages: list[str] = ["Stage IIIB", "Stage IV"]
    max_ecog: int = 1
    min_anc: float = 1500.0
    min_platelets: float = 100.0
    min_hemoglobin: float = 9.0
    min_egfr: float = 50.0
    max_total_bilirubin: float = 1.5
    max_alt_multiplier: float = 2.5  # Multiple of Upper Limit of Normal (ULN)
    max_alt_u_l: Optional[float] = None  # Explicit ALT threshold in U/L if specified by protocol
    alt_uln_reference: float = 56.0  # Documented adult clinical reference standard ULN (U/L)
    max_prior_lines: int = 2
    allow_stable_brain_mets: bool = True
    exclude_active_autoimmune: bool = True
    target_biomarker_egfr_negative: bool = False
    min_pdl1_tps: Optional[float] = None
