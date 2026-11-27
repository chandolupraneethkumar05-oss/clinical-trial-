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


def test_pdf_parser_extracts_structured_soa_table_and_tnbc_biomarkers():
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 50), "A Phase 2 Study of ADC Therapy in Triple-Negative Breast Cancer (TNBC)")
    page.insert_text((50, 80), "Inclusion Criteria:")
    page.insert_text((60, 100), "1. Age >= 18 and <= 75 years with histologically confirmed TNBC (ER-, PR-, HER2-).")
    page.insert_text((60, 118), "2. ECOG performance status <= 1 and eGFR >= 50 mL/min/1.73m2.")
    page.insert_text((50, 140), "Exclusion Criteria:")
    page.insert_text((60, 158), "1. Untreated or active brain metastases.")

    # Draw a crisp 4-column Schedule of Assessments grid for pdfplumber table detection
    x_cols = [50, 180, 270, 360, 450, 540]
    y_rows = [200, 225, 250, 275, 300]
    for y in y_rows:
        page.draw_line((x_cols[0], y), (x_cols[-1], y))
    for x in x_cols:
        page.draw_line((x, y_rows[0]), (x, y_rows[-1]))

    headers = ["Procedure", "Screening", "C1D1", "C3D1", "Week 12"]
    rows = [
        ["Vital Signs", "X", "X", "X", "X"],
        ["Safety Labs", "X", "X", "X", "X"],
        ["CT Scan", "X", "", "X", "X"],
        ["ctDNA Liquid Biopsy", "X", "", "", "X"],
    ]
    for c_idx, h in enumerate(headers):
        page.insert_text((x_cols[c_idx] + 6, y_rows[0] + 16), h)
    for r_idx, row_vals in enumerate(rows, start=1):
        for c_idx, cell_text in enumerate(row_vals):
            if cell_text:
                page.insert_text((x_cols[c_idx] + 6, y_rows[r_idx] + 16), cell_text)

    pdf_bytes = doc.tobytes()
    doc.close()

    parser = ProtocolPDFParser()
    parsed = parser.parse(pdf_bytes, "tnbc_soa_grid.pdf")
    assert parsed.extraction_status == "extracted"
    assert len(parsed.visits) == 4
    assert parsed.eligibility.structured_filters["min_egfr"] == 50.0
    assert parsed.eligibility.structured_filters["target_biomarker_her2_negative"] is True
    assert parsed.eligibility.structured_filters["target_biomarker_hormone_receptor_negative"] is True
    assert len(parsed.eligibility.criteria) >= 3
    assert any(c.validation_status == "VALIDATED" and c.extraction_confidence >= 0.9 for c in parsed.eligibility.criteria)
