import { describe, expect, test } from 'vitest';
import {
  annotatePlaceholderConflicts,
  bookingsOverlap,
  buildCalendarDisplayBookings,
  canDeletePlaceholder,
  getBookingMeta,
  normalizePlaceholderBooking,
  summarizeDay,
  summarizeWeek,
} from './bookings.js';

describe('booking helpers', () => {
  test('detects time overlap only when ranges intersect', () => {
    expect(bookingsOverlap(
      { time: '10:00-11:00' },
      { time: '10:30-11:30' },
    )).toBe(true);

    expect(bookingsOverlap(
      { time: '10:00-11:00' },
      { time: '11:00-12:00' },
    )).toBe(false);
  });

  test('marks overlapping placeholders as waitlist holds and annotates the live booking', () => {
    const liveBooking = {
      booking_owner: 'Confirmed player',
      court_id: 'court-1',
      court_name: 'Court 1',
      id: 'booking-1',
      time: '09:00-10:00',
    };
    const placeholder = normalizePlaceholderBooking({
      court_id: 'court-1',
      court_name: 'Court 1',
      customer_name: 'Waiting player',
      date: '2026-06-30',
      end_time: '09:30',
      estimated_price: 100000,
      id: 'placeholder-1',
      start_time: '09:00',
      status: 'negotiating',
    });

    const result = annotatePlaceholderConflicts([liveBooking], [placeholder]);

    expect(result.localPlaceholders[0]).toMatchObject({
      has_conflict: true,
      is_waitlist: true,
    });
    expect(result.localPlaceholders[0].blocked_by_bookings[0]).toMatchObject({
      id: 'booking-1',
      name: 'Confirmed player',
      type: 'booking',
    });
    expect(result.upstreamBookings[0]).toMatchObject({
      has_waitlist_placeholders: true,
    });
    expect(result.upstreamBookings[0].waitlist_placeholders[0]).toMatchObject({
      id: 'placeholder-1',
      name: 'Waiting player',
      type: 'placeholder',
    });
  });

  test('stacks placeholders with the same court and time slot', () => {
    const first = {
      booking_owner: 'Older hold',
      court_id: 'court-1',
      created_at: '2026-06-29T08:00:00.000Z',
      date: '2026-06-30',
      is_placeholder: true,
      time: '12:00-13:00',
    };
    const second = {
      booking_owner: 'Newer hold',
      court_id: 'court-1',
      created_at: '2026-06-29T09:00:00.000Z',
      date: '2026-06-30',
      is_placeholder: true,
      time: '12:00-13:00',
    };

    const displayBookings = buildCalendarDisplayBookings([first, second]);

    expect(displayBookings).toHaveLength(1);
    expect(displayBookings[0]).toMatchObject({
      booking_owner: 'Newer hold',
      stack_count: 2,
    });
    expect(displayBookings[0].placeholder_stack.map((item) => item.booking_owner)).toEqual([
      'Newer hold',
      'Older hold',
    ]);
  });

  test('restricts placeholder delete to its creator for virtual users', () => {
    const ownHold = { created_by_name: 'Front Desk' };
    const otherHold = { created_by_name: 'Night Shift' };

    // Master / regular operators can delete any hold regardless of creator.
    expect(canDeletePlaceholder(otherHold, { isVirtualUser: false, displayName: 'Front Desk' })).toBe(true);

    // Virtual users may delete only the placeholders they created.
    expect(canDeletePlaceholder(ownHold, { isVirtualUser: true, displayName: 'Front Desk' })).toBe(true);
    expect(canDeletePlaceholder(otherHold, { isVirtualUser: true, displayName: 'Front Desk' })).toBe(false);

    // Unattributed or missing holds are not deletable by a virtual user.
    expect(canDeletePlaceholder({}, { isVirtualUser: true, displayName: 'Front Desk' })).toBe(false);
    expect(canDeletePlaceholder(null, { isVirtualUser: true, displayName: 'Front Desk' })).toBe(false);
  });

  test('summarizes occupancy and masks revenue when requested', () => {
    const openHour = { close_hours: '08:00', open_hours: '06:00' };
    const bookings = [
      { court_id: 'court-1', duration: 60, price: 100000, time: '06:00-07:00' },
      { court_id: 'court-2', duration: 30, price: 50000, time: '07:00-07:30' },
    ];

    expect(summarizeDay(bookings, openHour, 2, true)).toMatchObject({
      bookedHours: 1.5,
      bookingCount: 2,
      occupancy: 37.5,
      revenue: 150000,
    });
    expect(summarizeDay(bookings, openHour, 2, false).revenue).toBeNull();
    expect(getBookingMeta(bookings[0], false)).toContain('Hidden');
  });

  test('summarizes weekly totals and busiest slots', () => {
    const weekDays = ['2026-06-29', '2026-06-30'];
    const bookingsByDate = {
      '2026-06-29': [
        { court_id: 'court-1', duration: 60, price: 100000, time: '06:00-07:00' },
      ],
      '2026-06-30': [
        { court_id: 'court-1', duration: 60, price: 100000, time: '07:00-08:00' },
        { court_id: 'court-2', duration: 60, price: 100000, time: '07:30-08:30' },
      ],
    };

    expect(summarizeWeek(weekDays, bookingsByDate, { close_hours: '10:00', open_hours: '06:00' }, 2, true)).toMatchObject({
      bookedHours: 3,
      busiestBand: '07:00',
      busiestDay: 'Tue',
      revenue: 300000,
      totalBookings: 3,
    });
  });
});
