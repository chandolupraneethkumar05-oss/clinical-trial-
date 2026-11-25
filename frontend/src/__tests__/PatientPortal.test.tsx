import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PatientPortal } from '../components/PatientPortal';
import type { AuthUser } from '../types/auth';

const TEST_PATIENT_USER: AuthUser = {
  id: 'usr-patient-test-01',
  name: 'Alex Test',
  email: 'alex.test@example.org',
  role: 'patient',
  provider: 'email',
  token: 'test-patient-jwt',
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fillRequiredClinicalInputs() {
  fireEvent.change(screen.getByLabelText(/Age \(Years\)/i), { target: { value: '60' } });
  fireEvent.change(screen.getByLabelText(/Cancer Stage/i), {
    target: { value: 'Stage IV (Oligometastatic)' },
  });
  fireEvent.change(screen.getByLabelText(/Kidney eGFR/i), { target: { value: '68' } });
  fireEvent.click(screen.getByRole('button', { name: /ECOG 1/i }));
}

describe('PatientPortal clinical safety, provenance, validation & concurrency', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('starts without invented clinical defaults and blocks screening when required fields are missing', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/patient/interests')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/patient/screenings')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.reject(new Error(`Unexpected call: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PatientPortal
        user={TEST_PATIENT_USER}
        onSignOut={vi.fn()}
        onSwitchPersona={vi.fn()}
        onOpenAuth={vi.fn()}
      />
    );

    expect((screen.getByLabelText(/Age \(Years\)/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Distance to Hospital/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Untreated \/ Active Brain Metastases/i) as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText(/Treated & Stable Brain Metastases/i) as HTMLSelectElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /Run Eligibility Screening/i }));

    await waitFor(() => {
      expect(screen.getByText(/Please fix the following clinical inputs before screening/i)).toBeTruthy();
    });
    const screenCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes('/api/v1/patient/screen-eligibility')
    );
    expect(screenCalls).toHaveLength(0);
  });

  it('omits missing optional fields rather than fabricating defaults and never asserts verified_clinical provenance', async () => {
    const capturedPayloads: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/v1/patient/interests')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/patient/screenings')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/patient/screen-eligibility')) {
        capturedPayloads.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              patient_id: TEST_PATIENT_USER.id,
              is_synthetic_data: false,
              data_provenance: 'patient_reported',
              provenance_verified: false,
              data_disclaimer: 'Preliminary patient-reported pre-screen.',
              evaluated_trials_count: 1,
              matches: [
                {
                  protocol_id: 'PS-ONC-2026-001',
                  title: 'Phase III NSCLC Study',
                  indication: 'NSCLC',
                  phase: 'Phase III',
                  match_status: 'REQUIRES_REVIEW',
                  match_score_pct: 66.7,
                  passed_criteria_count: 4,
                  total_criteria_count: 6,
                  criteria_breakdown: [
                    {
                      criterion: 'CNS Metastases (Brain Mets)',
                      category: 'Safety Exclusion',
                      status: 'NEEDS_INVESTIGATOR_REVIEW',
                      passed: false,
                      patient_value: 'Active: Not provided; Treated/Stable: Not provided',
                      required_threshold: 'Active CNS excluded; Treated/stable allowed',
                      impact_note: 'Missing CNS information requires investigator review.',
                      is_hard_rule: true,
                    },
                  ],
                  patient_burden_summary: {
                    pbi_score: 52.0,
                    attrition_risk_tier: 'Moderate',
                    total_study_visits: 10,
                    study_duration_weeks: 52,
                    total_clinic_hours: 22.0,
                    travel_distance_miles: null,
                    telehealth_eligible_visits: 2,
                  },
                  investigator_confirmation_required: true,
                  investigator_disclaimer: 'Requires Principal Investigator confirmation before enrollment.',
                },
              ],
              summary: '1 trial requires investigator review due to unprovided CNS/safety fields.',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PatientPortal
        user={TEST_PATIENT_USER}
        onSignOut={vi.fn()}
        onSwitchPersona={vi.fn()}
        onOpenAuth={vi.fn()}
      />
    );

    expect(screen.getByText(/Unprovided optional fields:/i)).toBeTruthy();

    fillRequiredClinicalInputs();
    fireEvent.click(screen.getByRole('button', { name: /Run Eligibility Screening/i }));

    await waitFor(() => {
      expect(screen.getByText(/Phase III NSCLC Study/i)).toBeTruthy();
    });

    expect(capturedPayloads).toHaveLength(1);
    const capturedPayload = capturedPayloads[0];
    expect(capturedPayload.data_provenance).toBe('patient_reported');
    expect(capturedPayload.data_provenance).not.toBe('verified_clinical');
    expect(capturedPayload).not.toHaveProperty('distance_to_center_miles');
    expect(capturedPayload).not.toHaveProperty('has_active_brain_mets');
    expect(capturedPayload).not.toHaveProperty('has_stable_brain_mets');
    expect(capturedPayload).not.toHaveProperty('has_active_autoimmune');
    expect(capturedPayload).not.toHaveProperty('has_egfr_sensitizing_mutation');

    expect(screen.getAllByText(/Patient-Reported \(Unverified by Investigator\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Investigator Review Required/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/TRAVEL MILES/i)).toBeTruthy();
    expect(screen.getByText(/^Not provided$/i)).toBeTruthy();
    expect(screen.getByText(/Requires Principal Investigator confirmation before enrollment\./i)).toBeTruthy();
  });

  it('marks synthetic demo walkthrough explicitly and clears stale state when disabled', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/patient/interests')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PatientPortal
        user={TEST_PATIENT_USER}
        onSignOut={vi.fn()}
        onSwitchPersona={vi.fn()}
        onOpenAuth={vi.fn()}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Load Demo Patient Profile/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByText(/Synthetic Demo Patient Profile Active — Not Real Clinical Data/i)).toBeTruthy();
    expect((screen.getByLabelText(/Age \(Years\)/i) as HTMLInputElement).value).toBe('62');

    fireEvent.click(screen.getByRole('button', { name: /Clear Demo Patient/i }));
    expect((screen.getByLabelText(/Age \(Years\)/i) as HTMLInputElement).value).toBe('');
  });

  it('distinguishes preliminary patient-reported matches from investigator-verified eligibility', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/patient/interests')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/patient/screenings')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                screening_id: 'scr-verified-001',
                patient_id: TEST_PATIENT_USER.id,
                data_provenance: 'investigator_verified',
                is_synthetic_data: false,
                investigator_verified: true,
                verified_by: 'Dr. Elena Vance',
                verified_by_role: 'doctor',
                verified_at: '2026-11-25T12:00:00Z',
                created_at: '2026-11-25T11:30:00Z',
                matches: [
                  {
                    protocol_id: 'PS-ONC-2026-001',
                    title: 'Phase III NSCLC Study',
                    indication: 'NSCLC',
                    phase: 'Phase III',
                    match_status: 'INVESTIGATOR_VERIFIED_ELIGIBLE',
                    match_score_pct: 100,
                    passed_criteria_count: 6,
                    total_criteria_count: 6,
                    criteria_breakdown: [],
                    patient_burden_summary: {
                      pbi_score: 48,
                      attrition_risk_tier: 'Moderate',
                      total_study_visits: 10,
                      total_clinic_hours: 20,
                      travel_distance_miles: 15,
                      telehealth_eligible_visits: 2,
                    },
                  },
                ],
              },
            ]),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/v1/patient/screen-eligibility')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              screening_id: 'scr-prelim-002',
              patient_id: TEST_PATIENT_USER.id,
              is_synthetic_data: false,
              data_provenance: 'patient_reported',
              provenance_verified: false,
              evaluated_trials_count: 1,
              matches: [
                {
                  protocol_id: 'PS-ONC-2026-001',
                  title: 'Phase III NSCLC Study',
                  indication: 'NSCLC',
                  phase: 'Phase III',
                  match_status: 'PRELIMINARY_MATCH',
                  match_status_label: 'Preliminary Match (Patient-Reported — Unverified)',
                  is_investigator_verified: false,
                  match_score_pct: 100,
                  passed_criteria_count: 6,
                  total_criteria_count: 6,
                  criteria_breakdown: [],
                  patient_burden_summary: {
                    pbi_score: 48,
                    attrition_risk_tier: 'Moderate',
                    total_study_visits: 10,
                    total_clinic_hours: 20,
                    travel_distance_miles: null,
                    telehealth_eligible_visits: 2,
                  },
                },
              ],
              recruitment_support_summary: '1 Preliminary Match (Unverified)',
            }),
            { status: 200 }
          )
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PatientPortal
        user={TEST_PATIENT_USER}
        onSignOut={vi.fn()}
        onSwitchPersona={vi.fn()}
        onOpenAuth={vi.fn()}
      />
    );

    // Loaded verification history clearly displays verified investigator attribution
    await waitFor(() => {
      expect(screen.getByText(/scr-verified-001/i)).toBeTruthy();
      expect(screen.getByText(/Verified by Dr\. Elena Vance/i)).toBeTruthy();
    });

    fillRequiredClinicalInputs();
    fireEvent.click(screen.getByRole('button', { name: /Run Eligibility Screening/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Preliminary Match \(Patient-Reported — Unverified\)/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/^✓ Investigator-Verified Eligible$/i)).toBeNull();
    expect(screen.getByText(/investigator confirmation required before enrollment/i)).toBeTruthy();
  });

  it('displays API error responses safely without crashing or showing fake matches', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/patient/interests')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/patient/screen-eligibility')) {
        return Promise.resolve(
          new Response(JSON.stringify({ detail: 'DuckDB cohort store temporarily unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PatientPortal
        user={TEST_PATIENT_USER}
        onSignOut={vi.fn()}
        onSwitchPersona={vi.fn()}
        onOpenAuth={vi.fn()}
      />
    );

    fillRequiredClinicalInputs();
    fireEvent.click(screen.getByRole('button', { name: /Run Eligibility Screening/i }));

    await waitFor(() => {
      expect(screen.getByText(/DuckDB cohort store temporarily unavailable/i)).toBeTruthy();
    });
  });

  it('aborts in-flight screening when profile is reset and ignores late stale responses', async () => {
    const firstDeferred = createDeferred<Response>();
    let firstAborted = false;

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/v1/patient/interests')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/patient/screenings')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes('/api/v1/patient/screen-eligibility')) {
        init?.signal?.addEventListener('abort', () => {
          firstAborted = true;
        });
        return firstDeferred.promise;
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PatientPortal
        user={TEST_PATIENT_USER}
        onSignOut={vi.fn()}
        onSwitchPersona={vi.fn()}
        onOpenAuth={vi.fn()}
      />
    );

    fillRequiredClinicalInputs();
    fireEvent.click(screen.getByRole('button', { name: /Run Eligibility Screening/i }));

    // Reset Form while first request is still pending -> must abort Signal
    fireEvent.click(screen.getByRole('button', { name: /Reset Form/i }));

    expect(firstAborted).toBe(true);

    // Late resolution of aborted request must not render stale trial matches
    firstDeferred.resolve(
      new Response(
        JSON.stringify({
          patient_id: TEST_PATIENT_USER.id,
          data_provenance: 'patient_reported',
          matches: [
            {
              protocol_id: 'STALE-ID',
              title: 'Stale Trial Result',
              indication: 'NSCLC',
              phase: 'Phase III',
              match_status: 'PRELIMINARY_MATCH',
              match_score_pct: 100,
              passed_criteria_count: 1,
              total_criteria_count: 1,
              criteria_breakdown: [],
              patient_burden_summary: {
                pbi_score: 40,
                attrition_risk_tier: 'Low',
                total_study_visits: 5,
                total_clinic_hours: 10,
                travel_distance_miles: null,
                telehealth_eligible_visits: 1,
              },
            },
          ],
          summary: 'Stale summary',
        }),
        { status: 200 }
      )
    );
    await Promise.resolve();
    expect(screen.queryByText(/Stale Trial Result/i)).toBeNull();
  });
});
