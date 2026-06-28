import { clearStoredAuth, getStoredAuth } from './auth.js';
import { buildApiUrl, buildPlaceholderApiUrl, hasPlaceholderApi, shouldUseLocalPlaceholders } from './config.js';
import { isPlaceholderRequest, localPlaceholderRequest } from './placeholders.js';

export async function apiRequest(path, options = {}) {
  if (isPlaceholderRequest(path) && shouldUseLocalPlaceholders()) {
    return localPlaceholderRequest(path, options);
  }

  const auth = getStoredAuth();
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json, text/plain, */*');

  if (auth?.accessToken) {
    headers.set('Authorization', `${auth.tokenType || 'Bearer'} ${auth.accessToken}`);
  }

  if (auth?.virtualUser?.id) {
    headers.set('X-Panel-Virtual-User', auth.virtualUser.id);
  }

  const isMultipartBody = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body && !headers.has('Content-Type') && !isMultipartBody) {
    headers.set('Content-Type', 'application/json');
  }

  const requestUrl = isPlaceholderRequest(path) && hasPlaceholderApi() ? buildPlaceholderApiUrl(path) : buildApiUrl(path);
  const response = await fetch(requestUrl, { ...options, headers });
  const payload = await readBody(response);

  if (response.status === 401) {
    clearStoredAuth();
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Request failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    error.code = payload?.code;
    throw error;
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
