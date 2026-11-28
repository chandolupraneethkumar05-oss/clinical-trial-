import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      if (url.includes('/api/v1/assistant/status')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'operational',
              mode: 'local_knowledge_base',
              llm_configured: false,
              voice_browser_supported: true,
              voice_server_audio_supported: false,
            }),
            { status: 200 }
          )
        );
      }
      return Promise.reject(new Error(`Unexpected API call: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(
      () => {
        expect(screen.getByText(/Unwrapped Curated NSCLC Benchmark Trial/i)).toBeTruthy();
        expect(screen.getByText(/Curated historical benchmark trials\./i)).toBeTruthy();
        expect(screen.getByText(/1 Trials/i)).toBeTruthy();
      },
      { timeout: 5000 }
    );

    const retentionUrl = calledUrls.find((u) => u.includes('/api/v1/cohort/retention-curve'));
    expect(retentionUrl).toBeDefined();
    expect(retentionUrl).toContain('duration_weeks=42');
    expect(retentionUrl).not.toContain('study_duration_weeks=');
    expect(retentionUrl).toContain('enrolled_size=6');
  });

  it('routes patient role strictly to PatientPortal even when studio hash is requested and logs out cleanly via UserMenu click', async () => {
    const patientUser = {
      id: 'usr-pat-99',
      name: 'John Miller',
      email: 'john.miller@patient.org',
      role: 'patient',
      provider: 'email',
      token: 'pat-jwt',
    };
    localStorage.setItem('protocolshield_user', JSON.stringify(patientUser));
    window.location.hash = '#/studio?tab=sandbox';

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve(new Response(JSON.stringify({ success: true, user: patientUser }), { status: 200 }));
      }
      if (url.includes('/api/v1/auth/logout')) {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }
      if (url.includes('/api/v1/patient/screenings') || url.includes('/api/v1/patient/interests')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/assistant/status')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: 'operational', mode: 'local_knowledge_base', llm_configured: false }),
            { status: 200 }
          )
        );
      }
      return Promise.reject(new Error(`Unexpected call: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(
      () => {
        expect(screen.getByText(/ProtocolShield Patient Portal/i)).toBeTruthy();
      },
      { timeout: 5000 }
    );
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/v1/protocol/sample'))).toBe(false);

    // Click UserMenu then Sign Out
    fireEvent.click(screen.getByRole('button', { name: /Account menu for John Miller/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Sign Out/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/v1/auth/logout'))).toBe(true);
      expect(localStorage.getItem('protocolshield_user')).toBeNull();
    });
  });

  it('routes admin role strictly to dedicated AdminPortal console on #/admin', async () => {
    const adminUser = {
      id: 'usr-adm-99',
      name: 'Sarah Jenkins, RAC',
      email: 'sarah.jenkins@iqvia.com',
      role: 'admin',
      provider: 'email',
      token: 'adm-jwt',
    };
    localStorage.setItem('protocolshield_user', JSON.stringify(adminUser));
    window.location.hash = '#/admin';

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve(new Response(JSON.stringify({ success: true, user: adminUser }), { status: 200 }));
      }
      if (url.includes('/ready')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ready',
              service: 'ProtocolShield',
              checks: { database: 'connected', cohort_initialized: true, persistent_storage: true },
            }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/v1/cohort/stats')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              is_synthetic_data: true,
              data_disclaimer: 'Synthetic DuckDB dataset',
              total_patients: 10000,
              stages: [{ stage: 'Stage IV', count: 3500 }],
              ecog_scores: [{ ecog: 1, count: 4000 }],
              rurality: [{ type: 'Urban', count: 7500 }],
              averages: { age: 62, egfr: 74, distance_miles: 20, anc: 3200 },
            }),
            { status: 200 }
          )
        );
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
        return Promise.resolve(new Response(JSON.stringify({ trials: [] }), { status: 200 }));
      }
      if (
        url.includes('/api/v1/audit/logs') ||
        url.includes('/api/v1/patient/screenings') ||
        url.includes('/api/v1/patient/interests') ||
        url.includes('/api/v1/auth/users')
      ) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/audit/verify')) {
        return Promise.resolve(
          new Response(JSON.stringify({ valid: true, total_records_verified: 0, details: 'OK' }), { status: 200 })
        );
      }
      if (url.includes('/api/v1/assistant/status')) {
        return Promise.resolve(
          new Response(JSON.stringify({ status: 'operational', mode: 'local_knowledge_base', llm_configured: false }), {
            status: 200,
          })
        );
      }
      return Promise.reject(new Error(`Unexpected call: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(
      () => {
        expect(screen.getByText(/ProtocolShield Admin Console/i)).toBeTruthy();
        expect(screen.getByText('Operational')).toBeTruthy();
      },
      { timeout: 5000 }
    );
  });

  it('resets appliedAmendmentIds when loading a different protocol via Upload Modal', async () => {
    window.location.hash = '#/studio?tab=sandbox';
    const amendedProtocol = {
      ...SAMPLE_TNBC_PROTOCOL,
      protocol_id: 'PS-ONC-2026-002',
      title: 'Amended TNBC Study',
    };
    const nextProtocol = {
      ...SAMPLE_TNBC_PROTOCOL,
      protocol_id: 'PS-ONC-2026-003',
      title: 'Fresh Myeloma Study',
      phase: 'Phase III',
      indication: 'Relapsed Multiple Myeloma',
      study_duration_weeks: 60,
    };

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve(new Response(JSON.stringify({ success: true, user: MOCK_DOCTOR }), { status: 200 }));
      }
      if (url.includes('/api/v1/protocol/templates')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              max_pdf_upload_mb: 25,
              templates: [
                {
                  type: 'myeloma',
                  protocol_id: 'PS-ONC-2026-003',
                  title: 'Fresh Myeloma Study',
                  phase: 'Phase III',
                  indication: 'Relapsed Multiple Myeloma',
                  label: 'Phase III · Myeloma',
                  short_name: 'BCMA Bispecific Antibody',
                  visit_count: 12,
                  study_duration_weeks: 60,
                  extracted_page_count: 187,
                  composite_pbi_score: 71.0,
                  highlights: ['12 Visits', '60 Weeks'],
                },
              ],
            }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/v1/protocol/sample/myeloma')) {
        return Promise.resolve(new Response(JSON.stringify(nextProtocol), { status: 200 }));
      }
      if (url.includes('/api/v1/protocol/sample')) {
        return Promise.resolve(new Response(JSON.stringify(SAMPLE_TNBC_PROTOCOL), { status: 200 }));
      }
      if (url.includes('/api/v1/protocol/uploaded')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/optimizer/propose-amendments')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                amendment_id: 'AMD-TEST-01',
                category: 'RENAL_FUNCTION',
                title: 'Relax eGFR Threshold',
                target_section: 'Exclusion 4.2',
                current_clause: 'eGFR >= 60',
                proposed_clause: 'eGFR >= 50',
                clinical_evidence_rationale: 'Expand renal window safely.',
                regulatory_precedent: 'FDA Guidance 2020',
                candidate_yield_lift: 45,
                yield_lift_percentage: 4.5,
                pbi_reduction_points: 2.0,
                estimated_accrual_acceleration_months: 1.5,
                projected_sponsor_cost_savings_usd: 150000,
                health_equity_diversity_impact: 'Improves access.',
                safety_guardrail_conditions: ['Monitor creatinine weekly'],
                filter_mutations: { min_egfr: 50 },
                is_recommended: true,
              },
            ]),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/v1/optimizer/apply-amendment')) {
        return Promise.resolve(new Response(JSON.stringify(amendedProtocol), { status: 200 }));
      }
      if (url.includes('/api/v1/cohort/simulate-funnel')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              total_population: 10000,
              final_eligible_count: 120,
              overall_yield_percentage: 1.2,
              screen_failure_rate: 98.8,
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
        return Promise.resolve(new Response(JSON.stringify({ trials: [] }), { status: 200 }));
      }
      if (url.includes('/api/v1/audit/logs')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/audit/verify')) {
        return Promise.resolve(new Response(JSON.stringify({ valid: true, total_records_verified: 0, details: 'OK' }), { status: 200 }));
      }
      if (url.includes('/api/v1/assistant/status')) {
        return Promise.resolve(
          new Response(JSON.stringify({ status: 'operational', mode: 'local_knowledge_base', llm_configured: false }), { status: 200 })
        );
      }
      return Promise.reject(new Error(`Unexpected call: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /AI Optimizer/i })).toBeTruthy();
    });

    // Apply one amendment and confirm count badge appears
    fireEvent.click(screen.getByRole('button', { name: /AI Optimizer/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Apply Amendment/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Apply Amendment/i }));
    await waitFor(() => {
      expect(screen.getByText(/AI Optimizer \(1\)/i)).toBeTruthy();
    });

    // Close Optimizer Modal, open Upload Modal, load a different protocol
    fireEvent.click(screen.getByRole('button', { name: /Done & Return to Studio/i }));
    fireEvent.click(screen.getByText(/Drop \/ Upload Protocol PDF/i));
    await waitFor(() => {
      expect(screen.getByText('BCMA Bispecific Antibody')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('BCMA Bispecific Antibody'));

    await waitFor(
      () => {
        expect(screen.getByText('PS-ONC-2026-003')).toBeTruthy();
        expect(screen.queryByText(/AI Optimizer \(1\)/i)).toBeNull();
      },
      { timeout: 3000 }
    );
  });
});
