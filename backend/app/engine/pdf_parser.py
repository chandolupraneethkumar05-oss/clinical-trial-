"""
ProtocolShield PDF Parser Engine
Extracts Schedule of Assessments and Eligibility Criteria from clinical trial protocol PDFs.
Uses PyMuPDF (fitz) for robust text extraction with keyword-driven SoA detection.
Falls back gracefully to canonical NSCLC defaults when extraction yields sparse data.
"""
from __future__ import annotations
import re
import uuid
from typing import Optional
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

from app.models.protocol import ClinicalTrialProtocol, ProtocolEligibilityCriteria
from app.models.burden import ProtocolVisit, AssessmentProcedure, InvasivenessTier
from app.engine.burden_scorer import burden_engine, STANDARD_PROCEDURE_CATALOG


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


class ProtocolPDFParser:
    """
    Extracts ClinicalTrialProtocol data from raw PDF bytes using PyMuPDF.
    Degrades gracefully when extraction yields sparse results.
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

        return self._parse_text(full_text, filename, page_count)

    def _parse_text(
        self, full_text: str, filename: str, page_count: int
    ) -> ClinicalTrialProtocol:
        lines = full_text.splitlines()

        # ── 1. Title & metadata extraction ───────────────────────────────────
        title = self._extract_title(lines, filename)
        phase = self._extract_phase(full_text)
        indication = self._extract_indication(full_text)

        # ── 2. Section segmentation ───────────────────────────────────────────
        sections = self._segment_sections(lines)

        # ── 3. Eligibility criteria extraction ───────────────────────────────
        inclusion = self._extract_criteria_bullets(
            sections.get("inclusion", []), "inclusion"
        )
        exclusion = self._extract_criteria_bullets(
            sections.get("exclusion", []), "exclusion"
        )

        eligibility_text = " ".join(
            sections.get("inclusion", []) + sections.get("exclusion", [])
        )
        min_egfr = _extract_egfr(eligibility_text) or 60.0
        max_ecog = _extract_ecog(eligibility_text)
        if max_ecog is None:
            max_ecog = 1
        min_age, max_age = _extract_age_range(eligibility_text)

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

        structured_filters: dict = {
            "min_age": min_age,
            "max_ecog": max_ecog,
            "min_egfr": min_egfr,
            "allowed_stages": ["Stage III", "Stage IV (Oligometastatic)", "Stage IV (Polymetastatic)"],
            "max_prior_lines": 1,
            "exclude_active_autoimmune": True,
        }
        if max_age:
            structured_filters["max_age"] = max_age

        # ── 4. Schedule of Assessments extraction ────────────────────────────
        soa_lines = sections.get("soa", [])
        visits = self._extract_visits(soa_lines, full_text)

        # Fallback: if sparse visits, enrich with canonical defaults
        if len(visits) < 3:
            visits = self._get_fallback_visits()

        # ── 5. Compute burden ────────────────────────────────────────────────
        study_duration = self._estimate_duration(full_text, visits)
        burden = burden_engine.calculate_protocol_burden(visits, study_duration)

        # ── 6. Derive protocol_id ─────────────────────────────────────────────
        slug = re.sub(r"[^A-Z0-9]", "", filename.upper())[:8]
        protocol_id = f"PS-EXT-{slug or 'PDF'}-{datetime.now().strftime('%Y')}"

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
            ),
            burden=burden,
            source_filename=filename,
            extracted_page_count=page_count,
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
                    "max_prior_lines": 1,
                    "allowed_stages": [
                        "Stage III", "Stage IV (Oligometastatic)", "Stage IV (Polymetastatic)"
                    ],
                    "exclude_active_autoimmune": True,
                },
            ),
            burden=burden,
            source_filename=filename,
            extracted_page_count=0,
        )
