"""
ProtocolShield Enterprise Authentication & Identity API Routes
Implements Bcrypt adaptive password hashing, JWT Bearer tokens,
role-based access control (RBAC), and 2-step single-use password resets.
"""
import re
import threading
import uuid
import secrets
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.core.email_service import EmailDeliveryError, is_email_configured, send_password_reset_email
from app.db.duckdb_client import db_client
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_role,
    AuthenticatedUser,
    enforce_rate_limit,
    revoke_token,
    oauth2_scheme,
)

router = APIRouter(prefix="/auth", tags=["Enterprise Authentication"])


# ── Canonical Role Constants ────────────────────────────────────────────────
ROLE_PATIENT = "patient"
ROLE_DOCTOR = "doctor"
ROLE_ADMIN = "admin"
VALID_ROLES = {ROLE_PATIENT, ROLE_DOCTOR, ROLE_ADMIN}


_demo_seeded = False
_demo_seed_lock = threading.Lock()
_EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email_value(value: str) -> str:
    cleaned = value.strip().lower()
    if not _EMAIL_REGEX.match(cleaned):
        raise ValueError("Please provide a valid email address.")
    return cleaned


def seed_default_users_if_empty():
    """
    Seeds verified demo profiles strictly in development and test environments.
    Guarantees:
      1. Strictly disabled in production.
      2. Requires settings.ENABLE_DEMO_SEEDING to be True.
      3. INSERT-ONLY: never overwrites existing user passwords, roles, or attributes.
      4. Never restores deleted accounts in production.
      5. Thread-safe against concurrent startup/request initialization.
    """
    global _demo_seeded
    with _demo_seed_lock:
        if _demo_seeded:
            return

        env = settings.ENVIRONMENT.lower().strip()
        if env not in {"development", "test"} or not settings.ENABLE_DEMO_SEEDING:
            # Fails closed in production or when demo seeding is disabled
            _demo_seeded = True
            return

        conn = db_client.get_connection()
        try:
            existing_count = conn.execute(
                "SELECT count(*) FROM users WHERE lower(email) IN ('elena.vance@novartis.com', 'marcus.chen@mskcc.org', 'sarah.jenkins@iqvia.com', 'john.miller@patient.org')"
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
            # Strict INSERT-ONLY operation: do not overwrite existing credentials or roles
            for user_id, name, email, pw_hash, role, org, provider in demo_users:
                existing = conn.execute("SELECT id FROM users WHERE lower(email) = ?", [email.lower()]).fetchone()
                if not existing:
                    conn.execute(
                        "INSERT INTO users (id, name, email, password_hash, role, organization, provider) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        [user_id, name, email.lower(), pw_hash, role, org, provider]
                    )
            _demo_seeded = True
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
    password: str = Field(..., min_length=8, max_length=72, description="Bcrypt max password size 72 bytes")
    role: Optional[str] = Field(default=ROLE_PATIENT, description="Public signup always creates 'patient' accounts")
    organization: Optional[str] = Field(default="Clinical Trial Volunteer Cohort", max_length=150)

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _validate_email_value(v)

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 2:
            raise ValueError("Name must be at least 2 non-whitespace characters.")
        return cleaned


class PromoteUserRequest(BaseModel):
    user_id: str = Field(..., min_length=3, max_length=120)
    target_role: str = Field(..., description="'doctor' | 'admin'")


class SignInRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=150)
    password: str = Field(..., min_length=1, max_length=72)

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _validate_email_value(v)


class ForgotPasswordInitRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=150)

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _validate_email_value(v)


class ForgotPasswordResetRequest(BaseModel):
    token: str = Field(..., min_length=8, max_length=256)
    new_password: str = Field(..., min_length=8, max_length=72)

    @field_validator("token")
    @classmethod
    def check_token(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 8:
            raise ValueError("Reset token must be at least 8 characters.")
        return cleaned


class GoogleSignInRequest(BaseModel):
    id_token: str = Field(..., min_length=10)


class AuthResponse(BaseModel):
    success: bool
    user: AuthUserResponse
    token: str
    message: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post(
    "/signup",
    response_model=AuthResponse,
    dependencies=[Depends(enforce_rate_limit(max_requests=10, window_seconds=60, prefix="auth_signup"))]
)
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
            "role": assigned_role,
            "token_version": 1
        })

        return AuthResponse(
            success=True,
            user=user_obj,
            token=token,
            message="Account successfully created."
        )
    finally:
        conn.close()


@router.post(
    "/signin",
    response_model=AuthResponse,
    dependencies=[Depends(enforce_rate_limit(max_requests=10, window_seconds=60, prefix="auth_signin"))]
)
async def signin(payload: SignInRequest):
    """Authenticates credentials against Bcrypt (with legacy SHA-256 upgrade) and returns signed JWT."""
    seed_default_users_if_empty()
    conn = db_client.get_connection()
    try:
        clean_email = payload.email.strip().lower()
        user_row = conn.execute(
            "SELECT id, name, email, password_hash, role, organization, provider, token_version FROM users WHERE lower(email) = ?",
            (clean_email,)
        ).fetchone()

        if not user_row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid work email or password."
            )

        user_id, name, email, stored_hash, role, org, provider = user_row[:7]
        user_token_version = user_row[7] if len(user_row) > 7 and user_row[7] is not None else 1
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
            "role": user_role,
            "token_version": user_token_version
        })

        return AuthResponse(
            success=True,
            user=user_obj,
            token=token,
            message="Institutional authentication verified."
        )
    finally:
        conn.close()


@router.post(
    "/forgot-password/request",
    dependencies=[Depends(enforce_rate_limit(max_requests=5, window_seconds=60, prefix="auth_forgot_pw"))]
)
async def forgot_password_request(payload: ForgotPasswordInitRequest):
    """
    Step 1: Secure password reset initiation.
    Issues a time-limited (15m), single-use cryptographic token and delivers it via configured email provider.
    Always returns a generic message to prevent email enumeration.
    Never returns raw reset tokens in production.
    """
    seed_default_users_if_empty()
    env = settings.ENVIRONMENT.lower().strip()
    is_prod = env in {"production", "prod", "staging"}

    if is_prod and not is_email_configured():
        # Checked BEFORE user lookup to avoid revealing account existence
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Password reset email delivery is not configured on this server. "
                "Please configure EMAIL_PROVIDER, EMAIL_API_KEY, and EMAIL_FROM, or contact an administrator."
            ),
        )

    clean_email = payload.email.strip().lower()
    raw_token: Optional[str] = None
    reset_id: Optional[str] = None

    with db_client.transaction() as conn:
        user_row = conn.execute("SELECT id FROM users WHERE lower(email) = ?", (clean_email,)).fetchone()
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

    dev_token_display = None
    if raw_token and reset_id:
        if is_email_configured():
            try:
                await send_password_reset_email(clean_email, raw_token)
            except EmailDeliveryError:
                # Fail safely without leaking token, password, or account existence:
                # invalidate the undelivered token and return the same generic response.
                logger.warning("Password reset email delivery failed for reset_id=%s", reset_id)
                try:
                    with db_client.transaction() as conn:
                        conn.execute("UPDATE password_resets SET used = TRUE WHERE id = ?", (reset_id,))
                except Exception:
                    logger.error("Failed to invalidate undelivered reset token reset_id=%s", reset_id)
        elif not is_prod and env in {"development", "test"} and settings.EXPOSE_DEV_RESET_TOKEN:
            dev_token_display = raw_token

    resp = {
        "success": True,
        "message": "If an account with that email address is registered, instructions to reset your password have been issued."
    }
    if dev_token_display and not is_prod:
        resp["dev_reset_token"] = dev_token_display
        resp["dev_note"] = "Local Development Mode: Token displayed for testing self-service reset."

    return resp


@router.post(
    "/forgot-password/reset",
    dependencies=[Depends(enforce_rate_limit(max_requests=5, window_seconds=60, prefix="auth_reset_pw"))]
)
async def forgot_password_reset(payload: ForgotPasswordResetRequest):
    """
    Step 2: Atomically consumes the reset token, updates password to Bcrypt hash,
    invalidates outstanding tokens, and revokes prior user sessions by incrementing token_version.
    """
    seed_default_users_if_empty()
    token_hash = hashlib.sha256(payload.token.strip().encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)

    with db_client.transaction() as conn:
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

        reset_id, email, expires_at, _used = reset_row

        # Verify expiration
        if isinstance(expires_at, str):
            exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        else:
            exp_dt = expires_at.replace(tzinfo=timezone.utc) if expires_at.tzinfo is None else expires_at

        if now > exp_dt:
            conn.execute("UPDATE password_resets SET used = TRUE WHERE id = ?", (reset_id,))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The password reset token has expired. Please request a new reset link."
            )

        # Update password hash with Bcrypt and increment token_version for instant session invalidation
        new_pwd_hash = hash_password(payload.new_password)
        conn.execute(
            "UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 1) + 1 WHERE lower(email) = ?",
            (new_pwd_hash, email.lower())
        )
        # Atomically mark this token and all outstanding reset tokens for this user as consumed
        conn.execute("UPDATE password_resets SET used = TRUE WHERE lower(email) = ?", (email.lower(),))

    return {
        "success": True,
        "message": "Password successfully reset. You may now sign in with your new password."
    }


@router.post(
    "/google",
    response_model=AuthResponse,
    dependencies=[Depends(enforce_rate_limit(max_requests=10, window_seconds=60, prefix="auth_google"))]
)
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
        id_info = await run_in_threadpool(
            google_id_token.verify_oauth2_token,
            payload.id_token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )

        # Validate issuer
        issuer = id_info.get("iss")
        if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google token issuer."
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
        if not email or not google_sub:
            raise HTTPException(status_code=400, detail="Google token does not contain a verified email or subject identifier.")

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
            "SELECT id, name, email, role, organization, token_version FROM users WHERE lower(email) = ?",
            (email,)
        ).fetchone()

        if user_row:
            user_id, name, email, role, org, token_ver = user_row
            user_token_version = token_ver or 1
            logger.info("Google OIDC login: existing user user_id=%s", user_id)
        else:
            # New Google user: always create as patient; never automatically elevate
            user_id = f"usr-{uuid.uuid4().hex[:8]}"
            role = ROLE_PATIENT
            org = "Google Workspace"
            user_token_version = 1
            conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, organization, provider, token_version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
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
            "role": user_role,
            "token_version": user_token_version
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
async def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(oauth2_scheme),
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Terminates session for the authenticated caller and commits token
    to the revocation blacklist to prevent replay or reuse.
    """
    if credentials and credentials.credentials:
        revoke_token(credentials.credentials)

    return {
        "success": True,
        "message": f"Session for {user.email} terminated and token invalidated successfully."
    }


@router.get("/users")
async def list_registered_users(
    _current_admin: AuthenticatedUser = Depends(require_role(["admin"])),
):
    """
    Lists registered accounts for administrator role governance.
    Strictly limited to admin role; never exposes password hashes or session secrets.
    """
    conn = db_client.get_connection()
    try:
        rows = conn.execute(
            """
            SELECT id, name, email, role, organization, provider, CAST(created_at AS VARCHAR)
            FROM users
            ORDER BY created_at DESC
            LIMIT 200
            """
        ).fetchall()
        return [
            {
                "id": r[0],
                "name": r[1],
                "email": r[2],
                "role": (r[3] or ROLE_PATIENT).lower().strip(),
                "organization": r[4],
                "provider": r[5] or "email",
                "created_at": str(r[6]) if r[6] else None,
            }
            for r in rows
        ]
    finally:
        conn.close()


@router.post("/promote-user")
async def promote_user(
    payload: PromoteUserRequest,
    current_admin: AuthenticatedUser = Depends(require_role(["admin"]))
):
    """
    Administrative endpoint for explicit, authorized role promotion.
    Requires an authenticated administrator with verified permissions.
    """
    target = payload.target_role.lower().strip()
    if target not in {ROLE_DOCTOR, ROLE_ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid target role '{payload.target_role}'. Promotion target must be 'doctor' or 'admin'."
        )

    with db_client.transaction() as conn:
        user_row = conn.execute(
            "SELECT id, email, role FROM users WHERE id = ?",
            (payload.user_id,)
        ).fetchone()

        if not user_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with ID '{payload.user_id}' does not exist."
            )

        conn.execute(
            "UPDATE users SET role = ?, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?",
            (target, payload.user_id)
        )

    logger.info(
        "Admin %s (%s) promoted user %s (%s) from %s to %s",
        current_admin.id, current_admin.email, payload.user_id, user_row[1], user_row[2], target
    )
    try:
        from app.api.routes_audit import record_audit_event
        record_audit_event(
            user_id=current_admin.id,
            user_name=current_admin.name,
            user_role=current_admin.role,
            action="USER_ROLE_PROMOTION",
            resource_type="USER",
            resource_id=payload.user_id,
            details=f"Admin {current_admin.email} promoted user {user_row[1]} ({payload.user_id}) from {user_row[2]} to {target}."
        )
    except Exception:
        logger.exception("Failed to record audit event for user promotion")
    return {
        "success": True,
        "user_id": payload.user_id,
        "previous_role": user_row[2],
        "new_role": target,
        "message": f"User {payload.user_id} successfully promoted to {target}."
    }
