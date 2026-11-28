"""
ProtocolShield Grounded AI Assistant API Routes
Supports welcome payloads, plain-language Q&A, capability introspection, and server-side audio chat.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Literal, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.security import AuthenticatedUser, enforce_rate_limit, get_current_user, get_current_user_optional
from app.engine.assistant_engine import (
    AssistantUnavailableError,
    build_welcome_payload,
    generate_chat_reply,
    generate_voice_reply,
    is_gemini_configured,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["ProtocolShield AI Assistant"])

MAX_AUDIO_BYTES = 6 * 1024 * 1024  # 6 MB ceiling for voice clips
ALLOWED_AUDIO_MIME_TYPES = {
    "audio/webm",
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/ogg",
    "audio/mp4",
    "audio/aac",
}


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=12)
    client_context: dict[str, Any] = Field(default_factory=dict)


@router.get("/status")
async def get_assistant_status(
    current_user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
):
    """
    Reports AI Assistant & Voice capabilities truthfully without leaking API keys.
    Returns personalized role greeting when called with a valid Bearer session.
    """
    llm_ready = is_gemini_configured()
    payload: dict[str, Any] = {
        "status": "operational",
        "mode": "gemini" if llm_ready else "local_knowledge_base",
        "llm_configured": llm_ready,
        "model": settings.GEMINI_MODEL if llm_ready else None,
        "voice_browser_supported": True,
        "voice_server_audio_supported": llm_ready,
    }
    if current_user:
        welcome = build_welcome_payload(current_user.name, current_user.role)
        payload["welcome"] = welcome
    return payload


@router.post(
    "/chat",
    dependencies=[Depends(enforce_rate_limit(max_requests=30, window_seconds=60, prefix="assistant_chat"))],
)
async def assistant_chat(
    payload: AssistantChatRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Answers questions about clinical trial terms (ECOG, eGFR, PBI, FDORA, 21 CFR Part 11, etc.)
    and ProtocolShield workflows using verified project facts and optional Gemini reasoning.
    """
    history_list = [{"role": h.role, "content": h.content} for h in payload.history]
    result = await run_in_threadpool(
        generate_chat_reply,
        payload.message,
        current_user.name,
        current_user.role,
        history_list,
        payload.client_context,
    )
    return {
        "success": True,
        **result,
    }


@router.post(
    "/voice-chat",
    dependencies=[Depends(enforce_rate_limit(max_requests=15, window_seconds=60, prefix="assistant_voice"))],
)
async def assistant_voice_chat(
    audio: UploadFile = File(...),
    client_context: str = Form(default="{}"),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Accepts recorded browser audio and returns a grounded transcription + spoken reply
    when GEMINI_API_KEY is configured on the server.
    """
    raw_mime = (audio.content_type or "audio/webm").split(";")[0].strip().lower()
    if raw_mime not in ALLOWED_AUDIO_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format '{raw_mime}'. Use WebM, WAV, MP3, OGG, or MP4 audio.",
        )

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio clip is empty.",
        )
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Audio recording exceeds the 6 MB maximum limit.",
        )

    parsed_ctx: dict[str, Any] = {}
    if client_context:
        try:
            loaded = json.loads(client_context)
            if isinstance(loaded, dict):
                parsed_ctx = loaded
        except Exception:
            parsed_ctx = {}

    try:
        result = await run_in_threadpool(
            generate_voice_reply,
            audio_bytes,
            raw_mime,
            current_user.name,
            current_user.role,
            parsed_ctx,
        )
    except AssistantUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except Exception as exc:
        logger.warning("Assistant voice processing failed (%s).", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to process audio clip cleanly right now. Try typing or using browser speech mode.",
        )

    return {
        "success": True,
        **result,
    }
