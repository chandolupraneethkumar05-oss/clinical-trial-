"""
ProtocolShield Clinical Trial Benchmark API Routes
Interfaces live with ClinicalTrials.gov API v2 for empirical benchmarking and study lookups.
"""
import asyncio
import logging
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, Depends
import httpx
from app.core.config import settings
from app.core.security import require_role, AuthenticatedUser

router = APIRouter(prefix="/benchmark", tags=["Clinical Benchmarking"])
logger = logging.getLogger(__name__)


def _extract_study_complexity_flags(protocol_section: Dict[str, Any]) -> List[str]:
    """Derives factual complexity indicators solely from ClinicalTrials.gov API v2 fields."""
    flags: List[str] = []
    arms = protocol_section.get("armsInterventionsModule", {}).get("armGroups") or []
    if isinstance(arms, list) and len(arms) > 0:
        flags.append(f"{len(arms)} study arm{'s' if len(arms) != 1 else ''}")

    outcomes = protocol_section.get("outcomesModule", {})
    primary_cnt = len(outcomes.get("primaryOutcomes") or [])
    secondary_cnt = len(outcomes.get("secondaryOutcomes") or [])
    if primary_cnt + secondary_cnt > 0:
        flags.append(f"{primary_cnt + secondary_cnt} outcome endpoints ({primary_cnt} primary)")

    elig_text = (
        protocol_section.get("eligibilityModule", {}).get("eligibilityCriteria") or ""
    ).lower()
    if "biopsy" in elig_text:
        flags.append("Biopsy clause in eligibility text")
    if "brain metastas" in elig_text or "cns metastas" in elig_text:
        flags.append("Brain/CNS metastasis eligibility clause")
    if "egfr" in elig_text or "creatinine" in elig_text or "renal" in elig_text:
        flags.append("Renal / eGFR eligibility criterion")
    if "fasting" in elig_text or "pharmacokinetic" in elig_text:
        flags.append("Fasting / PK requirement noted")

    return flags or ["No structured flags extracted from registry text"]


def _parse_clinicaltrials_benchmark(study: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    ps = study.get("protocolSection", {})
    ident = ps.get("identificationModule", {})
    status_mod = ps.get("statusModule", {})
    design_mod = ps.get("designModule", {})

    nct_id = ident.get("nctId")
    if not nct_id:
        return None

    overall_status = (status_mod.get("overallStatus") or "").upper()
    actual_status = "TERMINATED" if overall_status == "TERMINATED" else "COMPLETED"
    why_stopped = (status_mod.get("whyStopped") or "").strip() or None
    enroll_info = design_mod.get("enrollmentInfo") or {}
    enrolled = int(enroll_info.get("count") or 0)
    enroll_type = enroll_info.get("type")
    phases = design_mod.get("phases") or []
    phase_label = ", ".join(p.replace("PHASE", "Phase ") for p in phases) if phases else "Phase 3"

    if actual_status == "TERMINATED":
        verdict = (
            f"Terminated Early (Registry reason recorded)"
            if why_stopped
            else "Terminated Early per ClinicalTrials.gov"
        )
    else:
        verdict = "Completed per ClinicalTrials.gov"

    return {
        "nct_id": nct_id,
        "title": ident.get("briefTitle") or ident.get("officialTitle") or nct_id,
        "phase": phase_label,
        "actual_status": actual_status,
        "termination_reason": why_stopped,
        "enrolled_patients": enrolled,
        "enrollment_type": enroll_type,
        "target_enrollment": None,
        "burden_tier": "Registry Only (No SoA)",
        "predicted_pbi": None,
        "termination_risk_predicted": verdict,
        "protocol_complexity_flags": _extract_study_complexity_flags(ps),
    }


@router.get("/historical-trials")
async def get_historical_benchmarks(
    condition: str = Query(
        default="Non-Small Cell Lung Cancer",
        min_length=2,
        max_length=120,
        description="Oncology disease condition used to query live Phase 3 COMPLETED/TERMINATED trials.",
    ),
    _user: AuthenticatedUser = Depends(require_role(["doctor", "admin"])),
):
    """Queries ClinicalTrials.gov API v2 live for Completed vs Terminated Phase 3 trials. Requires doctor or admin role."""
    base_url = f"{settings.CLINICAL_TRIALS_API_BASE}/studies"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            completed_task = client.get(
                base_url,
                params={
                    "query.cond": condition,
                    "filter.overallStatus": "COMPLETED",
                    "filter.advanced": "AREA[Phase]PHASE3",
                    "pageSize": 3,
                },
            )
            terminated_task = client.get(
                base_url,
                params={
                    "query.cond": condition,
                    "filter.overallStatus": "TERMINATED",
                    "filter.advanced": "AREA[Phase]PHASE3",
                    "pageSize": 3,
                },
            )
            comp_resp, term_resp = await asyncio.gather(completed_task, terminated_task)
        except httpx.RequestError:
            logger.exception("Failed to connect to ClinicalTrials.gov for live historical benchmarks.")
            raise HTTPException(
                status_code=503,
                detail="ClinicalTrials.gov API v2 is currently unreachable. Unable to load live Phase 3 benchmarks.",
            )

    if comp_resp.status_code != 200 or term_resp.status_code != 200:
        status_code = comp_resp.status_code if comp_resp.status_code != 200 else term_resp.status_code
        raise HTTPException(
            status_code=502,
            detail=f"ClinicalTrials.gov API v2 returned HTTP {status_code} while querying Phase 3 trials.",
        )

    try:
        completed_studies = comp_resp.json().get("studies", [])
        terminated_studies = term_resp.json().get("studies", [])
    except ValueError:
        raise HTTPException(status_code=502, detail="ClinicalTrials.gov returned an invalid JSON payload.")

    seen_ids = set()
    trials: List[Dict[str, Any]] = []
    for raw_study in [*completed_studies, *terminated_studies]:
        parsed = _parse_clinicaltrials_benchmark(raw_study)
        if parsed and parsed["nct_id"] not in seen_ids:
            seen_ids.add(parsed["nct_id"])
            trials.append(parsed)

    return {
        "data_source": "ClinicalTrials.gov API v2",
        "condition": condition,
        "data_disclaimer": (
            f"Live Phase 3 {condition} records fetched directly from ClinicalTrials.gov API v2. "
            "Protocol Burden Index (PBI) requires a visit-by-visit Schedule of Events, which public "
            "ClinicalTrials.gov entries do not expose, so registry benchmarks report 'Registry Only (No SoA)' "
            "instead of a synthetic score."
        ),
        "benchmark_count": len(trials),
        "trials": trials,
    }


_NCT_ID_PATTERN = re.compile(r"^NCT\d{8}$")


@router.get("/clinicaltrials-live/{nct_id}")
async def fetch_live_clinical_trial(
    nct_id: str,
    _user: AuthenticatedUser = Depends(require_role(["doctor", "admin"]))
):
    """
    Fetches real-time protocol summary directly from ClinicalTrials.gov API v2.
    Requires doctor or admin role.
    """
    normalized_nct = nct_id.strip().upper()
    if not _NCT_ID_PATTERN.match(normalized_nct):
        raise HTTPException(
            status_code=400,
            detail="Invalid NCT identifier format. Expected format: NCT followed by 8 digits (e.g. NCT03845296).",
        )

    url = f"{settings.CLINICAL_TRIALS_API_BASE}/studies/{normalized_nct}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url)
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Study '{normalized_nct}' was not found on ClinicalTrials.gov.")
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"ClinicalTrials.gov upstream service returned HTTP {resp.status_code}.",
                )
            try:
                data = resp.json()
            except ValueError:
                raise HTTPException(status_code=502, detail="ClinicalTrials.gov returned an invalid JSON payload.")

            protocol_section = data.get("protocolSection", {})
            return {
                "data_source": "ClinicalTrials.gov",
                "nct_id": normalized_nct,
                "brief_title": protocol_section.get("identificationModule", {}).get("briefTitle"),
                "status": protocol_section.get("statusModule", {}).get("overallStatus"),
                "conditions": protocol_section.get("conditionsModule", {}).get("conditions", []),
                "eligibility_criteria_text": protocol_section.get("eligibilityModule", {}).get("eligibilityCriteria")
            }
        except HTTPException:
            raise
        except httpx.RequestError:
            logger.exception("Failed to connect to ClinicalTrials.gov for NCT ID: %s", normalized_nct)
            raise HTTPException(status_code=503, detail="ClinicalTrials.gov API is currently unavailable. Please try again later.")
