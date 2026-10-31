const apiBaseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
let authToken: string | null = null;

if (import.meta.env.PROD && !apiBaseUrl) {
  throw new Error('VITE_API_URL must be set to the deployed backend URL.');
}

if (import.meta.env.PROD && new URL(apiBaseUrl).protocol !== 'https:') {
  throw new Error('VITE_API_URL must use HTTPS in production.');
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof input === 'string' && input.startsWith('/api/')) {
    const headers = new Headers(init?.headers);
    if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
    return globalThis.fetch(`${apiBaseUrl}${input}`, { ...init, headers });
  }

  return globalThis.fetch(input, init);
}

export function setApiToken(token: string | null): void {
  authToken = token;
}
