import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FloatingAIAgent } from '../components/FloatingAIAgent';
import type { AuthUser } from '../types/auth';

const PATIENT_USER: AuthUser = {
  id: 'usr-pat-1',
  name: 'John Miller',
  email: 'john.miller@patient.org',
  role: 'patient',
  provider: 'email',
  token: 'pat-jwt',
};

describe('FloatingAIAgent avatar, auto-welcome, Q&A & Voice Mode', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('auto-welcomes signed-in user and answers grounded project & clinical questions', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
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
      if (url.includes('/api/v1/assistant/chat')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              reply: 'ECOG stands for **Eastern Cooperative Oncology Group** Performance Status.',
              voice_script: 'ECOG stands for Eastern Cooperative Oncology Group Performance Status.',
              mode: 'local_knowledge_base',
              sources: ['ECOG'],
              suggested_questions: ['What is eGFR?'],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.reject(new Error(`Unexpected call: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FloatingAIAgent user={PATIENT_USER} activeView="patient" onSessionExpired={vi.fn()} />
    );

    // Floating welcome bubble greets user automatically
    expect(screen.getByText(/Welcome, John/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Chat with Agent/i }));
    expect(screen.getByLabelText(/ProtocolShield AI Guide Assistant/i)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/Ask any project or term/i), {
      target: { value: 'What is full form of ECOG?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send question/i }));

    await waitFor(() => {
      expect(screen.getByText(/Eastern Cooperative Oncology Group/i)).toBeTruthy();
    });
  });

  it('activates Voice Mode and handles speech synthesis safely', async () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: speakMock, cancel: cancelMock });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        rate = 1;
        pitch = 1;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(t: string) {
          this.text = t;
        }
      }
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
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
      )
    );

    render(
      <FloatingAIAgent user={PATIENT_USER} activeView="patient" onSessionExpired={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Voice Mode/i }));
    expect(screen.getByRole('button', { name: /Disable Voice Mode/i })).toBeTruthy();
    expect(speakMock).toHaveBeenCalled();
  });

  it('renders asterisk markdown bullets with bold titles cleanly without leaked asterisks', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/assistant/status')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'operational',
              mode: 'gemini',
              llm_configured: true,
              voice_browser_supported: true,
              voice_server_audio_supported: true,
            }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/v1/assistant/chat')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              reply: '* **Eliminates long travel:** Brings routine trial visits home.\n* **Expands access:** Helps rural patients.',
              voice_script: 'Eliminates long travel and expands access.',
              mode: 'gemini',
              sources: ['FDORA'],
              suggested_questions: [],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.reject(new Error(`Unexpected call: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<FloatingAIAgent user={PATIENT_USER} activeView="patient" onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Chat with Agent/i }));
    fireEvent.change(screen.getByPlaceholderText(/Ask any project or term/i), {
      target: { value: 'Why decentralized nursing?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send question/i }));

    await waitFor(() => {
      const strongEl = screen.getByText('Eliminates long travel:');
      expect(strongEl.tagName.toLowerCase()).toBe('strong');
      expect(screen.queryByText(/\*Eliminates long travel:\*/)).toBeNull();
    });
  });
});
