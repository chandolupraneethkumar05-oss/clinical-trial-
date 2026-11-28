import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthModal } from '../components/AuthModal';

describe('AuthModal 3-role separated portals & expected_role validation', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders separated Patient, Doctor, and Admin portal tabs and submits expected_role', async () => {
    const capturedPayloads: Array<Record<string, unknown>> = [];
    const onLoginSuccess = vi.fn();

    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedPayloads.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            user: {
              id: 'usr-adm-1',
              name: 'Sarah Jenkins, RAC',
              email: 'sarah.jenkins@iqvia.com',
              role: 'admin',
              organization: 'IQVIA',
              provider: 'email',
            },
            token: 'admin-jwt-token',
          }),
          { status: 200 }
        )
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthModal onClose={vi.fn()} onLoginSuccess={onLoginSuccess} />);

    expect(screen.getByRole('tab', { name: /Patient Login/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Doctor Login/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Admin Login/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Admin Login/i }));
    expect(screen.getAllByText(/Administrator Login/i).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText(/admin@organization\.com/i), {
      target: { value: 'sarah.jenkins@iqvia.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••••••/), {
      target: { value: 'StrongPass2026!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Authenticate Session/i }));

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'sarah.jenkins@iqvia.com',
          role: 'admin',
          token: 'admin-jwt-token',
        })
      );
    });
    expect(capturedPayloads[0].expected_role).toBe('admin');
  });

  it('offers one-click portal switch when backend returns role mismatch 403', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail:
            "Role mismatch: this account is registered as 'patient', not 'doctor'. You attempted 'Doctor / Investigator Login' — please switch to 'Patient Portal Login'.",
        }),
        { status: 403 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthModal initialPortalRole="doctor" onClose={vi.fn()} onLoginSuccess={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/investigator@hospital\.org/i), {
      target: { value: 'john.miller@patient.org' },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••••••/), {
      target: { value: 'PatientPass!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Authenticate Session/i }));

    await waitFor(() => {
      expect(screen.getByText(/Role mismatch: this account is registered as 'patient'/i)).toBeTruthy();
    });

    const switchBtn = screen.getByRole('button', { name: /Switch to Patient Portal Login/i });
    fireEvent.click(switchBtn);
    expect(screen.getByRole('tab', { name: /Patient Login/i }).getAttribute('aria-selected')).toBe('true');
  });
});
