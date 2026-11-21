"""
ProtocolShield AI Protocol Amendment & Optimization Models
Represents clinical protocol redlines, FDA precedents, and quantitative yield impacts.
"""
from typing import Optional, Any
from pydantic import BaseModel, Field


class ProtocolAmendmentProposal(BaseModel):
    amendment_id: str = Field(..., description="Unique amendment identifier (e.g. AMD-01)")
    category: str = Field(..., description="Category: RENAL_FUNCTION | RE_BIOPSY | STABLE_CNS | PERFORMANCE_STATUS | TELEHEALTH_PK")
    title: str = Field(..., description="Clinical amendment headline")
    target_section: str = Field(..., description="Affected protocol section or schedule epoch")
    current_clause: str = Field(..., description="Existing restrictive text in protocol")
    proposed_clause: str = Field(..., description="Proposed AI-optimized redline text")
    clinical_evidence_rationale: str = Field(..., description="Clinical justification with medical guideline citations")
    regulatory_precedent: str = Field(..., description="FDA / EMA draft guidance and regulatory precedent")
    
    # Quantitative Impact Metrics (Computed via DuckDB & Tufts CSDD)
    candidate_yield_lift: int = Field(default=0, description="Additional eligible patients recovered from 10k pool")
    yield_lift_percentage: float = Field(default=0.0, description="Percentage lift in candidate pool")
    pbi_reduction_points: float = Field(default=0.0, description="Tufts CSDD Patient Burden Index point drop")
    estimated_accrual_acceleration_months: float = Field(default=0.0, description="Estimated time saved in trial enrollment")
    projected_sponsor_cost_savings_usd: float = Field(default=0.0, description="Estimated capital saved by avoiding enrollment delays")
    
    # Health Equity & Diversity Impact (FDA FDORA Compliance)
    health_equity_diversity_impact: str = Field(..., description="FDA Diversity Action Plan demographic impact")
    safety_guardrail_conditions: list[str] = Field(default_factory=list, description="Mandatory safety monitoring conditions")
    
    # State & mutations
    filter_mutations: dict[str, Any] = Field(default_factory=dict, description="Structured filters updated when applied")
    procedure_modifications: Optional[dict[str, Any]] = Field(default=None, description="Optional SoA visit/procedure adjustments")
    is_recommended: bool = Field(default=True)
    is_applied: bool = Field(default=False)
