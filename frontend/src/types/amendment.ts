export interface ProtocolAmendmentProposal {
  amendment_id: string;
  category: 'RENAL_FUNCTION' | 'RE_BIOPSY' | 'STABLE_CNS' | 'PERFORMANCE_STATUS' | 'TELEHEALTH_PK' | string;
  title: string;
  target_section: string;
  current_clause: string;
  proposed_clause: string;
  clinical_evidence_rationale: string;
  regulatory_precedent: string;

  candidate_yield_lift: number;
  yield_lift_percentage: number;
  pbi_reduction_points: number;
  estimated_accrual_acceleration_months: number;
  projected_sponsor_cost_savings_usd: number;

  health_equity_diversity_impact: string;
  safety_guardrail_conditions: string[];

  filter_mutations: Record<string, any>;
  procedure_modifications?: Record<string, any>;
  is_recommended: boolean;
  is_applied?: boolean;
}
