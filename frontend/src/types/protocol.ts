export interface Procedure {
  name: string;
  category: 'non_invasive' | 'minimally_invasive' | 'moderately_invasive' | 'highly_invasive';
  invasiveness_weight: number;
  estimated_duration_minutes: number;
  fasting_required: boolean;
  sedation_or_recovery_required?: boolean;
}

export interface Visit {
  visit_id: string;
  week_number: number;
  visit_name: string;
  procedures: Procedure[];
  is_mandatory: boolean;
  inpatient_stay: boolean;
}

export interface BurdenBreakdown {
  composite_pbi_score: number;
  temporal_burden_score: number;
  invasive_burden_score: number;
  cognitive_burden_score: number;
  total_study_visits: number;
  total_clinic_hours: number;
  total_blood_draws: number;
  total_imaging_scans: number;
  total_biopsies: number;
  peak_burden_weeks: number[];
  attrition_risk_tier: 'Low' | 'Moderate' | 'High' | 'Severe';
  clinical_risk_rationale: string;
}

export interface ClinicalProtocol {
  protocol_id: string;
  nct_id?: string;
  title: string;
  phase: string;
  indication: string;
  study_duration_weeks: number;
  target_enrollment: number;
  visits: Visit[];
  eligibility: {
    inclusion_criteria: string[];
    exclusion_criteria: string[];
    structured_filters: Record<string, any>;
  };
  burden: BurdenBreakdown;
  source_filename?: string;
  extracted_page_count?: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
  pass_rate: number;
}

export interface SensitivityOpportunity {
  parameter: string;
  current_rule: string;
  proposed_relaxation: string;
  additional_candidates: number;
  relative_gain_percent: number;
}

export interface FunnelSimulationResult {
  total_population: number;
  final_eligible_count: number;
  overall_yield_percentage: number;
  screen_failure_rate: number;
  funnel_stages: FunnelStage[];
  sensitivity_opportunities: SensitivityOpportunity[];
}

export interface RetentionPoint {
  week: number;
  active_patients: number;
  retained_percentage: number;
  cumulative_dropouts: number;
  weekly_dropout_hazard: number;
  is_peak_burden_week: boolean;
}

export interface BenchmarkTrial {
  nct_id: string;
  title: string;
  phase: string;
  actual_status: 'COMPLETED' | 'TERMINATED';
  termination_reason?: string;
  enrolled_patients: number;
  target_enrollment?: number;
  burden_tier: string;
  predicted_pbi: number;
  termination_risk_predicted: string;
  protocol_complexity_flags: string[];
}
