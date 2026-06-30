import { apiRequest } from './client.js';

export async function listVirtualUsers() {
  const response = await apiRequest('/api/virtual-users');
  return response?.lists || [];
}

export async function listVirtualUserSessions() {
  const response = await apiRequest('/api/virtual-users/sessions');
  return response?.lists || [];
}

export async function createVirtualUser(payload) {
  const response = await apiRequest('/api/virtual-users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response?.data;
}

export async function updateVirtualUser(id, payload) {
  const response = await apiRequest(`/api/virtual-users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return response?.data;
}

export async function deleteVirtualUser(id) {
  return apiRequest(`/api/virtual-users/${id}`, { method: 'DELETE' });
}
