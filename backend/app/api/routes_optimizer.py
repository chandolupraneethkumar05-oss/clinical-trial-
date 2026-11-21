"""
ProtocolShield AI Clinical Protocol Optimizer API Routes
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.models.protocol import ClinicalTrialProtocol
from app.models.amendment import ProtocolAmendmentProposal
from app.engine.optimizer_engine import protocol_optimizer

router = APIRouter(prefix="/optimizer", tags=["AI Protocol Optimizer"])


class ApplyAmendmentRequest(BaseModel):
    protocol: ClinicalTrialProtocol
    amendment_id: str


@router.post("/propose-amendments", response_model=list[ProtocolAmendmentProposal])
async def propose_protocol_amendments(protocol: ClinicalTrialProtocol):
    """
    Analyzes the loaded clinical trial protocol and synthesizes FDA-aligned
    protocol amendments that maximize patient recruitment yield, reduce Tufts CSDD
    patient burden, and fulfill FDA Diversity Action Plan standards.
    """
    try:
        proposals = protocol_optimizer.generate_amendments(protocol)
        return proposals
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate optimization proposals: {str(e)}")


@router.post("/apply-amendment", response_model=ClinicalTrialProtocol)
async def apply_protocol_amendment(payload: ApplyAmendmentRequest):
    """
    Applies the specified amendment proposal directly to the protocol, mutating
    eligibility criteria clauses, structured filters, Schedule of Assessments, and
    re-scoring composite Tufts CSDD Patient Burden Index.
    """
    try:
        updated_protocol = protocol_optimizer.apply_amendment_to_protocol(
            payload.protocol, payload.amendment_id
        )
        return updated_protocol
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply protocol amendment: {str(e)}")
