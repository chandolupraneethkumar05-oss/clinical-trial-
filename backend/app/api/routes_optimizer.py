"""
ProtocolShield AI Clinical Protocol Optimizer API Routes
"""
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.models.protocol import ClinicalTrialProtocol
from app.models.amendment import ProtocolAmendmentProposal
from app.engine.optimizer_engine import protocol_optimizer
from app.core.security import require_role, AuthenticatedUser

router = APIRouter(prefix="/optimizer", tags=["AI Protocol Optimizer"])
logger = logging.getLogger(__name__)


class ApplyAmendmentRequest(BaseModel):
    protocol: ClinicalTrialProtocol
    amendment_id: str


@router.post("/propose-amendments", response_model=list[ProtocolAmendmentProposal])
async def propose_protocol_amendments(
    protocol: ClinicalTrialProtocol,
    _user: AuthenticatedUser = Depends(require_role(["doctor", "admin"]))
):
    """
    Analyzes the loaded clinical trial protocol and synthesizes FDA-aligned
    protocol amendments that maximize patient recruitment yield, reduce Tufts CSDD
    patient burden, and fulfill FDA Diversity Action Plan standards.
    Requires doctor or administrator role.
    """
    try:
        proposals = protocol_optimizer.generate_amendments(protocol)
        return proposals
    except Exception:
        logger.exception("Failed to generate optimization proposals")
        raise HTTPException(status_code=500, detail="An unexpected error occurred generating protocol amendments.")


@router.post("/apply-amendment", response_model=ClinicalTrialProtocol)
async def apply_protocol_amendment(
    payload: ApplyAmendmentRequest,
    _user: AuthenticatedUser = Depends(require_role(["doctor", "admin"]))
):
    """
    Applies the specified amendment proposal directly to the protocol, mutating
    eligibility criteria clauses, structured filters, Schedule of Assessments, and
    re-scoring composite Tufts CSDD Patient Burden Index.
    Requires doctor or administrator role.
    """
    try:
        updated_protocol = protocol_optimizer.apply_amendment_to_protocol(
            payload.protocol, payload.amendment_id
        )
        try:
            from app.api.routes_audit import record_audit_event
            record_audit_event(
                user_id=_user.id,
                user_name=_user.name,
                user_role=_user.role,
                action="PROTOCOL_AMENDMENT_APPLIED",
                resource_type="PROTOCOL",
                resource_id=payload.protocol.protocol_id,
                details=f"Applied amendment proposal '{payload.amendment_id}' to protocol {payload.protocol.protocol_id} ({payload.protocol.title})."
            )
        except Exception:
            logger.exception("Failed to record audit event for applied amendment")
        return updated_protocol
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        logger.exception("Failed to apply protocol amendment")
        raise HTTPException(status_code=500, detail="An unexpected error occurred applying the protocol amendment.")

