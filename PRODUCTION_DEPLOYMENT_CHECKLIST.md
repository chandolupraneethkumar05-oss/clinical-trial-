# ProtocolShield Production Deployment & Security Runbook
**Document Classification:** Production Infrastructure & Operations Guide  
**Architecture Model:** Single-Worker Analytical DuckDB + FastAPI + React Vite  
**Cost Model:** ₹0-Cost Infrastructure Compatible (Render Free/Starter, Railway, Self-Hosted Docker)  

---

## 1. Concurrency Architecture & DuckDB Single-Worker Rule
> [!WARNING]
> **CRITICAL RUNTIME REQUIREMENT: SINGLE-WORKER EXECUTION ONLY**  
> DuckDB is an embedded in-process analytical vector database that maintains an exclusive operating system file lock on `protocolshield_cohort.duckdb`.  
> If multiple Uvicorn worker processes are spawned on the same database file (e.g. `uvicorn --workers 4`), secondary worker processes will immediately crash or raise `RuntimeError: [STARTUP FAILURE] Production DuckDB database is locked`.

### Required Startup Configuration:
- **Uvicorn Worker Count:** Strictly **1 worker** (`--workers 1` or `WEB_CONCURRENCY=1`).
- **Async Concurrency:** FastAPI handles concurrent asynchronous I/O and HTTP requests concurrently within that single event loop process.
- **Render / Container Command:**
  ```bash
  uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT --workers 1
  ```
  *(Or set Render **Root Directory** to `backend` and run `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`.)*
- **Health & Readiness Probes:**
  - Liveness probe: `GET /health`
  - Readiness probe: `GET /ready` *(verifies DuckDB connectivity & cohort/schema tables, returns `503` if degraded)*

---

## 2. Fail-Closed Security Gates (Startup Validation)
When `ENVIRONMENT` is set to `production`, `app.core.config.validate_production_secrets()` executes at startup and will **terminate the application immediately (exit code 1)** if any insecure configuration is detected:

| Configuration Variable | Required Production Setting | Startup Failure Condition |
| :--- | :--- | :--- |
| `ENVIRONMENT` | `"production"` | n/a |
| `DEBUG` | `False` | `DEBUG=True` in production |
| `ENABLE_DEMO_SEEDING` | `False` | `ENABLE_DEMO_SEEDING=True` in production |
| `EXPOSE_DEV_RESET_TOKEN` | `False` | `EXPOSE_DEV_RESET_TOKEN=True` in production |
| `JWT_SECRET_KEY` | $\ge 32$ high-entropy chars | Missing, $< 32$ chars, low entropy, or equals dev default |
| `TRUSTED_PROXIES` | Explicit upstream proxy IP(s) | Empty / invalid or contains `*` |
| `BACKEND_CORS_ORIGINS` | Explicit HTTPS origin(s) | Contains wildcard `*` in production |

---

## 3. Production Environment Variable Matrix

```dotenv
# Environment Mode
ENVIRONMENT=production
DEBUG=False

# Database Configuration (Persistent Volume Required)
DB_PATH=/var/data/protocolshield_cohort.duckdb

# Security & Cryptography
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(48))"
JWT_SECRET_KEY=<REPLACE_WITH_HIGH_ENTROPY_SECRET>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_ISSUER=protocolshield-api
JWT_AUDIENCE=protocolshield-client

# CORS & Password Reset Deep-Link Origin
FRONTEND_URL=https://your-frontend.onrender.com
BACKEND_CORS_ORIGINS=["https://your-frontend.onrender.com"]

# Anti-Spoofing & Trusted Proxies (Reverse Proxy IPs allowed for X-Forwarded-For)
TRUSTED_PROXIES=127.0.0.1,::1

# Gated Seeding & Reset Settings (Strictly False in Prod)
ENABLE_DEMO_SEEDING=False
EXPOSE_DEV_RESET_TOKEN=False

# Transactional Email Delivery (REQUIRED for Forgot-Password in Production)
# Supported EMAIL_PROVIDER values: resend | sendgrid | mailgun | smtp
# If left unset in production, /api/v1/auth/forgot-password-request fails closed with HTTP 503.
EMAIL_PROVIDER=resend
EMAIL_API_KEY=<REPLACE_WITH_EMAIL_API_KEY>
EMAIL_FROM=noreply@yourdomain.com
# EMAIL_MAILGUN_DOMAIN=mg.yourdomain.com
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASSWORD=
# SMTP_USE_TLS=true

# Google OAuth (Optional - Leave blank to disable Google Sign-In)
GOOGLE_CLIENT_ID=
```

### Frontend Static Site Environment Variable (Render / Vite)
If the Vite static frontend is hosted on a different origin than the FastAPI backend, set during frontend build:
```dotenv
VITE_API_BASE_URL=https://your-backend-service.onrender.com
```

---

## 4. Secure Manual Administrator Provisioning Procedure
Because automatic demo administrator seeding is strictly disabled in production, follow this audited CLI procedure to provision the initial system administrator:

1. **Access the Production Container Terminal / Shell:**
   ```bash
   python -c "
   import uuid
   from app.core.security import hash_password
   from app.db.duckdb_client import db_client

   admin_email = 'enterprise.admin@organization.com'
   admin_name = 'Enterprise System Administrator'
   admin_password = 'EnterSecurePasswordHere2026!'

   with db_client.transaction() as conn:
       existing = conn.execute('SELECT id FROM users WHERE lower(email) = lower(?)', (admin_email,)).fetchone()
       if existing:
           print(f'User already exists with ID: {existing[0]}')
       else:
           user_id = f'usr-admin-{uuid.uuid4().hex[:6]}'
           pw_hash = hash_password(admin_password)
           conn.execute(
               '''
               INSERT INTO users (id, name, email, password_hash, role, organization, provider)
               VALUES (?, ?, ?, ?, 'admin', 'Institutional Oversight Committee', 'email')
               ''',
               (user_id, admin_name, admin_email, pw_hash)
           )
           print(f'Successfully provisioned administrator account: {admin_email} (ID: {user_id})')
   "
   ```
2. **Verify Admin Role Assignment:**
   Log in via `POST /api/v1/auth/signin` with the provisioned credentials and verify that `user.role == "admin"`.
3. **Role Promotions:**
   Subsequent clinicians and researchers can sign up normally as patients and be promoted via `POST /api/v1/auth/promote-user` by this authenticated administrator.
