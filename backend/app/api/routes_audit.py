"""
ProtocolShield Audit Trail & Compliance API Routes
Maintains an immutable, cryptographically chained SHA-256 event log in DuckDB
supporting 21 CFR Part 11 and HIPAA audit trail requirements.
"""
import uuid
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator

from app.core.config import settings
from app.core.security import require_role, AuthenticatedUser
from app.db.duckdb_client import db_client

router = APIRouter(prefix="/audit", tags=["Compliance & Audit Trail"])
logger = logging.getLogger(__name__)

GENESIS_HASH = "0" * 64


class AuditEventModel(BaseModel):
    id: str
    timestamp: str
    event_type: str
    operator: str
    details: str
    previous_hash: Optional[str] = None
    verification_hash: str


class CreateAuditEventRequest(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=120, description="Machine-readable event category")
    details: str = Field(..., min_length=1, max_length=2000, description="Contextual event payload description")
    resource_type: Optional[str] = Field("PROTOCOL", max_length=120, description="Target resource type")
    resource_id: Optional[str] = Field(None, max_length=120, description="Identifier of the modified entity")

    @field_validator("event_type", "details")
    @classmethod
    def check_non_blank(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Field must not be blank.")
        return cleaned


class AuditVerificationResult(BaseModel):
    valid: bool
    total_records_verified: int
    latest_head_hash: Optional[str] = None
    tampered_event_id: Optional[str] = None
    details: str


def compute_audit_hash(
    event_id: str,
    timestamp: str,
    user_id: str,
    user_role: str,
    action: str,
    resource_type: str,
    resource_id: Optional[str],
    details: str,
    previous_hash: str
) -> str:
    """
    Computes deterministic SHA-256 cryptographic digest over all event fields and previous hash.
    Ensures sequential tamper-evidence across the entire audit trail.
    """
    raw = (
        f"{event_id}|{timestamp}|{user_id}|{user_role}|{action}|"
        f"{resource_type}|{resource_id or ''}|{details}|{previous_hash}"
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


DEFAULT_CANONICAL_AUDIT_LOGS = [
    {
        "id": "aud-001",
        "timestamp": "2026-11-20 16:30:12",
        "event_type": "PROTOCOL_SPECIFICATION_LOAD",
        "operator": "System / ProtocolShield Ingestion Engine",
        "details": "Ingested Phase 3 NSCLC Protocol (PS-ONC-2026-001). Parsed 14 visits and 8 eligibility clauses."
    },
    {
        "id": "aud-002",
        "timestamp": "2026-11-20 16:30:14",
        "event_type": "SYNTHETIC_COHORT_ATTACHMENT",
        "operator": "DuckDB Analytical In-Memory Engine",
        "details": "Attached 10,000 synthetic patient records (NSCLC Phenotype, FHIR R4 schema). Seed 42 verified."
    },
    {
        "id": "aud-003",
        "timestamp": "2026-11-20 16:30:15",
        "event_type": "TUFTS_CSDD_BURDEN_SYNTHESIS",
        "operator": "BurdenScoringEngine v1.0",
        "details": "Calculated Composite PBI: 68.4 / 100. Temporal: 71.4%, Invasive: 63.7%, Cognitive: 74.2%."
    },
    {
        "id": "aud-004",
        "timestamp": "2026-11-20 16:30:16",
        "event_type": "VECTOR_SCREENING_FUNNEL_EXECUTION",
        "operator": "CohortSimulationEngine",
        "details": "Screening funnel completed: 877 eligible subjects from 10,000 pool (Screen Failure: 91.2%)."
    },
    {
        "id": "aud-005",
        "timestamp": "2026-11-20 16:32:01",
        "event_type": "WHAT_IF_SENSITIVITY_RECALCULATION",
        "operator": "Clinical Trial Feasibility Planner",
        "details": "Parameter variance executed: eGFR relaxed to 50 mL/min (+133 candidates recovered)."
    }
]


def _seed_audit_logs_if_empty(conn):
    """
    Populates audit table with initial baseline logs if empty and demo seeding is enabled.
    Disabled in production/staging to prevent inserting artificial compliance records.
    """
    env = settings.ENVIRONMENT.lower().strip()
    if env not in {"development", "test"} or not settings.ENABLE_DEMO_SEEDING:
        return

    try:
        expected_aud_001 = f"SHA256: {compute_audit_hash('aud-001', DEFAULT_CANONICAL_AUDIT_LOGS[0]['timestamp'], 'system-seed', 'system', DEFAULT_CANONICAL_AUDIT_LOGS[0]['event_type'], 'PROTOCOL', None, DEFAULT_CANONICAL_AUDIT_LOGS[0]['details'], GENESIS_HASH)}"
        legacy_count = conn.execute(
            "SELECT count(*) FROM audit_logs WHERE id = 'aud-001' AND verification_hash != ?",
            (expected_aud_001,)
        ).fetchone()[0]
    except Exception:
        legacy_count = 0

    row = conn.execute("SELECT count(*) FROM audit_logs").fetchone()
    if (row and row[0] == 0) or legacy_count > 0:
        if legacy_count > 0:
            conn.execute("DELETE FROM audit_logs WHERE id LIKE 'aud-%'")
        prev_hash = GENESIS_HASH
        for seq_idx, entry in enumerate(DEFAULT_CANONICAL_AUDIT_LOGS, start=1):
            calc_hash = compute_audit_hash(
                event_id=entry["id"],
                timestamp=entry["timestamp"],
                user_id="system-seed",
                user_role="system",
                action=entry["event_type"],
                resource_type="PROTOCOL",
                resource_id=None,
                details=entry["details"],
                previous_hash=prev_hash
            )
            v_hash = f"SHA256: {calc_hash}"
            conn.execute(
                """
                INSERT INTO audit_logs (
                    id, timestamp, user_id, user_name, user_role,
                    action, resource_type, details, previous_hash, verification_hash, chain_seq
                )
                VALUES (?, ?, 'system-seed', ?, 'system', ?, 'PROTOCOL', ?, ?, ?, ?)
                """,
                (
                    entry["id"],
                    entry["timestamp"],
                    entry["operator"],
                    entry["event_type"],
                    entry["details"],
                    prev_hash,
                    v_hash,
                    seq_idx
                )
            )
            prev_hash = v_hash
    else:
        # Ensure canonical seed rows have chain_seq assigned if upgraded from an older schema
        conn.execute(
            """
            UPDATE audit_logs SET chain_seq = CASE id
                WHEN 'aud-001' THEN 1
                WHEN 'aud-002' THEN 2
                WHEN 'aud-003' THEN 3
                WHEN 'aud-004' THEN 4
                WHEN 'aud-005' THEN 5
                ELSE chain_seq
            END
            WHERE chain_seq IS NULL AND id IN ('aud-001', 'aud-002', 'aud-003', 'aud-004', 'aud-005')
            """
        )


def record_audit_event(
    user_id: str,
    user_name: str,
    user_role: str,
    action: str,
    resource_type: str = "PROTOCOL",
    resource_id: Optional[str] = None,
    details: str = ""
) -> AuditEventModel:
    """
    Server-side helper for business actions to append an immutable, cryptographically chained audit event.
    Executes atomically in a DuckDB transaction with monotonic chain_seq to ensure sequential chain consistency.
    """
    event_id = f"aud-{uuid.uuid4().hex[:8]}"
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    operator = f"{user_name} ({user_role})"

    with db_client.transaction() as conn:
        _seed_audit_logs_if_empty(conn)
        last_row = conn.execute(
            """
            SELECT verification_hash, COALESCE(chain_seq, 0)
            FROM audit_logs
            ORDER BY COALESCE(chain_seq, 0) DESC, timestamp DESC, id DESC
            LIMIT 1
            """
        ).fetchone()
        max_seq_row = conn.execute("SELECT COALESCE(MAX(chain_seq), 0) FROM audit_logs").fetchone()
        count_row = conn.execute("SELECT count(*) FROM audit_logs").fetchone()

        previous_hash = last_row[0] if last_row and last_row[0] else GENESIS_HASH
        next_seq = max(int(max_seq_row[0] or 0), int(count_row[0] or 0)) + 1

        raw_hash = compute_audit_hash(
            event_id=event_id,
            timestamp=now_str,
            user_id=user_id,
            user_role=user_role,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            previous_hash=previous_hash
        )
        verification_hash = f"SHA256: {raw_hash}"

        conn.execute(
            """
            INSERT INTO audit_logs (
                id, timestamp, user_id, user_name, user_role,
                action, resource_type, resource_id, details,
                previous_hash, verification_hash, chain_seq
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                now_str,
                user_id,
                operator,
                user_role,
                action,
                resource_type,
                resource_id,
                details,
                previous_hash,
                verification_hash,
                next_seq
            )
        )

    return AuditEventModel(
        id=event_id,
        timestamp=now_str,
        event_type=action,
        operator=operator,
        details=details,
        previous_hash=previous_hash,
        verification_hash=verification_hash
    )


@router.get("/logs", response_model=list[AuditEventModel])
async def get_audit_logs(
    _user: AuthenticatedUser = Depends(require_role(["doctor", "admin"]))
):
    """
    Retrieves chronological audit trail records with SHA-256 cryptographic verification hashes.
    Restricted to clinical investigators and administrators.
    """
    conn = db_client.get_connection()
    try:
        _seed_audit_logs_if_empty(conn)
        rows = conn.execute(
            """
            SELECT id, CAST(timestamp AS VARCHAR), action, user_name, details, previous_hash, verification_hash
            FROM audit_logs
            ORDER BY COALESCE(chain_seq, 0) ASC, timestamp ASC, id ASC
            """
        ).fetchall()

        events = []
        for r in rows:
            events.append(AuditEventModel(
                id=r[0],
                timestamp=str(r[1]),
                event_type=r[2],
                operator=r[3] or "System",
                details=r[4] or "",
                previous_hash=r[5] or GENESIS_HASH,
                verification_hash=r[6]
            ))
        return events
    finally:
        conn.close()


@router.get("/verify", response_model=AuditVerificationResult)
async def verify_audit_trail_integrity(
    _user: AuthenticatedUser = Depends(require_role(["doctor", "admin"]))
):
    """
    Traverses the cryptographic SHA-256 hash chain from genesis block to current head.
    Validates mathematical integrity of all event hashes and previous_hash links.
    Returns 200 with verification details if valid; details failure location if tampered.
    """
    conn = db_client.get_connection()
    try:
        _seed_audit_logs_if_empty(conn)
        rows = conn.execute(
            """
            SELECT id, CAST(timestamp AS VARCHAR), user_id, user_role, action,
                   resource_type, resource_id, details, previous_hash, verification_hash
            FROM audit_logs
            ORDER BY COALESCE(chain_seq, 0) ASC, timestamp ASC, id ASC
            """
        ).fetchall()

        if not rows:
            return AuditVerificationResult(
                valid=True,
                total_records_verified=0,
                latest_head_hash=GENESIS_HASH,
                details="Audit trail is empty. Genesis state intact."
            )

        expected_prev_hash = GENESIS_HASH
        for idx, r in enumerate(rows):
            (
                event_id,
                ts_str,
                user_id,
                user_role,
                action,
                resource_type,
                resource_id,
                details,
                previous_hash,
                verification_hash
            ) = r

            # Check 1: Chain linkage (previous_hash must match prior block's verification_hash)
            if previous_hash != expected_prev_hash:
                return AuditVerificationResult(
                    valid=False,
                    total_records_verified=idx,
                    tampered_event_id=event_id,
                    details=f"Hash chain linkage broken at event {event_id}. Expected previous_hash '{expected_prev_hash}', got '{previous_hash}'."
                )

            # Check 2: Content hash validation
            expected_raw = compute_audit_hash(
                event_id=event_id,
                timestamp=ts_str,
                user_id=user_id or "system-seed",
                user_role=user_role or "system",
                action=action,
                resource_type=resource_type or "PROTOCOL",
                resource_id=resource_id,
                details=details or "",
                previous_hash=previous_hash
            )
            expected_v_hash = f"SHA256: {expected_raw}"

            if verification_hash != expected_v_hash:
                return AuditVerificationResult(
                    valid=False,
                    total_records_verified=idx,
                    tampered_event_id=event_id,
                    details=f"Cryptographic digest mismatch at event {event_id}. Expected '{expected_v_hash}', got '{verification_hash}'."
                )

            expected_prev_hash = verification_hash

        return AuditVerificationResult(
            valid=True,
            total_records_verified=len(rows),
            latest_head_hash=expected_prev_hash,
            details=f"Successfully verified cryptographic integrity of {len(rows)} sequential audit records from genesis."
        )
    finally:
        conn.close()


@router.post("/logs", response_model=AuditEventModel)
async def create_audit_log(
    payload: CreateAuditEventRequest,
    current_user: AuthenticatedUser = Depends(require_role(["doctor", "admin"]))
):
    """
    Appends an immutable compliance audit event with cryptographically chained SHA-256 hash.
    Restricted to authenticated staff.
    """
    return record_audit_event(
        user_id=current_user.id,
        user_name=current_user.name,
        user_role=current_user.role,
        action=payload.event_type,
        resource_type=payload.resource_type or "PROTOCOL",
        resource_id=payload.resource_id,
        details=payload.details
    )
