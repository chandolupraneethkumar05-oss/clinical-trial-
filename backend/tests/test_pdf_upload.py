"""
Unit tests for ProtocolShield PDF Parser & Upload Endpoints
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.engine.pdf_parser import ProtocolPDFParser

client = TestClient(app)


def test_sample_protocol_templates():
    for ptype in ["nsclc", "tnbc", "myeloma"]:
        res = client.get(f"/api/v1/protocol/sample/{ptype}")
        assert res.status_code == 200
        data = res.json()
        assert "protocol_id" in data
        assert len(data["visits"]) > 0
        assert data["burden"]["composite_pbi_score"] > 0
        assert "inclusion_criteria" in data["eligibility"]


def test_sample_protocol_invalid_type():
    res = client.get("/api/v1/protocol/sample/invalid_study_type")
    assert res.status_code == 404


def test_pdf_parser_fallback_on_corrupt():
    parser = ProtocolPDFParser()
    result = parser.parse(b"corrupt non-pdf bytes", "corrupt.pdf")
    assert result.protocol_id.startswith("PS-EXT-")
    assert len(result.visits) >= 3
    assert result.burden is not None


def test_pdf_upload_non_pdf_rejected():
    # 1. Unauthenticated request rejected with 401
    unauth_res = client.post(
        "/api/v1/protocol/upload",
        files={"file": ("notes.txt", b"plain text", "text/plain")}
    )
    assert unauth_res.status_code == 401

    # 2. Authenticated doctor request rejected with 400 (not a PDF)
    login_resp = client.post("/api/v1/auth/signin", json={
        "email": "elena.vance@novartis.com",
        "password": "Novartis2026!"
    })
    token = login_resp.json()["token"]
    res = client.post(
        "/api/v1/protocol/upload",
        files={"file": ("notes.txt", b"plain text", "text/plain")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 400
    assert "Only PDF files are accepted" in res.json()["detail"]
