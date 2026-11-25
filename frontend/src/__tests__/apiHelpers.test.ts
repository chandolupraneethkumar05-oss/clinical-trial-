import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetchJson, extractApiErrorMessage, parseJsonSafe, SessionExpiredError } from '../lib/api';

describe('API helper utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formats Pydantic array detail and string detail errors cleanly', () => {
    expect(extractApiErrorMessage({ detail: 'Invalid credentials.' }, 'Fallback')).toBe(
      'Invalid credentials.'
    );
    expect(
      extractApiErrorMessage(
        {
          detail: [
            { loc: ['body', 'age'], msg: 'Input should be greater than or equal to 18' },
            { loc: ['body', 'egfr_ml_min'], msg: 'Field required' },
          ],
        },
        'Fallback'
      )
    ).toBe('age: Input should be greater than or equal to 18; egfr_ml_min: Field required');
    expect(extractApiErrorMessage(null, 'Fallback')).toBe('Fallback');
  });

  it('safely returns null on empty or non-JSON responses', async () => {
    const emptyRes = new Response('', { status: 200 });
    expect(await parseJsonSafe(emptyRes)).toBeNull();

    const htmlRes = new Response('<html>502 Bad Gateway</html>', { status: 502 });
    expect(await parseJsonSafe(htmlRes)).toBeNull();
  });

  it('calls onUnauthorized and throws SessionExpiredError on HTTP 401', async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Token expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    await expect(
      apiFetchJson('/api/v1/auth/me', { onUnauthorized })
    ).rejects.toBeInstanceOf(SessionExpiredError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
