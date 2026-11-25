"""
ProtocolShield Enterprise Security & Cryptography Module
Implements Bcrypt adaptive password hashing, JWT bearer token signing,
session lifecycle verification, and role-based access control (RBAC).
"""
import os
import ipaddress
import secrets
import hashlib
import time
import threading
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Any
import bcrypt
import jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from app.core.config import settings
from app.db.duckdb_client import db_client

logger = logging.getLogger(__name__)

# Bearer Token Scheme
oauth2_scheme = HTTPBearer(auto_error=False)

LEGACY_SALT = "protocolshield_security_salt_2026"
MIN_PASSWORD_CHARS = 8
MAX_PASSWORD_BYTES = 72  # Bcrypt algorithmic limit


# ── Sliding Window In-Memory Rate Limiter ────────────────────────────────────

class SlidingWindowRateLimiter:
    """
    Thread-safe in-memory sliding window rate limiter with automatic memory cleanup.
    Prunes expired timestamps, removes inactive keys, and caps maximum tracked entries.
    Documented constraint: Designed for single-process deployments (1 worker).
    """
    def __init__(self, max_entries: int = 10000, cleanup_interval_seconds: float = 60.0):
        self._lock = threading.Lock()
        # key -> (list of request timestamps, window_seconds)
        self._history: dict[str, tuple[list[float], float]] = {}
        self._max_entries = max(1, max_entries)
        self._cleanup_interval_seconds = max(0.0, cleanup_interval_seconds)
        self._last_cleanup = time.time()

    def _prune_unlocked(self, now: float) -> int:
        removed = 0
        stale_keys = []
        for k, (times, win) in self._history.items():
            cutoff = now - win
            valid = [t for t in times if t > cutoff]
            if not valid:
                stale_keys.append(k)
            elif len(valid) != len(times):
                self._history[k] = (valid, win)
        for k in stale_keys:
            del self._history[k]
            removed += 1
        self._last_cleanup = now
        return removed

    def prune_expired(self, now: Optional[float] = None) -> int:
        """Explicitly removes expired timestamps and inactive client entries."""
        ts = now if now is not None else time.time()
        with self._lock:
            return self._prune_unlocked(ts)

    def check(self, key: str, max_requests: int, window_seconds: int) -> tuple[bool, int]:
        """
        Evaluates whether key is within rate limits.
        Returns: (is_allowed, retry_after_seconds)
        """
        if max_requests <= 0:
            return False, max(1, int(window_seconds))

        now = time.time()
        win = float(max(1, window_seconds))
        cutoff = now - win
        with self._lock:
            if (
                (now - self._last_cleanup) >= self._cleanup_interval_seconds
                or len(self._history) >= self._max_entries
            ):
                self._prune_unlocked(now)

            existing = self._history.get(key)
            if existing is not None:
                valid_times = [t for t in existing[0] if t > cutoff]
            else:
                valid_times = []

            if len(valid_times) >= max_requests:
                earliest = valid_times[0]
                retry_after = max(1, int(earliest + win - now))
                self._history[key] = (valid_times, win)
                return False, retry_after

            if key not in self._history and len(self._history) >= self._max_entries:
                # Evict oldest-activity entry to keep memory strictly bounded
                oldest_key = min(
                    self._history.keys(),
                    key=lambda k: self._history[k][0][-1] if self._history[k][0] else 0.0,
                )
                del self._history[oldest_key]

            valid_times.append(now)
            self._history[key] = (valid_times, win)
            return True, 0

    def active_key_count(self) -> int:
        with self._lock:
            return len(self._history)

    def clear(self):
        with self._lock:
            self._history.clear()
            self._last_cleanup = time.time()


rate_limiter = SlidingWindowRateLimiter()


def resolve_client_ip(request: Request) -> str:
    """
    Resolves client IP safely without trusting spoofable headers from untrusted clients.
    Only inspects X-Forwarded-For when the direct socket peer is in settings.TRUSTED_PROXIES,
    walking right-to-left past trusted proxies and validating IP syntax.
    """
    if not request.client or not request.client.host:
        return "unknown"

    direct_ip = request.client.host.strip()
    trusted = {p.strip() for p in settings.TRUSTED_PROXIES if p and p.strip()}
    if direct_ip not in trusted:
        return direct_ip

    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return direct_ip

    hops = [h.strip() for h in forwarded.split(",") if h.strip()]
    for hop in reversed(hops):
        try:
            normalized = str(ipaddress.ip_address(hop))
        except ValueError:
            # Malformed hop cannot be trusted; fall back safely
            return direct_ip
        if normalized not in trusted:
            return normalized
    return direct_ip


def enforce_rate_limit(max_requests: int, window_seconds: int, prefix: str = "general"):
    """
    FastAPI dependency factory enforcing sliding-window rate limiting per client IP.
    Anti-Spoofing: Only trusts X-Forwarded-For if immediate client IP is in settings.TRUSTED_PROXIES.
    Returns HTTP 429 Too Many Requests with Retry-After header.
    Automatically bypassed in pytest test runners via PYTEST_CURRENT_TEST unless RATE_LIMIT_IN_TESTS=1.
    """
    async def limiter_dependency(request: Request):
        if (os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get("TESTING") == "1") and os.environ.get("RATE_LIMIT_IN_TESTS") != "1":
            return

        client_ip = resolve_client_ip(request)
        key = f"{prefix}:{client_ip}"
        allowed, retry_after = rate_limiter.check(key, max_requests, window_seconds)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Too many attempts. Please retry in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)}
            )
    return limiter_dependency


class TokenPayload(BaseModel):
    sub: str
    email: str
    name: str
    role: str
    exp: int
    iat: int
    iss: Optional[str] = None
    aud: Optional[str] = None
    jti: Optional[str] = None
    token_version: Optional[int] = 1


class AuthenticatedUser(BaseModel):
    id: str
    name: str
    email: str
    role: str  # 'patient' | 'doctor' | 'admin'
    organization: Optional[str] = None
    provider: str = "email"
    token_version: int = 1


# ── Password Cryptography ───────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hashes a password securely using Bcrypt with adaptive salt and length bounds."""
    if len(password) < MIN_PASSWORD_CHARS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {MIN_PASSWORD_CHARS} characters long."
        )
    pwd_bytes = password.encode("utf-8")
    if len(pwd_bytes) > MAX_PASSWORD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password exceeds maximum supported length of {MAX_PASSWORD_BYTES} bytes."
        )
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, stored_hash: str) -> tuple[bool, bool]:
    """
    Verifies password against stored hash.
    Supports seamless, zero-downtime migration of legacy SHA-256 hashes to Bcrypt.
    Enforces maximum password size compatible with Bcrypt (72 bytes).
    Returns: (is_valid, needs_rehash)
    """
    if not stored_hash or not plain_password:
        return False, False

    pwd_bytes = plain_password.encode("utf-8")
    if len(pwd_bytes) > MAX_PASSWORD_BYTES:
        return False, False

    # Check for Bcrypt hash ($2b$ or $2a$)
    if stored_hash.startswith("$2b$") or stored_hash.startswith("$2a$"):
        try:
            is_valid = bcrypt.checkpw(pwd_bytes, stored_hash.encode("utf-8"))
            return is_valid, False
        except Exception:
            return False, False

    # Check for legacy SHA-256 hash (64 hex characters) - migration only
    legacy_salted = hashlib.sha256(f"{LEGACY_SALT}{plain_password}".encode("utf-8")).hexdigest()
    legacy_unsalted = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    if secrets.compare_digest(legacy_salted, stored_hash) or secrets.compare_digest(legacy_unsalted, stored_hash):
        return True, True  # Valid legacy password, flag for rehash

    return False, False


# ── JWT Session Cryptography ────────────────────────────────────────────────

def create_access_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Signs a standard JWT access token with unique JTI, user claims, issuer, audience, and expiration."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.setdefault("jti", uuid.uuid4().hex)
    to_encode.setdefault("token_version", 1)
    to_encode.update({
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE
    })

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def is_token_revoked(token: str, jti: Optional[str] = None) -> bool:
    """Checks whether the token or its JTI has been revoked in DuckDB. Fails closed on database errors."""
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    try:
        conn = db_client.get_connection()
        try:
            if jti:
                row = conn.execute(
                    "SELECT count(*) FROM token_blacklist WHERE jti = ? OR token_hash = ?",
                    (jti, token_hash)
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT count(*) FROM token_blacklist WHERE token_hash = ?",
                    (token_hash,)
                ).fetchone()
            return bool(row and row[0] > 0)
        finally:
            conn.close()
    except Exception as e:
        logger.error("Token revocation lookup error: %s", e)
        # Fail closed: reject requests if revocation status cannot be verified
        return True


def revoke_token(token: str) -> bool:
    """Blacklists a token so it cannot be used again."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False, "verify_aud": False, "verify_iss": False}
        )
        jti = payload.get("jti") or uuid.uuid4().hex
        exp_ts = payload.get("exp")
        if exp_ts:
            expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc)
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    except Exception:
        jti = uuid.uuid4().hex
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    conn = db_client.get_connection()
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO token_blacklist (jti, token_hash, revoked_at, expires_at)
            VALUES (?, ?, CURRENT_TIMESTAMP, ?)
            """,
            (jti, token_hash, expires_at)
        )
        return True
    finally:
        conn.close()


def decode_access_token(token: str) -> dict[str, Any]:
    """Validates signature, explicit algorithm, expiration, issuer, and audience of incoming JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            audience=settings.JWT_AUDIENCE,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_iat": True,
                "verify_iss": True,
                "verify_aud": True,
                "require": ["exp", "iat", "sub", "iss", "aud"]
            }
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired. Please authenticate again.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except jwt.InvalidIssuerError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token issuer.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token audience.",
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
    """Returns authenticated user if a valid Bearer token is provided and not revoked, or None."""
    if not credentials or not credentials.credentials:
        return None

    try:
        payload = decode_access_token(credentials.credentials)
        jti = payload.get("jti")
        if is_token_revoked(credentials.credentials, jti):
            return None

        user_id = payload.get("sub")
        if not user_id:
            return None

        conn = db_client.get_connection()
        try:
            row = conn.execute(
                "SELECT id, name, email, role, organization, provider, token_version FROM users WHERE id = ?",
                (user_id,)
            ).fetchone()
            if not row:
                return None

            user_token_version = row[6] if len(row) > 6 and row[6] is not None else 1
            jwt_token_version = payload.get("token_version", 1)
            if not isinstance(jwt_token_version, int) or jwt_token_version != user_token_version:
                return None

            return AuthenticatedUser(
                id=row[0],
                name=row[1],
                email=row[2],
                role=row[3] or "doctor",
                organization=row[4],
                provider=row[5] or "email",
                token_version=user_token_version
            )
        finally:
            conn.close()
    except HTTPException:
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(oauth2_scheme)
) -> AuthenticatedUser:
    """Enforces authentication: requires valid, unrevoked Bearer token with matching session version."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in with institutional credentials.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    payload = decode_access_token(credentials.credentials)
    jti = payload.get("jti")
    if is_token_revoked(credentials.credentials, jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been terminated or logged out. Please authenticate again.",
            headers={"WWW-Authenticate": "Bearer"}
        )

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
            "SELECT id, name, email, role, organization, provider, token_version FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account associated with this session no longer exists.",
                headers={"WWW-Authenticate": "Bearer"}
            )

        user_token_version = row[6] if len(row) > 6 and row[6] is not None else 1
        jwt_token_version = payload.get("token_version", 1)
        if not isinstance(jwt_token_version, int) or jwt_token_version != user_token_version:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been revoked due to recent security credentials change. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"}
            )

        return AuthenticatedUser(
            id=row[0],
            name=row[1],
            email=row[2],
            role=row[3] or "doctor",
            organization=row[4],
            provider=row[5] or "email",
            token_version=user_token_version
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
