"""
ProtocolShield PDF Parser Engine
Extracts Schedule of Assessments and Eligibility Criteria from clinical trial protocol PDFs.
Uses PyMuPDF (fitz) for robust text extraction with keyword-driven SoA detection.
Falls back gracefully to canonical NSCLC defaults when extraction yields sparse data.
"""
from __future__ import annotations
import hashlib
import io
import json
import logging
import re
import uuid
from typing import Any, Optional
from datetime import datetime

try:
    import pymupdf as fitz
    PYMUPDF_AVAILABLE = True
except ImportError:
    try:
        import fitz
        PYMUPDF_AVAILABLE = True
    except ImportError:
        PYMUPDF_AVAILABLE = False

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False

from app.models.protocol import ClinicalTrialProtocol, ProtocolEligibilityCriteria, StructuredCriterion
from app.models.burden import ProtocolVisit, AssessmentProcedure, InvasivenessTier
from app.engine.burden_scorer import burden_engine, STANDARD_PROCEDURE_CATALOG

logger = logging.getLogger(__name__)


# ── Keyword → Catalog Procedure Mapping ─────────────────────────────────────
PROCEDURE_KEYWORD_MAP: dict[str, list[str]] = {
    "vitals": [
        "vital signs", "vitals", "blood pressure", "bp", "heart rate", "hr",
        "temperature", "weight", "height", "body weight", "pulse oximetry"
    ],
    "ecg": [
        "ecg", "ekg", "electrocardiogram", "12-lead", "12 lead", "cardiac monitoring"
    ],
    "safety_labs": [
        "hematology", "chemistry panel", "blood count", "cbc", "cmp", "lfts",
        "liver function", "renal function", "urinalysis", "serum chemistry",
        "clinical labs", "clinical laboratory", "safety labs", "laboratory"
    ],
    "pk_serial": [
        "pharmacokinetic", "pk sample", "pk blood", "pk draw", "dense pk",
        "pk profile", "serial pk", "sparse pk", "plasma sample", "drug level"
    ],
    "iv_infusion": [
        "infusion", "intravenous", "iv administration", "study drug", "investigational",
        "treatment administration", "drug administration", "dosing visit", "cycle day 1"
    ],
    "ct_scan": [
        "ct scan", "computed tomography", "ctscan", "ct/pet", "pet/ct", "pet scan",
        "recist", "tumor assessment", "disease assessment", "radiographic assessment",
        "ct chest", "ct abdomen", "ct pelvis"
    ],
    "brain_mri": [
        "brain mri", "mri brain", "cranial mri", "cns imaging", "mri scan",
        "magnetic resonance", "gadolinium"
    ],
    "tumor_biopsy": [
        "biopsy", "tumor biopsy", "tissue collection", "core needle biopsy",
        "fresh biopsy", "archival tissue", "liquid biopsy", "ctdna", "circulating tumor"
    ],
    "bone_marrow_biopsy": [
        "bone marrow biopsy", "bone marrow aspirate", "bmb", "bone marrow"
    ],
    "pro_survey": [
        "pro", "patient-reported outcome", "questionnaire", "quality of life",
        "qol", "fact-", "eortc", "sf-36", "bpi", "pgic", "symptom assessment",
        "patient diary", "patient survey"
    ],
}

# Visit name patterns to identify clinical visit rows
VISIT_HEADER_PATTERNS = [
    r"cycle\s*\d+\s*day\s*\d+",
    r"c\d+\s*d\d+",
    r"week\s*[-–]?\s*\d+",
    r"visit\s*[-–]?\s*\d+",
    r"screening",
    r"baseline",
    r"end\s+of\s+treatment",
    r"follow[-\s]+up",
    r"eot",
    r"eos",
]

# Eligibility section identifiers
INCLUSION_HEADERS = [
    "inclusion criteria", "inclusion/exclusion", "eligibility criteria",
    "key inclusion", "major inclusion"
]
EXCLUSION_HEADERS = [
    "exclusion criteria", "key exclusion", "major exclusion",
    "non-eligibility"
]
SOA_HEADERS = [
    "schedule of assessments", "schedule of events", "schedule of activities",
    "assessment schedule", "study procedures", "soa", "soe",
    "section 4", "section 5", "section 6"
]


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _detect_procedures_in_line(line: str) -> list[str]:
    """Returns list of catalog keys that match the given text line."""
    normalized = _normalize(line)
    found = []
    for catalog_key, keywords in PROCEDURE_KEYWORD_MAP.items():
        for kw in keywords:
            if kw in normalized:
                if catalog_key not in found:
                    found.append(catalog_key)
                break
    return found


def _extract_egfr(text: str) -> Optional[float]:
    """Extracts eGFR threshold from eligibility text."""
    patterns = [
        r"egfr\s*[≥>=]+\s*(\d+)",
        r"creatinine\s+clearance\s*[≥>=]+\s*(\d+)",
        r"clcr\s*[≥>=]+\s*(\d+)",
        r"gfr\s*[≥>=]+\s*(\d+)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return float(m.group(1))
    return None


def _extract_ecog(text: str) -> Optional[int]:
    """Extracts ECOG PS threshold from eligibility text."""
    patterns = [
        r"ecog\s+(?:ps|performance\s+status)?\s*(?:of\s+)?[0≤<=]?\s*[-–]?\s*(\d)\s*(?:or\s+\d)?",
        r"ecog\s*[≤<]=?\s*(\d)",
        r"performance\s+status\s*[≤<]=?\s*(\d)",
        r"karnofsky.*?[≥>]=?\s*(\d{2})",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = int(m.group(1))
            # Karnofsky → ECOG rough conversion
            if val >= 70:
                return 1
            return min(val, 2)
    return None


def _extract_age_range(text: str) -> tuple[Optional[int], Optional[int]]:
    """Extracts min/max age from eligibility text."""
    min_age = max_age = None
    m = re.search(r"(?:age|aged)\s*[≥>]=?\s*(\d{2})", text, re.IGNORECASE)
    if m:
        min_age = int(m.group(1))
    m = re.search(r"(?:age|aged)\s*[≤<]=?\s*(\d{2})", text, re.IGNORECASE)
    if m:
        max_age = int(m.group(1))
    if min_age is None:
        min_age = 18
    return min_age, max_age


def _infer_week_number(label: str, fallback_week: int) -> int:
    """Extracts canonical study week number from a visit header string."""
    norm = _normalize(label)
    if "screening" in norm or "baseline" in norm:
        return -2 if "screening" in norm else 0
    week_match = re.search(r"week\s*([-–]?\d+)", norm)
    if week_match:
        return int(week_match.group(1).replace("–", "-"))
    cycle_match = re.search(r"c(\d+)\s*d(\d+)", norm)
    if cycle_match:
        cycle_num = int(cycle_match.group(1))
        day_num = int(cycle_match.group(2))
        return (cycle_num - 1) * 3 + max(0, (day_num - 1) // 7)
    visit_num_match = re.search(r"visit\s*[-–]?\s*(\d+)", norm)
    if visit_num_match:
        return (int(visit_num_match.group(1)) - 1) * 3
    if "eot" in norm or "end of treatment" in norm:
        return max(fallback_week + 4, 24)
    return fallback_week + 3


def _cell_is_marked(cell: Optional[str]) -> bool:
    """Returns True when a Schedule-of-Assessments table cell marks a scheduled procedure."""
    if not cell:
        return False
    cleaned = re.sub(r"\s+", " ", cell).strip().lower()
    if not cleaned or cleaned in {"-", "—", "–", "no", "n/a", "na", "0"}:
        return False
    return cleaned in {"x", "✓", "✔", "yes", "y", "•", "●", "1", "[x]"} or cleaned.startswith(("x ", "x/", "✓"))


class ProtocolPDFParser:
    """
    Extracts ClinicalTrialProtocol data from raw PDF bytes using PyMuPDF text extraction
    plus pdfplumber structured SoA table detection. Degrades gracefully on sparse PDFs.
    """

    def parse(self, file_bytes: bytes, filename: str) -> ClinicalTrialProtocol:
        if not PYMUPDF_AVAILABLE:
            return self._fallback_protocol(filename, reason="PyMuPDF not available")

        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            page_count = len(doc)
            full_text = "\n".join(page.get_text() for page in doc)
            doc.close()
        except Exception as e:
            return self._fallback_protocol(filename, reason=f"PDF read error: {e}")

        table_visits = self._extract_visits_from_pdf_tables(file_bytes)
        return self._parse_text(
            full_text,
            filename,
            page_count,
            file_bytes=file_bytes,
            table_visits=table_visits,
        )

    def _extract_visits_from_pdf_tables(self, file_bytes: bytes) -> list[ProtocolVisit]:
        """Attempts structured SoA table extraction via pdfplumber for tabular matrices."""
        if not PDFPLUMBER_AVAILABLE:
            return []

        visits_by_col: list[tuple[str, int, list[AssessmentProcedure]]] = []
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages[:60]:
                    tables = page.extract_tables() or []
                    for table in tables:
                        if not table or len(table) < 2:
                            continue
                        header_row = [str(c or "").strip() for c in table[0]]
                        visit_cols: list[tuple[int, str, int]] = []
                        running_week = -5
                        for col_idx, col_title in enumerate(header_row[1:], start=1):
                            if not col_title:
                                continue
                            norm_col = _normalize(col_title)
                            if any(re.search(pat, norm_col) for pat in VISIT_HEADER_PATTERNS):
                                wk = _infer_week_number(col_title, running_week)
                                running_week = wk
                                visit_cols.append((col_idx, col_title[:65], wk))
                        if len(visit_cols) < 3:
                            continue

                        col_procs: dict[int, list[AssessmentProcedure]] = {c[0]: [] for c in visit_cols}
                        for row in table[1:]:
                            if not row:
                                continue
                            proc_label = str(row[0] or "").strip()
                            if not proc_label or len(proc_label) < 2:
                                continue
                            matched_keys = _detect_procedures_in_line(proc_label)
                            for col_idx, _title, _wk in visit_cols:
                                if col_idx < len(row) and _cell_is_marked(row[col_idx]):
                                    if matched_keys:
                                        for k in matched_keys:
                                            if k in STANDARD_PROCEDURE_CATALOG:
                                                proc = AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG[k])
                                                if not any(existing.name == proc.name for existing in col_procs[col_idx]):
                                                    col_procs[col_idx].append(proc)
                                    elif len(proc_label) <= 80:
                                        clean_label = re.sub(r"\s+", " ", proc_label)
                                        if not any(existing.name == clean_label for existing in col_procs[col_idx]):
                                            col_procs[col_idx].append(
                                                AssessmentProcedure(
                                                    name=clean_label,
                                                    category=InvasivenessTier.MINIMALLY_INVASIVE,
                                                    invasiveness_weight=2.0,
                                                    estimated_duration_minutes=20,
                                                    fasting_required=False,
                                                )
                                            )

                        for col_idx, title, wk in visit_cols:
                            procs = col_procs[col_idx]
                            if not procs:
                                procs = [AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["vitals"])]
                            visits_by_col.append((title, wk, procs))
                        if len(visits_by_col) >= 3:
                            break
                    if len(visits_by_col) >= 3:
                        break
        except Exception:
            return []

        return [
            ProtocolVisit(
                visit_id=f"V-{idx:02d}",
                week_number=wk,
                visit_name=title,
                procedures=procs,
            )
            for idx, (title, wk, procs) in enumerate(visits_by_col[:20], start=1)
        ]

    def _parse_text(
        self,
        full_text: str,
        filename: str,
        page_count: int,
        file_bytes: Optional[bytes] = None,
        table_visits: Optional[list[ProtocolVisit]] = None,
    ) -> ClinicalTrialProtocol:
        lines = full_text.splitlines()

        # ── 1. Title & metadata extraction ───────────────────────────────────
        title = self._extract_title(lines, filename)
        phase = self._extract_phase(full_text)
        indication = self._extract_indication(full_text)

        # ── 2. Section segmentation ───────────────────────────────────────────
        sections = self._segment_sections(lines)

        # ── 3. Eligibility criteria & biomarker extraction ───────────────────
        inclusion = self._extract_criteria_bullets(
            sections.get("inclusion", []), "inclusion"
        )
        exclusion = self._extract_criteria_bullets(
            sections.get("exclusion", []), "exclusion"
        )

        eligibility_text = " ".join(
            sections.get("inclusion", []) + sections.get("exclusion", [])
        ) or full_text[:12000]
        extracted_egfr = _extract_egfr(eligibility_text)
        min_egfr = min(150.0, max(10.0, extracted_egfr)) if extracted_egfr is not None else 60.0
        extracted_ecog = _extract_ecog(eligibility_text)
        max_ecog = min(4, max(0, extracted_ecog)) if extracted_ecog is not None else 1
        raw_min_age, raw_max_age = _extract_age_range(eligibility_text)
        min_age = min(95, max(18, raw_min_age if raw_min_age is not None else 18))
        max_age = min(120, raw_max_age) if raw_max_age is not None and raw_max_age >= min_age else None

        if not inclusion:
            inclusion = [
                f"Histologically confirmed {indication} requiring systemic therapy",
                f"Age >= {min_age} years at time of informed consent",
                f"ECOG performance status 0 or {max_ecog}",
                f"Adequate renal function: eGFR >= {int(min_egfr)} mL/min/1.73m²",
                "Measurable disease per RECIST v1.1",
            ]
        if not exclusion:
            exclusion = [
                "Active, uncontrolled CNS metastases",
                "Active autoimmune disease requiring systemic immunosuppressive therapy",
                "Prior systemic therapy for advanced/metastatic disease (unless protocol-specified)",
            ]

        inclusion_blob = " ".join(inclusion).lower()
        exclusion_blob = " ".join(exclusion).lower()
        elig_blob = f"{inclusion_blob} {exclusion_blob}".lower()

        has_cns_clause = ("cns" in exclusion_blob or "brain" in exclusion_blob)
        blanket_cns_exclusion = (
            has_cns_clause
            and ("regardless of" in exclusion_blob or "any known brain" in exclusion_blob or "known or suspected" in exclusion_blob)
            and not any(tok in exclusion_blob for tok in ["untreated", "active", "symptomatic", "uncontrolled"])
        )

        is_tnbc = "tnbc" in indication.lower() or "triple-negative" in indication.lower()
        is_myeloma = "myeloma" in indication.lower()
        is_nsclc = "nsclc" in indication.lower() or "non-small cell" in indication.lower()

        allowed_stages = (
            ["Stage I (ISS)", "Stage II (ISS)", "Stage III (ISS)"]
            if is_myeloma
            else ["Stage IIIB", "Stage IIIC", "Stage IV (Oligometastatic)", "Stage IV (Polymetastatic)"]
        )

        prior_lines_match = re.search(r"(?:>=|≥|at least)\s*(\d+)\s*prior\s+lines", elig_blob)
        min_prior_lines = int(prior_lines_match.group(1)) if prior_lines_match else (3 if is_myeloma else 0)
        max_prior_lines = 10 if is_myeloma else 1

        structured_filters: dict = {
            "min_age": min_age,
            "max_ecog": max_ecog,
            "min_egfr": min_egfr,
            "allowed_stages": allowed_stages,
            "min_prior_lines": min_prior_lines,
            "max_prior_lines": max_prior_lines,
            "exclude_active_brain_mets": True,
            "allow_stable_brain_mets": not blanket_cns_exclusion,
            "exclude_active_autoimmune": not is_myeloma,
        }
        if max_age:
            structured_filters["max_age"] = max_age

        if is_nsclc:
            structured_filters["target_cancer_types"] = ["NSCLC"]
            if "egfr" in exclusion_blob or "wild-type" in elig_blob:
                structured_filters["target_biomarker_egfr_negative"] = True
        elif is_tnbc:
            structured_filters["target_cancer_types"] = ["Breast Cancer", "TNBC", "Triple Negative"]
            if "her2" in elig_blob or "triple" in elig_blob:
                structured_filters["target_biomarker_her2_negative"] = True
                structured_filters["target_biomarker_hormone_receptor_negative"] = True
        elif is_myeloma:
            structured_filters["target_cancer_types"] = ["Multiple Myeloma"]
            if "bcma" in elig_blob:
                structured_filters["target_biomarker_bcma_positive"] = True

        pdl1_match = re.search(r"pd-?l1\s*(?:tps|cps)?\s*[≥>=]+\s*(\d{1,3})\s*%?", elig_blob)
        if pdl1_match:
            pdl1_val = float(pdl1_match.group(1))
            if 0.0 <= pdl1_val <= 100.0:
                structured_filters["min_pdl1_tps"] = pdl1_val

        structured_criteria: list[StructuredCriterion] = [
            StructuredCriterion(
                criterion_id="CRIT-AGE",
                description=f"Age >= {min_age}" + (f" and <= {max_age}" if max_age else "") + " years",
                criterion_type="INCLUSION",
                clinical_parameter="age",
                comparator=">=",
                threshold=min_age,
                unit="years",
                extraction_confidence=0.9 if raw_min_age is not None else 0.55,
                validation_status="VALIDATED" if raw_min_age is not None else "HEURISTIC",
            ),
            StructuredCriterion(
                criterion_id="CRIT-ECOG",
                description=f"ECOG Performance Status <= {max_ecog}",
                criterion_type="INCLUSION",
                clinical_parameter="ecog_score",
                comparator="<=",
                threshold=max_ecog,
                extraction_confidence=0.92 if extracted_ecog is not None else 0.55,
                validation_status="VALIDATED" if extracted_ecog is not None else "HEURISTIC",
            ),
            StructuredCriterion(
                criterion_id="CRIT-EGFR",
                description=f"Renal clearance eGFR >= {int(min_egfr)} mL/min",
                criterion_type="INCLUSION",
                clinical_parameter="egfr_ml_min",
                comparator=">=",
                threshold=min_egfr,
                unit="mL/min/1.73m2",
                extraction_confidence=0.95 if extracted_egfr is not None else 0.55,
                validation_status="VALIDATED" if extracted_egfr is not None else "HEURISTIC",
            ),
            StructuredCriterion(
                criterion_id="CRIT-CNS",
                description=(
                    "No active or stable CNS metastases"
                    if blanket_cns_exclusion
                    else "Untreated/active CNS metastases excluded (stable treated permitted)"
                ),
                criterion_type="EXCLUSION",
                clinical_parameter="has_active_brain_mets",
                comparator="!=",
                threshold=True,
                is_hard_rule=True,
                extraction_confidence=0.9 if has_cns_clause else 0.6,
                validation_status="VALIDATED" if has_cns_clause else "HEURISTIC",
            ),
        ]

        # ── 4. Schedule of Assessments extraction & optional Gemini semantic assist ─
        extraction_status = "extracted"
        extraction_notes = None
        ai_notes: Optional[str] = None
        if table_visits and len(table_visits) >= 3:
            visits = table_visits
            extraction_notes = f"Extracted {len(visits)} visits from structured SoA tables."
        else:
            soa_lines = sections.get("soa", [])
            visits = self._extract_visits(soa_lines, full_text)
            if len(visits) < 3 and len(full_text.strip()) >= 120:
                ai_data = self._try_gemini_semantic_extract(full_text, filename)
                if ai_data and len(ai_data.get("visits") or []) >= 3:
                    visits = ai_data["visits"]
                    if ai_data.get("title"):
                        title = str(ai_data["title"])[:240]
                    if ai_data.get("phase"):
                        phase = str(ai_data["phase"])[:40]
                    if ai_data.get("indication"):
                        indication = str(ai_data["indication"])[:160]
                    if ai_data.get("inclusion_criteria"):
                        inclusion = ai_data["inclusion_criteria"]
                    if ai_data.get("exclusion_criteria"):
                        exclusion = ai_data["exclusion_criteria"]
                    if ai_data.get("min_egfr") is not None:
                        structured_filters["min_egfr"] = ai_data["min_egfr"]
                    if ai_data.get("max_ecog") is not None:
                        structured_filters["max_ecog"] = ai_data["max_ecog"]
                    if ai_data.get("min_age") is not None:
                        structured_filters["min_age"] = ai_data["min_age"]
                    if ai_data.get("max_age") is not None:
                        structured_filters["max_age"] = ai_data["max_age"]
                    if ai_data.get("allow_stable_brain_mets") is not None:
                        structured_filters["allow_stable_brain_mets"] = ai_data["allow_stable_brain_mets"]
                    extraction_status = "gemini_structured"
                    ai_notes = (
                        f"Semantic extraction via Gemini ({ai_data.get('_used_model', 'gemini')}) parsed "
                        f"{len(visits)} visits and eligibility criteria from non-tabular protocol text."
                    )
                    extraction_notes = ai_notes

            if len(visits) < 3:
                visits = self._get_fallback_visits()
                extraction_status = "heuristic_fallback"
                extraction_notes = (
                    "Document yielded sparse SoA tables or visits (< 3 detected). "
                    "Calibrated oncology baseline schedule applied alongside extracted criteria."
                )

        # ── 5. Compute burden ────────────────────────────────────────────────
        study_duration = min(156, max(4, self._estimate_duration(full_text, visits)))
        burden = burden_engine.calculate_protocol_burden(visits, study_duration)

        # ── 6. Derive collision-resistant protocol_id ────────────────────────
        slug = re.sub(r"[^A-Z0-9]", "", filename.upper())[:8]
        content_hash = hashlib.sha256(file_bytes or full_text.encode("utf-8")).hexdigest()[:4].upper()
        protocol_id = f"PS-EXT-{slug or 'PDF'}-{datetime.now().strftime('%Y')}-{content_hash}"

        return ClinicalTrialProtocol(
            protocol_id=protocol_id,
            nct_id=self._extract_nct(full_text),
            title=title,
            phase=phase,
            indication=indication,
            study_duration_weeks=study_duration,
            target_enrollment=self._extract_enrollment(full_text),
            visits=visits,
            eligibility=ProtocolEligibilityCriteria(
                inclusion_criteria=inclusion,
                exclusion_criteria=exclusion,
                structured_filters=structured_filters,
                criteria=structured_criteria,
            ),
            burden=burden,
            source_filename=filename,
            extracted_page_count=page_count,
            extraction_status=extraction_status,
            extraction_notes=extraction_notes,
        )

    # ── Section Segmentation ──────────────────────────────────────────────────

    def _segment_sections(self, lines: list[str]) -> dict[str, list[str]]:
        sections: dict[str, list[str]] = {
            "inclusion": [], "exclusion": [], "soa": [], "other": []
        }
        current = "other"

        for line in lines:
            norm = _normalize(line)
            if any(h in norm for h in INCLUSION_HEADERS):
                current = "inclusion"
                continue
            elif any(h in norm for h in EXCLUSION_HEADERS):
                current = "exclusion"
                continue
            elif any(h in norm for h in SOA_HEADERS):
                current = "soa"
                continue
            elif re.match(r"^\d+\.\d+\s+[A-Z]", line) or re.match(r"^section\s+\d+", norm):
                # New major section detected — reset to other
                current = "other"

            if line.strip():
                sections[current].append(line.strip())

        return sections

    # ── Eligibility Criteria ──────────────────────────────────────────────────

    def _extract_criteria_bullets(self, lines: list[str], kind: str) -> list[str]:
        criteria = []
        buffer = ""
        for line in lines[:60]:  # Limit scope
            stripped = line.strip()
            if not stripped:
                if buffer:
                    criteria.append(buffer.strip())
                    buffer = ""
                continue
            # Bullet detection: numbered, lettered, or dash/bullet
            if re.match(r"^(\d+[\.\)]\s+|[a-z][\.\)]\s+|[-•–▪]\s+)", stripped):
                if buffer:
                    criteria.append(buffer.strip())
                buffer = re.sub(r"^(\d+[\.\)]\s+|[a-z][\.\)]\s+|[-•–▪]\s+)", "", stripped)
            else:
                buffer = (buffer + " " + stripped).strip() if buffer else stripped

        if buffer:
            criteria.append(buffer.strip())

        # Filter out header lines and very short fragments
        criteria = [c for c in criteria if len(c) > 20 and not any(
            h in c.lower() for h in INCLUSION_HEADERS + EXCLUSION_HEADERS
        )]
        return criteria[:10]  # Cap at 10 per section

    # ── Visit / SoA Extraction ────────────────────────────────────────────────

    def _extract_visits(self, soa_lines: list[str], full_text: str) -> list[ProtocolVisit]:
        visits: list[ProtocolVisit] = []
        visit_counter = 1
        week_counter = -2  # Start at screening

        # Try SoA section first if it has lines; fall back to scanning full text
        candidate_lines = soa_lines if len(soa_lines) >= 3 else full_text.splitlines()

        for idx, line in enumerate(candidate_lines):
            norm = _normalize(line)

            # Skip lines that are clearly criteria bullets
            if re.match(r"^\s*(\d+[\.\)]|[-•*])", line) and any(kw in norm for kw in ["prior", "therapy", "eligible", "consent", "disease", "metastases", "autoimmune"]):
                continue

            is_visit_line = any(
                re.search(pat, norm) for pat in VISIT_HEADER_PATTERNS
            )
            if not is_visit_line:
                continue

            # Extract week number from line
            week_match = re.search(r"week\s*[-–]?\s*(\d+)", norm)
            cycle_match = re.search(r"c(\d+)\s*d(\d+)", norm)
            visit_num_match = re.search(r"visit\s*[-–]?\s*(\d+)", norm)

            if week_match:
                week_counter = int(week_match.group(1))
            elif cycle_match:
                cycle_num = int(cycle_match.group(1))
                week_counter = (cycle_num - 1) * 3
            elif visit_num_match:
                week_counter = (int(visit_num_match.group(1)) - 1) * 3
            else:
                week_counter += 3

            # Check if this line itself contains procedure definitions (e.g. "C1D1: Vitals, Labs, IV Infusion")
            line_procs = _detect_procedures_in_line(line)
            if line_procs:
                proc_keys = line_procs
            else:
                # Look at next 3 lines
                next_context = " ".join(candidate_lines[idx:idx + 4])
                proc_keys = _detect_procedures_in_line(next_context)

            # Always include vitals
            if "vitals" not in proc_keys:
                proc_keys.insert(0, "vitals")

            procedures = [
                AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG[k])
                for k in proc_keys
                if k in STANDARD_PROCEDURE_CATALOG
            ]

            # Clean visit name: strip trailing colons, procedures or bullets
            clean_name = re.split(r"[:;–—]\s*(?:vital|safety|ecg|ct|mri|iv|pro|recist)", line, flags=re.IGNORECASE)[0].strip()
            visit_name = clean_name[:65] or f"Visit {visit_counter}"

            visits.append(ProtocolVisit(
                visit_id=f"V-{visit_counter:02d}",
                week_number=week_counter,
                visit_name=visit_name,
                procedures=procedures,
            ))
            visit_counter += 1

            if visit_counter > 20:  # Cap at 20 visits
                break

        return visits

    # ── Metadata Extractors ───────────────────────────────────────────────────

    def _extract_title(self, lines: list[str], filename: str) -> str:
        # Try first 30 lines for a capitalized multi-word title
        for line in lines[:30]:
            stripped = line.strip()
            if len(stripped) > 40 and re.search(r"[Pp]hase|[Ss]tudy|[Tt]rial|[Rr]andomized", stripped):
                return stripped[:200]
        return f"Clinical Trial Protocol — {filename}"

    def _extract_phase(self, text: str) -> str:
        m = re.search(r"[Pp]hase\s+(I{1,3}V?|1|2|3|4|I\/II|II\/III)", text)
        if m:
            raw = m.group(1)
            map_ = {"1": "I", "2": "II", "3": "III", "4": "IV"}
            return f"Phase {map_.get(raw, raw)}"
        return "Phase II/III"

    def _extract_indication(self, text: str) -> str:
        # Look for common oncology indications
        indications = [
            (r"non.small.cell lung", "Non-Small Cell Lung Cancer (NSCLC)"),
            (r"nsclc", "Non-Small Cell Lung Cancer (NSCLC)"),
            (r"triple.negative breast", "Triple-Negative Breast Cancer (TNBC)"),
            (r"tnbc", "Triple-Negative Breast Cancer (TNBC)"),
            (r"multiple myeloma", "Multiple Myeloma"),
            (r"myeloma", "Multiple Myeloma"),
            (r"diffuse large b", "Diffuse Large B-Cell Lymphoma (DLBCL)"),
            (r"hodgkin", "Hodgkin Lymphoma"),
            (r"colorectal", "Colorectal Cancer (CRC)"),
            (r"hepatocellular", "Hepatocellular Carcinoma (HCC)"),
            (r"renal cell", "Renal Cell Carcinoma (RCC)"),
            (r"bladder|urothelial", "Urothelial Carcinoma"),
            (r"ovarian", "Ovarian Cancer"),
            (r"pancreatic", "Pancreatic Ductal Adenocarcinoma"),
            (r"glioblastoma|gbm", "Glioblastoma Multiforme (GBM)"),
            (r"melanoma", "Melanoma"),
        ]
        text_lower = text[:5000].lower()
        for pattern, label in indications:
            if re.search(pattern, text_lower):
                return label
        return "Oncology — Advanced Solid Tumors"

    def _extract_nct(self, text: str) -> Optional[str]:
        m = re.search(r"NCT\d{8}", text)
        return m.group(0) if m else None

    def _extract_enrollment(self, text: str) -> int:
        patterns = [
            r"(\d{2,4})\s+(?:patients|subjects|participants)",
            r"target.*?(\d{2,4})\s+(?:enrolled|randomized)",
            r"sample\s+size.*?(\d{2,4})",
            r"n\s*=\s*(\d{2,4})",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                val = int(m.group(1))
                if 20 <= val <= 5000:
                    return val
        return 200

    def _estimate_duration(self, text: str, visits: list[ProtocolVisit]) -> int:
        if visits:
            max_week = max((v.week_number for v in visits), default=0)
            if max_week > 4:
                return max_week + 8
        m = re.search(r"(\d+)[-–\s]+week\s+(?:study|treatment|follow)", text, re.IGNORECASE)
        if m:
            return int(m.group(1))
        m = re.search(r"(\d+)\s+months?\s+(?:of\s+)?(?:study|treatment)", text, re.IGNORECASE)
        if m:
            return int(m.group(1)) * 4
        return 52

    # ── Fallback Visit List ───────────────────────────────────────────────────

    def _get_fallback_visits(self) -> list[ProtocolVisit]:
        """Minimal clinically valid visit set for sparse-extraction fallback."""
        def proc(*keys):
            return [
                AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG[k])
                for k in keys if k in STANDARD_PROCEDURE_CATALOG
            ]

        return [
            ProtocolVisit(visit_id="V-01", week_number=-2,
                          visit_name="Screening & Baseline",
                          procedures=proc("vitals", "ecg", "safety_labs", "ct_scan", "pro_survey")),
            ProtocolVisit(visit_id="V-02", week_number=0,
                          visit_name="Cycle 1 Day 1 — Treatment Initiation",
                          procedures=proc("vitals", "safety_labs", "iv_infusion", "pk_serial")),
            ProtocolVisit(visit_id="V-03", week_number=3,
                          visit_name="Cycle 2 Day 1 — Maintenance",
                          procedures=proc("vitals", "safety_labs", "iv_infusion")),
            ProtocolVisit(visit_id="V-04", week_number=6,
                          visit_name="Cycle 3 Day 1 — Restaging",
                          procedures=proc("vitals", "safety_labs", "iv_infusion", "ct_scan", "pro_survey")),
            ProtocolVisit(visit_id="V-05", week_number=12,
                          visit_name="Cycle 5 Day 1 — Restaging + PK",
                          procedures=proc("vitals", "safety_labs", "iv_infusion", "ct_scan", "pk_serial")),
            ProtocolVisit(visit_id="V-06", week_number=24,
                          visit_name="Cycle 9 Day 1 — Restaging",
                          procedures=proc("vitals", "safety_labs", "iv_infusion", "ct_scan", "pro_survey")),
            ProtocolVisit(visit_id="V-07", week_number=52,
                          visit_name="End of Treatment (EOT) Evaluation",
                          procedures=proc("vitals", "safety_labs", "ct_scan", "ecg", "pro_survey")),
        ]

    # ── Full Fallback Protocol ────────────────────────────────────────────────

    def _fallback_protocol(self, filename: str, reason: str = "") -> ClinicalTrialProtocol:
        visits = self._get_fallback_visits()
        burden = burden_engine.calculate_protocol_burden(visits, 52)
        return ClinicalTrialProtocol(
            protocol_id=f"PS-EXT-UPLOAD-{datetime.now().strftime('%Y%m%d')}",
            title=f"Extracted Protocol — {filename}",
            phase="Phase II/III",
            indication="Oncology — Advanced Solid Tumors",
            study_duration_weeks=52,
            target_enrollment=200,
            visits=visits,
            eligibility=ProtocolEligibilityCriteria(
                inclusion_criteria=[
                    "Histologically confirmed advanced solid tumor",
                    "Age >= 18 years",
                    "ECOG performance status 0 or 1",
                    "Adequate organ function per protocol-defined thresholds",
                    "Measurable disease per RECIST v1.1",
                ],
                exclusion_criteria=[
                    "Active, uncontrolled CNS metastases",
                    "Prior systemic therapy for advanced disease",
                    "Active autoimmune disease requiring immunosuppression",
                ],
                structured_filters={
                    "min_age": 18,
                    "max_ecog": 1,
                    "min_egfr": 60.0,
                    "min_prior_lines": 0,
                    "max_prior_lines": 1,
                    "allowed_stages": [
                        "Stage IIIB", "Stage IIIC", "Stage IV (Oligometastatic)", "Stage IV (Polymetastatic)"
                    ],
                    "exclude_active_brain_mets": True,
                    "allow_stable_brain_mets": True,
                    "exclude_active_autoimmune": True,
                },
            ),
            burden=burden,
            source_filename=filename,
            extracted_page_count=0,
            extraction_status="heuristic_fallback",
            extraction_notes=f"Document yielded sparse text or non-tabular structures ({reason or 'standard parsing'}). Calibrated oncology defaults loaded.",
        )

    # ── Optional Semantic Extraction via Gemini API ──────────────────────────

    def _try_gemini_semantic_extract(self, full_text: str, filename: str) -> Optional[dict[str, Any]]:
        """
        Uses configured Gemini API to recover structured Schedule of Assessments & eligibility fields
        from unstructured PDF prose when deterministic table parsing finds < 3 visits.
        Returns None cleanly when Gemini is disabled or returns invalid structure.
        """
        try:
            from app.engine.assistant_engine import (
                _build_genai_client,
                _generate_with_model_fallback,
                is_gemini_configured,
            )
            if not is_gemini_configured():
                return None

            from google import genai
            from google.genai import types
            from app.core.config import settings
        except Exception:
            return None

        excerpt = (full_text or "").strip()
        if len(excerpt) > 14000:
            excerpt = excerpt[:7500] + "\n...\n" + excerpt[-6500:]

        allowed_keys = list(STANDARD_PROCEDURE_CATALOG.keys())
        prompt = (
            "Extract ONLY explicitly stated protocol facts from this clinical trial excerpt. "
            "Do NOT invent or assume visits or criteria that are not stated.\n"
            f"Filename: {filename}\n"
            f"Allowed procedure_keys ONLY from: {json.dumps(allowed_keys)}\n\n"
            "Return a single strict JSON object with keys:\n"
            '  "title": string or null,\n'
            '  "phase": string or null,\n'
            '  "indication": string or null,\n'
            '  "inclusion_criteria": array of short strings (up to 8),\n'
            '  "exclusion_criteria": array of short strings (up to 8),\n'
            '  "min_age": integer (18-95) or null,\n'
            '  "max_age": integer (18-120) or null,\n'
            '  "min_egfr": number (10-150) or null,\n'
            '  "max_ecog": integer (0-4) or null,\n'
            '  "allow_stable_brain_mets": boolean or null,\n'
            '  "visits": array of up to 16 objects {"visit_name": string, "week_number": integer (-4 to 104), "procedure_keys": array of strings from allowed procedure_keys}\n\n'
            f"PROTOCOL EXCERPT:\n{excerpt}"
        )

        try:
            client = _build_genai_client(genai, types)
            primary_model = (settings.GEMINI_MODEL or "gemini-3.8-flash").strip()
            response, used_model = _generate_with_model_fallback(
                client,
                primary_model=primary_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=2048,
                    response_mime_type="application/json",
                ),
            )
            raw_text = (getattr(response, "text", None) or "").strip()
            if not raw_text:
                return None
            payload = json.loads(raw_text)
            if not isinstance(payload, dict):
                return None

            raw_visits = payload.get("visits") or []
            parsed_visits: list[ProtocolVisit] = []
            for idx, v_obj in enumerate(raw_visits[:20], start=1):
                if not isinstance(v_obj, dict):
                    continue
                v_name = str(v_obj.get("visit_name") or "").strip()[:80]
                if not v_name:
                    continue
                try:
                    wk = max(-4, min(104, int(v_obj.get("week_number", (idx - 1) * 3))))
                except (TypeError, ValueError):
                    wk = max(-4, min(104, (idx - 1) * 3))
                raw_keys = v_obj.get("procedure_keys") or []
                procs: list[AssessmentProcedure] = []
                for pk in raw_keys:
                    k = str(pk).strip()
                    if k in STANDARD_PROCEDURE_CATALOG and not any(p.name == STANDARD_PROCEDURE_CATALOG[k]["name"] for p in procs):
                        procs.append(AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG[k]))
                if not procs:
                    procs = [AssessmentProcedure(**STANDARD_PROCEDURE_CATALOG["vitals"])]
                parsed_visits.append(
                    ProtocolVisit(
                        visit_id=f"V-{idx:02d}",
                        week_number=wk,
                        visit_name=v_name,
                        procedures=procs,
                    )
                )

            if len(parsed_visits) < 3:
                return None

            def _bound_float(val: Any, lo: float, hi: float) -> Optional[float]:
                try:
                    if val is None:
                        return None
                    f = float(val)
                    return f if lo <= f <= hi else None
                except (TypeError, ValueError):
                    return None

            def _bound_int(val: Any, lo: int, hi: int) -> Optional[int]:
                try:
                    if val is None:
                        return None
                    n = int(val)
                    return n if lo <= n <= hi else None
                except (TypeError, ValueError):
                    return None

            return {
                "_used_model": used_model,
                "title": str(payload.get("title")).strip() if payload.get("title") else None,
                "phase": str(payload.get("phase")).strip() if payload.get("phase") else None,
                "indication": str(payload.get("indication")).strip() if payload.get("indication") else None,
                "inclusion_criteria": [str(x).strip() for x in (payload.get("inclusion_criteria") or []) if str(x).strip()][:8],
                "exclusion_criteria": [str(x).strip() for x in (payload.get("exclusion_criteria") or []) if str(x).strip()][:8],
                "min_age": _bound_int(payload.get("min_age"), 18, 95),
                "max_age": _bound_int(payload.get("max_age"), 18, 120),
                "min_egfr": _bound_float(payload.get("min_egfr"), 10.0, 150.0),
                "max_ecog": _bound_int(payload.get("max_ecog"), 0, 4),
                "allow_stable_brain_mets": payload.get("allow_stable_brain_mets") if isinstance(payload.get("allow_stable_brain_mets"), bool) else None,
                "visits": parsed_visits,
            }
        except Exception as exc:
            logger.info("Gemini semantic PDF extraction unavailable (%s); using deterministic fallback.", type(exc).__name__)
            return None
