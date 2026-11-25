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
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes_protocol.py    # Protocol parsing & burden computation
│   │   │   ├── routes_cohort.py      # Vectorized DuckDB funnel & retention curve
│   │   │   └── routes_benchmark.py   # Historical ClinicalTrials.gov comparison
│   │   ├── core/
│   │   │   └── config.py             # Enterprise settings & calibration weights
│   │   ├── db/
│   │   │   └── duckdb_client.py      # High-performance analytical DuckDB client
│   │   ├── engine/
│   │   │   ├── synthetic_data.py     # 10,000-patient epidemiology generator
│   │   │   ├── burden_scorer.py      # Tufts CSDD empirical scoring model
│   │   │   └── cohort_simulator.py   # Vectorized funnel & Kaplan-Meier decay
│   │   ├── models/                   # Strict Pydantic v2 domain schemas
│   │   └── main.py                   # FastAPI application & lifecycle
│   ├── tests/                        # Automated unit & API integration test suite
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx            # Clinical executive application header
│   │   │   ├── StatCard.tsx          # Metric cards with tabular numerals
│   │   │   ├── BurdenOverviewTab.tsx # Tufts CSDD decomposition & risk breakdown
│   │   │   ├── ScheduleMatrixTab.tsx # Schedule of Assessments (SoA) table & inspector
│   │   │   ├── WhatIfSandboxTab.tsx  # Real-time parameter sliders & Recharts curve
│   │   │   └── BenchmarkTab.tsx      # ClinicalTrials.gov historical validation
│   │   ├── types/
│   │   ├── App.tsx                   # Main dashboard state & export modal
│   │   └── index.css                 # Refined clinical design system
│   ├── vite.config.ts                # Vite config with API proxy
│   └── tailwind.config.js            # Bespoke clinical color tokens
└── pytest.ini
```

---

## Quickstart & Local Execution

### 1. Backend Setup
```bash
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Run automated tests
pytest backend/tests

# Start FastAPI development server (recommended from repository root)
python run_backend.py
# Or explicitly with uvicorn:
uvicorn app.main:app --app-dir backend --reload --port 8000 --workers 1
```
API Documentation will be accessible at: `http://localhost:8000/docs`

### 2. Frontend Setup
```bash
cd frontend

# Install dependencies (already completed)
npm install

# Build production bundle
npm run build

# Start Vite dev server
npm run dev
```
Dashboard will be accessible at: `http://localhost:5173`

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

### 3. Clinical Safety Guardrails & Disclaimers
* **Hard Exclusions:** Clinical safety rules (e.g. untreated active brain metastases or active autoimmune conditions under immunotherapy protocols) unconditionally evaluate to `NOT_ELIGIBLE`. High overall criteria match percentages (even ≥85%) are strictly prevented from overriding hard clinical exclusions.
* **Investigator Confirmation Disclaimer:** All patient screening endpoints and UI views include a prominent disclaimer requiring confirmation by a qualified clinical investigator before any eligibility determination is finalized.
* **Synthetic Cohort Attribution:** All cohort data (10,000 statistical patient records) is explicitly labeled as synthetic epidemiological simulation data and is never represented as actual patient records.

---

## Configuration & Environment Variables

Copy `.env.example` to `.env` to configure the environment:

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
|---|---|---|
| `ENVIRONMENT` | `development` | Runtime environment (`development` or `production`) |
| `DB_PATH` | `backend/data/protocolshield_cohort.duckdb` | DuckDB file path (requires single worker `--workers 1`) |
| `JWT_SECRET_KEY` | *(dev default)* | Cryptographic signing secret for JWT tokens (min 32 high-entropy chars in prod) |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | JWT access token lifetime |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin & password-reset link base URL |
| `BACKEND_CORS_ORIGINS` | `["http://localhost:5173", ...]` | Allowed CORS origins list (wildcard `*` rejected in prod) |
| `TRUSTED_PROXIES` | `127.0.0.1,::1` | Trusted proxy IPs for `X-Forwarded-For` (`*` rejected in prod) |
| `ENABLE_DEMO_SEEDING` | `true` (dev) / `false` (prod) | Gate demo user/audit seeding (must be `false` in prod) |
| `EXPOSE_DEV_RESET_TOKEN` | `true` (dev) / `false` (prod) | Never expose reset tokens in API responses in prod |
| `GOOGLE_CLIENT_ID` | *(optional)* | Google OAuth 2.0 Web Client ID |
| `GOOGLE_CLIENT_SECRET` | *(optional)* | Google OAuth 2.0 Client Secret |
| `EMAIL_PROVIDER` | *(optional in dev)* | Email provider (`resend`, `sendgrid`, `mailgun`, `smtp`) for password resets |
| `EMAIL_API_KEY` | *(provider key)* | API key for `resend`/`sendgrid`/`mailgun` |
| `EMAIL_FROM` | `noreply@protocolshield.org` | Sender address for transactional password-reset emails |
| `VITE_API_BASE_URL` | *(empty / Vite proxy)* | Frontend build env var for deployed backend origin |

