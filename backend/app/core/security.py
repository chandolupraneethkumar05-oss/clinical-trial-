"""
ProtocolShield Enterprise Security & Cryptography Module
Implements Bcrypt adaptive password hashing, JWT bearer token signing,
session lifecycle verification, and role-based access control (RBAC).
"""
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Any
import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from app.core.config import settings
from app.db.duckdb_client import db_client

# Bearer Token Scheme
oauth2_scheme = HTTPBearer(auto_error=False)

LEGACY_SALT = "protocolshield_security_salt_2026"


class TokenPayload(BaseModel):
    sub: str
    email: str
    name: str
    role: str
    exp: int
    iat: int


class AuthenticatedUser(BaseModel):
    id: str
    name: str
    email: str
    role: str  # 'patient' | 'doctor' | 'admin'
    organization: Optional[str] = None
    provider: str = "email"


# ── Password Cryptography ───────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hashes a password securely using Bcrypt with adaptive salt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, stored_hash: str) -> tuple[bool, bool]:
    """
    Verifies password against stored hash.
    Supports seamless, zero-downtime migration of legacy SHA-256 hashes to Bcrypt.
    Returns: (is_valid, needs_rehash)
    """
    if not stored_hash:
        return False, False

    # Check for Bcrypt hash ($2b$ or $2a$)
    if stored_hash.startswith("$2b$") or stored_hash.startswith("$2a$"):
        try:
            is_valid = bcrypt.checkpw(plain_password.encode("utf-8"), stored_hash.encode("utf-8"))
            return is_valid, False
        except Exception:
            return False, False

    # Check for legacy SHA-256 hash (64 hex characters)
    legacy_salted = hashlib.sha256(f"{LEGACY_SALT}{plain_password}".encode("utf-8")).hexdigest()
    legacy_unsalted = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    if secrets.compare_digest(legacy_salted, stored_hash) or secrets.compare_digest(legacy_unsalted, stored_hash):
        return True, True  # Valid legacy password, flag for rehash

    return False, False


# ── JWT Session Cryptography ────────────────────────────────────────────────

def create_access_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Signs a standard JWT access token with user claims and expiration."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp())
    })

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> dict[str, Any]:
    """Validates signature and claims of incoming JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired. Please authenticate again.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or corrupt authentication credentials.",
            headers={"WWW-Authenticate": "Bearer"}
        )


# ── Dependency Guards: Authentication & RBAC ────────────────────────────────

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(oauth2_scheme)
) -> Optional[AuthenticatedUser]:
    """Returns authenticated user if a valid Bearer token is provided, or None."""
    if not credentials or not credentials.credentials:
        return None

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            return None

        conn = db_client.get_connection()
        try:
            row = conn.execute(
                "SELECT id, name, email, role, organization, provider FROM users WHERE id = ?",
                (user_id,)
            ).fetchone()
            if not row:
                return None
            return AuthenticatedUser(
                id=row[0],
                name=row[1],
                email=row[2],
                role=row[3] or "doctor",
                organization=row[4],
                provider=row[5] or "email"
            )
        finally:
            conn.close()
    except HTTPException:
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(oauth2_scheme)
) -> AuthenticatedUser:
    """Enforces authentication: requires valid Bearer token."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in with institutional credentials.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload: missing subject identifier.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    conn = db_client.get_connection()
    try:
        row = conn.execute(
            "SELECT id, name, email, role, organization, provider FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account associated with this session no longer exists.",
                headers={"WWW-Authenticate": "Bearer"}
            )

        return AuthenticatedUser(
            id=row[0],
            name=row[1],
            email=row[2],
            role=row[3] or "doctor",
            organization=row[4],
            provider=row[5] or "email"
        )
    finally:
        conn.close()


def require_role(allowed_roles: list[str]):
    """
    Factory creating a FastAPI dependency enforcing Role-Based Access Control (RBAC).
    Allowed roles: 'patient', 'doctor', 'admin'.
    """
    async def role_checker(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        # Standardize matching
        user_role = current_user.role.lower().strip()
        normalized_allowed = [r.lower().strip() for r in allowed_roles]

        # 'admin' has super-user access across medical and administrative routes
        if user_role == "admin" or user_role in normalized_allowed:
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Insufficient permissions for role '{current_user.role}'. Required role: {', '.join(allowed_roles)}."
        )

    return role_checker
