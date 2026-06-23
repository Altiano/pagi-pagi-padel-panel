const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const PLACEHOLDER_API_BASE_URL = import.meta.env.VITE_PLACEHOLDER_API_BASE_URL || '';
const USE_LOCAL_PLACEHOLDERS = import.meta.env.VITE_USE_LOCAL_PLACEHOLDERS === 'true';

export function buildApiUrl(path) {
  if (!API_BASE_URL || /^https?:\/\//.test(path)) return path;
  return `${API_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export function buildPlaceholderApiUrl(path) {
  if (!PLACEHOLDER_API_BASE_URL || /^https?:\/\//.test(path)) return path;
  return `${PLACEHOLDER_API_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export function hasPlaceholderApi() {
  return Boolean(PLACEHOLDER_API_BASE_URL);
}

export function shouldUseLocalPlaceholders() {
  return USE_LOCAL_PLACEHOLDERS;
}
