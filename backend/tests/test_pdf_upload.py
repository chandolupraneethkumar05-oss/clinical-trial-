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


def test_pdf_parser_uses_gemini_semantic_extraction_when_non_tabular(monkeypatch):
    import json
    import sys
    import types
    import pymupdf
    from app.core.config import settings

    # Build a prose-only PDF without structured table borders or explicit week markers
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 60), "A Phase 3 Multicenter Study evaluating TargetX in Refractory Metastatic NSCLC.")
    page.insert_text((50, 80), "Patients must be adults at least 18 years old with ECOG 0 or 1 and eGFR >= 50.")
    page.insert_text((50, 100), "Participants visit at screening before Cycle 1 baseline, then return for cycle 2")
    page.insert_text((50, 120), "infusions and repeat radiographic imaging with safety monitoring over 52 weeks.")
    pdf_bytes = doc.tobytes()
    doc.close()

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-fake-gemini-key")

    class _FakeModels:
        def generate_content(self, *, model, contents, config):
            return types.SimpleNamespace(
                text=json.dumps({
                    "title": "Phase 3 Study evaluating TargetX in Refractory Metastatic NSCLC",
                    "phase": "Phase III",
                    "indication": "Non-Small Cell Lung Cancer (NSCLC)",
                    "inclusion_criteria": ["Age >= 18", "ECOG 0-1", "eGFR >= 50 mL/min"],
                    "exclusion_criteria": ["Untreated active CNS metastases"],
                    "min_age": 18,
                    "max_age": None,
                    "min_egfr": 50.0,
                    "max_ecog": 1,
                    "allow_stable_brain_mets": True,
                    "visits": [
                        {"visit_name": "Screening", "week_number": -2, "procedure_keys": ["vitals", "safety_labs", "ct_scan"]},
                        {"visit_name": "Cycle 1 Day 1", "week_number": 0, "procedure_keys": ["vitals", "iv_infusion"]},
                        {"visit_name": "Cycle 2 Day 1", "week_number": 6, "procedure_keys": ["vitals", "safety_labs", "ct_scan"]},
                    ],
                })
            )

    class _FakeClient:
        def __init__(self, api_key: str, **kwargs):
            self.models = _FakeModels()

    class _FakeConfig:
        def __init__(self, **kwargs):
            pass

    class _FakeHttpOptions:
        def __init__(self, **kwargs):
            pass

    fake_google = types.ModuleType("google")
    fake_genai = types.ModuleType("google.genai")
    fake_types = types.ModuleType("google.genai.types")
    fake_genai.Client = _FakeClient
    fake_types.GenerateContentConfig = _FakeConfig
    fake_types.HttpOptions = _FakeHttpOptions
    fake_google.genai = fake_genai
    fake_genai.types = fake_types
    monkeypatch.setitem(sys.modules, "google", fake_google)
    monkeypatch.setitem(sys.modules, "google.genai", fake_genai)
    monkeypatch.setitem(sys.modules, "google.genai.types", fake_types)

    parsed = ProtocolPDFParser().parse(pdf_bytes, "prose_only_protocol.pdf")
    assert parsed.extraction_status == "gemini_structured"
    assert len(parsed.visits) == 3
    assert parsed.eligibility.structured_filters["min_egfr"] == 50.0
    assert "Semantic extraction via Gemini" in (parsed.extraction_notes or "")


def test_export_dossier_pdf_endpoint():
    sample_proto = client.get("/api/v1/protocol/sample").json()
    payload = {
        "protocol": sample_proto,
        "funnel_data": {
            "total_population": 10000,
            "final_eligible_count": 531,
            "overall_yield_percentage": 5.31,
            "screen_failure_rate": 94.7,
            "funnel_stages": [{"stage": "Total", "count": 10000, "pass_rate": 100.0}],
        },
        "total_cohort_size": 10000,
        "applied_amendment_ids": ["AMD-01"],
    }

    # Unauthenticated -> 401
    unauth = client.post("/api/v1/protocol/export-dossier", json=payload)
    assert unauth.status_code == 401

    # Patient -> 403
    pat_tok = client.post(
        "/api/v1/auth/signin",
        json={"email": "john.miller@patient.org", "password": "Patient2026!"},
    ).json()["token"]
    pat_resp = client.post(
        "/api/v1/protocol/export-dossier",
        json=payload,
        headers={"Authorization": f"Bearer {pat_tok}"},
    )
    assert pat_resp.status_code == 403

    # Doctor -> 200 valid PDF binary
    doc_tok = client.post(
        "/api/v1/auth/signin",
        json={"email": "elena.vance@novartis.com", "password": "Novartis2026!"},
    ).json()["token"]
    doc_resp = client.post(
        "/api/v1/protocol/export-dossier",
        json=payload,
        headers={"Authorization": f"Bearer {doc_tok}"},
    )
    assert doc_resp.status_code == 200
    assert doc_resp.headers["content-type"].startswith("application/pdf")
    assert doc_resp.content.startswith(b"%PDF")
    assert len(doc_resp.content) > 1000


def test_tnbc_dossier_pdf_sanitizes_unicode_for_helvetica():
    import pymupdf as fitz

    tnbc_proto = client.get("/api/v1/protocol/sample/tnbc").json()
    doc_tok = client.post(
        "/api/v1/auth/signin",
        json={"email": "elena.vance@novartis.com", "password": "Novartis2026!"},
    ).json()["token"]

    resp = client.post(
        "/api/v1/protocol/export-dossier",
        json={
            "protocol": tnbc_proto,
            "funnel_data": None,
            "total_cohort_size": 10000,
            "applied_amendment_ids": [],
        },
        headers={"Authorization": f"Bearer {doc_tok}"},
    )
    assert resp.status_code == 200

    pdf_doc = fitz.open(stream=resp.content, filetype="pdf")
    extracted = "\n".join(page.get_text() for page in pdf_doc)
    pdf_doc.close()

    assert "\u00b7" not in extracted
    assert "Screening -- Baseline" in extracted
    assert "Subscores -> Temporal:" in extracted


def test_protocol_templates_endpoint():
    resp = client.get("/api/v1/protocol/templates")
    assert resp.status_code == 200
    body = resp.json()
    assert body["max_pdf_upload_mb"] == 25
    templates = body["templates"]
    assert [t["type"] for t in templates] == ["nsclc", "tnbc", "myeloma"]
    by_type = {t["type"]: t for t in templates}
    assert by_type["nsclc"]["extracted_page_count"] == 148
    assert by_type["tnbc"]["extracted_page_count"] == 112
    assert by_type["myeloma"]["extracted_page_count"] == 187
    assert by_type["myeloma"]["visit_count"] == 12
