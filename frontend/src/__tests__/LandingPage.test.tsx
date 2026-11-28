import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LandingPage } from '../components/LandingPage';

// Lightweight canvas mock so KineticSculptureCanvas doesn't fail under jsdom
vi.mock('../components/KineticSculptureCanvas', () => ({
  KineticSculptureCanvas: () => <div data-testid="kinetic-canvas" />,
}));

const MOCK_OVERVIEW = {
  is_synthetic_cohort: true,
  cohort_patient_count: 10000,
  audit_events_count: 42,
  uploaded_protocols_count: 3,
  measured_query_ms: 4.1,
  cohort_averages: { age: 63.6, egfr: 73.5, distance_miles: 31.3 },
  baseline_nsclc: {
    protocol_id: 'PS-ONC-2026-001',
    title: 'Phase 3 NSCLC Live Reference',
    study_duration_weeks: 52,
    total_visits: 14,
    total_clinic_hours: 90.8,
    avg_visit_hours: 6.5,
    total_biopsies: 2,
    composite_pbi_score: 78.2,
    attrition_risk_tier: 'Severe',
    peak_burden_weeks: [0, 12],
    peak_visit_hours: 5.2,
    total_population: 10000,
    eligible_count: 531,
    overall_yield_percentage: 5.31,
    screen_failure_rate: 94.7,
    funnel_stages: [
      { stage: 'Total Monitored Cohort', count: 10000, pass_rate: 100.0 },
      { stage: 'Age & Cancer Stage', count: 4112, pass_rate: 41.1 },
      { stage: 'ECOG Performance (<= 1)', count: 3315, pass_rate: 33.1 },
      { stage: 'Organ & Lab Functions (eGFR, ANC, ALT)', count: 2292, pass_rate: 22.9 },
      { stage: 'Comorbidity & Final Eligibility', count: 531, pass_rate: 5.3 },
    ],
    sensitivity_opportunities: [],
    end_retention_pct: 56.7,
    visit_previews: [
      { visit_name: 'Screening', week_number: -2, hours: 5.2 },
      { visit_name: 'C1D1', week_number: 0, hours: 9.8 },
      { visit_name: 'C2D1', week_number: 3, hours: 3.5 },
    ],
    clause_diagnostics: {
      egfr: { threshold: 'eGFR < 60 mL/min', recoverable_candidates: 59, relaxed_eligible_count: 590 },
      ecog: { threshold: 'ECOG > 1', recoverable_candidates: 99, relaxed_eligible_count: 630 },
      biopsy: { peak_week: 12, pbi_reduction_if_optional: 10.2, hours_saved_if_hybrid: 17.8 },
    },
  },
  simulation_scenarios: {
    baseline: {
      name: 'Phase III Baseline Protocol',
      color: '#e05a47',
      retentionAt52: 56.7,
      patientsGained: 0,
      eligibleCount: 531,
      compositePbi: 78.2,
      description: 'Baseline NSCLC schedule.',
      data: [{ week: 0, retained: 100 }, { week: 52, retained: 56.7 }],
    },
    scenarioA: {
      name: 'Scenario A: Relaxed eGFR (50 mL/min)',
      color: '#d97706',
      retentionAt52: 56.7,
      patientsGained: 59,
      eligibleCount: 590,
      compositePbi: 78.2,
      description: 'Expanded renal criteria (+59).',
      data: [{ week: 0, retained: 100 }, { week: 52, retained: 56.7 }],
    },
    scenarioB: {
      name: 'Scenario B: Decentralized Visits & Optional Biopsy',
      color: '#2d6a4f',
      retentionAt52: 61.6,
      patientsGained: 59,
      eligibleCount: 590,
      compositePbi: 68.0,
      hoursReduced: 17.8,
      pbiDelta: 10.2,
      description: 'Decentralized visits + optional biopsy.',
      data: [{ week: 0, retained: 100 }, { week: 52, retained: 61.6 }],
    },
  },
  case_studies: {
    nsclc: {
      key: 'nsclc',
      protocol_key: 'nsclc',
      protocol_id: 'PS-ONC-2026-001',
      title: 'Live NSCLC Case Study',
      sponsor: 'Phase III Reference',
      target: 'Metastatic NSCLC',
      challenge: 'Computed bottleneck in DuckDB.',
      result: 'Recovers +59 candidates.',
      metrics: [{ label: 'Eligible Cohort Yield', value: '531 (5.3%)' }],
    },
    breast: {
      key: 'breast',
      protocol_key: 'tnbc',
      protocol_id: 'PS-ONC-2026-002',
      title: 'Live TNBC Case Study',
      sponsor: 'Phase II Reference',
      target: 'Metastatic TNBC',
      challenge: 'Computed TNBC bottleneck.',
      result: 'Decentralizes visit schedule.',
      metrics: [{ label: 'Eligible Cohort Yield', value: '123 (1.2%)' }],
    },
    myeloma: {
      key: 'myeloma',
      protocol_key: 'myeloma',
      protocol_id: 'PS-ONC-2026-003',
      title: 'Live Myeloma Case Study',
      sponsor: 'Phase III Reference',
      target: 'Relapsed Myeloma',
      challenge: 'Computed Myeloma bottleneck.',
      result: 'Reduces burden score.',
      metrics: [{ label: 'Eligible Cohort Yield', value: '509 (5.1%)' }],
    },
  },
};

describe('LandingPage live public-overview wiring', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('populates metrics and scenarios dynamically from /api/v1/system/public-overview without fabricated pediatric case', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_OVERVIEW), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<LandingPage onLaunchStudio={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/31\.3 Miles Avg Travel/i)).toBeTruthy();
      expect(screen.getByText(/531 \(5\.3%\)/i)).toBeTruthy();
    });

    expect(screen.queryByText(/Pediatric Rare Oncology/i)).toBeNull();
    expect(screen.queryByText(/\$2\.4M/i)).toBeNull();
    expect(screen.queryByText(/\$600k/i)).toBeNull();

    // Switching scenario updates headline and metrics from live payload
    fireEvent.click(screen.getByText(/3\. Scenario B: Decentralized Hybrid Visits/i));
    expect(screen.getByText(/68 \/ 100/i)).toBeTruthy();
  });

  it('surfaces honest offline telemetry notice without faking numbers when overview API fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'DuckDB offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<LandingPage onLaunchStudio={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Live backend telemetry offline: DuckDB offline/i)).toBeTruthy();
    });
    expect(screen.queryByText(/\$2\.4M/i)).toBeNull();
    expect(screen.queryByText(/142 Qualified/i)).toBeNull();
  });
});
