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

# Start FastAPI development server
uvicorn backend.app.main:app --reload --port 8000
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
