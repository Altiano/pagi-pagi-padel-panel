import { describe, expect, test } from 'vitest';
import {
  filterNavGroups,
  getAllowedNav,
  getCalendarCacheScope,
  getFirstAllowedNav,
  hasPermission,
  isNavAllowed,
} from './navigation.js';
import { CALENDAR_BOOKING_PERMISSION, CALENDAR_REVENUE_PERMISSION, navGroups } from '../constants.js';

describe('navigation helpers', () => {
  test('allows every screen for non-virtual sessions', () => {
    expect(getAllowedNav({ username: 'master' })).toBeNull();
    expect(isNavAllowed('Setting', null)).toBe(true);
    expect(hasPermission({ username: 'master' }, CALENDAR_REVENUE_PERMISSION)).toBe(true);
  });

  test('filters virtual-user navigation by visible screens', () => {
    const auth = {
      virtualUser: {
        id: 'frontdesk',
        permissions: ['Calendar', 'Service', CALENDAR_BOOKING_PERMISSION],
      },
    };
    const allowedNav = getAllowedNav(auth);
    const visibleLabels = filterNavGroups(navGroups, allowedNav).flatMap((group) => group.items.map((item) => item.label));

    expect(visibleLabels).toEqual(['Calendar', 'Court Prices']);
    expect(getFirstAllowedNav(allowedNav)).toBe('Calendar');
    expect(isNavAllowed('Court Prices', allowedNav)).toBe(true);
    expect(hasPermission(auth, CALENDAR_BOOKING_PERMISSION)).toBe(true);
    expect(hasPermission(auth, CALENDAR_REVENUE_PERMISSION)).toBe(false);
  });

  test('separates cache scopes for masked and revenue-visible sessions', () => {
    const auth = { virtualUser: { id: 'frontdesk' } };

    expect(getCalendarCacheScope(auth, true)).toBe('frontdesk:revenue');
    expect(getCalendarCacheScope(auth, false)).toBe('frontdesk:masked');
  });
});
