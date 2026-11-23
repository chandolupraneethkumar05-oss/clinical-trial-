"""
ProtocolShield Enterprise Authentication & Identity API Routes
Implements Bcrypt adaptive password hashing, JWT Bearer tokens,
role-based access control (RBAC), and 2-step single-use password resets.
"""
import uuid
import secrets
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.db.duckdb_client import db_client
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    AuthenticatedUser,
)

router = APIRouter(prefix="/auth", tags=["Enterprise Authentication"])


# ── Canonical Role Constants ────────────────────────────────────────────────
ROLE_PATIENT = "patient"
ROLE_DOCTOR = "doctor"
ROLE_ADMIN = "admin"
VALID_ROLES = {ROLE_PATIENT, ROLE_DOCTOR, ROLE_ADMIN}


_demo_seeded = False


def seed_default_users_if_empty():
    """Seeds or synchronizes verified demo profiles across all three roles."""
    global _demo_seeded
    if _demo_seeded:
        return

    conn = db_client.get_connection()
    try:
        existing_count = conn.execute(
            "SELECT count(*) FROM users WHERE email IN ('elena.vance@novartis.com', 'marcus.chen@mskcc.org', 'sarah.jenkins@iqvia.com', 'john.miller@patient.org')"
        ).fetchone()[0]
        if existing_count == 4:
            _demo_seeded = True
            return

        demo_users = [
            (
                "usr-demo-001",
                "Dr. Elena Vance",
                "elena.vance@novartis.com",
                hash_password("Novartis2026!"),
                ROLE_DOCTOR,
                "Novartis Oncology",
                "email"
            ),
            (
                "usr-demo-002",
                "Dr. Marcus Chen",
                "marcus.chen@mskcc.org",
                hash_password("MSKCC2026!"),
                ROLE_DOCTOR,
                "Memorial Sloan Kettering",
                "email"
            ),
            (
                "usr-demo-003",
                "Sarah Jenkins, RAC",
                "sarah.jenkins@iqvia.com",
                hash_password("IQVIA2026!"),
                ROLE_ADMIN,
                "IQVIA Biotech & Regulatory Governance",
                "email"
            ),
            (
                "usr-demo-004",
                "John Miller",
                "john.miller@patient.org",
                hash_password("Patient2026!"),
                ROLE_PATIENT,
                "Clinical Trial Volunteer Cohort",
                "email"
            )
        ]
        for user_id, name, email, pw_hash, role, org, provider in demo_users:
            existing = conn.execute("SELECT id FROM users WHERE email = ?", [email]).fetchone()
            if existing:
                conn.execute(
                    "UPDATE users SET role = ?, password_hash = ? WHERE email = ?",
                    [role, pw_hash, email]
                )
            else:
                conn.execute(
                    "INSERT INTO users (id, name, email, password_hash, role, organization, provider) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [user_id, name, email, pw_hash, role, org, provider]
                )
    finally:
        conn.close()


# ── Request / Response Schemas ───────────────────────────────────────────────

class AuthUserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    organization: Optional[str] = None
    provider: str = "email"


class SignUpRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=5, max_length=150)
    password: str = Field(..., min_length=8)
    role: Optional[str] = Field(default=ROLE_DOCTOR, description="'patient' | 'doctor' | 'admin'")
    organization: Optional[str] = "Clinical Trial Sponsor / CRO"


class SignInRequest(BaseModel):
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=1)


class ForgotPasswordInitRequest(BaseModel):
    email: str = Field(..., min_length=5)


class ForgotPasswordResetRequest(BaseModel):
    token: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8)


class GoogleSignInRequest(BaseModel):
    id_token: str = Field(..., min_length=10)


class AuthResponse(BaseModel):
    success: bool
    user: AuthUserResponse
    token: str
    message: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=AuthResponse)
async def signup(payload: SignUpRequest):
    """Registers a new user account with Bcrypt password hashing and returns a signed JWT."""
    seed_default_users_if_empty()

    # Security: Public registration ALWAYS creates patient accounts.
    # Role values submitted by the client are intentionally ignored.
    # Doctors must be promoted by an admin; admins are provisioned separately.
    assigned_role = ROLE_PATIENT

    conn = db_client.get_connection()
    try:
        clean_email = payload.email.strip().lower()
        existing = conn.execute("SELECT id FROM users WHERE lower(email) = ?", (clean_email,)).fetchone()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email address is already registered."
            )

        user_id = f"usr-{uuid.uuid4().hex[:8]}"
        pwd_hash = hash_password(payload.password)
        conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, organization, provider) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, payload.name.strip(), clean_email, pwd_hash, assigned_role, payload.organization, "email")
        )
        logger.info("New patient account created: user_id=%s", user_id)

        user_obj = AuthUserResponse(
            id=user_id,
            name=payload.name.strip(),
            email=clean_email,
            role=assigned_role,
            organization=payload.organization,
            provider="email"
        )

        token = create_access_token({
            "sub": user_id,
            "email": clean_email,
            "name": user_obj.name,
            "role": assigned_role
        })

        return AuthResponse(
            success=True,
            user=user_obj,
            token=token,
            message="Account successfully created."
        )
    finally:
        conn.close()


@router.post("/signin", response_model=AuthResponse)
async def signin(payload: SignInRequest):
    """Authenticates credentials against Bcrypt (with legacy SHA-256 upgrade) and returns signed JWT."""
    seed_default_users_if_empty()
    conn = db_client.get_connection()
    try:
        clean_email = payload.email.strip().lower()
        user_row = conn.execute(
            "SELECT id, name, email, password_hash, role, organization, provider FROM users WHERE lower(email) = ?",
            (clean_email,)
        ).fetchone()

        if not user_row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid work email or password."
            )

        user_id, name, email, stored_hash, role, org, provider = user_row
        is_valid, needs_rehash = verify_password(payload.password, stored_hash)

        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid work email or password."
            )

        # Transparently upgrade legacy SHA-256 hashes to Bcrypt upon successful authentication
        if needs_rehash:
            new_hash = hash_password(payload.password)
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))

        user_role = (role or ROLE_PATIENT).lower().strip()
        user_obj = AuthUserResponse(
            id=user_id,
            name=name,
            email=email,
            role=user_role,
            organization=org,
            provider=provider or "email"
        )

        token = create_access_token({
            "sub": user_id,
            "email": email,
            "name": name,
            "role": user_role
        })

        return AuthResponse(
            success=True,
            user=user_obj,
            token=token,
            message="Institutional authentication verified."
        )
    finally:
        conn.close()


@router.post("/forgot-password/request")
async def forgot_password_request(payload: ForgotPasswordInitRequest):
    """
    Step 1: Secure password reset initiation.
    Issues a time-limited (15m), single-use cryptographic token.
    Always returns a generic message to prevent email enumeration.
    """
    seed_default_users_if_empty()
    conn = db_client.get_connection()
    try:
        clean_email = payload.email.strip().lower()
        user_row = conn.execute("SELECT id FROM users WHERE lower(email) = ?", (clean_email,)).fetchone()

        dev_token_display = None
        if user_row:
            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
            reset_id = f"rst-{uuid.uuid4().hex[:8]}"
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES)

            # Invalidate any prior unused tokens for this email
            conn.execute("UPDATE password_resets SET used = TRUE WHERE lower(email) = ?", (clean_email,))
            conn.execute(
                "INSERT INTO password_resets (id, email, token_hash, expires_at, used) VALUES (?, ?, ?, ?, FALSE)",
                (reset_id, clean_email, token_hash, expires_at)
            )

            # In development/hackathon mode, provide the token for verification without a mail server
            if settings.ENVIRONMENT == "development" or settings.DEBUG:
                dev_token_display = raw_token

        resp = {
            "success": True,
            "message": "If an account with that email address is registered, instructions to reset your password have been issued."
        }
        if dev_token_display:
            resp["dev_reset_token"] = dev_token_display
            resp["dev_note"] = "Local Hackathon Development Mode: Token displayed for testing self-service reset."

        return resp
    finally:
        conn.close()


@router.post("/forgot-password/reset")
async def forgot_password_reset(payload: ForgotPasswordResetRequest):
    """
    Step 2: Consumes the reset token, updates password to Bcrypt hash, and invalidates token.
    """
    seed_default_users_if_empty()
    conn = db_client.get_connection()
    try:
        token_hash = hashlib.sha256(payload.token.strip().encode("utf-8")).hexdigest()
        now = datetime.now(timezone.utc)

        reset_row = conn.execute(
            """
            SELECT id, email, expires_at, used 
            FROM password_resets 
            WHERE token_hash = ? AND used = FALSE
            """,
            (token_hash,)
        ).fetchone()

        if not reset_row:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The password reset token is invalid or has already been used."
            )

        reset_id, email, expires_at, used = reset_row
        
        # Verify expiration
        if isinstance(expires_at, str):
            exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        else:
            exp_dt = expires_at.replace(tzinfo=timezone.utc) if expires_at.tzinfo is None else expires_at

        if now > exp_dt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The password reset token has expired. Please request a new reset link."
            )

        # Update password hash with Bcrypt
        new_pwd_hash = hash_password(payload.new_password)
        conn.execute("UPDATE users SET password_hash = ? WHERE lower(email) = ?", (new_pwd_hash, email.lower()))
        conn.execute("UPDATE password_resets SET used = TRUE WHERE id = ?", (reset_id,))

        return {
            "success": True,
            "message": "Password successfully reset. You may now sign in with your new password."
        }
    finally:
        conn.close()


@router.post("/google", response_model=AuthResponse)
async def google_auth(payload: GoogleSignInRequest):
    """
    Server-side Google OAuth 2.0 / OIDC ID Token verification.
    Validates token signature, audience, and expiry before creating or authenticating session.
    """
    seed_default_users_if_empty()

    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Sign-In is not configured on this server instance (GOOGLE_CLIENT_ID not set). Please authenticate using enterprise email credentials or demo personas."
        )

    try:
        id_info = google_id_token.verify_oauth2_token(
            payload.id_token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )

        # Security: reject tokens with unverified email addresses
        if id_info.get("email_verified") is not True:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google account email is not verified. Please verify your Google account email before signing in."
            )

        email = id_info.get("email", "").lower().strip()
        google_sub = id_info.get("sub", "")
        name = id_info.get("name", "Google User")
        if not email:
            raise HTTPException(status_code=400, detail="Google token does not contain a verified email.")

    except HTTPException:
        raise
    except Exception:
        logger.exception("Google ID token verification failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google Sign-In verification failed. Please try again."
        )

    conn = db_client.get_connection()
    try:
        user_row = conn.execute(
            "SELECT id, name, email, role, organization FROM users WHERE lower(email) = ?",
            (email,)
        ).fetchone()

        if user_row:
            user_id, name, email, role, org = user_row
            logger.info("Google OIDC login: existing user user_id=%s", user_id)
        else:
            # New Google user: always create as patient
            user_id = f"usr-{uuid.uuid4().hex[:8]}"
            role = ROLE_PATIENT
            org = "Google Workspace"
            conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, organization, provider) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (user_id, name, email, "google_oidc_managed", role, org, "google")
            )
            logger.info("New patient account via Google OIDC: user_id=%s", user_id)

        user_role = (role or ROLE_PATIENT).lower().strip()
        user_obj = AuthUserResponse(
            id=user_id,
            name=name,
            email=email,
            role=user_role,
            organization=org,
            provider="google"
        )

        token = create_access_token({
            "sub": user_id,
            "email": email,
            "name": name,
            "role": user_role
        })

        return AuthResponse(
            success=True,
            user=user_obj,
            token=token,
            message="Google OIDC identity verified."
        )
    finally:
        conn.close()


@router.get("/me")
async def get_current_user_profile(user: AuthenticatedUser = Depends(get_current_user)):
    """Protected endpoint: Returns currently authenticated user identity and verified role."""
    user_data = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "organization": user.organization,
        "provider": user.provider
    }
    return {
        "success": True,
        "user": user_data,
        **user_data
    }


@router.post("/logout")
async def logout(user: AuthenticatedUser = Depends(get_current_user)):
    """Terminates session for the authenticated caller."""
    return {
        "success": True,
        "message": f"Session for {user.email} terminated successfully."
    }
