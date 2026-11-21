"""
ProtocolShield Role-Based Access Control (RBAC) & Patient Eligibility Screening Unit Tests
Validates role permissions, Bcrypt cryptographic hashing, JWT security, and patient matching engine.
"""
from fastapi.testclient import TestClient
from fastapi import HTTPException
from app.main import app
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token
from datetime import timedelta
import pytest
import hashlib

client = TestClient(app)


def test_bcrypt_cryptography_and_migration():
    password = "SuperSecurePassword2026!"
    pw_hash = hash_password(password)
    assert pw_hash.startswith("$2b$")

    # Verify password with bcrypt
    valid, needs_mig = verify_password(password, pw_hash)
    assert valid is True
    assert needs_mig is False

    # Verify invalid password fails
    invalid, _ = verify_password("WrongPassword!", pw_hash)
    assert invalid is False

    # Test legacy SHA-256 automatic migration detection
    legacy_sha256 = hashlib.sha256(password.encode("utf-8")).hexdigest()
    valid_leg, needs_mig_leg = verify_password(password, legacy_sha256)
    assert valid_leg is True
    assert needs_mig_leg is True  # Flags that hash needs migration to Bcrypt


def test_jwt_claims_and_expiration():
    claims = {
        "sub": "user-test-123",
        "email": "sarah.jenkins@iqvia.com",
        "name": "Sarah Jenkins",
        "role": "admin"
    }
    token = create_access_token(claims, expires_delta=timedelta(minutes=60))
    assert isinstance(token, str)

    # Decode valid token
    decoded = decode_access_token(token)
    assert decoded["sub"] == "user-test-123"
    assert decoded["email"] == "sarah.jenkins@iqvia.com"
    assert decoded["role"] == "admin"

    # Expired token test (expires immediately)
    expired_token = create_access_token(claims, expires_delta=timedelta(minutes=-5))
    with pytest.raises(HTTPException) as excinfo:
        decode_access_token(expired_token)
    assert excinfo.value.status_code == 401

    # Tampered token test
    tampered = token[:-4] + "xyz1"
    with pytest.raises(HTTPException) as excinfo:
        decode_access_token(tampered)
    assert excinfo.value.status_code == 401


def test_patient_eligibility_screening_endpoint():
    payload = {
        "patient_id": "PT-TEST-001",
        "age": 62,
        "cancer_stage": "Stage IV (Oligometastatic)",
        "ecog_score": 1,
        "egfr_ml_min": 52.0,
        "distance_to_center_miles": 24.0,
        "has_stable_brain_mets": True,
        "anc": 1850.0,
        "platelets": 165.0,
        "hemoglobin": 11.4,
        "total_bilirubin": 1.1,
        "prior_lines": 0
    }

    resp = client.post("/api/v1/patient/screen-eligibility", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "matches" in data
    assert "recruitment_support_summary" in data
    assert len(data["matches"]) >= 1

    # Inspect first match (NSCLC)
    nsclc_match = next((m for m in data["matches"] if "NSCLC" in m["protocol_id"]), data["matches"][0])
    assert nsclc_match["protocol_id"] is not None
    assert nsclc_match["match_status"] in ["ELIGIBLE", "BORDERLINE", "INELIGIBLE"]
    assert "criteria_breakdown" in nsclc_match
    assert len(nsclc_match["criteria_breakdown"]) >= 5

    # Check criteria breakdown includes eGFR, ECOG, Brain Mets
    criteria_names = [c["criterion"] for c in nsclc_match["criteria_breakdown"]]
    assert any("eGFR" in name for name in criteria_names)
    assert any("ECOG" in name for name in criteria_names)

    # Check burden summary is attached
    burden = nsclc_match["patient_burden_summary"]
    assert "pbi_score" in burden
    assert "attrition_risk_tier" in burden
    assert "total_study_visits" in burden
    assert "telehealth_eligible_visits" in burden


def test_patient_role_screening_with_auth_token():
    # Login as patient John Miller
    login_resp = client.post("/api/v1/auth/signin", json={
        "email": "john.miller@patient.org",
        "password": "Patient2026!"
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["token"]
    user_role = login_resp.json()["user"]["role"]
    assert user_role == "patient"

    # Call patient screening with John's token
    screen_resp = client.post(
        "/api/v1/patient/screen-eligibility",
        json={
            "patient_id": "PT-JOHN-MILLER",
            "age": 64,
            "cancer_stage": "Stage IIIB",
            "ecog_score": 1,
            "egfr_ml_min": 58.0,
            "distance_to_center_miles": 15.0,
            "has_stable_brain_mets": False,
            "anc": 2100.0,
            "platelets": 180.0,
            "hemoglobin": 12.1,
            "total_bilirubin": 0.9,
            "prior_lines": 1
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert screen_resp.status_code == 200
    assert len(screen_resp.json()["matches"]) > 0
