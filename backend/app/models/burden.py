"""
ProtocolShield Burden Scoring & Complexity Models
Calibrated using Tufts Center for the Study of Drug Development (CSDD) protocol complexity metrics.
"""
from enum import Enum
from pydantic import BaseModel, Field


class InvasivenessTier(str, Enum):
    NON_INVASIVE = "non_invasive"           # Vitals, ECG, Physical Exam (Weight 1.0 - 2.0)
    MINIMALLY_INVASIVE = "minimally_invasive" # Blood Draw, Urinalysis (Weight 2.5 - 3.5)
    MODERATELY_INVASIVE = "moderately_invasive" # Serial PK, IV Infusion, Endoscopy (Weight 5.0 - 8.0)
    HIGHLY_INVASIVE = "highly_invasive"     # Contrast MRI/CT, Bone Marrow, Lumbar Puncture (Weight 8.5 - 18.0)


class AssessmentProcedure(BaseModel):
    name: str = Field(..., description="Name of clinical procedure or test")
    category: InvasivenessTier = Field(..., description="Invasiveness classification")
    invasiveness_weight: float = Field(..., ge=1.0, le=25.0, description="Empirical invasiveness weight")
    estimated_duration_minutes: int = Field(..., ge=5, le=480, description="Dwell time for this specific assessment")
    fasting_required: bool = Field(default=False, description="Whether 8-12 hour prior fasting is mandatory")
    sedation_or_recovery_required: bool = Field(default=False, description="Post-procedure monitoring needed")


class ProtocolVisit(BaseModel):
    visit_id: str = Field(..., description="e.g. V-01 (Screening), V-04 (Week 6)")
    week_number: int = Field(..., ge=-4, le=104, description="Protocol study week (-4 for screening, 0 for baseline)")
    visit_name: str = Field(..., description="Display label (e.g., 'Cycle 1 Day 1', 'Week 12 Restaging')")
    procedures: list[AssessmentProcedure] = Field(default_factory=list)
    is_mandatory: bool = Field(default=True)
    inpatient_stay: bool = Field(default=False)
    
    @property
    def total_clinic_minutes(self) -> int:
        return sum(p.estimated_duration_minutes for p in self.procedures)
    
    @property
    def total_procedure_weight(self) -> float:
        return sum(p.invasiveness_weight for p in self.procedures)


class PatientBurdenBreakdown(BaseModel):
    composite_pbi_score: float = Field(..., ge=0.0, le=100.0, description="0-100 Normalized Patient Burden Index")
    temporal_burden_score: float = Field(..., description="Subscore reflecting total clinic & transit hours")
    invasive_burden_score: float = Field(..., description="Subscore reflecting physical discomfort/biopsies")
    cognitive_burden_score: float = Field(..., description="Subscore reflecting diary/fasting/regimen friction")
    
    total_study_visits: int
    total_clinic_hours: float
    total_blood_draws: int
    total_imaging_scans: int
    total_biopsies: int
    
    peak_burden_weeks: list[int] = Field(default_factory=list, description="Weeks where procedures cluster")
    attrition_risk_tier: str = Field(..., description="Low, Moderate, High, or Severe")
    clinical_risk_rationale: str = Field(..., description="Executive summary explaining the primary friction drivers")
