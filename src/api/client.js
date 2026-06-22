import { clearStoredAuth, getStoredAuth } from './auth.js';
import { buildApiUrl } from './config.js';

export async function apiRequest(path, options = {}) {
  const auth = getStoredAuth();
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json, text/plain, */*');

  if (auth?.accessToken) {
    headers.set('Authorization', `${auth.tokenType || 'Bearer'} ${auth.accessToken}`);
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(buildApiUrl(path), { ...options, headers });
  const payload = await readBody(response);

  if (response.status === 401) {
    clearStoredAuth();
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Request failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function readBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}
