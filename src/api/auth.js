import { buildApiUrl } from './config.js';

const AUTH_STORAGE_KEY = 'panel.auth';

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken) return null;
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      clearStoredAuth();
      return null;
    }
    return parsed;
  } catch {
    clearStoredAuth();
    return null;
  }
}

export function storeAuth(loginResponse, username) {
  const expiresInMs = Number(loginResponse.expires_in || 0) * 1000;
  const auth = {
    tokenType: loginResponse.token_type || 'Bearer',
    accessToken: loginResponse.access_token,
    refreshToken: loginResponse.refresh_token,
    expiresIn: loginResponse.expires_in,
    expiresAt: expiresInMs ? Date.now() + expiresInMs : null,
    username,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));

  // The Nuxt app stores similarly named values; keeping these helps future parity testing.
  localStorage.setItem('auth.strategy', 'local');
  localStorage.setItem('auth._token.local', `${auth.tokenType} ${auth.accessToken}`);
  localStorage.setItem('auth._token_expiration.local', String(auth.expiresAt || false));
  localStorage.setItem('auth._refresh_token.local', auth.refreshToken || 'false');

  return auth;
}

export function clearStoredAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem('auth.strategy');
  localStorage.removeItem('auth._token.local');
  localStorage.removeItem('auth._token_expiration.local');
  localStorage.removeItem('auth._refresh_token.local');
}

export async function login({ username, password, remember }) {
  const response = await fetch(buildApiUrl('/api/auth/login'), {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password, remember }),
  });

  const payload = await readJson(response);
  if (!response.ok) {
    const message = payload?.message || payload?.error || 'Unable to sign in with those credentials.';
    throw new Error(message);
  }

  return storeAuth(payload, username);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
