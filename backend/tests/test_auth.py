"""
ProtocolShield Authentication & Security Endpoints Unit Tests
Tests signup, signin, secure 2-step forgot-password workflow, JWT tokens, and /me endpoint.
"""
from fastapi.testclient import TestClient
from app.main import app
import uuid

client = TestClient(app)


def test_signin_demo_user():
    payload = {
        "email": "elena.vance@novartis.com",
        "password": "Novartis2026!"
    }
    resp = client.post("/api/v1/auth/signin", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["user"]["name"] == "Dr. Elena Vance"
    assert data["user"]["role"] in ["doctor", "investigator"]
    assert "token" in data
    # Verify JWT structure (header.payload.signature)
    parts = data["token"].split(".")
    assert len(parts) == 3


def test_signin_invalid_password():
    payload = {
        "email": "elena.vance@novartis.com",
        "password": "WrongPassword!"
    }
    resp = client.post("/api/v1/auth/signin", json=payload)
    assert resp.status_code == 401


def test_signup_and_signin_new_user():
    random_email = f"test.user.{uuid.uuid4().hex[:6]}@astrazeneca.com"
    signup_payload = {
        "name": "Dr. Clara Oswald",
        "email": random_email,
        "password": "ValidPassword2026!",
        "role": "doctor",  # Requesting privileged role should be ignored by backend
        "organization": "AstraZeneca Oncology"
    }
    resp = client.post("/api/v1/auth/signup", json=signup_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["user"]["email"] == random_email.lower()
    # Security fix verification: Public signups ALWAYS assign patient role
    assert data["user"]["role"] == "patient"
    assert "token" in data

    # Sign in with newly created account
    signin_payload = {
        "email": random_email,
        "password": "ValidPassword2026!"
    }
    si_resp = client.post("/api/v1/auth/signin", json=signin_payload)
    assert si_resp.status_code == 200
    assert si_resp.json()["user"]["name"] == "Dr. Clara Oswald"
    assert si_resp.json()["user"]["role"] == "patient"


def test_public_signup_cannot_create_admin():
    random_email = f"malicious.admin.{uuid.uuid4().hex[:6]}@adversary.org"
    signup_payload = {
        "name": "Attacker Admin",
        "email": random_email,
        "password": "ValidPassword2026!",
        "role": "admin",  # Attempting privilege escalation
        "organization": "Adversary Org"
    }
    resp = client.post("/api/v1/auth/signup", json=signup_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    # Security fix verification: Admin privilege escalation is strictly blocked
    assert data["user"]["role"] == "patient"


def test_secure_two_step_forgot_password():
    random_email = f"reset.user.{uuid.uuid4().hex[:6]}@roche.com"
    # 1. First sign up user
    client.post("/api/v1/auth/signup", json={
        "name": "Dr. Gregory House",
        "email": random_email,
        "password": "OldPassword123!",
        "role": "doctor",
        "organization": "Roche"
    })

    # 2. Step 1: Request password reset (does not leak email existence)
    req_resp = client.post("/api/v1/auth/forgot-password/request", json={
        "email": random_email
    })
    assert req_resp.status_code == 200
    req_data = req_resp.json()
    assert req_data["success"] is True
    # In dev environment, reset token is provided for verification
    reset_token = req_data.get("dev_reset_token")
    assert reset_token is not None

    # 3. Step 2: Complete reset using single-use token
    reset_resp = client.post("/api/v1/auth/forgot-password/reset", json={
        "token": reset_token,
        "new_password": "NewSecretPassword2026!"
    })
    assert reset_resp.status_code == 200
    assert reset_resp.json()["success"] is True

    # 4. Attempting to reuse the same token must fail
    reuse_resp = client.post("/api/v1/auth/forgot-password/reset", json={
        "token": reset_token,
        "new_password": "AnotherPassword2026!"
    })
    assert reuse_resp.status_code == 400

    # 5. Old password no longer works
    bad_login = client.post("/api/v1/auth/signin", json={
        "email": random_email,
        "password": "OldPassword123!"
    })
    assert bad_login.status_code == 401

    # 6. Sign in succeeds with new password
    good_login = client.post("/api/v1/auth/signin", json={
        "email": random_email,
        "password": "NewSecretPassword2026!"
    })
    assert good_login.status_code == 200
    assert good_login.json()["success"] is True


def test_get_current_user_me_endpoint():
    # Login as demo user
    resp = client.post("/api/v1/auth/signin", json={
        "email": "elena.vance@novartis.com",
        "password": "Novartis2026!"
    })
    token = resp.json()["token"]

    # Valid token
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["user"]["email"] == "elena.vance@novartis.com"
    assert me_data["user"]["role"] in ["doctor", "investigator"]

    # Missing token
    bad_me = client.get("/api/v1/auth/me")
    assert bad_me.status_code == 401

    # Tampered token
    tampered_me = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.jwt.token"})
    assert tampered_me.status_code == 401


def test_jwt_revocation_on_logout():
    # 1. Login to acquire fresh session token
    resp = client.post("/api/v1/auth/signin", json={
        "email": "elena.vance@novartis.com",
        "password": "Novartis2026!"
    })
    assert resp.status_code == 200
    token = resp.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Verify token is active
    me_resp = client.get("/api/v1/auth/me", headers=headers)
    assert me_resp.status_code == 200

    # 3. Call logout endpoint to blacklist token
    logout_resp = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_resp.status_code == 200
    assert logout_resp.json()["success"] is True

    # 4. Attempt to reuse token on /me - must be rejected with 401
    post_logout_me = client.get("/api/v1/auth/me", headers=headers)
    assert post_logout_me.status_code == 401
    assert "terminated or logged out" in post_logout_me.json()["detail"]


def test_sliding_window_rate_limiter():
    from app.core.security import SlidingWindowRateLimiter
    limiter = SlidingWindowRateLimiter()
    test_key = "client-test-ip-123"

    # Allow up to 3 requests
    allowed1, _ = limiter.check(test_key, max_requests=3, window_seconds=60)
    allowed2, _ = limiter.check(test_key, max_requests=3, window_seconds=60)
    allowed3, _ = limiter.check(test_key, max_requests=3, window_seconds=60)
    assert allowed1 is True
    assert allowed2 is True
    assert allowed3 is True

    # 4th request must be blocked
    allowed4, retry_after = limiter.check(test_key, max_requests=3, window_seconds=60)
    assert allowed4 is False
    assert retry_after > 0


def test_cohort_simulator_sql_injection_resilience():
    from app.engine.cohort_simulator import cohort_engine
    from app.models.patient import CohortFilterCriteria

    # Attempt classic SQL injection payload in allowed_stages
    malicious_criteria = CohortFilterCriteria(
        allowed_stages=["Stage IV", "'; DROP TABLE patients; --", "Stage IIIB' OR 1=1 --"]
    )
    # Must execute safely via parameterized query without syntax errors or injection
    result = cohort_engine.simulate_eligibility_funnel(malicious_criteria)
    assert "final_eligible_count" in result
    assert "funnel_stages" in result
    assert result["final_eligible_count"] >= 0
