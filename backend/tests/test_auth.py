"""
ProtocolShield Authentication Endpoints Unit Tests
Tests signup, signin, forgot-password, and demo user verification.
"""
from fastapi.testclient import TestClient
from app.main import app

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
    assert "token" in data


def test_signin_invalid_password():
    payload = {
        "email": "elena.vance@novartis.com",
        "password": "WrongPassword!"
    }
    resp = client.post("/api/v1/auth/signin", json=payload)
    assert resp.status_code == 401


def test_signup_and_signin_new_user():
    import uuid
    random_email = f"test.user.{uuid.uuid4().hex[:6]}@astrazeneca.com"
    signup_payload = {
        "name": "Dr. Clara Oswald",
        "email": random_email,
        "password": "ValidPassword2026!",
        "role": "Global Study Director",
        "organization": "AstraZeneca Oncology"
    }
    resp = client.post("/api/v1/auth/signup", json=signup_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["user"]["email"] == random_email.lower()

    # Now sign in with newly created account
    signin_payload = {
        "email": random_email,
        "password": "ValidPassword2026!"
    }
    si_resp = client.post("/api/v1/auth/signin", json=signin_payload)
    assert si_resp.status_code == 200
    assert si_resp.json()["user"]["name"] == "Dr. Clara Oswald"


def test_forgot_password():
    import uuid
    random_email = f"reset.user.{uuid.uuid4().hex[:6]}@roche.com"
    # First sign up
    client.post("/api/v1/auth/signup", json={
        "name": "Dr. Gregory House",
        "email": random_email,
        "password": "OldPassword123!",
        "role": "Chief of Diagnostics",
        "organization": "Roche"
    })

    # Reset password
    reset_resp = client.post("/api/v1/auth/forgot-password", json={
        "email": random_email,
        "new_password": "NewSecretPassword2026!"
    })
    assert reset_resp.status_code == 200
    assert reset_resp.json()["success"] is True

    # Sign in with new password
    si_resp = client.post("/api/v1/auth/signin", json={
        "email": random_email,
        "password": "NewSecretPassword2026!"
    })
    assert si_resp.status_code == 200
