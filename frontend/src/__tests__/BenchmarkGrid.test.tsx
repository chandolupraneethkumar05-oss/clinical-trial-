import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BenchmarkGrid } from '../components/BenchmarkGrid';
import type { BenchmarkTrial, ClinicalProtocol } from '../types/protocol';

const SAMPLE_TRIALS: BenchmarkTrial[] = [
  {
    nct_id: 'NCT02477839',
    title: 'Keynote-042 NSCLC Completed Benchmark',
    phase: 'Phase 3',
    actual_status: 'COMPLETED',
    enrolled_patients: 305,
    burden_tier: 'Moderate',
    predicted_pbi: 54.2,
    termination_risk_predicted: 'Low',
    protocol_complexity_flags: ['Standard 3-week dosing'],
  },
];

describe('BenchmarkGrid curated portfolio & live ClinicalTrials.gov lookup', () => {
  beforeEach(() => {
    localStorage.setItem(
      'protocolshield_user',
      JSON.stringify({ id: 'usr-doc-1', name: 'Dr. Vance', email: 'v@org.com', role: 'doctor', token: 'doc-jwt' })
    );
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders benchmark disclaimer and executes live NCT lookup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data_source: 'ClinicalTrials.gov',
          nct_id: 'NCT03845296',
          brief_title: 'Live Registry Phase III NSCLC Protocol',
          status: 'RECRUITING',
          conditions: ['Non-Small Cell Lung Cancer'],
          eligibility_criteria_text: 'Age >= 18 years; ECOG 0-1.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BenchmarkGrid
        benchmarks={SAMPLE_TRIALS}
        disclaimer="Curated from publicly available ClinicalTrials.gov records."
        defaultNctId="NCT03845296"
      />
    );

    expect(screen.getByText(/Curated from publicly available ClinicalTrials\.gov records\./i)).toBeTruthy();
    expect(screen.getByText(/Keynote-042 NSCLC Completed Benchmark/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Lookup Live Study/i }));

    await waitFor(() => {
      expect(screen.getByText(/Live Registry Phase III NSCLC Protocol/i)).toBeTruthy();
      expect(screen.getByText(/RECRUITING/i)).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/benchmark/clinicaltrials-live/NCT03845296'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer doc-jwt' }),
      })
    );
  });

  it('rejects invalid NCT format client-side without calling backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<BenchmarkGrid benchmarks={SAMPLE_TRIALS} />);
    fireEvent.change(screen.getByLabelText(/NCT Identifier/i), { target: { value: 'BAD-NCT' } });
    fireEvent.click(screen.getByRole('button', { name: /Lookup Live Study/i }));

    await waitFor(() => {
      expect(screen.getByText(/Enter a valid ClinicalTrials\.gov identifier in NCT######## format/i)).toBeTruthy();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders Registry Only (No SoA) honestly when predicted_pbi is null from ClinicalTrials.gov v2', () => {
    const registryOnlyTrial: BenchmarkTrial[] = [
      {
        nct_id: 'NCT01379976',
        title: 'Live Terminated NSCLC Study Without Uploaded SoA',
        phase: 'Phase 3',
        actual_status: 'TERMINATED',
        termination_reason: 'Difficulty of recruitment',
        enrolled_patients: 107,
        enrollment_type: 'ACTUAL',
        burden_tier: 'Registry Only (No SoA)',
        predicted_pbi: null,
        termination_risk_predicted: 'Terminated Early (Registry reason recorded)',
        protocol_complexity_flags: ['2 study arms'],
      },
    ];
    render(<BenchmarkGrid benchmarks={registryOnlyTrial} />);
    expect(screen.getByText('No SoA')).toBeTruthy();
    expect(screen.getByText(/Registry Only \(No SoA\)/i)).toBeTruthy();
    expect(screen.getByText(/Difficulty of recruitment/i)).toBeTruthy();
  });

  it('opens side-by-side active protocol vs ClinicalTrials.gov comparison when activeProtocol is supplied', () => {
    const activeProto: ClinicalProtocol = {
      protocol_id: 'PS-ONC-2026-001',
      title: 'Active Phase 3 NSCLC Studio Study',
      phase: 'Phase III',
      indication: 'NSCLC',
      study_duration_weeks: 52,
      target_enrollment: 400,
      visits: [],
      eligibility: {
        inclusion_criteria: ['Age >= 18'],
        exclusion_criteria: ['Active CNS'],
        structured_filters: { min_egfr: 50, max_ecog: 1 },
      },
      burden: {
        composite_pbi_score: 62.5,
        temporal_burden_score: 60,
        invasive_burden_score: 65,
        cognitive_burden_score: 50,
        total_study_visits: 12,
        total_clinic_hours: 48,
        total_blood_draws: 10,
        total_imaging_scans: 4,
        total_biopsies: 1,
        peak_burden_weeks: [12],
        attrition_risk_tier: 'High',
        clinical_risk_rationale: 'Moderate burden.',
      },
    };

    render(<BenchmarkGrid benchmarks={SAMPLE_TRIALS} activeProtocol={activeProto} />);
    fireEvent.click(screen.getByRole('button', { name: /Compare/i }));
    expect(screen.getByText(/Protocol vs Registry Comparison: PS-ONC-2026-001 vs NCT02477839/i)).toBeTruthy();
    expect(screen.getByText(/Active Phase 3 NSCLC Studio Study/i)).toBeTruthy();
  });
});
