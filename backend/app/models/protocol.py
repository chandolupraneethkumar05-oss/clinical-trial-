"""
ProtocolShield Protocol & Schedule of Assessments Models
"""
from typing import Optional
from pydantic import BaseModel, Field
from app.models.burden import ProtocolVisit, PatientBurdenBreakdown


class ProtocolEligibilityCriteria(BaseModel):
    inclusion_criteria: list[str] = Field(default_factory=list)
    exclusion_criteria: list[str] = Field(default_factory=list)
    structured_filters: dict = Field(default_factory=dict, description="Normalized machine-readable filters")


class ClinicalTrialProtocol(BaseModel):
    protocol_id: str = Field(..., description="Internal sponsor trial identifier")
    nct_id: Optional[str] = Field(None, description="ClinicalTrials.gov identifier if applicable")
    title: str = Field(..., description="Official protocol title")
    phase: str = Field(default="Phase III", description="Clinical phase (Phase I, II, III, IV)")
    indication: str = Field(default="Non-Small Cell Lung Cancer (NSCLC)", description="Target therapeutic indication")
    study_duration_weeks: int = Field(default=52, ge=4, le=156)
    target_enrollment: int = Field(default=400, ge=10, le=50000)
    
    # Schedule of Assessments (SoA)
    visits: list[ProtocolVisit] = Field(default_factory=list)
    
    # Eligibility & Filtering
    eligibility: ProtocolEligibilityCriteria = Field(default_factory=ProtocolEligibilityCriteria)
    
    # Computed Burden Analytics
    burden: Optional[PatientBurdenBreakdown] = None
    
    # Ingestion Metadata
    source_filename: Optional[str] = None
    extracted_page_count: Optional[int] = None
    extraction_status: Optional[str] = Field("extracted", description="Extraction quality: 'extracted' | 'heuristic_fallback'")
    extraction_notes: Optional[str] = Field(None, description="Diagnostic notes about document parsing")
