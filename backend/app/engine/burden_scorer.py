"""
ProtocolShield Patient Burden & Protocol Friction Scoring Engine
Calibrated using Tufts CSDD complexity metrics and clinical trial literature.
"""
import re
from app.models.burden import (
    ProtocolVisit,
    AssessmentProcedure,
    InvasivenessTier,
    PatientBurdenBreakdown
)
from app.core.config import settings

# Canonical procedure knowledge-base with empirical weights and dwell times
STANDARD_PROCEDURE_CATALOG: dict[str, dict] = {
    "vitals": {
        "name": "Vital Signs & Performance Status",
        "category": InvasivenessTier.NON_INVASIVE,
        "invasiveness_weight": 1.0,
        "estimated_duration_minutes": 15,
        "fasting_required": False
    },
    "ecg": {
        "name": "12-Lead Electrocardiogram (ECG)",
        "category": InvasivenessTier.NON_INVASIVE,
        "invasiveness_weight": 2.0,
        "estimated_duration_minutes": 20,
        "fasting_required": False
    },
    "safety_labs": {
        "name": "Routine Safety Blood Draw (CBC, CMP, Coagulation)",
        "category": InvasivenessTier.MINIMALLY_INVASIVE,
        "invasiveness_weight": 2.5,
        "estimated_duration_minutes": 15,
        "fasting_required": False
    },
    "pk_serial": {
        "name": "Serial Pharmacokinetic (PK) Blood Sampling (Dense)",
        "category": InvasivenessTier.MODERATELY_INVASIVE,
        "invasiveness_weight": 7.5,
        "estimated_duration_minutes": 360,
        "fasting_required": True
    },
    "iv_infusion": {
        "name": "Intravenous Investigational Product Infusion",
        "category": InvasivenessTier.MODERATELY_INVASIVE,
        "invasiveness_weight": 6.0,
        "estimated_duration_minutes": 180,
        "fasting_required": False
    },
    "ct_scan": {
        "name": "Contrast-Enhanced CT (Chest/Abdomen/Pelvis)",
        "category": InvasivenessTier.HIGHLY_INVASIVE,
        "invasiveness_weight": 8.5,
        "estimated_duration_minutes": 60,
        "fasting_required": True
    },
    "brain_mri": {
        "name": "Brain MRI with Gadolinium Contrast",
        "category": InvasivenessTier.HIGHLY_INVASIVE,
        "invasiveness_weight": 9.0,
        "estimated_duration_minutes": 60,
        "fasting_required": False
    },
    "tumor_biopsy": {
        "name": "Mandatory Core Needle Tumor Biopsy",
        "category": InvasivenessTier.HIGHLY_INVASIVE,
        "invasiveness_weight": 16.0,
        "estimated_duration_minutes": 120,
        "fasting_required": True,
        "sedation_or_recovery_required": True
    },
    "pro_survey": {
        "name": "Patient-Reported Outcome Survey (EORTC QLQ-C30)",
        "category": InvasivenessTier.NON_INVASIVE,
        "invasiveness_weight": 1.5,
        "estimated_duration_minutes": 25,
        "fasting_required": False
    },
    "bone_marrow_biopsy": {
        "name": "Bone Marrow Biopsy & Aspirate",
        "category": InvasivenessTier.HIGHLY_INVASIVE,
        "invasiveness_weight": 18.0,
        "estimated_duration_minutes": 150,
        "fasting_required": True,
        "sedation_or_recovery_required": True
    }
}


class BurdenScoringEngine:
    def __init__(
        self,
        weight_temporal: float = settings.WEIGHT_TEMPORAL,
        weight_invasive: float = settings.WEIGHT_INVASIVE,
        weight_cognitive: float = settings.WEIGHT_COGNITIVE
    ):
        self.w_temp = weight_temporal
        self.w_inv = weight_invasive
        self.w_cog = weight_cognitive

    def calculate_protocol_burden(
        self,
        visits: list[ProtocolVisit],
        study_duration_weeks: int = 52,
        estimated_round_trip_minutes: int = 75
    ) -> PatientBurdenBreakdown:
        """
        Calculates normalized Patient Burden Index (PBI 0-100) and friction drivers.
        """
        if not visits:
            return PatientBurdenBreakdown(
                composite_pbi_score=0.0,
                temporal_burden_score=0.0,
                invasive_burden_score=0.0,
                cognitive_burden_score=0.0,
                total_study_visits=0,
                total_clinic_hours=0.0,
                total_blood_draws=0,
                total_imaging_scans=0,
                total_biopsies=0,
                peak_burden_weeks=[],
                attrition_risk_tier="Low",
                clinical_risk_rationale="No protocol visits scheduled."
            )

        total_visits = len(visits)
        total_clinic_minutes = sum(v.total_clinic_minutes for v in visits)
        total_transit_minutes = total_visits * estimated_round_trip_minutes
        total_time_hours = (total_clinic_minutes + total_transit_minutes) / 60.0

        # Invasiveness aggregations
        total_invasive_raw = sum(v.total_procedure_weight for v in visits)
        
        # Procedure counts
        blood_draws = 0
        scans = 0
        biopsies = 0
        fasting_visits = 0
        
        visit_burdens: list[tuple[int, float]] = []

        for v in visits:
            v_weight = v.total_procedure_weight
            v_time_hrs = (v.total_clinic_minutes + estimated_round_trip_minutes) / 60.0
            
            # Identify specific heavy procedure counts using word-boundary patterns
            # so words like "electrocardiogram" or "product" do not falsely count as CT scans
            for p in v.procedures:
                p_lower = p.name.lower()
                if re.search(r"\bblood\b|\bpk\b|phlebotomy|pharmacokinetic", p_lower):
                    blood_draws += 1
                if re.search(r"\bct\b|\bmri\b|\bscan\b|computed tomography|magnetic resonance", p_lower):
                    scans += 1
                if re.search(r"\bbiopsy\b|\baspirate\b", p_lower):
                    biopsies += 1
            
            if any(p.fasting_required for p in v.procedures):
                fasting_visits += 1

            # Combined visit friction unit
            combined_visit_friction = v_weight + (v_time_hrs * 1.5)
            visit_burdens.append((v.week_number, combined_visit_friction))

        # Peak burden weeks: Top 25% most demanding study weeks (deduplicated)
        visit_burdens.sort(key=lambda x: x[1], reverse=True)
        peak_cutoff = max(1, int(len(visit_burdens) * 0.25))
        peak_weeks = sorted({w for w, _ in visit_burdens[:peak_cutoff]})

        # Normalized Subscores (0 - 100 benchmarked against Phase III oncology trials)
        # Phase III Oncology Benchmark: 25 visits, 80 total hours, 350 raw invasive points
        temporal_normalized = min(100.0, (total_time_hours / 110.0) * 100.0)
        invasive_normalized = min(100.0, (total_invasive_raw / 380.0) * 100.0)
        
        # Cognitive friction: fasting requirements + survey fatigue + multi-visit density
        visit_density_per_month = (total_visits / max(1, study_duration_weeks)) * 4.33
        cognitive_raw = (fasting_visits * 3.5) + (visit_density_per_month * 6.0)
        cognitive_normalized = min(100.0, (cognitive_raw / 45.0) * 100.0)

        composite_pbi = round(
            (self.w_temp * temporal_normalized) +
            (self.w_inv * invasive_normalized) +
            (self.w_cog * cognitive_normalized),
            1
        )

        # Risk Tier Classification
        if composite_pbi < 35.0:
            risk_tier = "Low"
            rationale = "Low protocol friction. Manageable visit frequency with minimal invasive burden."
        elif composite_pbi < 60.0:
            risk_tier = "Moderate"
            rationale = "Standard protocol friction. Moderate clinic dwell times and routine safety monitoring."
        elif composite_pbi < 78.0:
            risk_tier = "High"
            rationale = "Elevated patient friction driven by frequent imaging scans and clustered clinic visits."
        else:
            risk_tier = "Severe"
            rationale = "High attrition danger! Protocol demands excessive dwell times, serial PKs, or repeat biopsies."

        return PatientBurdenBreakdown(
            composite_pbi_score=composite_pbi,
            temporal_burden_score=round(temporal_normalized, 1),
            invasive_burden_score=round(invasive_normalized, 1),
            cognitive_burden_score=round(cognitive_normalized, 1),
            total_study_visits=total_visits,
            total_clinic_hours=round(total_time_hours, 1),
            total_blood_draws=blood_draws,
            total_imaging_scans=scans,
            total_biopsies=biopsies,
            peak_burden_weeks=peak_weeks,
            attrition_risk_tier=risk_tier,
            clinical_risk_rationale=rationale
        )


burden_engine = BurdenScoringEngine()

