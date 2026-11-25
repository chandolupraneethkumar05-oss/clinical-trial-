# ProtocolShield
**Autonomous Clinical Trial Protocol Feasibility & Patient Attrition Synthesizer**  
*Enterprise Clinical Data Engineering & Predictive Feasibility Platform*

---

## Executive Overview
Over 80% of Phase II and Phase III clinical trials suffer multi-month delays or outright termination due to over-engineered protocol schedules and restrictive patient eligibility criteria. Every day of delay costs pharmaceutical sponsors between **$600,000 and $8,000,000** in lost patent exclusivity and operational overhead.

**ProtocolShield** stress-tests trial protocols before millions of dollars are committed. It extracts the Schedule of Assessments (SoA), calculates an empirical **Patient Burden Index (PBI)** using Tufts CSDD calibrated metrics, vectorizes eligibility rules against a synthetic 10,000-patient cohort in an in-memory DuckDB engine, and provides an interactive "What-If" sensitivity sandbox for protocol optimization.

---

## Architecture

```
denovate/
├── .github/workflows/                # CI, Security Scan, Render Deploy & Release workflows
├── docs/
│   └── CI_CD_SETUP.md                # Detailed GitHub Actions & Render operations guide
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes_protocol.py    # Protocol PDF ingestion, SoA parsing & burden scoring
│   │   │   ├── routes_cohort.py      # Vectorized DuckDB funnel & retention curve
│   │   │   ├── routes_patient.py     # Provenance-aware screening & investigator verification
│   │   │   ├── routes_auth.py        # Bcrypt auth, JWT sessions, RBAC & email password reset
│   │   │   ├── routes_audit.py       # Tamper-evident SHA-256 operational audit ledger
│   │   │   ├── routes_optimizer.py   # AI-assisted protocol amendment proposals & application
│   │   │   └── routes_benchmark.py   # Historical & ClinicalTrials.gov v2 benchmark checks
│   │   ├── core/
│   │   │   ├── config.py             # Pydantic settings & production fail-closed validation
│   │   │   ├── email_service.py      # Transactional email delivery (Resend/SendGrid/Mailgun/SMTP)
│   │   │   └── security.py           # Bcrypt, JWT validation, sliding-window rate limiting
│   │   ├── db/
│   │   │   └── duckdb_client.py      # Single-worker thread-safe DuckDB client & schema manager
│   │   ├── engine/
│   │   │   ├── eligibility.py        # Shared individual & cohort eligibility/provenance rules
│   │   │   ├── synthetic_data.py     # 10,000-patient synthetic epidemiology generator
│   │   │   ├── burden_scorer.py      # Tufts CSDD empirical scoring model
│   │   │   ├── cohort_simulator.py   # Vectorized funnel & Kaplan-Meier decay
│   │   │   ├── optimizer_engine.py   # Amendment proposal & simulation engine
│   │   │   └── pdf_parser.py         # PyMuPDF protocol extraction parser
│   │   ├── models/                   # Strict Pydantic v2 domain schemas
│   │   └── main.py                   # FastAPI application, security headers, /health & /ready
│   ├── tests/                        # Automated backend unit, security & E2E tests
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/               # StudioWorkspace, PatientPortal, AuditTrailView, AuthModal, etc.
│   │   ├── lib/api.ts                # Shared API URL resolver, error extraction & 401 handling
│   │   ├── __tests__/                # Vitest + Testing Library unit/component tests
│   │   ├── types/
│   │   ├── App.tsx                   # Route/hash state, session lifecycle & Studio wiring
│   │   └── index.css                 # Clinical design tokens
│   ├── vitest.config.ts
│   ├── vite.config.ts                # Vite config with local /api proxy
│   └── tailwind.config.js
├── render.yaml                       # Render Blueprint (Python API w/ disk + Vite static site)
└── pytest.ini
```

---

## Quickstart & Local Execution

### 1. Backend Setup & Tests
```bash
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r backend/requirements.txt

# Run complete backend unit, security, parity & integration tests
pytest backend/tests -v

# Start FastAPI development server (single worker required for DuckDB file lock)
python run_backend.py
# Or explicitly with uvicorn:
uvicorn app.main:app --app-dir backend --reload --port 8000 --workers 1
```
API Documentation is accessible at `http://localhost:8000/docs`, liveness at `http://localhost:8000/health`, and DB readiness at `http://localhost:8000/ready`.

### 2. Frontend Setup, Tests & Production Build
```bash
cd frontend

# Install dependencies reproducibly
npm ci

# Type check, lint, and run Vitest tests
npx tsc -b --noEmit
npm run lint
npm test

# Build production bundle
npm run build

# Start Vite dev server (proxies /api to http://127.0.0.1:8000)
npm run dev
```
Dashboard is accessible at `http://localhost:5173`.

---

## Mathematical Formulation

### Patient Burden Index (PBI)
$$\text{PBI}_{\text{composite}} = w_{\text{temporal}} \cdot \text{Score}_{\text{time}} + w_{\text{invasive}} \cdot \text{Score}_{\text{invasive}} + w_{\text{cognitive}} \cdot \text{Score}_{\text{cognitive}}$$

Where:
* $w_{\text{temporal}} = 0.35$ (Clinic dwell time + average transit friction)
* $w_{\text{invasive}} = 0.45$ (Biopsies, contrast CT/MRI, serial PK blood sampling)
* $w_{\text{cognitive}} = 0.20$ (Fasting restrictions, diary compliance, visit density)

---

## Security & Authentication Architecture

### 1. Zero-Cost Enterprise Cryptography
* **Password Hashing:** Bcrypt (cost 12) with automatic adaptive migration from legacy SHA-256 hashes upon successful authentication. Plaintext passwords and salts are never stored or hardcoded.
* **JWT Access Tokens:** Cryptographically signed Bearer tokens using standard HMAC-SHA256 (`HS256`). Default expiration is calibrated to 60 minutes.
* **Production Secret Protection:** In production (`ENVIRONMENT=production`), application startup strictly fails if `JWT_SECRET_KEY` is missing or matches development defaults.
* **Two-Step Password Recovery:** Single-use, time-limited reset tokens (15-minute TTL). Reset tokens are cryptographically hashed and never leaked in API responses in production environments.
* **Google OIDC Integration:** Server-side verification of Google Identity ID tokens using `google-auth`. Verifies token signature, issuer, audience (`GOOGLE_CLIENT_ID`), expiration, and `email_verified=True`. Implements zero-cost ₹0 authentication architecture with no paid IDP dependencies.

### 2. Role-Based Access Control (RBAC)
ProtocolShield enforces strict server-side RBAC across three clinical personas:

| Role | Access Scope | Public Registration |
|---|---|---|
| **Patient (`patient`)** | PatientPortal, self eligibility screening, burden preview | **Default role** for all public signups |
| **Doctor (`doctor`)** | StudioWorkspace, AI Protocol Optimizer, Funnel Simulator, Cohort Analytics | Requires administrator promotion |
| **Administrator (`admin`)** | Full system governance, cohort database re-seeding, user management | Provisioned via administrator credentials |

* **Privilege Escalation Prevention:** The public signup endpoint ignores any `role` value passed by the client and strictly assigns the `patient` role. Privileged investigator and administrator accounts can only be provisioned through controlled administrative channels.

### 3. Clinical Safety Guardrails & Provenance Model
* **Provenance-Aware Outcomes:** Individual screenings strictly distinguish:
  1. `PRELIMINARY_MATCH` — criteria satisfied only on `patient_reported`, `synthetic_demo`, or unverified data (`provenance_verified=False`). Never claims verified eligibility or trial enrollment readiness.
  2. `REQUIRES_REVIEW` — missing, unknown, or borderline clinical parameters require investigator review. Never defaults missing values to `false`.
  3. `INVESTIGATOR_VERIFIED_ELIGIBLE` — reachable exclusively when an authorized `doctor` or `admin` submits verified data or explicitly verifies a non-synthetic screening via `POST /api/v1/patient/screenings/{screening_id}/verify` (auditable with verifier identity and timestamp).
  4. `NOT_ELIGIBLE` — confirmed failure or hard exclusion criterion (e.g., active CNS metastases when excluded, active autoimmune contraindication, high match scores never override hard exclusions).
* **Investigator Confirmation Disclaimer:** All patient screening endpoints and UI views include a prominent disclaimer requiring confirmation by a qualified clinical investigator before any eligibility determination is finalized.
* **Synthetic Cohort Attribution:** All cohort data (10,000 statistical patient records) and demo patient walkthroughs are explicitly labeled as synthetic simulation data and cannot be promoted to `investigator_verified`.

---

## Configuration & Environment Variables

Copy `.env.example` to `.env` for local development (never commit real secrets or `.env`):

```bash
cp .env.example .env
```

| Variable | Required in Prod | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | Yes (`production`) | `development` | Runtime mode (`development`, `test`, `production`) |
| `DEBUG` | Yes (`false`) | `false` | Startup fails closed if `true` in production |
| `DB_PATH` | Yes | `backend/data/protocolshield_cohort.duckdb` | DuckDB path (`/var/data/protocolshield_cohort.duckdb` on Render Disk; requires `--workers 1`) |
| `JWT_SECRET_KEY` | Yes | *(dev default)* | Cryptographic HMAC signing secret (`>=32` high-entropy chars in prod) |
| `JWT_ALGORITHM` | Yes | `HS256` | JWT signing algorithm |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Yes | `protocolshield-api` / `protocolshield-client` | Strict token issuer/audience validation |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Yes | `60` | JWT access token lifetime |
| `FRONTEND_URL` | Yes | `http://localhost:5173` | Allowed CORS origin & password-reset deep-link base URL |
| `BACKEND_CORS_ORIGINS` | Yes | `["http://localhost:5173", ...]` | Explicit CORS allowlist (`*` rejected in production) |
| `TRUSTED_PROXIES` | Yes | `127.0.0.1,::1` | Reverse-proxy IPs trusted for `X-Forwarded-For` (`*` rejected in prod) |
| `ENABLE_DEMO_SEEDING` | Yes (`false`) | `true` | Gate demo user/audit seeding (`false` enforced in prod) |
| `EXPOSE_DEV_RESET_TOKEN` | Yes (`false`) | `false` | Never expose reset tokens in API responses in production |
| `EMAIL_PROVIDER` | Yes (for reset) | *(empty)* | `resend`, `sendgrid`, `mailgun`, or `smtp` (returns 503 in prod if unset) |
| `EMAIL_API_KEY` / `EMAIL_FROM` | Yes (for reset) | *(empty)* | Email provider credentials & verified sender address |
| `EMAIL_MAILGUN_DOMAIN` / `SMTP_*` | Conditional | *(empty)* | Required only when using `mailgun` or `smtp` |
| `GOOGLE_CLIENT_ID` | Optional | *(empty)* | Google OAuth 2.0 Web Client ID for optional OIDC sign-in |
| `CLINICAL_TRIALS_API_BASE` | Optional | `https://clinicaltrials.gov/api/v2` | ClinicalTrials.gov v2 benchmark API endpoint |
| `VITE_API_BASE_URL` | Yes (split host) | *(empty / Vite proxy)* | Frontend build env var specifying deployed FastAPI origin |

---

## CI/CD Workflows & Render Deployment

See [docs/CI_CD_SETUP.md](docs/CI_CD_SETUP.md) and [`render.yaml`](render.yaml) for the complete operational runbook.

* **GitHub Actions Workflows:**
  * [`ci.yml`](.github/workflows/ci.yml) — runs backend checks (`compileall`, `ruff`, `pip check`, startup validation, full `pytest` suite), frontend checks (`npm ci`, `tsc -b --noEmit`, `oxlint`, Vitest, `vite build`), and a live HTTP Uvicorn + isolated DuckDB E2E verification job on every PR and push to `master`.
  * [`security.yml`](.github/workflows/security.yml) — runs `pip-audit`, Bandit SAST, `npm audit`, tracked secret-file check, TruffleHog OSS secret scan, and PR Dependency Review.
  * [`deploy-render.yml`](.github/workflows/deploy-render.yml) — triggers Render deployment only after `CI Pipeline` passes on `master` (never on PRs) using secret `RENDER_DEPLOY_HOOK_URL`, and verifies `/health` and `/ready` return HTTP `200` when `RENDER_BACKEND_URL` is configured.
  * [`release.yml`](.github/workflows/release.yml) — validates SemVer tags (`v*.*.*`), checks `master` lineage, re-runs full verification, and publishes GitHub Releases.
* **Health Verification & Rollback:**
  * `/health` verifies process liveness (`200`), while `/ready` verifies DuckDB connectivity, schema initialization, cohort load, and non-fallback storage in production (`200` or `503`).
  * To roll back a bad release, trigger Render's **Rollback to this deploy** on `protocolshield-api` / `protocolshield-web` and revert the commit via Pull Request on `master`.


