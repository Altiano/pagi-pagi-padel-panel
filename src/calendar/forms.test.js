import { describe, expect, test } from 'vitest';
import {
  buildPlaceholderForm,
  buildCancelBookingPayload,
  buildCourtBookingPayload,
  getBookingFormDates,
  getSelectedCourtIds,
  getTimeRangeDurationMinutes,
  inferPlaceholderDurationMode,
  shiftFormEndTime,
} from './forms.js';

describe('calendar form helpers', () => {
  test('deduplicates and sorts booking dates', () => {
    expect(getBookingFormDates({
      additional_dates: ['2026-07-02', '2026-07-01', '2026-07-02', ''],
      date: '2026-07-03',
    })).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });

  test('falls back to court_id when court_ids is empty', () => {
    expect(getSelectedCourtIds({ court_id: 'court-1', court_ids: [] })).toEqual(['court-1']);
    expect(getSelectedCourtIds({ court_id: 'court-1', court_ids: ['court-2', 'court-3'] })).toEqual(['court-2', 'court-3']);
  });

  test('builds offline court booking payloads for upstream', () => {
    const payload = buildCourtBookingPayload({
      form: {
        court_id: 'court-1',
        customerMode: 'offline',
        date: '2026-06-30',
        end_time: '08:30',
        notes: 'Bring rackets',
        offlineUser: 'Morning Group',
        price: '250000',
        start_time: '07:00',
      },
      mitraId: 'mitra-1',
    });

    expect(payload).toMatchObject({
      court_id: 'court-1',
      date: '2026-06-30',
      duration: 90,
      harga: 250000,
      mitra_id: 'mitra-1',
      offline_user: 'Morning Group',
      paid: true,
      payment_method: 'offline',
      registered: false,
      user_id: null,
    });
  });

  test('builds registered booking payloads with selected player', () => {
    const payload = buildCourtBookingPayload({
      form: {
        court_id: 'court-1',
        customerMode: 'registered',
        date: '2026-06-30',
        end_time: '08:00',
        offlineUser: '',
        price: '',
        selectedPlayer: { id: 'player-1' },
        start_time: '07:00',
      },
      mitraId: 'mitra-1',
    });

    expect(payload).toMatchObject({
      harga: 0,
      offline_user: null,
      registered: true,
      user_id: 'player-1',
    });
  });

  test('builds cancel payload with nested booking email fallback', () => {
    const payload = buildCancelBookingPayload({
      booking: {
        customer: { email: 'customer@example.com' },
        id: 'booking-1',
        type: 'booking',
      },
      form: { cancel_note: 'Rain' },
      mitraId: 'mitra-1',
    });

    expect(payload).toMatchObject({
      cancel_note: 'Rain',
      email: 'customer@example.com',
      id: 'booking-1',
      mitra_id: 'mitra-1',
      type: 'booking-court',
    });
  });

  test('calculates valid time range duration only', () => {
    expect(getTimeRangeDurationMinutes({ end_time: '10:30', start_time: '09:00' })).toBe(90);
    expect(getTimeRangeDurationMinutes({ end_time: '08:00', start_time: '09:00' })).toBe(0);
  });

  test('caps preset end times to the latest valid native time input', () => {
    expect(shiftFormEndTime('21:00', 60)).toBe('22:00');
    expect(shiftFormEndTime('22:00', 120)).toBe('23:59');
    expect(inferPlaceholderDurationMode('22:00', '23:59')).toBe('120');
    expect(getTimeRangeDurationMinutes({
      duration_mode: '120',
      end_time: '23:59',
      start_time: '22:00',
    })).toBe(120);
  });

  test('normalizes midnight placeholder form end times for time inputs', () => {
    const form = buildPlaceholderForm({
      booking: {
        booking_owner: 'Late Match',
        court_id: 'court-1',
        date: '2026-07-02',
        time: '22:00-24:00',
      },
      courts: [{ id: 'court-1', name: 'Court 1' }],
      defaultDate: '2026-07-02',
      defaultName: 'Owner',
      openHour: { open_hours: '06:00', close_hours: '24:00' },
    });

    expect(form.end_time).toBe('23:59');
    expect(form.duration_mode).toBe('120');
  });
});
