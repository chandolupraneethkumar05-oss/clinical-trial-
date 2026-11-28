import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminPortal } from '../components/AdminPortal';
import type { AuthUser } from '../types/auth';

const ADMIN_USER: AuthUser = {
  id: 'usr-adm-1',
  name: 'Sarah Jenkins, RAC',
  email: 'sarah.jenkins@iqvia.com',
  role: 'admin',
  organization: 'IQVIA',
  provider: 'email',
  token: 'admin-token',
};

describe('AdminPortal dedicated console & real backend state', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders honest empty placeholders without hardcoded numbers when telemetry is null', () => {
    render(
      <AdminPortal
        user={ADMIN_USER}
        auditEvents={[]}
        auditVerification={null}
        patientScreenings={[]}
        onVerifyScreening={vi.fn()}
        patientInterests={[]}
        adminUsers={[]}
        onPromoteUser={vi.fn()}
        readiness={null}
        cohortStats={null}
        onRefreshAll={vi.fn()}
        onSeedCohort={vi.fn().mockResolvedValue('Seeded')}
        onOpenStudioView={vi.fn()}
        onBackToLanding={vi.fn()}
        onOpenAuth={vi.fn()}
        onSignOut={vi.fn()}
        onSwitchPersona={vi.fn()}
      />
    );

    expect(screen.getByText(/ProtocolShield Admin Console/i)).toBeTruthy();
    expect(screen.getByText(/Awaiting live cohort telemetry/i)).toBeTruthy();
    expect(screen.getByText(/Cohort telemetry not available yet/i)).toBeTruthy();
  });

  it('renders live cohort metrics, guards cohort reset confirmation, and promotes users', async () => {
    const onPromoteUser = vi.fn();
    const onSeedCohort = vi.fn().mockResolvedValue('Synthetic cohort verified.');

    render(
      <AdminPortal
        user={ADMIN_USER}
        auditEvents={[]}
        auditVerification={{
          valid: true,
          total_records_verified: 5,
          details: 'Chain intact',
        }}
        patientScreenings={[]}
        onVerifyScreening={vi.fn()}
        patientInterests={[]}
        adminUsers={[
          {
            id: 'usr-p-1',
            name: 'John Miller',
            email: 'john.miller@patient.org',
            role: 'patient',
            organization: 'Patient Cohort',
            provider: 'email',
            created_at: '2026-11-20T00:00:00Z',
          },
          ADMIN_USER as unknown as {
            id: string;
            name: string;
            email: string;
            role: string;
            organization: string;
            provider: string;
            created_at: string;
          },
        ]}
        onPromoteUser={onPromoteUser}
        readiness={{
          status: 'ready',
          service: 'ProtocolShield API',
          checks: { database: 'connected', cohort_initialized: true, persistent_storage: true },
        }}
        cohortStats={{
          is_synthetic_data: true,
          data_disclaimer: 'Synthetic educational dataset generated cleanly.',
          total_patients: 10000,
          stages: [{ stage: 'Stage IV', count: 3500 }],
          ecog_scores: [{ ecog: 1, count: 4200 }],
          rurality: [{ type: 'Urban', count: 7800 }],
          averages: { age: 61.5, egfr: 72.1, distance_miles: 24.3, anc: 3100 },
        }}
        onRefreshAll={vi.fn()}
        onSeedCohort={onSeedCohort}
        onOpenStudioView={vi.fn()}
        onBackToLanding={vi.fn()}
        onOpenAuth={vi.fn()}
        onSignOut={vi.fn()}
        onSwitchPersona={vi.fn()}
      />
    );

    expect(screen.getByText('Operational')).toBeTruthy();
    expect(screen.getByText('10,000')).toBeTruthy();
    expect(screen.getByText(/Synthetic educational dataset generated cleanly\./i)).toBeTruthy();

    // Guarded regenerate flow requires confirmation phrase
    fireEvent.click(screen.getByRole('button', { name: /Reset & Regenerate Synthetic Cohort/i }));
    const confirmBtn = screen.getByRole('button', { name: /Confirm Regenerate/i }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('CONFIRM_REGENERATE_SYNTHETIC_COHORT'), {
      target: { value: 'CONFIRM_REGENERATE_SYNTHETIC_COHORT' },
    });
    expect(confirmBtn.disabled).toBe(false);

    // Switch to User Governance tab and promote patient to doctor
    fireEvent.click(screen.getByRole('button', { name: /User Governance/i }));
    expect(screen.getByText('John Miller')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Promote to Doctor/i }));
    expect(onPromoteUser).toHaveBeenCalledWith('usr-p-1', 'doctor');
  });

  it('counts backend uppercase match statuses and excludes synthetic demos from Verify actions', () => {
    const onVerifyScreening = vi.fn().mockResolvedValue(undefined);

    render(
      <AdminPortal
        user={ADMIN_USER}
        auditEvents={[]}
        auditVerification={{
          valid: true,
          total_records_verified: 5,
          details: 'Chain intact',
        }}
        patientScreenings={[
          {
            screening_id: 'SCR-REAL-001',
            patient_id: 'PT-REAL-1',
            submitted_by_user_id: 'usr-pat-1',
            submitted_by_role: 'patient',
            data_provenance: 'patient_reported',
            investigator_verified: false,
            is_synthetic_data: false,
            created_at: '2026-11-28T10:00:00Z',
            clinical_summary: { cancer_stage: 'Stage IIIB', ecog_score: 1, egfr_ml_min: 55 },
            matches: [
              { protocol_id: 'PS-ONC-2026-001', match_status: 'INVESTIGATOR_VERIFIED_ELIGIBLE' },
              { protocol_id: 'PS-ONC-2026-002', match_status: 'PRELIMINARY_MATCH' },
              { protocol_id: 'PS-ONC-2026-003', match_status: 'INELIGIBLE' },
            ],
          },
          {
            screening_id: 'SCR-SYN-002',
            patient_id: 'PT-SYN-2',
            submitted_by_user_id: 'usr-pat-1',
            submitted_by_role: 'patient',
            data_provenance: 'synthetic_demo',
            investigator_verified: false,
            is_synthetic_data: true,
            created_at: '2026-11-28T09:00:00Z',
            clinical_summary: { cancer_stage: 'Stage IV', ecog_score: 1, egfr_ml_min: 70 },
            matches: [
              { protocol_id: 'PS-ONC-2026-001', match_status: 'PRELIMINARY_MATCH' },
              { protocol_id: 'PS-ONC-2026-002', match_status: 'INELIGIBLE' },
            ],
          },
        ]}
        onVerifyScreening={onVerifyScreening}
        patientInterests={[]}
        adminUsers={[]}
        onPromoteUser={vi.fn()}
        readiness={null}
        cohortStats={null}
        onRefreshAll={vi.fn()}
        onSeedCohort={vi.fn().mockResolvedValue('ok')}
        onOpenStudioView={vi.fn()}
        onBackToLanding={vi.fn()}
        onOpenAuth={vi.fn()}
        onSignOut={vi.fn()}
        onSwitchPersona={vi.fn()}
      />
    );

    const queueTab = screen.getByRole('button', { name: /Clinical Queue/i });
    expect(queueTab.textContent).toContain('1');
    fireEvent.click(queueTab);

    expect(screen.getByText(/2\/3 protocol matches/i)).toBeTruthy();
    expect(screen.getByText(/1\/2 protocol matches/i)).toBeTruthy();
    expect(screen.getByText('Pending Clinical Review')).toBeTruthy();
    expect(screen.getByText('Synthetic Demo')).toBeTruthy();

    const verifyButtons = screen.getAllByRole('button', { name: /^Verify$/i });
    expect(verifyButtons).toHaveLength(1);
    fireEvent.click(verifyButtons[0]);
    expect(onVerifyScreening).toHaveBeenCalledWith('SCR-REAL-001');
  });
});
