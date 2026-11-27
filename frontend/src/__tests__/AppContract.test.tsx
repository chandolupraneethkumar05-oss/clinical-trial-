import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import App from '../App';

const MOCK_DOCTOR = {
  id: 'usr-doc-1',
  name: 'Dr. Elena Vance',
  email: 'elena.vance@novartis.com',
  role: 'doctor',
  provider: 'email',
  token: 'test-doctor-jwt',
};

const SAMPLE_TNBC_PROTOCOL = {
  protocol_id: 'PS-ONC-2026-002',
  nct_id: 'NCT04468321',
  title: 'Phase 2 Study in Metastatic TNBC',
  phase: 'Phase II',
  indication: 'Metastatic Triple-Negative Breast Cancer (TNBC)',
  study_duration_weeks: 42,
  target_enrollment: 120,
  visits: [],
  eligibility: {
    inclusion_criteria: ['Age >= 18'],
    exclusion_criteria: ['Active CNS mets'],
    structured_filters: {
      min_egfr: 50,
      max_ecog: 1,
      allow_stable_brain_mets: true,
      max_prior_lines: 0,
    },
  },
  burden: {
    composite_pbi_score: 54.0,
    temporal_burden_score: 50.0,
    invasive_burden_score: 60.0,
    cognitive_burden_score: 48.0,
    total_study_visits: 10,
    total_clinic_hours: 28.0,
    total_blood_draws: 12,
    total_imaging_scans: 5,
    total_biopsies: 2,
    peak_burden_weeks: [0, 12],
    attrition_risk_tier: 'Moderate',
    clinical_risk_rationale: 'Moderate schedule friction.',
  },
};

describe('App API contract fixes (benchmarks payload & retention params)', () => {
  beforeEach(() => {
    localStorage.setItem('protocolshield_user', JSON.stringify(MOCK_DOCTOR));
    window.location.hash = '#/studio?tab=benchmarks';
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    window.location.hash = '#/';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('unwraps { trials: [...] } from historical-trials and sends duration_weeks query param to retention-curve', async () => {
    const calledUrls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      calledUrls.push(url);
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve(new Response(JSON.stringify({ success: true, user: MOCK_DOCTOR }), { status: 200 }));
      }
      if (url.includes('/api/v1/protocol/sample')) {
        return Promise.resolve(new Response(JSON.stringify(SAMPLE_TNBC_PROTOCOL), { status: 200 }));
      }
      if (url.includes('/api/v1/cohort/simulate-funnel')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              total_population: 10000,
              final_eligible_count: 6,
              overall_yield_percentage: 0.06,
              screen_failure_rate: 99.94,
              funnel_stages: [],
              sensitivity_opportunities: [],
            }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/v1/cohort/retention-curve')) {
        return Promise.resolve(new Response(JSON.stringify({ retention_curve: [] }), { status: 200 }));
      }
      if (url.includes('/api/v1/benchmark/historical-trials')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data_source: 'synthetic_benchmark',
              data_disclaimer: 'Curated historical benchmark trials.',
              benchmark_count: 1,
              trials: [
                {
                  nct_id: 'NCT02477839',
                  title: 'Unwrapped Curated NSCLC Benchmark Trial',
                  phase: 'Phase 3',
                  actual_status: 'COMPLETED',
                  enrolled_patients: 305,
                  burden_tier: 'Moderate',
                  predicted_pbi: 54.2,
                  termination_risk_predicted: 'Low',
                  protocol_complexity_flags: ['Standard dosing'],
                },
              ],
            }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/v1/audit/logs') || url.includes('/api/v1/patient/screenings') || url.includes('/api/v1/patient/interests')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/audit/verify')) {
        return Promise.resolve(new Response(JSON.stringify({ valid: true, total_records_verified: 0, details: 'OK' }), { status: 200 }));
      }
      return Promise.reject(new Error(`Unexpected API call: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Unwrapped Curated NSCLC Benchmark Trial/i)).toBeTruthy();
      expect(screen.getByText(/Curated historical benchmark trials\./i)).toBeTruthy();
      expect(screen.getByText(/1 Trials/i)).toBeTruthy();
    });

    const retentionUrl = calledUrls.find((u) => u.includes('/api/v1/cohort/retention-curve'));
    expect(retentionUrl).toBeDefined();
    expect(retentionUrl).toContain('duration_weeks=42');
    expect(retentionUrl).not.toContain('study_duration_weeks=');
    expect(retentionUrl).toContain('enrolled_size=6');
  });
});
