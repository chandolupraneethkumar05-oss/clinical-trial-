"""
ProtocolShield Grounded AI Assistant Engine
Explains clinical trial concepts, acronyms, live platform metrics, and project workflows
in the user's exact requested format (one line, short paragraph, summary, or bullet breakdown).
Never fabricates statistics or medical claims; uses verified DB/project facts and optional Gemini API.
"""
from __future__ import annotations

import difflib
import json
import logging
import re
import time
from typing import Any, Optional

from app.core.config import settings
from app.db.duckdb_client import db_client

logger = logging.getLogger(__name__)


class AssistantUnavailableError(Exception):
    """Raised when server-side LLM/audio reasoning is requested without configuration."""


# Canonical, code-verified ProtocolShield & clinical trial glossary
# Each entry provides clean facet variants so conversational follow-ups (1-line, small paragraph,
# advantages, how-it-works, full form) adapt naturally instead of repeating the same text block.
GLOSSARY_ENTRIES: list[dict[str, Any]] = [
    {
        "id": "ai_assistant_role",
        "term": "ProtocolShield AI Guide (Assistant)",
        "full_form": "ProtocolShield Grounded AI Guide — Text & Voice Clinical Explainer",
        "aliases": [
            "who are you",
            "what are you",
            "use of you",
            "your use",
            "how can you help",
            "what can you do",
            "your purpose",
            "your role",
            "help me",
            "about you",
        ],
        "one_line": (
            "I am your ProtocolShield AI Guide, here to explain clinical trial terms, lab cutoffs, "
            "and platform tools clearly in plain language via text or voice."
        ),
        "small_paragraph": (
            "I help patients, doctors, and administrators understand everything inside ProtocolShield without jargon. "
            "You can ask me the full form or importance of clinical acronyms like ECOG, eGFR, or PBI, ask about live cohort numbers, "
            "or ask how any screen works—and switch to Voice Mode anytime for hands-free questions and spoken replies."
        ),
        "advantage": (
            "Instead of searching through 100-page trial PDFs or decoding medical abbreviations alone, "
            "you get instant plain-English explanations grounded directly in ProtocolShield's verified rules and live database metrics."
        ),
        "how_it_works": (
            "I match your question against verified ProtocolShield system rules and live DuckDB statistics "
            "(and use Google Gemini reasoning when configured on the server), automatically adapting replies to one-line answers, short paragraphs, or spoken voice."
        ),
        "simple_explanation": (
            "I am an embedded clinical-trial explainer built specifically for ProtocolShield's Patient, Doctor, and Admin portals."
        ),
        "why_important": (
            "Clear plain-English guidance removes confusion around lab thresholds, exclusion rules, and protocol burden scores."
        ),
        "used_in_project": (
            "Available globally via the floating bottom-right avatar across Patient, Doctor, and Admin portals with Voice Mode support."
        ),
    },
    {
        "id": "project_purpose",
        "term": "ProtocolShield Platform",
        "full_form": "ProtocolShield — Clinical Trial Feasibility, Patient Burden & Attrition Optimizer",
        "aliases": [
            "this project",
            "the project",
            "protocolshield",
            "protocol shield",
            "why this project",
            "what is this project",
            "use of this project",
            "purpose of this project",
            "advantage of this project",
            "benefits of this project",
            "what does protocolshield do",
            "how does protocolshield work",
            "explain project",
        ],
        "one_line": (
            "ProtocolShield tests clinical trial eligibility rules and clinic visit burden before enrollment opens "
            "so sponsors widen access cleanly and patients avoid exhausting protocols."
        ),
        "small_paragraph": (
            "Clinical trials frequently stall because eligibility rules exclude too many real-world patients or demand grueling clinic visit schedules. "
            "ProtocolShield lets investigators parse protocol PDFs, test relaxing rules like eGFR or ECOG in real time across the cohort database, "
            "and spot high-dropout visit weeks before launch—while giving patients a private preliminary self-screening portal."
        ),
        "advantage": (
            "Its core advantage is catching costly enrollment bottlenecks and patient dropout risks before a trial activates. "
            "Teams see exact candidate recovery counts in DuckDB, quantify visit burden via PBI, verify every edit in a SHA-256 ledger, "
            "and offer patients private self-screening with clinician review."
        ),
        "how_it_works": (
            "First, doctors upload a protocol PDF (or pick a built-in NSCLC, TNBC, or Myeloma template) to extract eligibility criteria and clinic visits; "
            "second, DuckDB slices the cohort SQL table to measure screen failures and test What-If adjustments while scoring visit burden (PBI 0–100); "
            "third, patients self-screen privately while admins govern user roles and verify audit integrity."
        ),
        "simple_explanation": (
            "ProtocolShield helps clinical teams spot overly strict exclusion rules and exhausting visit schedules before opening a trial, "
            "and gives patients a private self-check tool."
        ),
        "why_important": (
            "Catching narrow rules and heavy visit fatigue before launch improves diversity equity (FDORA goals), prevents enrollment failures, and protects patient retention."
        ),
        "used_in_project": (
            "Connects the Doctor Studio (PDF parsing, What-If SQL simulator, PBI matrix, live ClinicalTrials.gov lookup), "
            "Patient Portal (self-screening & trial interest), and Admin Console (readiness, user governance, 21 CFR Part 11 verification)."
        ),
    },
    {
        "id": "ecog",
        "term": "ECOG",
        "full_form": "Eastern Cooperative Oncology Group Performance Status (0 to 4)",
        "aliases": ["ecog", "ecog score", "performance status", "ecog 0", "ecog 1", "ecog 2"],
        "one_line": (
            "ECOG stands for Eastern Cooperative Oncology Group Performance Status, a 0-to-4 scale measuring how well a patient manages daily physical activities."
        ),
        "small_paragraph": (
            "ECOG (Eastern Cooperative Oncology Group Performance Status) scores daily functioning from 0 to 4: "
            "0 means fully active, 1 allows light work with strenuous effort limited, 2 means walking and self-care are fine though unable to work, "
            "3 means confined to bed or chair over half the day, and 4 means completely disabled. Checking ECOG 0–2 expansion helps trials include real-world older or rural patients safely."
        ),
        "advantage": (
            "Simulating ECOG relaxation (for instance testing ECOG <= 2 instead of <= 1) lets investigators see immediately in DuckDB how many ambulatory patients can safely qualify."
        ),
        "simple_explanation": (
            "A 0-to-4 functional scale showing how active a patient is day-to-day (0 = full activity; 1 = light work OK; 2 = up >50% of waking hours; 3 = bed/chair >50%; 4 = completely disabled)."
        ),
        "why_important": (
            "Many trials restrict entry to ECOG 0–1 automatically, excluding otherwise stable patients who have mild fatigue."
        ),
        "used_in_project": (
            "Used in Eligibility Sandbox Stage 2 filtering (`max_ecog`), What-If sliders, and Patient Self-Screening."
        ),
    },
    {
        "id": "egfr",
        "term": "eGFR",
        "full_form": "Estimated Glomerular Filtration Rate (Kidney Filtration Speed in mL/min)",
        "aliases": ["egfr", "gfr", "kidney", "renal", "creatinine", "crcl", "gcrgr", "egfr_ml_min"],
        "one_line": (
            "eGFR (Estimated Glomerular Filtration Rate) measures in mL/min how effectively a patient's kidneys filter waste and clear study drugs from blood."
        ),
        "small_paragraph": (
            "eGFR stands for Estimated Glomerular Filtration Rate, measured in mL/min/1.73m². Higher numbers reflect stronger kidney filtering capacity. "
            "While kidneys must safely clear toxic drugs, strict cutoffs like eGFR >= 60 often exclude many older candidates unnecessarily—so calibrating to >= 50 mL/min when clinically safe often boosts eligible enrollment."
        ),
        "advantage": (
            "Calibrating overly strict eGFR >= 60 rules down to eGFR >= 50 for non-renally cleared therapies directly recovers older candidates without guessing."
        ),
        "simple_explanation": (
            "A blood-test calculation showing how fast kidneys filter waste (measured in mL/min)."
        ),
        "why_important": (
            "Protects kidney safety while preventing arbitrary cutoffs (like >= 60) from shutting out older adults."
        ),
        "used_in_project": (
            "Checked in Stage 3 Lab Filtering (`min_egfr`) during cohort simulations, Amendment `AMD-01`, and Patient Portal kidney input."
        ),
    },
    {
        "id": "anc",
        "term": "ANC",
        "full_form": "Absolute Neutrophil Count (Infection-Fighting White Blood Cells)",
        "aliases": ["anc", "neutrophil", "neutrophils", "white blood cell", "wbc"],
        "one_line": (
            "ANC stands for Absolute Neutrophil Count, measuring the main infection-fighting white blood cells before starting trial therapy."
        ),
        "small_paragraph": (
            "ANC (Absolute Neutrophil Count) counts the white blood cells that fight bacterial infections, checked in cells per microliter (often >= 1,500/uL for oncology trials). "
            "Because systemic cancer therapies can temporarily lower white blood cells, protocols confirm healthy baseline ANC to prevent serious infections."
        ),
        "simple_explanation": (
            "The count of neutrophils—white blood cells that protect the body from bacterial infections."
        ),
        "why_important": (
            "Helps verify immune readiness so investigational cancer drugs do not trigger dangerous neutropenic infections."
        ),
        "used_in_project": (
            "Evaluated in Stage 3 hematologic safety rules (`min_anc`) across DuckDB cohort simulation and Patient Portal screening."
        ),
    },
    {
        "id": "platelets_hemoglobin",
        "term": "Platelets & Hemoglobin",
        "full_form": "Platelet Count (Clotting Cells) and Hemoglobin (Oxygen-Carrying Protein)",
        "aliases": ["platelets", "platelet", "hemoglobin", "hgb", "hb", "anemia", "cbc"],
        "one_line": (
            "Platelets measure blood-clotting cells (K/uL) to guard against bleeding, while Hemoglobin measures oxygen-carrying red cell protein (g/dL)."
        ),
        "small_paragraph": (
            "Routine Complete Blood Count (CBC) checks verify Platelets (clotting cells in K/uL, commonly >= 100) and Hemoglobin (oxygen carrier in g/dL, commonly >= 9.0). "
            "Setting safe minimums protects patients from bleeding risk and severe anemia fatigue during therapy."
        ),
        "simple_explanation": (
            "Platelets stop bleeding by clotting blood, and Hemoglobin carries oxygen throughout the body."
        ),
        "why_important": (
            "Low counts increase bleeding or fatigue risk under systemic oncology regimens."
        ),
        "used_in_project": (
            "Evaluated in Stage 3 lab thresholds (`min_platelets`, `min_hemoglobin`) in Doctor simulation and Patient Screening."
        ),
    },
    {
        "id": "alt_uln",
        "term": "ALT & ULN",
        "full_form": "Alanine Aminotransferase (ALT) & Upper Limit of Normal (ULN)",
        "aliases": ["alt", "uln", "liver", "hepatic", "transaminase", "alt uln", "max_alt_uln"],
        "one_line": (
            "ALT is a liver enzyme checked in blood tests, and ULN means Upper Limit of Normal—used as multiples like 2.5x ULN across hospital labs."
        ),
        "small_paragraph": (
            "ALT (Alanine Aminotransferase) is a key liver health enzyme, and ULN stands for Upper Limit of Normal—the upper reference cutoff for healthy labs. "
            "Protocols express liver limits like <= 2.5x ULN (reference 56 U/L) because different hospital machines have slightly different normal scales."
        ),
        "simple_explanation": (
            "ALT measures liver stress, while ULN ('Upper Limit of Normal') normalizes cutoffs across different hospital lab scales."
        ),
        "why_important": (
            "Because the liver metabolizes trial drugs, verifying ALT against ULN prevents liver toxicity fairly."
        ),
        "used_in_project": (
            "Normalized identically by `compute_max_alt_u_l()` in `eligibility.py` for both SQL cohort filtering and patient screening."
        ),
    },
    {
        "id": "biomarkers",
        "term": "Tumor Biomarkers (PD-L1, EGFR, HER2, ER/PR, BCMA)",
        "full_form": "Targeted Molecular Markers for Precision Oncology Matching",
        "aliases": ["biomarker", "biomarkers", "pd-l1", "pdl1", "egfr mutation", "her2", "er/pr", "bcma", "tnbc", "nsclc", "myeloma"],
        "one_line": (
            "Biomarkers like PD-L1, EGFR, HER2, ER/PR, and BCMA are molecular features on tumor cells used to match patients to targeted trials."
        ),
        "small_paragraph": (
            "Biomarkers act like molecular locks or flags on tumor cells: PD-L1 and EGFR guide Non-Small Cell Lung Cancer (NSCLC) trials, "
            "HER2 and ER/PR hormone receptors define Triple-Negative Breast Cancer (TNBC) eligibility, and BCMA targets Multiple Myeloma studies. "
            "Screening on biomarkers prevents giving targeted therapies to subgroups that will not respond."
        ),
        "simple_explanation": (
            "Tumor markers tested on biopsies or blood to verify whether a targeted cancer therapy fits the tumor biology."
        ),
        "why_important": (
            "Avoids ineffective treatment by pairing each mechanism (immunotherapy, ADC, or bispecific antibody) to the right cancer profile."
        ),
        "used_in_project": (
            "Powers subtype matching across NSCLC, TNBC Breast Cancer, and Multiple Myeloma in the DuckDB cohort and Patient Portal."
        ),
    },
    {
        "id": "cns",
        "term": "CNS (Brain Metastases)",
        "full_form": "Central Nervous System Involvement / Brain Metastases Status",
        "aliases": ["cns", "brain met", "brain metastases", "leptomeningeal", "stable brain"],
        "one_line": (
            "CNS stands for Central Nervous System; protocols separate untreated active brain metastases (excluded for safety) from treated stable lesions."
        ),
        "small_paragraph": (
            "CNS refers to the brain and spinal cord. Trials typically exclude active, untreated brain metastases (`has_active_brain_mets`) for neurologic safety, "
            "but modern FDA guidance encourages permitting *stable, previously treated* brain metastases (`allow_stable_brain_mets`)—and missing CNS history safely flags `Requires Investigator Review`."
        ),
        "simple_explanation": (
            "Checks whether cancer has spread to the brain and separates active untreated lesions from previously treated, stable lesions."
        ),
        "why_important": (
            "Blanket exclusion of stable treated CNS patients shuts out up to a quarter of advanced lung/breast cancer candidates."
        ),
        "used_in_project": (
            "Controlled via `allow_stable_brain_mets` & `exclude_active_brain_mets` in backend rules, What-If toggles, and strict tri-state screening."
        ),
    },
    {
        "id": "pbi",
        "term": "PBI (Patient Burden Index)",
        "full_form": "Patient Burden Index — Composite 0–100 Protocol Friction Score",
        "aliases": ["pbi", "patient burden", "burden index", "burden score", "attrition risk", "temporal", "invasive", "cognitive"],
        "one_line": (
            "PBI (Patient Burden Index) is a 0-to-100 score combining clinic time, invasive procedures, and visit frequency to predict patient fatigue and dropout risk."
        ),
        "small_paragraph": (
            "The Patient Burden Index scores clinical schedules from 0 to 100 by weighting Temporal burden (clinic dwell + transit hours), "
            "Invasive burden (biopsies, CT/MRI scans, dense PK blood draws), and Cognitive burden (fasting and visit density). "
            "Scores fall into Low (<35), Moderate (<60), High (<78), or Severe (>=78) friction tiers so teams spot burdensome weeks before enrollment."
        ),
        "advantage": (
            "Quantifying burden early shows which specific clinic week causes dropout spikes—for example showing how converting an on-treatment biopsy lowers PBI directly."
        ),
        "simple_explanation": (
            "A 0-to-100 composite friction score measuring how tiring and invasive a study visit calendar is for participants."
        ),
        "why_important": (
            "Protocols with Severe PBI (>= 78) suffer high mid-study withdrawal even when patients pass initial eligibility criteria."
        ),
        "used_in_project": (
            "Calculated live from visit schedules in `burden_scorer.py` and displayed in Doctor Studio, Optimizer amendments, and Patient burden summaries."
        ),
    },
    {
        "id": "soa",
        "term": "SoA (Schedule of Assessments / Events)",
        "full_form": "Schedule of Assessments (Schedule of Events)",
        "aliases": ["soa", "schedule of assessments", "schedule of events", "visit calendar", "pk_serial"],
        "one_line": (
            "SoA stands for Schedule of Assessments—the study's week-by-week calendar of every clinic visit, scan, lab draw, infusion, and biopsy."
        ),
        "small_paragraph": (
            "The Schedule of Assessments (SoA) is the trial protocol's visit matrix mapping every week or cycle against required clinic procedures. "
            "ProtocolShield extracts SoA tables from uploaded PDFs via `pdfplumber` and flags peak burden weeks where heavy scans or biopsies cluster together."
        ),
        "simple_explanation": (
            "The master timeline showing what procedures happen at Screening, Cycle 1, restaging weeks, and End of Treatment."
        ),
        "why_important": (
            "Reveals stacked procedures on single clinic days (e.g., dense 6-hour PK + biopsy + CT scan) that drive patient burnout."
        ),
        "used_in_project": (
            "Parsed by `ProtocolPDFParser` and rendered interactively in the Doctor Studio's Schedule of Assessments matrix."
        ),
    },
    {
        "id": "recist",
        "term": "RECIST v1.1",
        "full_form": "Response Evaluation Criteria in Solid Tumors (Version 1.1)",
        "aliases": ["recist", "measurable disease", "tumor measurement", "ct scan"],
        "one_line": (
            "RECIST v1.1 is the standard international imaging rulebook doctors use to measure tumor shrinkage or growth on CT and MRI scans."
        ),
        "small_paragraph": (
            "RECIST v1.1 (Response Evaluation Criteria in Solid Tumors) defines objective rules for measuring target lesions on contrast CT or MRI scans "
            "so hospitals measure treatment response consistently across trial sites."
        ),
        "simple_explanation": (
            "Standard CT/MRI measurement criteria used to track tumor response consistently."
        ),
        "why_important": (
            "Keeps tumor progression and partial-response endpoints reproducible across sites, though frequent scans raise patient time burden."
        ),
        "used_in_project": (
            "Included in protocol eligibility clauses and contrast CT / brain MRI visit cadence scoring."
        ),
    },
    {
        "id": "fdora",
        "term": "FDORA",
        "full_form": "Food and Drug Omnibus Reform Act (FDA Trial Diversity Mandate)",
        "aliases": ["fdora", "diversity", "equity", "rural", "distance", "health equity"],
        "one_line": (
            "FDORA is U.S. legislation requiring late-stage clinical trials to submit Diversity Action Plans so studies include real-world age, racial, and rural populations."
        ),
        "small_paragraph": (
            "The Food and Drug Omnibus Reform Act (FDORA, Section 3601) mandates Diversity Action Plans for pivotal trials so enrollment reflects real-world patients across age, ancestry, and geography. "
            "ProtocolShield measures age/ancestry/rural shifts in DuckDB when optimizing protocols (such as widening eGFR thresholds) and tracks distance in the cohort overview and patient screening."
        ),
        "simple_explanation": (
            "U.S. regulatory framework requiring sponsors to plan diverse and accessible clinical trial enrollment."
        ),
        "why_important": (
            "Narrow lab rules and distant trial visits disproportionately exclude elderly, minority, and rural patients."
        ),
        "used_in_project": (
            "Tracked via DuckDB demographic cohort analytics (`patients` table rurality/race/age >= 65), Optimizer equity impact calculations, and Patient travel distance inputs."
        ),
    },
    {
        "id": "cfr_part_11",
        "term": "21 CFR Part 11 & Audit Chain",
        "full_form": "FDA Title 21 CFR Part 11 (Electronic Records & Cryptographic Audit Trails)",
        "aliases": ["21 cfr", "part 11", "audit", "audit trail", "sha-256", "hash chain", "tamper"],
        "one_line": (
            "21 CFR Part 11 is the FDA regulation for electronic records; ProtocolShield chains audit events with SHA-256 hashes to detect tampering."
        ),
        "small_paragraph": (
            "FDA 21 CFR Part 11 sets technical integrity standards for clinical electronic records. "
            "ProtocolShield writes critical actions—PDF uploads, applied amendments, role promotions, trial interests, and investigator verifications—into DuckDB with sequential SHA-256 hashes linked to the prior record so any alteration breaks chain verification."
        ),
        "simple_explanation": (
            "FDA electronic record-keeping standard enforced via sequentially linked SHA-256 audit hashes."
        ),
        "why_important": (
            "Gives regulators and sponsors verifiable proof of who modified protocol parameters or verified clinical records and when."
        ),
        "used_in_project": (
            "Stored in DuckDB `audit_logs` and inspected via `/api/v1/audit/verify` in Doctor Studio and Admin Console."
        ),
    },
    {
        "id": "benchmark_trials",
        "term": "Peer Benchmarks & ClinicalTrials.gov Lookup",
        "full_form": "Live ClinicalTrials.gov Registry Benchmarking",
        "aliases": ["benchmark", "benchmarks", "clinicaltrials", "clinicaltrials.gov", "nct"],
        "one_line": (
            "Peer Benchmarks pull completed and terminated trials live from ClinicalTrials.gov API v2 so investigators can compare study statuses and eligibility designs."
        ),
        "small_paragraph": (
            "ProtocolShield connects directly to the public ClinicalTrials.gov v2 REST API to fetch real completed and terminated trials as well as individual study records by NCT ID. "
            "Investigators can inspect why historical studies stopped (such as slow accrual) alongside their real eligibility criteria."
        ),
        "simple_explanation": (
            "Live integration with ClinicalTrials.gov API v2 for inspecting completed/terminated trials and NCT studies."
        ),
        "why_important": (
            "Compares new protocols against real historical enrollment successes and terminations rather than working in isolation."
        ),
        "used_in_project": (
            "Powers the Peer Benchmarks tab via `/api/v1/benchmark/historical-trials` and `/clinicaltrials-live/{nct_id}`."
        ),
    },
    {
        "id": "ai_optimizer",
        "term": "Protocol Amendment Optimizer",
        "full_form": "Protocol Amendment Proposal & Simulation Engine",
        "aliases": ["optimizer", "amendment", "amendments", "amd-01", "amd-02", "amd-03", "redline"],
        "one_line": (
            "The Protocol Optimizer analyzes protocol rules and schedules to propose concrete amendments with live DuckDB candidate-yield and PBI burden deltas."
        ),
        "small_paragraph": (
            "The Amendment Advisor inspects structured criteria (like eGFR >= 60 or CNS exclusions) and heavy visits (like mandatory on-treatment core biopsies or dense PK visits), "
            "simulates relaxing or decentralizing them against the DuckDB patient cohort and Tufts burden calculator, and lets investigators apply changes in one click."
        ),
        "simple_explanation": (
            "Suggests specific eligibility and schedule improvements backed by counterfactual DuckDB yield and PBI re-scoring."
        ),
        "why_important": (
            "Shows exact candidate and burden impact before sending protocol amendments to an IRB or FDA review."
        ),
        "used_in_project": (
            "Exposed via `/api/v1/optimizer/propose-amendments` and `/apply-amendment` inside the Doctor Studio."
        ),
    },
    {
        "id": "portals_roles",
        "term": "Three Role Portals (Patient, Doctor, Admin)",
        "full_form": "Role-Separated Authentication & Access Workspaces",
        "aliases": [
            "patient portal",
            "doctor portal",
            "admin portal",
            "admin page",
            "roles",
            "how to login",
            "switch role",
            "investigator",
        ],
        "one_line": (
            "ProtocolShield separates login and UI into three RBAC-enforced portals: Patient Self-Screening, Doctor Studio, and the Administrator Console."
        ),
        "small_paragraph": (
            "Access is strictly divided across three roles verified on the server: Patients (`#/patient`) privately screen themselves and signal trial interest; "
            "Doctors (`#/studio`) parse PDFs, run What-If cohort simulations, score SoA burden, and review benchmarks; "
            "Admins (`#/admin`) oversee system readiness, DuckDB cohort seeding, user role promotion, screening verification, and audit logs."
        ),
        "simple_explanation": (
            "Three server-enforced portals isolating patient screening, investigator trial analytics, and admin system governance."
        ),
        "why_important": (
            "Prevents patients from altering trial parameters or viewing other subjects while reserving role promotion and seeding for admins."
        ),
        "used_in_project": (
            "Enforced on login via `expected_role` and JWT/RBAC middleware across every API route."
        ),
    },
    {
        "id": "voice_mode",
        "term": "Voice Mode",
        "full_form": "Browser Web Speech & Optional Server Audio Voice Interaction",
        "aliases": ["voice", "microphone", "speak", "audio", "speech"],
        "one_line": (
            "Voice Mode lets you speak questions through your browser microphone and hear spoken answers read aloud cleanly."
        ),
        "small_paragraph": (
            "Click the microphone or toggle Voice Mode to talk directly to the floating guide. Your browser's Web Speech API captures speech and reads answers aloud cleanly; "
            "when server-side Gemini is configured (`GEMINI_API_KEY`), recorded audio clips can also be transcribed and answered by Gemini on `/api/v1/assistant/voice-chat`."
        ),
        "simple_explanation": (
            "Hands-free voice input and spoken text-to-speech responses inside the floating guide."
        ),
        "why_important": (
            "Lets both patients and investigators ask quick clinical or protocol questions without typing."
        ),
        "used_in_project": (
            "Uses browser `SpeechRecognition` / `speechSynthesis` plus optional Gemini audio fallback on `/api/v1/assistant/voice-chat`."
        ),
    },
]

_TYPO_HINTS: dict[str, str] = {
    "gcrgr": (
        "'GCRGR' is not a standard clinical acronym in ProtocolShield — it looks like a typo or speech-to-text match for "
        "**eGFR (Estimated Glomerular Filtration Rate)**, which measures kidney filtering speed (mL/min)."
    ),
    "ecgo": "'ECGO' looks like a typo for **ECOG (Eastern Cooperative Oncology Group Performance Status)**.",
    "edoa": "'EDOA' looks like a typo for **FDORA (Food and Drug Omnibus Reform Act)**.",
    "pb1": "'PB1' looks like a typo for **PBI (Patient Burden Index)**.",
}

_ONE_LINE_RE = re.compile(
    r"\b(?:in\s+)?(?:one|1|single)\s+(?:(?:short|brief|concise|simple|quick)\s+)?(?:line|sentence)\b|\bone[-\s]?liner\b|\btl;?dr\b|\bbrief\s+answer\b|\bshort\s+answer\b|\bin\s+short\b",
    re.IGNORECASE,
)
_SMALL_PARA_RE = re.compile(
    r"\b(?:small|short|brief|concise)\s+para(?:graph)?\b|\bfew\s+(?:lines|sentences)\b|\b(?:2|two)[-\s]*(?:3|three)\s+(?:lines|sentences)\b|\bin\s+(?:a\s+)?paragraph\b",
    re.IGNORECASE,
)
_SUMMARIZE_RE = re.compile(
    r"\b(?:summarize|summary|summarise|recap|sum\s+up|shorten|make\s+it\s+shorter|compress|boil\s+down)\b",
    re.IGNORECASE,
)
_BULLETS_RE = re.compile(
    r"\b(?:bullet\s*points?|bullets|in\s+points|numbered\s+list|step\s+by\s+step)\b",
    re.IGNORECASE,
)
_FOLLOWUP_REFERENT_RE = re.compile(
    r"\b(?:it|that|this|above|previous|same)\b",
    re.IGNORECASE,
)


def is_gemini_configured() -> bool:
    return bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())


def get_live_platform_facts() -> dict[str, Any]:
    """Reads live DuckDB metrics directly from real tables without fabricating counts."""
    cohort_count: Optional[int] = None
    cancer_types: list[str] = []
    avg_age: Optional[float] = None
    avg_egfr: Optional[float] = None
    avg_distance_miles: Optional[float] = None
    uploaded_protocols_count: Optional[int] = None
    patient_screenings_count: Optional[int] = None
    audit_events_count: Optional[int] = None

    try:
        conn = db_client.get_connection()
        try:
            row = conn.execute(
                """
                SELECT
                    COUNT(*),
                    ROUND(AVG(age), 1),
                    ROUND(AVG(egfr_ml_min), 1),
                    ROUND(AVG(distance_to_center_miles), 1)
                FROM patients
                """
            ).fetchone()
            if row:
                cohort_count = int(row[0] or 0)
                avg_age = float(row[1]) if row[1] is not None else None
                avg_egfr = float(row[2]) if row[2] is not None else None
                avg_distance_miles = float(row[3]) if row[3] is not None else None

            type_rows = conn.execute(
                "SELECT DISTINCT primary_cancer_type FROM patients WHERE primary_cancer_type IS NOT NULL ORDER BY 1"
            ).fetchall()
            cancer_types = [str(r[0]) for r in type_rows if r and r[0]]

            for tbl_sql, target in (
                ("SELECT COUNT(*) FROM uploaded_protocols", "uploaded"),
                ("SELECT COUNT(*) FROM patient_screenings", "screenings"),
                ("SELECT COUNT(*) FROM audit_logs", "audit"),
            ):
                try:
                    c_row = conn.execute(tbl_sql).fetchone()
                    val = int(c_row[0] or 0) if c_row else 0
                    if target == "uploaded":
                        uploaded_protocols_count = val
                    elif target == "screenings":
                        patient_screenings_count = val
                    elif target == "audit":
                        audit_events_count = val
                except Exception:
                    pass
        finally:
            conn.close()
    except Exception:
        pass

    return {
        "project_name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "cohort_patient_count": cohort_count,
        "cohort_cancer_types": cancer_types,
        "cohort_averages": {
            "age_years": avg_age,
            "egfr_ml_min": avg_egfr,
            "distance_miles": avg_distance_miles,
        },
        "uploaded_protocols_count": uploaded_protocols_count,
        "patient_screenings_count": patient_screenings_count,
        "audit_events_count": audit_events_count,
        "pbi_weights": {
            "temporal": settings.WEIGHT_TEMPORAL,
            "invasive": settings.WEIGHT_INVASIVE,
            "cognitive": settings.WEIGHT_COGNITIVE,
        },
        "pbi_risk_tiers": {
            "Low": "< 35.0",
            "Moderate": "35.0 - 59.9",
            "High": "60.0 - 77.9",
            "Severe": ">= 78.0",
        },
    }


def _detect_length_and_angle(question: str) -> tuple[str, str]:
    q_lower = (question or "").strip().lower()

    if _ONE_LINE_RE.search(q_lower):
        length_mode = "one_line"
    elif _SMALL_PARA_RE.search(q_lower):
        length_mode = "small_paragraph"
    elif _SUMMARIZE_RE.search(q_lower):
        length_mode = "summarize"
    elif _BULLETS_RE.search(q_lower):
        length_mode = "bullets"
    else:
        length_mode = "default"

    if re.search(r"\b(?:advantage|advantages|benefit|benefits|pros|value|gain|helpful|useful)\b", q_lower):
        angle = "advantage"
    elif re.search(r"\b(?:full\s+form|stand\s+for|stands\s+for|acronym|abbreviation)\b", q_lower):
        angle = "full_form"
    elif re.search(r"\b(?:how\s+(?:does|do|to|it)|workflow|process|steps|architecture)\b", q_lower):
        angle = "how"
    elif re.search(r"\b(?:how\s+many|live\s+count|patient\s+count|stats|statistics|average|how\s+much\s+data)\b", q_lower):
        angle = "live_stats"
    elif re.search(r"\b(?:why|important|matter|matters|purpose|use\s+of|reason)\b", q_lower):
        angle = "purpose"
    else:
        angle = "general"

    return length_mode, angle


def match_glossary_entries(question: str, limit: int = 3) -> tuple[list[dict[str, Any]], Optional[str]]:
    """
    Finds the most relevant verified glossary items using exact keyword/alias matching
    plus safe uppercase/token similarity for typos (never hallucinating unknown terms).
    """
    q_clean = (question or "").strip()
    q_lower = q_clean.lower()
    if not q_lower:
        return [], None

    raw_tokens = re.findall(r"[a-zA-Z0-9\-/]+", q_clean)
    tokens = [t.lower() for t in raw_tokens]
    explicit_typo_note: Optional[str] = None
    for tok in tokens:
        if tok in _TYPO_HINTS:
            explicit_typo_note = _TYPO_HINTS[tok]
            break

    # Explicitly handle assistant self-identity queries cleanly before project purpose
    self_query = bool(
        re.search(
            r"\b(?:who\s+are\s+you|what\s+are\s+you|use\s+of\s+you|your\s+use|your\s+role|your\s+purpose|what\s+can\s+you\s+do|about\s+you)\b",
            q_lower,
        )
    )

    _NON_ACRONYM_STOPWORDS = {
        "you", "one", "use", "why", "how", "the", "for", "can", "line", "lines", "sentence",
        "sentences", "short", "small", "brief", "para", "paragraph", "summary", "summarize",
        "give", "tell", "what", "when", "where", "who", "which", "this", "that", "with",
        "from", "about", "into", "advantage", "advantages", "benefit", "benefits", "project",
        "trial", "trials", "patient", "patients", "doctor", "doctors", "admin", "please",
        "simply", "simple", "clear", "clearly", "detail", "details", "right", "now", "many",
        "much", "make", "only", "just", "full", "form", "stand", "stands", "mean", "meaning",
    }

    scored: list[tuple[float, dict[str, Any], Optional[str]]] = []
    for entry in GLOSSARY_ENTRIES:
        score = 0.0
        entry_note: Optional[str] = explicit_typo_note if explicit_typo_note and entry["id"] in {"egfr", "ecog"} else None
        term_lower = entry["term"].lower()
        if term_lower in q_lower:
            score += 6.0
        for alias in entry["aliases"]:
            alias_l = alias.lower()
            if alias_l in q_lower:
                score += 4.5 + min(3.0, len(alias_l) / 8.0)
            else:
                alias_words = set(re.findall(r"[a-z0-9]+", alias_l))
                q_words = set(tokens)
                meaningful_alias = alias_words - {"of", "the", "this", "is", "are", "you", "what", "why", "how"}
                if meaningful_alias and len(meaningful_alias & q_words) == len(meaningful_alias):
                    score += 3.0

        # Only run fuzzy acronym matching when no exact alias matched and on uppercase/non-stopword tokens
        if score == 0.0:
            candidate_terms = [a for a in entry["aliases"] if len(a) <= 10 and " " not in a]
            for raw_tok in raw_tokens:
                tok = raw_tok.lower()
                looks_like_acronym_or_unknown = (raw_tok.isupper() and len(raw_tok) >= 3) or tok not in _NON_ACRONYM_STOPWORDS
                if len(tok) >= 3 and looks_like_acronym_or_unknown and tok not in _NON_ACRONYM_STOPWORDS:
                    close = difflib.get_close_matches(tok, candidate_terms, n=1, cutoff=0.78)
                    if close:
                        score += 2.5
                        if not entry_note:
                            entry_note = (
                                f"Closest verified ProtocolShield term to '{tok.upper()}' is **{entry['term']} ({entry['full_form']})**."
                            )

        if entry["id"] == "ai_assistant_role" and self_query:
            score += 10.0

        if entry["id"] == "project_purpose" and any(
            w in q_lower for w in ("project", "protocolshield", "advantage of this", "use of this", "why use", "purpose", "what is this")
        ) and not self_query:
            score += 8.0

        if score > 0 and any(p in q_lower for p in ("full form", "stand for", "meaning", "what is", "explain")):
            score += 0.5

        if score > 0:
            scored.append((score, entry, entry_note))

    scored.sort(key=lambda item: item[0], reverse=True)
    top_note = scored[0][2] if scored else explicit_typo_note
    return [item[1] for item in scored[:limit]], top_note


def _resolve_topic_from_history(
    question: str,
    history: Optional[list[dict[str, str]]],
) -> tuple[list[dict[str, Any]], Optional[str], Optional[str]]:
    """
    Resolves topic continuity when the user writes a follow-up like
    'give it in one line', 'summarize it', 'what is its advantage?', or 'make it a short paragraph'.
    Returns (matched_entries, clarification_note, previous_assistant_reply).
    """
    direct_matches, direct_note = match_glossary_entries(question, limit=3)
    prev_assistant: Optional[str] = None
    if history:
        for msg in reversed(history):
            if str(msg.get("role", "")).lower() == "assistant":
                txt = str(msg.get("content", "")).strip()
                if txt:
                    prev_assistant = txt
                    break

    if direct_matches:
        return direct_matches, direct_note, prev_assistant

    # Check if this looks like a format/angle follow-up referring back to recent conversation
    q_lower = question.strip().lower()
    length_mode, angle = _detect_length_and_angle(question)
    is_followup = (
        length_mode != "default"
        or angle != "general"
        or bool(_FOLLOWUP_REFERENT_RE.search(q_lower))
        or len(q_lower.split()) <= 6
    )

    if is_followup and history:
        for msg in reversed(history):
            content = str(msg.get("content", "")).strip()
            if not content:
                continue
            hist_matches, hist_note = match_glossary_entries(content, limit=2)
            if hist_matches:
                return hist_matches, hist_note, prev_assistant

    return [], direct_note, prev_assistant


def _distill_text_concisely(text: str, max_sentences: int = 1) -> str:
    """Condenses markdown prose into 1 or 2 crisp sentences cleanly for follow-up summaries."""
    cleaned = strip_markdown_for_speech(text)
    # Remove noisy lead-in tags before summarizing
    cleaned = re.sub(r"^(?:Note:\s*[^.]*\.\s*)", "", cleaned)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if len(s.strip()) > 12]
    if not sentences:
        return cleaned[:240].strip()
    if max_sentences == 1:
        lead = sentences[0]
        # Avoid ultra-tiny heading fragment as the entire summary
        if len(lead) < 35 and len(sentences) > 1:
            lead = f"{lead.rstrip('.')} — {sentences[1][0].lower() + sentences[1][1:] if len(sentences[1]) > 1 else sentences[1]}"
        return lead
    return " ".join(sentences[:max_sentences])


def build_welcome_payload(user_name: str, user_role: str) -> dict[str, Any]:
    """Generates a clear, honest role-specific login greeting and starter suggestions."""
    clean_name = (user_name or "there").strip()
    role = (user_role or "patient").strip().lower()
    if role == "admin":
        greeting = (
            f"Welcome, {clean_name}! You are signed in to the Administrator Console. "
            "Ask me about cohort operations, role governance, 21 CFR Part 11 audit verification, or any clinical term."
        )
        prompts = [
            "What is the advantage of this project in one line?",
            "Explain 21 CFR Part 11 & SHA-256 audit chain",
            "What is the full form of ECOG and eGFR?",
            "How many synthetic patients are in the database right now?",
        ]
    elif role == "doctor":
        greeting = (
            f"Welcome, {clean_name}! You are signed in to the Doctor / Investigator Studio. "
            "Ask me about PBI scores, Schedule of Assessments, FDORA equity metrics, or any eligibility acronym."
        )
        prompts = [
            "What is the Patient Burden Index (PBI) in one line?",
            "What is the advantage of this project?",
            "What is the full form of ECOG and eGFR?",
            "What is FDORA and how does ProtocolShield track diversity?",
        ]
    else:
        greeting = (
            f"Welcome, {clean_name}! You are signed in to the Patient Portal. "
            "I can explain lab terms like ECOG, eGFR, or ANC in plain language and guide you through trial screening."
        )
        prompts = [
            "What is the full form of ECOG in one line?",
            "What is eGFR (or GCRGR) and why check kidney labs?",
            "What is the use of this project in a small paragraph?",
            "How can I use Voice Mode?",
        ]

    return {
        "greeting": greeting,
        "role": role,
        "suggested_questions": prompts,
    }


def strip_markdown_for_speech(text: str) -> str:
    """Normalizes Markdown answers into natural spoken prose for Web Speech TTS."""
    clean = re.sub(r"`([^`]+)`", r"\1", text)
    clean = re.sub(r"\*\*([^*]+)\*\*", r"\1", clean)
    clean = re.sub(r"\*([^*]+)\*", r"\1", clean)
    clean = re.sub(r"^[\s\-\*\d\.]+", "", clean, flags=re.MULTILINE)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def _render_entry_by_style(
    entry: dict[str, Any],
    angle: str,
    length_mode: str,
    facts: dict[str, Any],
    clarification_note: Optional[str],
) -> str:
    """Selects and formats the exact right explanation facet & length for a topic."""
    live_count = facts.get("cohort_patient_count")
    count_clause = (
        f" across **{live_count:,}** patient records in DuckDB"
        if isinstance(live_count, int) and live_count > 0
        else ""
    )

    if length_mode == "one_line":
        if angle == "advantage":
            base = entry.get("advantage") or entry["why_important"]
            line = _distill_text_concisely(base, max_sentences=1)
        elif angle == "full_form":
            line = f"{entry['term']} stands for **{entry['full_form']}**—{_distill_text_concisely(entry['simple_explanation'], 1)[0].lower() + _distill_text_concisely(entry['simple_explanation'], 1)[1:]}"
        elif angle == "how" and entry.get("how_it_works"):
            line = _distill_text_concisely(entry["how_it_works"], max_sentences=1)
        else:
            line = entry.get("one_line") or _distill_text_concisely(entry["simple_explanation"], 1)
        if clarification_note:
            clean_hint = _distill_text_concisely(clarification_note, 1)
            return f"{clean_hint} {line}"
        return line

    if length_mode in {"small_paragraph", "summarize"}:
        if angle == "advantage" and entry.get("advantage"):
            para = entry["advantage"]
            if entry["id"] == "project_purpose" and count_clause:
                para = para.replace("in DuckDB", count_clause.strip())
        elif angle == "how" and entry.get("how_it_works"):
            para = entry["how_it_works"]
        elif entry.get("small_paragraph"):
            para = entry["small_paragraph"]
            if entry["id"] == "project_purpose" and isinstance(live_count, int) and live_count > 0:
                para = para.replace("across the cohort database", f"across {live_count:,} cohort profiles in DuckDB")
        else:
            para = f"{entry['term']} ({entry['full_form']}): {entry['simple_explanation']} {entry['why_important']}"

        if length_mode == "summarize":
            para = _distill_text_concisely(para, max_sentences=2)
        if clarification_note:
            return f"{clarification_note} {para}"
        return para

    # Default / Bullets — tailor strictly to the asked angle instead of dumping the exact same 3 bullets
    header = f"**{entry['term']}** — *{entry['full_form']}*"
    prefix_note = f"{clarification_note}\n\n" if clarification_note else ""

    if angle == "advantage":
        adv_text = entry.get("advantage") or entry["why_important"]
        lines = [
            f"{prefix_note}**Key Advantages of {entry['term']}:**",
            f"- **Primary benefit:** {adv_text}",
            f"- **Why it matters:** {entry['why_important']}",
        ]
        if entry["id"] == "project_purpose" and isinstance(live_count, int):
            lines.append(f"- **Live Cohort Ready:** Tested against **{live_count:,}** DuckDB patient profiles right now.")
        return "\n".join(lines)

    if angle == "how" and entry.get("how_it_works"):
        lines = [
            f"{prefix_note}**How {entry['term']} Works:**",
            entry["how_it_works"],
            f"- **Where used:** {entry['used_in_project']}",
        ]
        return "\n".join(lines)

    if angle == "full_form":
        lines = [
            f"{prefix_note}**{entry['term']}** = **{entry['full_form']}**",
            f"- **Plain meaning:** {entry['simple_explanation']}",
            f"- **Role in ProtocolShield:** {entry['used_in_project']}",
        ]
        return "\n".join(lines)

    # General balanced view
    body = [
        header,
        f"- **In simple words:** {entry['simple_explanation']}",
        f"- **Why it matters:** {entry['why_important']}",
        f"- **In ProtocolShield:** {entry['used_in_project']}",
    ]
    if entry["id"] == "project_purpose" and isinstance(live_count, int):
        c_types = ", ".join(facts["cohort_cancer_types"][:4]) if facts.get("cohort_cancer_types") else "oncology cohorts"
        body.append(f"- **Live Database Status:** **{live_count:,}** cohort records currently loaded ({c_types}).")
    elif entry["id"] == "pbi":
        w = facts["pbi_weights"]
        body.append(f"- **Active Scoring Weights:** Temporal {w['temporal']:.0%} + Invasive {w['invasive']:.0%} + Cognitive {w['cognitive']:.0%}.")
    return prefix_note + "\n".join(body)


def _format_local_grounded_reply(
    question: str,
    user_role: str,
    matched: list[dict[str, Any]],
    clarification_note: Optional[str],
    facts: dict[str, Any],
    prev_assistant: Optional[str] = None,
    fallback_reason: Optional[str] = None,
) -> dict[str, Any]:
    q_lower = question.strip().lower()
    length_mode, angle = _detect_length_and_angle(question)

    # Conversational greeting
    if re.fullmatch(r"(hi|hello|hey|good morning|good afternoon|good evening)[!. ]*", q_lower):
        welcome = build_welcome_payload("there", user_role)
        reply = "Hello! I am the ProtocolShield Assistant. " + welcome["greeting"].replace("Welcome, there! ", "")
        return {
            "reply": reply,
            "voice_script": strip_markdown_for_speech(reply),
            "mode": "local_knowledge_base",
            "llm_configured": is_gemini_configured(),
            "sources": ["ProtocolShield Portal Guide"],
            "suggested_questions": welcome["suggested_questions"],
            "clarification_note": None,
            "fallback_reason": fallback_reason,
        }

    # Explicit live database stats question
    if angle == "live_stats":
        cnt = facts.get("cohort_patient_count")
        avg = facts.get("cohort_averages") or {}
        if cnt is None:
            reply = "I could not read live metrics from DuckDB right now, so I will not guess any numbers."
        elif length_mode == "one_line":
            reply = (
                f"DuckDB currently holds {cnt:,} synthetic patient profiles "
                f"(average age {avg.get('age_years') or '—'} yrs, eGFR {avg.get('egfr_ml_min') or '—'} mL/min, "
                f"distance {avg.get('distance_miles') or '—'} mi), {facts.get('patient_screenings_count') or 0} saved screenings, "
                f"and {facts.get('audit_events_count') or 0} audit records."
            )
        else:
            c_types = ", ".join(facts.get("cohort_cancer_types") or []) or "multiple oncology phenotypes"
            reply = (
                f"**Live DuckDB Platform Metrics:**\n"
                f"- **Synthetic Cohort Records (`patients` table):** {cnt:,} across {c_types}\n"
                f"- **Cohort Averages:** Age {avg.get('age_years') if avg.get('age_years') is not None else '—'} yrs • eGFR {avg.get('egfr_ml_min') if avg.get('egfr_ml_min') is not None else '—'} mL/min • Travel Distance {avg.get('distance_miles') if avg.get('distance_miles') is not None else '—'} mi\n"
                f"- **Operational Tables:** {facts.get('uploaded_protocols_count') or 0} uploaded PDF protocols • "
                f"{facts.get('patient_screenings_count') or 0} patient screenings • {facts.get('audit_events_count') or 0} SHA-256 audit events"
            )
        return {
            "reply": reply,
            "voice_script": strip_markdown_for_speech(reply),
            "mode": "local_knowledge_base",
            "llm_configured": is_gemini_configured(),
            "sources": ["Live DuckDB Query (patients / operational tables)"],
            "suggested_questions": build_welcome_payload("there", user_role)["suggested_questions"],
            "clarification_note": None,
            "fallback_reason": fallback_reason,
        }

    # Pure summary request on previous assistant response when no separate entry was forced
    if length_mode in {"one_line", "summarize"} and prev_assistant and not matched:
        reply = _distill_text_concisely(prev_assistant, max_sentences=1 if length_mode == "one_line" else 2)
        return {
            "reply": reply,
            "voice_script": strip_markdown_for_speech(reply),
            "mode": "local_knowledge_base",
            "llm_configured": is_gemini_configured(),
            "sources": ["Conversation Summary"],
            "suggested_questions": build_welcome_payload("there", user_role)["suggested_questions"],
            "clarification_note": None,
            "fallback_reason": fallback_reason,
        }

    if matched:
        if length_mode in {"one_line", "small_paragraph", "summarize"}:
            # Focus cleanly on primary matched entry (or first 2 for multi-term query like 'ECOG and eGFR')
            if len(matched) >= 2 and length_mode == "one_line" and any(e["id"] != matched[0]["id"] for e in matched):
                pieces = [
                    _render_entry_by_style(e, angle, "one_line", facts, clarification_note if idx == 0 else None)
                    for idx, e in enumerate(matched[:2])
                ]
                reply = " ".join(pieces)
            else:
                reply = _render_entry_by_style(matched[0], angle, length_mode, facts, clarification_note)
        else:
            rendered_blocks = [
                _render_entry_by_style(e, angle, length_mode, facts, clarification_note if idx == 0 else None)
                for idx, e in enumerate(matched[:2])
            ]
            reply = "\n\n".join(rendered_blocks)

        sources = [e["term"] for e in matched]
        next_prompts = _pick_followups(matched[0]["id"], user_role)
    else:
        cohort_line = (
            f"DuckDB currently holds **{facts['cohort_patient_count']:,}** synthetic patient records."
            if facts.get("cohort_patient_count") is not None
            else "Live DuckDB cohort metrics could not be read right now."
        )
        reply = (
            "I don't have a verified entry in my local knowledge base matching that exact question, and I won't guess or invent an answer.\n\n"
            "Try asking about ProtocolShield features or clinical terms (you can add *\"in one line\"*, *\"small paragraph\"*, *\"advantages\"*, or *\"summarize\"*):\n"
            "- **Platform & Tools:** Purpose/advantages of ProtocolShield, What-If simulator, Protocol Optimizer, Patient/Doctor/Admin portals, Voice Mode\n"
            "- **Clinical & Compliance Terms:** ECOG, eGFR, ANC, Platelets, Hemoglobin, ALT/ULN, PD-L1/HER2/BCMA, CNS, PBI, SoA, FDORA, 21 CFR Part 11\n\n"
            f"{cohort_line}"
        )
        if not is_gemini_configured():
            reply += "\n\n*Honest limitation: Server `GEMINI_API_KEY` is currently unset, so open-ended general-world Q&A requires configuring `GEMINI_API_KEY` on the backend.*"
        sources = ["ProtocolShield Verified Knowledge Guardrail"]
        next_prompts = build_welcome_payload("there", user_role)["suggested_questions"]

    return {
        "reply": reply,
        "voice_script": strip_markdown_for_speech(reply),
        "mode": "local_knowledge_base",
        "llm_configured": is_gemini_configured(),
        "sources": sources,
        "suggested_questions": next_prompts,
        "clarification_note": clarification_note,
        "fallback_reason": fallback_reason,
    }


def _pick_followups(topic_id: str, user_role: str) -> list[str]:
    if topic_id == "project_purpose":
        return [
            "What is the advantage of this project in one line?",
            "How does ProtocolShield work?",
            "Summarize that in a small paragraph",
        ]
    if topic_id == "ai_assistant_role":
        return [
            "What is the use of this project in one line?",
            "What is the full form of ECOG?",
            "How many synthetic patients are in the database right now?",
        ]
    if topic_id == "ecog":
        return ["Summarize ECOG in one line", "What is eGFR and why check kidney labs?", "What is PBI (Patient Burden Index)?"]
    if topic_id == "egfr":
        return ["Explain eGFR in one line", "What is the full form of ECOG?", "What does ALT & ULN mean?"]
    if topic_id == "pbi":
        return ["Explain PBI in a small paragraph", "What is SoA (Schedule of Assessments)?", "What is FDORA?"]
    return build_welcome_payload("there", user_role)["suggested_questions"]


def _build_gemini_system_instruction(
    user_name: str,
    user_role: str,
    facts: dict[str, Any],
    matched: list[dict[str, Any]],
    clarification_note: Optional[str],
    client_context: dict[str, Any],
    length_mode: str = "default",
    angle: str = "general",
) -> str:
    glossary_snapshot = "\n".join(
        f"- {e['term']} ({e['full_form']}): {e['simple_explanation']} Advantages: {e.get('advantage', e['why_important'])} App usage: {e['used_in_project']}"
        for e in (matched if matched else GLOSSARY_ENTRIES)
    )
    context_safe = json.dumps(
        {
            "portal_role": user_role,
            "user_name": user_name,
            "active_view": str(client_context.get("active_view", ""))[:80],
            "active_protocol": str(client_context.get("active_protocol", ""))[:120],
        },
        ensure_ascii=True,
    )
    facts_safe = json.dumps(facts, ensure_ascii=True)
    clarification_line = f"\nSpelling/Acronym hint: {clarification_note}" if clarification_note else ""

    format_directive = ""
    if length_mode == "one_line":
        format_directive = "STRICT FORMAT REQUIREMENT: Answer in ONE single clear sentence only (no bullet points, no headers)."
    elif length_mode == "small_paragraph":
        format_directive = "STRICT FORMAT REQUIREMENT: Answer in ONE short cohesive paragraph of 2–3 natural sentences (no bullet list)."
    elif length_mode == "summarize":
        format_directive = "STRICT FORMAT REQUIREMENT: Summarize the requested point or your prior reply cleanly in 1–2 concise sentences."
    elif length_mode == "bullets":
        format_directive = "STRICT FORMAT REQUIREMENT: Use crisp, short bullet points directly answering the question."

    angle_directive = ""
    if angle == "advantage":
        angle_directive = "FOCUS REQUIREMENT: Answer specifically the practical advantages/benefits asked—do not dump unrelated generic overview blocks."

    return (
        "You are the friendly, conversational ProtocolShield Guide & Clinical Trial Explainer.\n"
        "Strict Style, Honesty & Anti-Hallucination Rules:\n"
        "1. Answer the user's exact question naturally like a senior human mentor—never repeat boilerplate blocks if they asked a specific follow-up, asked for a summary, or specified length.\n"
        "2. Ground project-specific statements strictly in the VERIFIED LIVE PLATFORM FACTS and GLOSSARY below. Do NOT invent trial efficacy numbers, fake patient records, or personal medical diagnoses.\n"
        "3. If a user types an unclear acronym (e.g., GCRGR), state clearly it is not a standard ProtocolShield acronym and explain the closest real term (e.g., eGFR).\n"
        "4. Remind patients briefly when relevant that screening outputs are preliminary and require clinician confirmation.\n"
        f"{format_directive}\n{angle_directive}\n"
        f"\nUSER SESSION CONTEXT: {context_safe}\n"
        f"VERIFIED LIVE PLATFORM FACTS: {facts_safe}{clarification_line}\n"
        f"VERIFIED PROTOCOLSHIELD GLOSSARY:\n{glossary_snapshot}"
    )


_FALLBACK_GEMINI_MODELS = (
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
)

# Short cooldown cache so deprecated (404) or overloaded (503) models aren't retried on every single turn
_MODEL_COOLDOWN_UNTIL: dict[str, float] = {}


def _build_genai_client(genai_mod: Any, types_mod: Any) -> Any:
    """Constructs a Gemini client with a bounded 20s HTTP timeout when supported by the SDK."""
    api_key = settings.GEMINI_API_KEY.strip()
    if hasattr(types_mod, "HttpOptions"):
        try:
            return genai_mod.Client(api_key=api_key, http_options=types_mod.HttpOptions(timeout=20000))
        except TypeError:
            pass
    return genai_mod.Client(api_key=api_key)


def _generate_with_model_fallback(client: Any, *, primary_model: str, contents: Any, config: Any) -> tuple[Any, str]:
    """Calls Gemini with primary_model and fails over on deprecated (404) or high-demand/timeout (503/504) models."""
    is_real_client = str(type(client).__module__).startswith("google.genai")
    now = time.monotonic()

    ordered: list[str] = []
    for candidate in (primary_model, *_FALLBACK_GEMINI_MODELS):
        clean = (candidate or "").strip()
        if clean and clean not in ordered:
            ordered.append(clean)

    candidates = (
        [m for m in ordered if _MODEL_COOLDOWN_UNTIL.get(m, 0.0) <= now] or ordered
        if is_real_client
        else ordered
    )

    last_exc: Optional[Exception] = None
    for idx, mdl in enumerate(candidates):
        try:
            return client.models.generate_content(model=mdl, contents=contents, config=config), mdl
        except Exception as exc:
            last_exc = exc
            code = getattr(exc, "code", None)
            err_text = str(exc)
            err_lower = err_text.lower()
            is_missing = (
                code == 404
                or "NOT_FOUND" in err_text
                or "no longer available" in err_lower
            )
            is_transient_busy = (
                code in (408, 429, 500, 503, 504)
                or "UNAVAILABLE" in err_text
                or "DEADLINE_EXCEEDED" in err_text
                or "high demand" in err_lower
                or "overloaded" in err_lower
                or "timed out" in err_lower
                or "timeout" in err_lower
            )
            if is_real_client and is_missing:
                _MODEL_COOLDOWN_UNTIL[mdl] = time.monotonic() + 3600.0
            elif is_real_client and is_transient_busy:
                _MODEL_COOLDOWN_UNTIL[mdl] = time.monotonic() + 60.0

            if (is_missing or is_transient_busy) and idx + 1 < len(candidates):
                logger.info("Gemini model '%s' unavailable (%s); failing over to next model.", mdl, code or type(exc).__name__)
                continue
            raise
    if last_exc:
        raise last_exc
    raise RuntimeError("No Gemini model candidates configured.")


def generate_chat_reply(
    question: str,
    user_name: str,
    user_role: str,
    history: Optional[list[dict[str, str]]] = None,
    client_context: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Generates a grounded, format-aware plain-language answer using Gemini (if configured) or conversational local engine."""
    facts = get_live_platform_facts()
    matched, clarification_note, prev_assistant = _resolve_topic_from_history(question, history)
    length_mode, angle = _detect_length_and_angle(question)
    ctx = client_context or {}

    if not is_gemini_configured():
        return _format_local_grounded_reply(
            question=question,
            user_role=user_role,
            matched=matched,
            clarification_note=clarification_note,
            facts=facts,
            prev_assistant=prev_assistant,
        )

    try:
        from google import genai
        from google.genai import types

        client = _build_genai_client(genai, types)
        system_instruction = _build_gemini_system_instruction(
            user_name=user_name,
            user_role=user_role,
            facts=facts,
            matched=matched,
            clarification_note=clarification_note,
            client_context=ctx,
            length_mode=length_mode,
            angle=angle,
        )

        turn_lines: list[str] = []
        for msg in (history or [])[-8:]:
            role_tag = "User" if str(msg.get("role", "")).lower() == "user" else "Assistant"
            text_val = str(msg.get("content", "")).strip()[:600]
            if text_val:
                turn_lines.append(f"{role_tag}: {text_val}")
        turn_lines.append(f"User: {question.strip()}")
        prompt_text = "\n".join(turn_lines)

        primary_model = (settings.GEMINI_MODEL or "gemini-3.5-flash").strip()
        response, used_model = _generate_with_model_fallback(
            client,
            primary_model=primary_model,
            contents=prompt_text,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.25,
                max_output_tokens=2048,
            ),
        )
        reply_text = (getattr(response, "text", None) or "").strip()
        if not reply_text:
            raise ValueError("Empty response from Gemini model.")

        sources = [e["term"] for e in matched] if matched else ["ProtocolShield Verified System Context"]
        return {
            "reply": reply_text,
            "voice_script": strip_markdown_for_speech(reply_text),
            "mode": "gemini",
            "model": used_model,
            "llm_configured": True,
            "sources": sources,
            "suggested_questions": _pick_followups(matched[0]["id"], user_role) if matched else build_welcome_payload(user_name, user_role)["suggested_questions"],
            "clarification_note": clarification_note,
            "fallback_reason": None,
        }
    except Exception as exc:
        logger.warning("Gemini chat failed (%s); falling back to verified local knowledge base.", type(exc).__name__)
        return _format_local_grounded_reply(
            question=question,
            user_role=user_role,
            matched=matched,
            clarification_note=clarification_note,
            facts=facts,
            prev_assistant=prev_assistant,
            fallback_reason="gemini_unavailable",
        )


def generate_voice_reply(
    audio_bytes: bytes,
    mime_type: str,
    user_name: str,
    user_role: str,
    client_context: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Transcribes and answers an audio voice query using Gemini multimodal input.
    Raises AssistantUnavailableError when GEMINI_API_KEY is not configured.
    """
    if not is_gemini_configured():
        raise AssistantUnavailableError(
            "Server-side audio transcription requires GEMINI_API_KEY. Browser Web Speech Voice Mode works without a server key."
        )

    from google import genai
    from google.genai import types

    facts = get_live_platform_facts()
    ctx = client_context or {}
    system_instruction = _build_gemini_system_instruction(
        user_name=user_name,
        user_role=user_role,
        facts=facts,
        matched=GLOSSARY_ENTRIES,
        clarification_note=None,
        client_context=ctx,
    )

    prompt = (
        "Listen to the user's spoken audio carefully. Return ONLY a JSON object with exactly two keys:\n"
        '  "transcript": exact transcription of what the user said,\n'
        '  "reply": clear, friendly, spoken-friendly plain-English answer matching the user\'s requested format/length and strictly following ProtocolShield anti-hallucination rules.'
    )

    client = _build_genai_client(genai, types)
    primary_model = (settings.GEMINI_MODEL or "gemini-3.5-flash").strip()
    response, used_model = _generate_with_model_fallback(
        client,
        primary_model=primary_model,
        contents=[
            types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
            types.Part.from_text(text=prompt),
        ],
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.25,
            max_output_tokens=2048,
            response_mime_type="application/json",
        ),
    )

    raw_text = (getattr(response, "text", None) or "").strip()
    transcript = ""
    reply_text = ""
    if raw_text:
        try:
            parsed = json.loads(raw_text)
            if isinstance(parsed, dict):
                transcript = str(parsed.get("transcript", "")).strip()
                reply_text = str(parsed.get("reply", "")).strip()
        except Exception:
            reply_text = raw_text

    if not reply_text:
        reply_text = "I could not hear a clear question in that audio recording. Please try speaking again or type your question."

    matched, clarification_note = match_glossary_entries(transcript or reply_text, limit=3)
    return {
        "transcript": transcript or "(Audio processed)",
        "reply": reply_text,
        "voice_script": strip_markdown_for_speech(reply_text),
        "mode": "gemini_audio",
        "model": used_model,
        "llm_configured": True,
        "sources": [e["term"] for e in matched] if matched else ["ProtocolShield Verified Audio Context"],
        "suggested_questions": build_welcome_payload(user_name, user_role)["suggested_questions"],
        "clarification_note": clarification_note,
    }
