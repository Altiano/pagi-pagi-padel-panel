import { apiRequest } from './client.js';

export async function getBackendVersion() {
  const response = await apiRequest('/api/panel/version');
  return response?.data || response || null;
}
