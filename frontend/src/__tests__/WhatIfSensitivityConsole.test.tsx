import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WhatIfSensitivityConsole } from '../components/WhatIfSensitivityConsole';
import type { ClinicalProtocol, FunnelSimulationResult, RetentionPoint } from '../types/protocol';

const MOCK_PROTOCOL: ClinicalProtocol = {
  protocol_id: 'PS-ONC-2026-001',
  nct_id: 'NCT06184210',
  title: 'Test NSCLC Protocol',
  phase: 'Phase III',
  indication: 'NSCLC',
  study_duration_weeks: 52,
  target_enrollment: 400,
  visits: [],
  eligibility: {
    inclusion_criteria: ['Age >= 18'],
    exclusion_criteria: ['Active CNS mets'],
    structured_filters: {
      min_egfr: 60,
      max_ecog: 1,
      max_total_bilirubin: 1.5,
      allow_stable_brain_mets: true,
      max_prior_lines: 2,
    },
  },
  burden: {
    composite_pbi_score: 62.5,
    temporal_burden_score: 55.0,
    invasive_burden_score: 68.0,
    cognitive_burden_score: 58.0,
    total_study_visits: 14,
    total_clinic_hours: 34.5,
    total_blood_draws: 18,
    total_imaging_scans: 6,
    total_biopsies: 2,
    peak_burden_weeks: [4, 12],
    attrition_risk_tier: 'High',
    clinical_risk_rationale: 'Moderate-to-high invasive burden.',
  },
};

const INITIAL_FUNNEL: FunnelSimulationResult = {
  total_population: 10000,
  final_eligible_count: 1450,
  overall_yield_percentage: 14.5,
  screen_failure_rate: 85.5,
  funnel_stages: [{ stage: 'Total Virtual Cohort', count: 10000, pass_rate: 100 }],
  sensitivity_opportunities: [],
};

const INITIAL_RETENTION: RetentionPoint[] = [
  {
    week: 0,
    active_patients: 1450,
    retained_percentage: 100,
    cumulative_dropouts: 0,
    weekly_dropout_hazard: 0,
    is_peak_burden_week: false,
  },
  {
    week: 52,
    active_patients: 1120,
    retained_percentage: 77.2,
    cumulative_dropouts: 330,
    weekly_dropout_hazard: 0.4,
    is_peak_burden_week: false,
  },
];

describe('WhatIfSensitivityConsole error & abort handling', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('surfaces simulation API failure banner, preserves stale warning, and supports Retry', async () => {
    const onSimulateFunnel = vi
      .fn()
      .mockRejectedValueOnce(new Error('Backend cohort database offline'))
      .mockResolvedValueOnce({
        ...INITIAL_FUNNEL,
        final_eligible_count: 1890,
        overall_yield_percentage: 18.9,
      });

    const onCalculateRetention = vi.fn().mockResolvedValue(INITIAL_RETENTION);

    render(
      <WhatIfSensitivityConsole
        protocol={MOCK_PROTOCOL}
        initialFunnel={INITIAL_FUNNEL}
        initialRetention={INITIAL_RETENTION}
        onSimulateFunnel={onSimulateFunnel}
        onCalculateRetention={onCalculateRetention}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /KDIGO Renal \(eGFR 50\)/i }));

    await waitFor(() => {
      expect(screen.getByText(/Backend cohort database offline/i)).toBeTruthy();
      expect(screen.getByText(/Showing previously computed results for this protocol/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Backend cohort database offline/i)).toBeNull();
      expect(screen.getByText(/1,890/)).toBeTruthy();
    });
  });

  it('aborts superseded simulation requests when user clicks another preset rapidly', async () => {
    const signals: AbortSignal[] = [];
    let resolveFirst!: (val: FunnelSimulationResult) => void;
    const firstPromise = new Promise<FunnelSimulationResult>((res) => {
      resolveFirst = res;
    });

    const onSimulateFunnel = vi
      .fn()
      .mockImplementationOnce((_criteria: Record<string, unknown>, signal?: AbortSignal) => {
        if (signal) signals.push(signal);
        return firstPromise;
      })
      .mockImplementationOnce((_criteria: Record<string, unknown>, signal?: AbortSignal) => {
        if (signal) signals.push(signal);
        return Promise.resolve({
          ...INITIAL_FUNNEL,
          final_eligible_count: 2125,
          overall_yield_percentage: 21.25,
        });
      });

    const onCalculateRetention = vi.fn().mockResolvedValue(INITIAL_RETENTION);

    render(
      <WhatIfSensitivityConsole
        protocol={MOCK_PROTOCOL}
        initialFunnel={INITIAL_FUNNEL}
        initialRetention={INITIAL_RETENTION}
        onSimulateFunnel={onSimulateFunnel}
        onCalculateRetention={onCalculateRetention}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /KDIGO Renal \(eGFR 50\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /ECOG 2 Expansion/i }));

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    await waitFor(() => {
      expect(screen.getByText(/2,125/)).toBeTruthy();
    });

    // Late resolution of first superseded call must not overwrite newer result
    resolveFirst({
      ...INITIAL_FUNNEL,
      final_eligible_count: 999,
      overall_yield_percentage: 9.99,
    });
    await Promise.resolve();
    expect(screen.queryByText(/999/)).toBeNull();
  });
});
