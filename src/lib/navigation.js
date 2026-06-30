// Virtual-user navigation + permission helpers used by the panel shell.
import { navGroups } from '../constants.js';

export function getAllowedNav(auth) {
  if (!auth?.virtualUser) return null;
  const permissions = Array.isArray(auth.virtualUser.permissions) ? auth.virtualUser.permissions : [];
  return new Set(permissions);
}

export function isNavAllowed(nav, allowedNav) {
  if (!allowedNav) return true;
  if (nav === 'Court Prices' && allowedNav.has('Service')) return true;
  return allowedNav.has(nav);
}

export function filterNavGroups(groups, allowedNav) {
  if (!allowedNav) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isNavAllowed(item.label, allowedNav)),
    }))
    .filter((group) => group.items.length);
}

export function getFirstAllowedNav(allowedNav) {
  if (!allowedNav) return 'Calendar';
  return navGroups.flatMap((group) => group.items).find((item) => isNavAllowed(item.label, allowedNav))?.label || '';
}

export function hasPermission(auth, permission) {
  if (!auth?.virtualUser) return true;
  const permissions = Array.isArray(auth.virtualUser.permissions) ? auth.virtualUser.permissions : [];
  return permissions.includes(permission);
}

export function getCalendarCacheScope(auth, canViewRevenue) {
  const identity = auth?.virtualUser?.id || auth?.accessToken || auth?.username || 'session';
  return `${identity}:${canViewRevenue ? 'revenue' : 'masked'}`;
}


