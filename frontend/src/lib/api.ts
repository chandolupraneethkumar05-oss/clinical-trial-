/**
 * Shared API client helpers for ProtocolShield frontend.
 * Handles optional VITE_API_BASE_URL prefixing, HTTP error formatting,
 * safe JSON parsing, and consistent 401 session expiration signaling.
 */

export class SessionExpiredError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export function apiUrl(path: string): string {
  const base = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) return path;
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

export function getStoredAuthToken(): string | null {
  try {
    const raw = localStorage.getItem('protocolshield_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.token === 'string' && parsed.token.length > 0 ? parsed.token : null;
  } catch {
    return null;
  }
}

export function extractApiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  const detail = record.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const formatted = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const entry = item as Record<string, unknown>;
          const loc = Array.isArray(entry.loc)
            ? entry.loc.filter((part) => part !== 'body').join('.')
            : '';
          const msg = typeof entry.msg === 'string' ? entry.msg : 'Invalid value';
          return loc ? `${loc}: ${msg}` : msg;
        }
        return null;
      })
      .filter((v): v is string => Boolean(v));
    if (formatted.length > 0) {
      return formatted.join('; ');
    }
  }
  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }
  return fallback;
}

export async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function apiFetchJson<T>(
  path: string,
  options: RequestInit & { onUnauthorized?: () => void } = {}
): Promise<T> {
  const { onUnauthorized, headers, ...fetchOpts } = options;
  const res = await fetch(apiUrl(path), {
    ...fetchOpts,
    headers,
  });

  if (res.status === 401) {
    const data = await parseJsonSafe(res);
    const msg = extractApiErrorMessage(data, 'Your session has expired. Please sign in again.');
    onUnauthorized?.();
    throw new SessionExpiredError(msg);
  }

  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(extractApiErrorMessage(data, `Request failed with HTTP ${res.status}.`));
  }

  if (data === null) {
    throw new Error('Server returned an empty or malformed JSON response.');
  }

  return data as T;
}
