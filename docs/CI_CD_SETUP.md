# ProtocolShield CI/CD & Cloud Deployment Guide

This guide documents the GitHub Actions workflows, repository security settings, branch protection rules, and Render deployment configuration for **ProtocolShield**.

---

## 1. GitHub Actions Workflows Overview

All workflows live under `.github/workflows/` and pin third-party actions to verified full commit SHAs with least-privilege `permissions`.

| Workflow | File | Triggers | Purpose |
| :--- | :--- | :--- | :--- |
| **CI Pipeline** | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Pull requests to `master`, pushes to `master`, `workflow_dispatch` | Backend `compileall`, `ruff`, `pip check`, startup validation, full `pytest` suite (+ JUnit report); Frontend `npm ci`, `tsc -b --noEmit`, `oxlint`, Vitest (+ JUnit report), Vite production build; Live Uvicorn + isolated DuckDB HTTP E2E integration tests + YAML validation |
| **Security Scan** | [`.github/workflows/security.yml`](../.github/workflows/security.yml) | Pull requests to `master`, pushes to `master`, weekly schedule (`0 3 * * 1`), `workflow_dispatch` | Python `pip-audit` + Bandit SAST (`backend/app`), frontend `npm audit --omit=dev --audit-level=high`, tracked secret-file guard + TruffleHog OSS secret scan, and GitHub Pull Request Dependency Review (`fail-on-severity: high`) |
| **Deploy to Render** | [`.github/workflows/deploy-render.yml`](../.github/workflows/deploy-render.yml) | `workflow_run` on `master` only when `CI Pipeline` completes with `conclusion == 'success'` (push events only), or confirmed `workflow_dispatch` | Triggers Render Deploy Hook via secret `RENDER_DEPLOY_HOOK_URL` (and optional `RENDER_FRONTEND_DEPLOY_HOOK_URL`), then verifies `/health` and `/ready` return `200` if `RENDER_BACKEND_URL` is provided. Never runs on pull requests |
| **Controlled Release** | [`.github/workflows/release.yml`](../.github/workflows/release.yml) | Tags `v*.*.*` or manual `workflow_dispatch` | Validates SemVer tag format and `origin/master` lineage, runs full backend + frontend verification suites cleanly, and publishes a GitHub Release |

---

## 2. Required GitHub Repository Secrets & Variables

Configure these in **GitHub Repository Settings → Secrets and variables → Actions** before enabling automatic Render deployment:

### Repository Secrets (Required for Deployment)
| Name | Required | Purpose |
| :--- | :--- | :--- |
| `RENDER_DEPLOY_HOOK_URL` | Yes (for `deploy-render.yml`) | Render Web Service Deploy Hook URL for `protocolshield-api` |
| `RENDER_FRONTEND_DEPLOY_HOOK_URL` | Optional | Render Static Site Deploy Hook URL for `protocolshield-web` if not auto-triggered separately |

### Repository Variables / Optional Endpoints
| Name | Required | Purpose |
| :--- | :--- | :--- |
| `RENDER_BACKEND_URL` | Recommended | Public HTTPS URL of `protocolshield-api` (e.g., `https://protocolshield-api.onrender.com`) so `deploy-render.yml` polls `/health` and `/ready` after triggering deployment |

> [!IMPORTANT]
> Never store runtime application secrets (like production `JWT_SECRET_KEY`, `EMAIL_API_KEY`, or database files) in GitHub CI workflow logs or frontend `VITE_*` variables. Configure production application secrets directly inside Render's Service Environment Settings.

---

## 3. Recommended GitHub Branch Protection Rules (`master`)

Because branch protection settings are managed through GitHub Repository Settings (not Git commits), a repository administrator should configure **Settings → Branches → Branch protection rules** for `master` with:

1. **Require a pull request before merging:** Enabled (require at least 1 approving review before merging into `master`).
2. **Dismiss stale pull request approvals when new commits are pushed:** Enabled.
3. **Require status checks to pass before merging:** Enabled (`Require branches to be up to date before merging`), selecting:
   - `Backend Lint, Import & Pytest`
   - `Frontend Typecheck, Lint, Tests & Build`
   - `Full-Stack HTTP & Workflow Validation`
   - `Python Dependencies & Bandit SAST`
   - `Frontend Dependency Vulnerability Audit`
   - `Secret & Credential Hygiene Scan`
   - `Pull Request Dependency Review`
4. **Do not allow bypassing the above settings** (recommended for production integrity).
5. **Restrict force pushes & branch deletions:** Leave force pushes and branch deletions disabled for `master`.

---

## 4. Render Production Architecture & DuckDB Persistence

The [`render.yaml`](../render.yaml) Blueprint configures two coordinated services:

1. **Backend Web Service (`protocolshield-api`)**
   - **Runtime:** Python (`3.13.3`)
   - **Build Command:** `pip install --upgrade pip && pip install -r backend/requirements.txt`
   - **Start Command:** `uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT --workers 1`
   - **Health Check Path:** `/ready`
   - **Persistent Disk:** `mountPath: /var/data`, `DB_PATH: /var/data/protocolshield_cohort.duckdb`
   - **Single-Worker / Single-Instance Rule:** DuckDB maintains an exclusive OS file lock on the `.duckdb` database file. Always keep `WEB_CONCURRENCY=1`, `--workers 1`, and a single instance (`numInstances: 1`) attached to `/var/data`. Do not deploy Render Free tier instances without a persistent disk in production because ephemeral filesystems wipe user accounts, `patient_screenings`, and SHA-256 `audit_logs` on restart.

2. **Frontend Static Site (`protocolshield-web`)**
   - **Build Command:** `npm --prefix frontend ci && npm --prefix frontend run build`
   - **Publish Directory:** `frontend/dist`
   - **Build Environment Variable:** `VITE_API_BASE_URL` pointing to the deployed `protocolshield-api` HTTPS URL.

---

## 5. Manual Render Deployment & Rollback Procedure

### Initial Provisioning / Manual Deploy
1. Connect the GitHub repository in Render (`New + → Blueprint` or configure Web Service + Static Site matching `render.yaml`).
2. Populate all `sync: false` secrets in Render (`JWT_SECRET_KEY`, `FRONTEND_URL`, `BACKEND_CORS_ORIGINS`, `TRUSTED_PROXIES`, `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `VITE_API_BASE_URL`, optional `GOOGLE_CLIENT_ID`).
3. Verify `ENVIRONMENT=production`, `DEBUG=false`, `ENABLE_DEMO_SEEDING=false`, and `EXPOSE_DEV_RESET_TOKEN=false`.
4. Confirm startup succeeded by testing:
   ```bash
   curl -fsS https://<your-api-domain>/health
   curl -fsS https://<your-api-domain>/ready
   ```
5. Provision the first production `admin` user manually inside the Render shell (see [`PRODUCTION_DEPLOYMENT_CHECKLIST.md`](../PRODUCTION_DEPLOYMENT_CHECKLIST.md)).

### Rollback Procedure
1. In **Render Dashboard → Service → Events/Deploys**, select the last known-good deploy and click **Rollback to this deploy** (note: code rolls back immediately, while the `/var/data/protocolshield_cohort.duckdb` persistent disk preserves schema-compatible tables).
2. In GitHub, revert the problematic commit via Pull Request on `master` so automated CI and subsequent deployments align with the rolled-back codebase.

---

## 6. Common Deployment Failures

| Symptom | Likely Cause | Fix |
| :--- | :--- | :--- |
| Process exits immediately with code 1 (`[STARTUP FAILURE]`) | Unsafe production env var (`DEBUG=true`, `ENABLE_DEMO_SEEDING=true`, `EXPOSE_DEV_RESET_TOKEN=true`, weak `JWT_SECRET_KEY`, or `*` in `TRUSTED_PROXIES`/`BACKEND_CORS_ORIGINS`) | Fix environment settings in Render Dashboard matching `.env.example` |
| `RuntimeError: Production DuckDB database ... is locked` | Multiple Uvicorn workers (`--workers > 1`) or scaling >1 instance against one `.duckdb` disk | Enforce `--workers 1`, `WEB_CONCURRENCY=1`, single instance |
| `/ready` returns HTTP `503` (`persistent_storage: false`) | Persistent disk missing/unmounted and DB fell back or failed lock check | Attach Render Disk at `/var/data` and set `DB_PATH=/var/data/protocolshield_cohort.duckdb` |
| Forgot-password returns HTTP `503` | `EMAIL_PROVIDER` / `EMAIL_API_KEY` / `EMAIL_FROM` unset in production | Configure valid email provider credentials in Render |
| Frontend CORS or API calls fail on deployed static site | `VITE_API_BASE_URL` unset during frontend build or missing origin in `BACKEND_CORS_ORIGINS` | Set `VITE_API_BASE_URL` in static site build env and exact HTTPS origin in backend `FRONTEND_URL`/`BACKEND_CORS_ORIGINS` |
