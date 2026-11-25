import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuditTrailView } from '../components/AuditTrailView';
import type { PatientScreeningRecord } from '../types/audit';

const SAMPLE_SCREENINGS: PatientScreeningRecord[] = [
  {
    screening_id: 'scr-patient-001',
    patient_id: 'usr-pat-1',
    submitted_by_user_id: 'usr-pat-1',
    submitted_by_role: 'patient',
    data_provenance: 'patient_reported',
    is_synthetic_data: false,
    investigator_verified: false,
    created_at: '2026-11-25T10:00:00Z',
    clinical_summary: { age: 62, cancer_stage: 'Stage IV', ecog_score: 1, egfr_ml_min: 70 },
    matches: [{ protocol_id: 'PS-ONC-2026-001', match_status: 'PRELIMINARY_MATCH' }],
  },
  {
    screening_id: 'scr-demo-002',
    patient_id: 'usr-pat-1',
    submitted_by_user_id: 'usr-pat-1',
    submitted_by_role: 'patient',
    data_provenance: 'synthetic_demo',
    is_synthetic_data: true,
    investigator_verified: false,
    created_at: '2026-11-25T10:05:00Z',
    clinical_summary: { age: 62, cancer_stage: 'Stage IV', ecog_score: 1, egfr_ml_min: 52 },
    matches: [{ protocol_id: 'PS-ONC-2026-001', match_status: 'PRELIMINARY_MATCH' }],
  },
  {
    screening_id: 'scr-verified-003',
    patient_id: 'usr-pat-2',
    submitted_by_user_id: 'usr-pat-2',
    submitted_by_role: 'patient',
    data_provenance: 'investigator_verified',
    is_synthetic_data: false,
    investigator_verified: true,
    verified_by: 'Dr. Elena Vance',
    verified_by_role: 'doctor',
    verified_at: '2026-11-25T11:00:00Z',
    created_at: '2026-11-25T10:30:00Z',
    clinical_summary: { age: 58, cancer_stage: 'Stage IV', ecog_score: 0, egfr_ml_min: 80 },
    matches: [{ protocol_id: 'PS-ONC-2026-001', match_status: 'INVESTIGATOR_VERIFIED_ELIGIBLE' }],
  },
];

describe('AuditTrailView investigator verification queue', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('distinguishes preliminary, synthetic demo, and verified screenings and triggers verification only on non-synthetic pending records', () => {
    const onVerifyScreening = vi.fn();

    render(
      <AuditTrailView
        events={[]}
        patientScreenings={SAMPLE_SCREENINGS}
        onVerifyScreening={onVerifyScreening}
      />
    );

    expect(screen.getByText(/PATIENT-REPORTED \(PRELIMINARY\)/i)).toBeTruthy();
    expect(screen.getByText(/SYNTHETIC DEMO \(UNVERIFIABLE\)/i)).toBeTruthy();
    expect(screen.getByText(/INVESTIGATOR VERIFIED/i)).toBeTruthy();
    expect(screen.getByText(/Verified by Dr\. Elena Vance/i)).toBeTruthy();

    const verifyButtons = screen.getAllByRole('button', { name: /Verify Clinical Record/i });
    expect(verifyButtons).toHaveLength(1);

    fireEvent.click(verifyButtons[0]);
    expect(onVerifyScreening).toHaveBeenCalledWith('scr-patient-001');
  });
});
