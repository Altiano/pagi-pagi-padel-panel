const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function buildApiUrl(path) {
  if (!API_BASE_URL || /^https?:\/\//.test(path)) return path;
  return `${API_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
