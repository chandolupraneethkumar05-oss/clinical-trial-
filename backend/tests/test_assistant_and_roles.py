"""
Tests for Role-Separated Auth Hardening, Security Defaults, Permissions-Policy,
and ProtocolShield Grounded AI Assistant (/api/v1/assistant/*).
"""
from __future__ import annotations

import json
import sys
import types
import uuid
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.duckdb_client import db_client
from app.main import app

client = TestClient(app)


def _create_temp_user(email: str, role: str | None, password: str = "ValidPass2026!") -> str:
    user_id = f"usr-test-{uuid.uuid4().hex[:8]}"
    pw_hash = hash_password(password)
    with db_client.transaction() as conn:
        conn.execute(
            """
            INSERT INTO users (id, name, email, password_hash, role, organization, provider, token_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (user_id, "Test Account", email.lower(), pw_hash, role, "Test Org", "email"),
        )
    return user_id


def test_expected_role_enforcement_on_signin():
    patient_email = f"pat.{uuid.uuid4().hex[:6]}@patient.org"
    admin_email = f"adm.{uuid.uuid4().hex[:6]}@iqvia.com"
    _create_temp_user(patient_email, "patient")
    _create_temp_user(admin_email, "admin")

    # Matching expected_role succeeds
    ok_pat = client.post(
        "/api/v1/auth/signin",
        json={"email": patient_email, "password": "ValidPass2026!", "expected_role": "patient"},
    )
    assert ok_pat.status_code == 200
    assert ok_pat.json()["user"]["role"] == "patient"

    # Patient attempting Doctor or Admin login portal is blocked with 403
    bad_pat = client.post(
        "/api/v1/auth/signin",
        json={"email": patient_email, "password": "ValidPass2026!", "expected_role": "doctor"},
    )
    assert bad_pat.status_code == 403
    assert "Role mismatch" in bad_pat.json()["detail"]

    bad_pat_admin = client.post(
        "/api/v1/auth/signin",
        json={"email": patient_email, "password": "ValidPass2026!", "expected_role": "admin"},
    )
    assert bad_pat_admin.status_code == 403

    # Admin succeeds on admin portal, rejected on patient portal
    ok_adm = client.post(
        "/api/v1/auth/signin",
        json={"email": admin_email, "password": "ValidPass2026!", "expected_role": "admin"},
    )
    assert ok_adm.status_code == 200
    assert ok_adm.json()["user"]["role"] == "admin"

    bad_adm = client.post(
        "/api/v1/auth/signin",
        json={"email": admin_email, "password": "ValidPass2026!", "expected_role": "patient"},
    )
    assert bad_adm.status_code == 403

    # Invalid expected_role fails schema validation cleanly
    bad_schema = client.post(
        "/api/v1/auth/signin",
        json={"email": patient_email, "password": "ValidPass2026!", "expected_role": "superuser"},
    )
    assert bad_schema.status_code == 422


def test_null_or_empty_db_role_defaults_to_patient_not_doctor():
    null_email = f"nullrole.{uuid.uuid4().hex[:6]}@example.org"
    uid = _create_temp_user(null_email, "")
    token = create_access_token({"sub": uid, "email": null_email, "name": "Null Role", "role": "doctor", "token_version": 1})

    # security.get_current_user reads DB role ("" -> defaults fail-safe to "patient", never "doctor")
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["user"]["role"] == "patient"

    # Doctor/Admin-only endpoints deny this user cleanly
    users_resp = client.get("/api/v1/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert users_resp.status_code == 403


def test_permissions_policy_allows_same_origin_microphone():
    resp = client.get("/health")
    assert resp.status_code == 200
    policy = resp.headers.get("permissions-policy", "")
    assert "microphone=(self)" in policy


def test_assistant_status_and_grounded_local_qna(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    # Unauthenticated status hides PII and reports accurate capability flags
    anon_status = client.get("/api/v1/assistant/status")
    assert anon_status.status_code == 200
    anon_data = anon_status.json()
    assert anon_data["mode"] == "local_knowledge_base"
    assert anon_data["llm_configured"] is False
    assert anon_data["voice_browser_supported"] is True
    assert anon_data["voice_server_audio_supported"] is False
    assert "welcome" not in anon_data

    # Chat requires authentication
    unauth_chat = client.post("/api/v1/assistant/chat", json={"message": "What is ECOG?"})
    assert unauth_chat.status_code in (401, 403)

    pat_email = f"guidepat.{uuid.uuid4().hex[:6]}@patient.org"
    uid = _create_temp_user(pat_email, "patient")
    token = create_access_token({"sub": uid, "email": pat_email, "name": "Guide Patient", "role": "patient", "token_version": 1})
    headers = {"Authorization": f"Bearer {token}"}

    # Authenticated status includes role-specific welcome
    auth_status = client.get("/api/v1/assistant/status", headers=headers)
    assert auth_status.status_code == 200
    assert "welcome" in auth_status.json()
    assert "Patient Portal" in auth_status.json()["welcome"]["greeting"]

    # Grounded ECOG query
    ecog_resp = client.post(
        "/api/v1/assistant/chat",
        headers=headers,
        json={"message": "what is the full form of ECOG and why is it important"},
    )
    assert ecog_resp.status_code == 200
    ecog_body = ecog_resp.json()
    assert ecog_body["mode"] == "local_knowledge_base"
    assert "Eastern Cooperative Oncology Group" in ecog_body["reply"]

    # Typo / non-existent acronym GCRGR is honestly clarified as mapping to eGFR
    gcrgr_resp = client.post(
        "/api/v1/assistant/chat",
        headers=headers,
        json={"message": "what is the full form of GCRGR"},
    )
    assert gcrgr_resp.status_code == 200
    gcrgr_body = gcrgr_resp.json()
    assert "eGFR" in gcrgr_body["reply"]
    assert "Estimated Glomerular Filtration Rate" in gcrgr_body["reply"]
    assert "not a standard clinical acronym" in gcrgr_body["reply"]

    # Project purpose question
    why_resp = client.post(
        "/api/v1/assistant/chat",
        headers=headers,
        json={"message": "why and what is the use of this project"},
    )
    assert why_resp.status_code == 200
    assert "ProtocolShield" in why_resp.json()["reply"]

    # Out-of-scope / unknown prompt refuses to hallucinate
    unknown_resp = client.post(
        "/api/v1/assistant/chat",
        headers=headers,
        json={"message": "xyzzyqwerty998877 nonexistent"},
    )
    assert unknown_resp.status_code == 200
    assert "don't have a verified entry" in unknown_resp.json()["reply"]

    # Voice-chat endpoint returns 503 honestly when GEMINI_API_KEY is empty
    voice_no_key = client.post(
        "/api/v1/assistant/voice-chat",
        headers=headers,
        files={"audio": ("clip.webm", b"fake-audio-bytes", "audio/webm")},
    )
    assert voice_no_key.status_code == 503


def test_assistant_gemini_mocked_chat_and_voice_validation(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-fake-gemini-key")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")

    class _FakeModels:
        def generate_content(self, *, model, contents, config):
            if isinstance(contents, list):
                payload = {"transcript": "What is ECOG?", "reply": "ECOG measures a patient's daily activity score cleanly."}
                return types.SimpleNamespace(text=json.dumps(payload))
            return types.SimpleNamespace(text="Gemini explanation: PBI measures temporal, invasive, and cognitive burden.")

    class _FakeClient:
        def __init__(self, api_key: str):
            assert api_key == "test-fake-gemini-key"
            self.models = _FakeModels()

    class _FakePart:
        @staticmethod
        def from_bytes(*, data: bytes, mime_type: str):
            return {"data": len(data), "mime_type": mime_type}

        @staticmethod
        def from_text(*, text: str):
            return {"text": text}

    class _FakeGenerateContentConfig:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    fake_google = types.ModuleType("google")
    fake_genai = types.ModuleType("google.genai")
    fake_types = types.ModuleType("google.genai.types")
    fake_genai.Client = _FakeClient
    fake_types.Part = _FakePart
    fake_types.GenerateContentConfig = _FakeGenerateContentConfig
    fake_google.genai = fake_genai
    fake_genai.types = fake_types

    monkeypatch.setitem(sys.modules, "google", fake_google)
    monkeypatch.setitem(sys.modules, "google.genai", fake_genai)
    monkeypatch.setitem(sys.modules, "google.genai.types", fake_types)

    doc_email = f"guidedoc.{uuid.uuid4().hex[:6]}@novartis.com"
    uid = _create_temp_user(doc_email, "doctor")
    token = create_access_token({"sub": uid, "email": doc_email, "name": "Guide Doctor", "role": "doctor", "token_version": 1})
    headers = {"Authorization": f"Bearer {token}"}

    chat_resp = client.post(
        "/api/v1/assistant/chat",
        headers=headers,
        json={"message": "Explain PBI"},
    )
    assert chat_resp.status_code == 200
    assert chat_resp.json()["mode"] == "gemini"
    assert "Gemini explanation" in chat_resp.json()["reply"]

    voice_resp = client.post(
        "/api/v1/assistant/voice-chat",
        headers=headers,
        files={"audio": ("question.webm", b"RIFF0000WAVE", "audio/webm")},
    )
    assert voice_resp.status_code == 200
    v_body = voice_resp.json()
    assert v_body["mode"] == "gemini_audio"
    assert v_body["transcript"] == "What is ECOG?"
    assert "ECOG measures" in v_body["reply"]

    # Bad MIME rejected with 400
    bad_mime = client.post(
        "/api/v1/assistant/voice-chat",
        headers=headers,
        files={"audio": ("bad.txt", b"hello", "text/plain")},
    )
    assert bad_mime.status_code == 400

    # Oversized audio (> 6MB) rejected with 413
    too_big = client.post(
        "/api/v1/assistant/voice-chat",
        headers=headers,
        files={"audio": ("huge.webm", b"x" * (6 * 1024 * 1024 + 10), "audio/webm")},
    )
    assert too_big.status_code == 413


def test_assistant_conversational_adaptation_history_and_live_db_facts(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    from app.engine.assistant_engine import get_live_platform_facts

    facts = get_live_platform_facts()
    assert isinstance(facts["cohort_patient_count"], int)
    assert facts["cohort_patient_count"] >= 1000
    assert facts["cohort_averages"]["age_years"] is not None
    assert facts["cohort_averages"]["egfr_ml_min"] is not None
    assert facts["cohort_averages"]["distance_miles"] is not None

    doc_email = f"convdoc.{uuid.uuid4().hex[:6]}@novartis.com"
    uid = _create_temp_user(doc_email, "doctor")
    token = create_access_token(
        {"sub": uid, "email": doc_email, "name": "Conversational Doctor", "role": "doctor", "token_version": 1}
    )
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Live DuckDB stats query
    live_resp = client.post(
        "/api/v1/assistant/chat",
        headers=headers,
        json={"message": "how many synthetic patients are in the database right now?"},
    )
    assert live_resp.status_code == 200
    live_reply = live_resp.json()["reply"]
    assert f"{facts['cohort_patient_count']:,}" in live_reply

    # 2. Advantage in one line -> concise 1-sentence answer focused on advantages
    adv_one_line = client.post(
        "/api/v1/assistant/chat",
        headers=headers,
        json={"message": "What is the advantage of this project in one line?"},
    )
    assert adv_one_line.status_code == 200
    adv_text = adv_one_line.json()["reply"].strip()
    assert "\n-" not in adv_text
    assert len(adv_text) < 280
    assert adv_text.count(". ") <= 1

    # 3. Multi-turn follow-up: "What is the use of this project?" -> "Summarize it" / "Give it in a small paragraph"
    turn1 = client.post(
        "/api/v1/assistant/chat",
        headers=headers,
        json={"message": "What is the use of this project?"},
    )
    assert turn1.status_code == 200
    turn1_reply = turn1.json()["reply"]

    history = [
        {"role": "user", "content": "What is the use of this project?"},
        {"role": "assistant", "content": turn1_reply},
    ]

    turn2_summary = client.post(
        "/api/v1/assistant/chat",
        headers=headers,
        json={"message": "Summarize it", "history": history},
    )
    assert turn2_summary.status_code == 200
    summary_reply = turn2_summary.json()["reply"]
    assert summary_reply != turn1_reply
    assert "ProtocolShield" in summary_reply or "trial" in summary_reply.lower()

    turn2_para = client.post(
        "/api/v1/assistant/chat",
        headers=headers,
        json={"message": "Give it in a small paragraph", "history": history},
    )
    assert turn2_para.status_code == 200
    para_reply = turn2_para.json()["reply"]
    assert para_reply != turn1_reply
    assert "\n-" not in para_reply
    assert len(para_reply) >= 80

    # 4. Self-role question in one line ("what is the use of you in one line?")
    self_one_line = client.post(
        "/api/v1/assistant/chat",
        headers=headers,
        json={"message": "what is the use of you in one line?"},
    )
    assert self_one_line.status_code == 200
    self_reply = self_one_line.json()["reply"].strip()
    assert "\n-" not in self_reply
    assert "guide" in self_reply.lower() or "explain" in self_reply.lower()
    assert len(self_reply) < 260
