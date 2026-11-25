"""
ProtocolShield Security, Password Reset, Rate Limiter, Production Hardening,
Backend Reliability, and End-to-End Integration Regression Suite.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from unittest.mock import MagicMock, patch

import duckdb
import httpx
import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.core.config import Settings
from app.core.email_service import EmailDeliveryError
from app.core.security import (
    SlidingWindowRateLimiter,
    decode_access_token,
    resolve_client_ip,
)
from app.db.duckdb_client import DuckDBClient, db_client
from app.engine.eligibility import PROVENANCE_PATIENT_REPORTED
from app.main import app


def hash_reset_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()

client = TestClient(app)


def _signin(email: str, password: str) -> tuple[str, dict]:
    resp = client.post("/api/v1/auth/signin", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return body["token"], body["user"]


def _signup_fresh_patient() -> tuple[str, str, str, str]:
    email = f"reset.patient.{uuid.uuid4().hex[:8]}@example.org"
    pw = "InitialStrongPw2026!"
    resp = client.post(
        "/api/v1/auth/signup",
        json={"name": "Regression Patient", "email": email, "password": pw},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return body["user"]["id"], email, pw, body["token"]


# ── 1. Password Reset Complete Matrix (All 10 Required Cases) ────────────────

def test_password_reset_full_security_matrix(monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr("app.api.routes_auth.settings.ENVIRONMENT", "development")
    monkeypatch.setattr("app.api.routes_auth.settings.EXPOSE_DEV_RESET_TOKEN", True)
    user_id, email, old_pw, old_jwt = _signup_fresh_patient()

    # 1. Dev mode reset request with email delivery mocked -> succeeds, creates reset token
    sent_emails: list[tuple[str, str]] = []

    async def fake_send_email(recipient_email: str, reset_token: str) -> bool:
        sent_emails.append((recipient_email, reset_token))
        return True

    with patch("app.api.routes_auth.is_email_configured", return_value=True), \
         patch("app.api.routes_auth.send_password_reset_email", side_effect=fake_send_email):
        req1 = client.post("/api/v1/auth/forgot-password/request", json={"email": email})
    assert req1.status_code == 200
    assert "dev_reset_token" not in req1.json()
    assert len(sent_emails) == 1 and sent_emails[0][0] == email.lower()
    token1 = sent_emails[0][1]
    assert token1 and len(token1) > 12

    # Confirm raw reset token was stored HASHED in DB, never plaintext
    conn = db_client.get_connection()
    try:
        rows = conn.execute(
            "SELECT token_hash, used FROM password_resets WHERE lower(email) = ?",
            (email.lower(),),
        ).fetchall()
    finally:
        conn.close()
    assert len(rows) >= 1
    assert all(r[0] == hash_reset_token(token1) and r[0] != token1 for r in rows)

    # 2. Unknown email -> generic 200, no dev token, no enumeration difference
    unknown_resp = client.post(
        "/api/v1/auth/forgot-password/request",
        json={"email": f"nobody.{uuid.uuid4().hex[:6]}@example.org"},
    )
    assert unknown_resp.status_code == 200
    assert "dev_reset_token" not in unknown_resp.json()
    assert unknown_resp.json()["message"] == req1.json()["message"]

    # 3. Invalid token -> rejected 400
    bad_tok = client.post(
        "/api/v1/auth/forgot-password/reset",
        json={"email": email, "token": "INVALID-TOKEN-XYZ", "new_password": "NewStrongPw2026!"},
    )
    assert bad_tok.status_code == 400

    # 4. Expired token -> rejected 400
    with patch("app.api.routes_auth.is_email_configured", return_value=False):
        req_exp = client.post("/api/v1/auth/forgot-password/request", json={"email": email})
    expired_token = req_exp.json()["dev_reset_token"]
    past_ts = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    with db_client.transaction() as tconn:
        tconn.execute(
            "UPDATE password_resets SET expires_at = ? WHERE token_hash = ?",
            (past_ts, hash_reset_token(expired_token)),
        )
    exp_resp = client.post(
        "/api/v1/auth/forgot-password/reset",
        json={"email": email, "token": expired_token, "new_password": "NewStrongPw2026!"},
    )
    assert exp_resp.status_code == 400

    # 5 & 6. Multiple outstanding tokens: issue token_a and token_b; reset via token_b invalidates token_a
    with patch("app.api.routes_auth.is_email_configured", return_value=False):
        tok_a = client.post("/api/v1/auth/forgot-password/request", json={"email": email}).json()["dev_reset_token"]
        tok_b = client.post("/api/v1/auth/forgot-password/request", json={"email": email}).json()["dev_reset_token"]

    # 7. Successful password reset with token_b
    new_pw = "RotatedStrongPw2026!"
    reset_ok = client.post(
        "/api/v1/auth/forgot-password/reset",
        json={"email": email, "token": tok_b, "new_password": new_pw},
    )
    assert reset_ok.status_code == 200
    assert reset_ok.json()["success"] is True

    # Reusing token_b must fail 400
    reused_b = client.post(
        "/api/v1/auth/forgot-password/reset",
        json={"email": email, "token": tok_b, "new_password": "AnotherPw2026!"},
    )
    assert reused_b.status_code == 400

    # Earlier outstanding token_a must ALSO be invalidated after successful reset
    reused_a = client.post(
        "/api/v1/auth/forgot-password/reset",
        json={"email": email, "token": tok_a, "new_password": "AnotherPw2026!"},
    )
    assert reused_a.status_code == 400

    # 8. Old session invalidation (token_version incremented on reset)
    old_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_jwt}"})
    assert old_me.status_code == 401

    # Old password fails 401; new password succeeds 200
    assert client.post("/api/v1/auth/signin", json={"email": email, "password": old_pw}).status_code == 401
    new_token, _ = _signin(email, new_pw)
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_token}"}).status_code == 200

    # 9 & 10. Production mode email unconfigured -> 503 fail closed; configured & failing -> generic 200 & token invalidated; never leaks raw token
    monkeypatch.setattr("app.api.routes_auth.settings.ENVIRONMENT", "production")
    monkeypatch.setattr("app.api.routes_auth.settings.EXPOSE_DEV_RESET_TOKEN", False)

    with patch("app.api.routes_auth.is_email_configured", return_value=False):
        unconf_resp = client.post("/api/v1/auth/forgot-password/request", json={"email": email})
    assert unconf_resp.status_code == 503
    assert "dev_reset_token" not in unconf_resp.json()

    with patch("app.api.routes_auth.is_email_configured", return_value=True), \
         patch("app.api.routes_auth.send_password_reset_email", side_effect=EmailDeliveryError("SMTP timeout")):
        err_resp = client.post("/api/v1/auth/forgot-password/request", json={"email": email})
    assert err_resp.status_code == 200
    assert "dev_reset_token" not in err_resp.json()

    # Check production response NEVER exposes token when email succeeds
    prod_captured: list[str] = []

    async def capture_prod_email(_recipient: str, tok: str) -> bool:
        prod_captured.append(tok)
        return True

    with patch("app.api.routes_auth.is_email_configured", return_value=True), \
         patch("app.api.routes_auth.send_password_reset_email", side_effect=capture_prod_email):
        prod_ok = client.post("/api/v1/auth/forgot-password/request", json={"email": email})
    assert prod_ok.status_code == 200
    assert "dev_reset_token" not in prod_ok.json()
    assert len(prod_captured) == 1

    # Verify logs NEVER contain plaintext passwords or raw reset tokens
    combined_logs = "\n".join(r.getMessage() for r in caplog.records)
    for sensitive in (old_pw, new_pw, token1, tok_a, tok_b, prod_captured[0]):
        assert sensitive not in combined_logs


# ── 2. Rate Limiter Cleanup, Bounded Memory, Concurrency & Anti-Spoofing ─────

def test_rate_limiter_prunes_expired_and_bounds_distinct_ips(monkeypatch):
    limiter = SlidingWindowRateLimiter(max_entries=50, cleanup_interval_seconds=0.0)
    fake_now = [1000.0]
    monkeypatch.setattr("app.core.security.time.time", lambda: fake_now[0])

    assert limiter.check("ip:1.1.1.1", max_requests=2, window_seconds=10)[0] is True
    assert limiter.check("ip:1.1.1.1", max_requests=2, window_seconds=10)[0] is True
    allowed, retry = limiter.check("ip:1.1.1.1", max_requests=2, window_seconds=10)
    assert allowed is False and retry >= 1
    assert limiter.active_key_count() == 1

    # Advance past window -> expired entry is pruned completely on next check / prune_expired
    fake_now[0] = 1015.0
    removed = limiter.prune_expired(now=fake_now[0])
    assert removed == 1
    assert limiter.active_key_count() == 0

    # Insert 200 distinct active IPs -> memory stays strictly capped at max_entries=50
    for i in range(200):
        limiter.check(f"ip:10.0.0.{i}", max_requests=5, window_seconds=60)
    assert limiter.active_key_count() <= 50


def test_rate_limiter_thread_safe_concurrent_requests():
    limiter = SlidingWindowRateLimiter(max_entries=100, cleanup_interval_seconds=0.5)

    def hit_limit(_idx: int) -> bool:
        ok, _ = limiter.check("concurrent:client", max_requests=25, window_seconds=60)
        return ok

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(hit_limit, range(40)))

    assert sum(1 for r in results if r) == 25
    assert sum(1 for r in results if not r) == 15


def _make_mock_request(direct_ip: Optional[str], xff: Optional[str] = None) -> Request:
    headers = []
    if xff is not None:
        headers.append((b"x-forwarded-for", xff.encode("latin-1")))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers,
        "client": (direct_ip, 12345) if direct_ip is not None else None,
    }
    return Request(scope)


def test_resolve_client_ip_proxy_and_spoofing_protection(monkeypatch):
    monkeypatch.setattr("app.core.security.settings.TRUSTED_PROXIES", ["127.0.0.1", "10.0.0.5"])

    # Untrusted direct caller cannot spoof X-Forwarded-For
    untrusted = _make_mock_request("198.51.100.77", "8.8.8.8, 1.1.1.1")
    assert resolve_client_ip(untrusted) == "198.51.100.77"

    # Trusted proxy walks right-to-left skipping trusted hops
    trusted = _make_mock_request("127.0.0.1", "203.0.113.9, 10.0.0.5")
    assert resolve_client_ip(trusted) == "203.0.113.9"

    # Malformed X-Forwarded-For falls back cleanly to proxy peer IP
    malformed = _make_mock_request("127.0.0.1", "not-an-ip, 10.0.0.5")
    assert resolve_client_ip(malformed) == "127.0.0.1"

    # Missing client socket info never impersonates 127.0.0.1 (would bypass or share trusted identity)
    no_client = _make_mock_request(None, "203.0.113.9")
    assert resolve_client_ip(no_client) == "unknown"


# ── 3. Production Secret Validation, RBAC & Cross-Patient IDOR ───────────────

@pytest.mark.parametrize(
    "overrides",
    [
        {"DEBUG": True},
        {"ENABLE_DEMO_SEEDING": True},
        {"EXPOSE_DEV_RESET_TOKEN": True},
        {"JWT_SECRET_KEY": "short"},
        {"JWT_SECRET_KEY": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},  # low entropy
        {"TRUSTED_PROXIES": ["*"]},
        {"BACKEND_CORS_ORIGINS": ["*"]},
    ],
)
def test_validate_production_secrets_fails_closed(overrides):
    base = {
        "ENVIRONMENT": "production",
        "DEBUG": False,
        "ENABLE_DEMO_SEEDING": False,
        "EXPOSE_DEV_RESET_TOKEN": False,
        "JWT_SECRET_KEY": "X9!vQ2#mZ7pL4$wN8kR1@cB6tY3&hJ5s",
        "TRUSTED_PROXIES": ["127.0.0.1"],
        "BACKEND_CORS_ORIGINS": ["https://protocolshield.example.com"],
        "EMAIL_PROVIDER": "resend",
        "EMAIL_API_KEY": "re_test_key",
    }
    valid_settings = Settings(**base)
    valid_settings.validate_production_secrets()

    base.update(overrides)
    bad_settings = Settings(**base)
    with pytest.raises(SystemExit):
        bad_settings.validate_production_secrets()


def test_role_promotion_admin_only_and_invalidates_prior_sessions():
    admin_tok, _ = _signin("sarah.jenkins@iqvia.com", "IQVIA2026!")
    doc_tok, _ = _signin("elena.vance@novartis.com", "Novartis2026!")
    patient_id, patient_email, patient_pw, patient_old_tok = _signup_fresh_patient()

    # Non-admin doctor cannot promote user
    deny_resp = client.post(
        "/api/v1/auth/promote-user",
        json={"user_id": patient_id, "target_role": "doctor"},
        headers={"Authorization": f"Bearer {doc_tok}"},
    )
    assert deny_resp.status_code == 403

    # Admin promotes user to doctor
    ok_resp = client.post(
        "/api/v1/auth/promote-user",
        json={"user_id": patient_id, "target_role": "doctor"},
        headers={"Authorization": f"Bearer {admin_tok}"},
    )
    assert ok_resp.status_code == 200, ok_resp.text
    assert ok_resp.json()["new_role"] == "doctor"

    # Prior patient token MUST be invalidated due to token_version bump
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {patient_old_tok}"}).status_code == 401

    # Fresh sign-in reflects new doctor role
    fresh_tok, fresh_user = _signin(patient_email, patient_pw)
    assert fresh_user["role"] == "doctor"
    assert decode_access_token(fresh_tok)["role"] == "doctor"


def test_cross_patient_idor_blocked_and_jwt_tampering_rejected():
    p1_id, _, _, p1_token = _signup_fresh_patient()
    p2_id, _, _, _ = _signup_fresh_patient()

    # Patient 1 cannot read Patient 2 clinical record
    idor_resp = client.get(
        f"/api/v1/patient/records/{p2_id}",
        headers={"Authorization": f"Bearer {p1_token}"},
    )
    assert idor_resp.status_code == 403

    # Patient 1 explicitly targeting another patient_id on screening is blocked 403
    spoof_resp = client.post(
        "/api/v1/patient/screen-eligibility",
        json={
            "patient_id": p2_id,
            "age": 60,
            "cancer_stage": "Stage IV (Oligometastatic)",
            "ecog_score": 1,
            "egfr_ml_min": 70.0,
        },
        headers={"Authorization": f"Bearer {p1_token}"},
    )
    assert spoof_resp.status_code == 403

    # Normal self-screening without mismatched ID forces server-owned p1_id
    screen_resp = client.post(
        "/api/v1/patient/screen-eligibility",
        json={
            "age": 60,
            "cancer_stage": "Stage IV (Oligometastatic)",
            "ecog_score": 1,
            "egfr_ml_min": 70.0,
        },
        headers={"Authorization": f"Bearer {p1_token}"},
    )
    assert screen_resp.status_code == 200
    assert screen_resp.json()["patient_id"] == p1_id

    # Tampered signature rejected 401
    bad_jwt = pyjwt.encode({"sub": "usr-admin-1", "role": "admin"}, "wrong-secret-padding-for-hs256-32b", algorithm="HS256")
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bad_jwt}"}).status_code == 401


# ── 4. Health/Readiness, Seed Safety, Audit Ordering, Benchmark & Upload ─────

def test_health_and_ready_reflect_duckdb_status_without_leaking_paths():
    h = client.get("/health")
    r = client.get("/ready")
    assert h.status_code == 200 and h.json()["status"] == "healthy"
    assert r.status_code == 200 and r.json()["status"] == "ready"
    assert "duckdb" not in str(h.json()).lower() or "protocolshield_cohort.duckdb" not in str(h.json())

    with patch("app.main.db_client.check_health", return_value=(False, 0)):
        h_down = client.get("/health")
        r_down = client.get("/ready")
        assert h_down.status_code == 503
        assert h_down.json()["status"] == "unhealthy"
        assert r_down.status_code == 503
        assert "protocolshield_cohort" not in str(h_down.json())


def test_duckdb_production_lock_never_falls_back_to_memory(monkeypatch):
    monkeypatch.setattr("app.db.duckdb_client.settings.ENVIRONMENT", "production")
    with patch("app.db.duckdb_client.duckdb.connect", side_effect=duckdb.IOException("file locked by other PID")):
        with pytest.raises(RuntimeError, match="Production DuckDB database"):
            DuckDBClient(Path("backend/data/locked_prod_test.duckdb"))


def test_demo_seeding_disabled_when_flag_false_or_production(monkeypatch):
    from app.api.routes_auth import seed_default_users_if_empty
    from app.api.routes_audit import _seed_audit_logs_if_empty

    monkeypatch.setattr("app.api.routes_auth.settings.ENVIRONMENT", "production")
    monkeypatch.setattr("app.api.routes_auth.settings.ENABLE_DEMO_SEEDING", False)
    monkeypatch.setattr("app.api.routes_audit.settings.ENVIRONMENT", "production")
    monkeypatch.setattr("app.api.routes_audit.settings.ENABLE_DEMO_SEEDING", False)

    with patch("app.api.routes_auth.db_client.transaction") as auth_tx:
        seed_default_users_if_empty()
        auth_tx.assert_not_called()

    mock_conn = MagicMock()
    _seed_audit_logs_if_empty(mock_conn)
    mock_conn.execute.assert_not_called()


def test_cohort_seed_preserves_existing_data_unless_confirmed():
    admin_tok, _ = _signin("sarah.jenkins@iqvia.com", "IQVIA2026!")
    headers = {"Authorization": f"Bearer {admin_tok}"}

    safe_seed = client.post("/api/v1/cohort/seed?total=100", headers=headers)
    assert safe_seed.status_code == 200
    body = safe_seed.json()
    assert body["regenerated"] is False
    assert body["existing_records_preserved"] is True

    # Force regenerate WITHOUT confirmation phrase -> rejected 400
    unconfirmed = client.post("/api/v1/cohort/seed?total=100&force_regenerate=true", headers=headers)
    assert unconfirmed.status_code == 400


def test_audit_chain_monotonic_under_same_second_burst():
    doc_tok, _ = _signin("elena.vance@novartis.com", "Novartis2026!")
    headers = {"Authorization": f"Bearer {doc_tok}"}

    for i in range(4):
        resp = client.post(
            "/api/v1/audit/logs",
            json={
                "event_type": "REGRESSION_BURST_CHECK",
                "details": f"Same-second burst event #{i}",
                "resource_id": "PS-ONC-2026-001",
            },
            headers=headers,
        )
        assert resp.status_code == 200

    verify = client.get("/api/v1/audit/verify", headers=headers)
    assert verify.status_code == 200
    assert verify.json()["valid"] is True


def test_benchmark_nct_validation_and_upstream_failure_handling():
    doc_tok, _ = _signin("elena.vance@novartis.com", "Novartis2026!")
    headers = {"Authorization": f"Bearer {doc_tok}"}

    bad_id = client.get("/api/v1/benchmark/clinicaltrials-live/INVALID-ID", headers=headers)
    assert bad_id.status_code == 400

    with patch("app.api.routes_benchmark.httpx.AsyncClient.get", side_effect=httpx.ConnectError("upstream down")):
        down = client.get("/api/v1/benchmark/clinicaltrials-live/NCT06184210", headers=headers)
        assert down.status_code in (502, 503, 504)


def test_protocol_upload_rejects_non_pdf_magic_bytes():
    doc_tok, _ = _signin("elena.vance@novartis.com", "Novartis2026!")
    fake_pdf = b"THIS IS NOT A REAL PDF DOCUMENT"
    resp = client.post(
        "/api/v1/protocol/upload",
        files={"file": ("evil.pdf", fake_pdf, "application/pdf")},
        headers={"Authorization": f"Bearer {doc_tok}"},
    )
    assert resp.status_code == 400


# ── 5. Full End-to-End Integration Regression Flow ───────────────────────────

def test_end_to_end_synthetic_patient_and_investigator_workflow():
    # 1. Patient signs up cleanly & screens with unknown CNS -> REQUIRES_REVIEW
    uid, p_email, p_pw, p_token = _signup_fresh_patient()
    p_headers = {"Authorization": f"Bearer {p_token}"}

    first_screen = client.post(
        "/api/v1/patient/screen-eligibility",
        json={
            "age": 60,
            "cancer_stage": "Stage IV (Oligometastatic)",
            "ecog_score": 1,
            "egfr_ml_min": 68.0,
        },
        headers=p_headers,
    )
    assert first_screen.status_code == 200
    first_data = first_screen.json()
    assert first_data["data_provenance"] == PROVENANCE_PATIENT_REPORTED
    assert all(m["match_status"] in ("REQUIRES_REVIEW", "NOT_ELIGIBLE") for m in first_data["matches"])

    # 2. Express interest in NSCLC protocol & confirm persistence
    interest_resp = client.post(
        "/api/v1/patient/interest",
        json={"protocol_id": "PS-ONC-2026-001"},
        headers=p_headers,
    )
    assert interest_resp.status_code == 200
    interests = client.get("/api/v1/patient/interests", headers=p_headers)
    assert interests.status_code == 200
    assert any(item["protocol_id"] == "PS-ONC-2026-001" for item in interests.json())

    # 3. Doctor loads protocol, simulates funnel, computes retention, applies amendment, verifies audit chain
    doc_tok, _ = _signin("elena.vance@novartis.com", "Novartis2026!")
    d_headers = {"Authorization": f"Bearer {doc_tok}"}

    proto = client.get("/api/v1/protocol/sample").json()
    funnel = client.post(
        "/api/v1/cohort/simulate-funnel",
        json=proto["eligibility"]["structured_filters"],
        headers=d_headers,
    )
    assert funnel.status_code == 200
    eligible_count = funnel.json()["final_eligible_count"]
    assert eligible_count > 0

    ret = client.get(
        f"/api/v1/cohort/retention-curve?enrolled_size={max(10, eligible_count)}&composite_pbi={proto['burden']['composite_pbi_score']}",
        headers=d_headers,
    )
    assert ret.status_code == 200 and len(ret.json()["retention_curve"]) > 0

    amended = client.post(
        "/api/v1/optimizer/apply-amendment",
        json={"protocol": proto, "amendment_id": "AMD-01"},
        headers=d_headers,
    )
    assert amended.status_code == 200

    audit_check = client.get("/api/v1/audit/verify", headers=d_headers)
    assert audit_check.status_code == 200 and audit_check.json()["valid"] is True
