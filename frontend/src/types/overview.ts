export interface PublicOverviewScenarioPoint {
  week: number;
  retained: number;
}

export interface PublicOverviewScenario {
  name: string;
  color: string;
  retentionAt52: number;
  patientsGained: number;
  eligibleCount: number;
  compositePbi: number;
  hoursReduced?: number;
  pbiDelta?: number;
  description: string;
  data: PublicOverviewScenarioPoint[];
}

export interface PublicOverviewCaseStudyMetric {
  label: string;
  value: string;
}

export interface PublicOverviewCaseStudy {
  key: 'nsclc' | 'breast' | 'myeloma';
  protocol_key: string;
  protocol_id: string;
  title: string;
  sponsor: string;
  target: string;
  challenge: string;
  result: string;
  metrics: PublicOverviewCaseStudyMetric[];
}

export interface PublicOverviewTemplateSummary {
  type: string;
  protocol_id: string;
  title: string;
  phase: string;
  indication: string;
  label: string;
  short_name: string;
  visit_count: number;
  study_duration_weeks: number;
  extracted_page_count?: number | null;
  composite_pbi_score?: number | null;
  highlights: string[];
}

export interface PublicOverviewResponse {
  is_synthetic_cohort: boolean;
  cohort_patient_count: number;
  audit_events_count: number;
  uploaded_protocols_count: number;
  measured_query_ms: number;
  max_pdf_upload_mb?: number;
  template_summaries?: PublicOverviewTemplateSummary[];
  cohort_averages: {
    age: number;
    egfr: number;
    distance_miles: number;
  };
  baseline_nsclc: {
    protocol_id: string;
    title: string;
    study_duration_weeks: number;
    total_visits: number;
    total_clinic_hours: number;
    avg_visit_hours: number;
    total_biopsies: number;
    composite_pbi_score: number;
    attrition_risk_tier: string;
    peak_burden_weeks: number[];
    peak_visit_hours: number | null;
    total_population: number;
    eligible_count: number;
    overall_yield_percentage: number;
    screen_failure_rate: number;
    funnel_stages: Array<{ stage: string; count: number; pass_rate: number }>;
    sensitivity_opportunities: Array<{
      parameter: string;
      current_rule: string;
      proposed_relaxation: string;
      additional_candidates: number;
      relative_gain_percent: number;
    }>;
    end_retention_pct: number;
    visit_previews: Array<{ visit_name: string; week_number: number; hours: number }>;
    clause_diagnostics: {
      egfr: {
        threshold: string;
        min_egfr?: number;
        relaxed_egfr?: number;
        recoverable_candidates: number;
        relaxed_eligible_count: number;
      };
      ecog: {
        threshold: string;
        recoverable_candidates: number;
        relaxed_eligible_count: number;
      };
      biopsy: {
        peak_week: number;
        pbi_reduction_if_optional: number;
        hours_saved_if_hybrid: number;
      };
    };
  };
  simulation_scenarios: {
    baseline: PublicOverviewScenario;
    scenarioA: PublicOverviewScenario;
    scenarioB: PublicOverviewScenario;
  };
  case_studies: {
    nsclc: PublicOverviewCaseStudy;
    breast: PublicOverviewCaseStudy;
    myeloma: PublicOverviewCaseStudy;
  };
}
