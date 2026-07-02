// Pure form-state and upstream-payload builders for the booking editors.
import {
  OFFLINE_CANCEL_EMAIL,
  PLACEHOLDER_DURATION_OPTIONS,
  RECEIPT_ATTACHMENT_TYPE,
} from '../constants.js';
import { formatTimeInput, formatUpstreamTime, parseTimeToMinutes, toDateInputValue } from '../lib/datetime.js';
import { getBookingEmail, getCourtBookingWriteType, getDurationMinutes } from '../lib/bookings.js';

const MAX_NATIVE_TIME_INPUT_MINUTES = 24 * 60 - 1;

function formatNativeTimeInputMinutes(minutes) {
  return formatTimeInput(Math.min(Math.max(Number(minutes) || 0, 0), MAX_NATIVE_TIME_INPUT_MINUTES));
}

export function toNativeTimeInputValue(value) {
  if (value === undefined || value === null || value === '') return '';
  return formatNativeTimeInputMinutes(parseTimeToMinutes(value));
}

export function shiftFormEndTime(startTime, minutesToAdd) {
  return formatNativeTimeInputMinutes(parseTimeToMinutes(startTime) + Number(minutesToAdd || 0));
}

export function buildPlaceholderForm({ booking, courts, defaultDate, defaultName, draft, isVirtualUser = false, openHour }) {
  if (booking) {
    const [startTime, endTime] = String(booking.time || '').split('-');
    const courtId = booking.court_id || '';
    const formStartTime = toNativeTimeInputValue(startTime || openHour?.open_hours || '06:00');
    const formEndTime = toNativeTimeInputValue(endTime) || shiftFormEndTime(formStartTime, 60);
    return {
      court_id: courtId,
      court_ids: courtId ? [courtId] : [],
      court_name: booking.court_name || '',
      date: booking.date || defaultDate,
      start_time: formStartTime,
      end_time: formEndTime,
      duration_mode: inferPlaceholderDurationMode(formStartTime, formEndTime),
      customer_name: booking.booking_owner || booking.name || '',
      customer_contact: booking.customer_contact || '',
      estimated_price: String(booking.price || 0),
      status: booking.status || 'awaiting_payment',
      notes: booking.notes || '',
      created_by_name: booking.created_by_name || defaultName || '',
      updated_by_name: isVirtualUser ? defaultName || '' : booking.updated_by_name || defaultName || '',
    };
  }

  const startTime = toNativeTimeInputValue(draft?.start_time || openHour?.open_hours || '06:00');
  const court = courts.find((item) => item.id === draft?.court_id) || courts[0];
  const endTime = toNativeTimeInputValue(draft?.end_time) || shiftFormEndTime(startTime, 60);
  const courtIds = draft?.court_ids?.length ? draft.court_ids : court?.id ? [court.id] : [];
  return {
    court_id: courtIds[0] || '',
    court_ids: courtIds,
    court_name: court?.name || draft?.court_name || '',
    date: draft?.date || defaultDate,
    start_time: startTime,
    end_time: endTime,
    duration_mode: inferPlaceholderDurationMode(startTime, endTime),
    customer_name: '',
    customer_contact: '',
    estimated_price: '',
    status: 'awaiting_payment',
    notes: '',
    created_by_name: defaultName || '',
    updated_by_name: defaultName || '',
  };
}

export function buildBookingWriteForm({ booking, courts, defaultDate, draft, openHour }) {
  const [bookingStart, bookingEnd] = String(booking?.time || '').split('-');
  const startTime = toNativeTimeInputValue(draft?.start_time || bookingStart || openHour?.open_hours || '06:00');
  const endTime = toNativeTimeInputValue(draft?.end_time || bookingEnd) || shiftFormEndTime(startTime, 60);
  const court = courts.find((item) => item.id === (draft?.court_id || booking?.court_id)) || courts[0];
  const initialCourtId = draft?.court_id || booking?.court_id || court?.id || '';
  const courtIds = draft?.court_ids?.length ? draft.court_ids : initialCourtId ? [initialCourtId] : [];
  return {
    additional_dates: [],
    attachmentType: RECEIPT_ATTACHMENT_TYPE,
    court_id: courtIds[0] || '',
    court_ids: courtIds,
    court_name: draft?.court_name || booking?.court_name || court?.name || '',
    customerMode: 'offline',
    date: draft?.date || booking?.date || defaultDate,
    duration_mode: inferPlaceholderDurationMode(startTime, endTime),
    end_time: endTime,
    offlineUser: booking?.booking_owner || booking?.name || '',
    playerSearch: booking?.booking_owner || booking?.name || '',
    price: String(booking?.price || ''),
    receiptFile: null,
    selectedPlayer: null,
    start_time: startTime,
    notes: booking?.notes || '',
  };
}

export function getBookingFormDates(form) {
  const dates = [
    form?.date,
    ...(Array.isArray(form?.additional_dates) ? form.additional_dates : []),
  ].map((date) => String(date || '').trim()).filter(Boolean);
  return [...new Set(dates)].sort();
}

export function normalizeAdditionalBookingDates(dates, primaryDate) {
  return [...new Set((dates || []).map((date) => String(date || '').trim()).filter(Boolean))]
    .filter((date) => date !== primaryDate)
    .sort();
}

export function buildRescheduleBookingForm({ booking, courts, openHour }) {
  const [bookingStart, bookingEnd] = String(booking?.time || '').split('-');
  const duration = getDurationMinutes(booking) || 60;
  const startTime = toNativeTimeInputValue(bookingStart || openHour?.open_hours || '06:00');
  const endTime = toNativeTimeInputValue(bookingEnd) || shiftFormEndTime(startTime, duration);
  const court = courts.find((item) => item.id === booking?.court_id) || courts[0];
  return {
    court_id: booking?.court_id || court?.id || '',
    court_name: booking?.court_name || court?.name || '',
    date: booking?.date || toDateInputValue(new Date()),
    duration_mode: inferPlaceholderDurationMode(startTime, endTime),
    end_time: endTime,
    start_time: startTime,
  };
}

export function buildCourtBookingPayload({ form, mitraId }) {
  const isRegistered = form.customerMode === 'registered';
  return {
    mitra_id: mitraId,
    duration: getTimeRangeDurationMinutes(form),
    date: form.date,
    start_hours: formatUpstreamTime(form.start_time),
    court_id: form.court_id,
    harga: Number(form.price || 0),
    diskon: 0,
    notes: form.notes || '',
    paid: true,
    payment_method: 'offline',
    registered: isRegistered,
    user_id: isRegistered ? form.selectedPlayer?.id || null : null,
    offline_user: isRegistered ? null : form.offlineUser.trim(),
    is_recurring: false,
    recurring_type: null,
    end_date: null,
    type: 'booking',
    add_ons: [],
    voucher: null,
    voucher2: null,
  };
}

export function buildCancelBookingPayload({ booking, form, mitraId }) {
  const email = getBookingEmail(booking) || OFFLINE_CANCEL_EMAIL;
  return {
    mitra_id: mitraId,
    id: booking.id,
    type: getCourtBookingWriteType(booking),
    user_offline: null,
    email_verified: true,
    already_wd: false,
    use_package: Boolean(booking.use_package),
    email,
    cancel_note: form.cancel_note || 'Cancel',
    is_recurring: false,
    start_date: null,
    end_date: null,
  };
}

export function getTimeRangeDurationMinutes(form) {
  const presetMinutes = Number(form.duration_mode);
  if (
    presetMinutes > 0
    && shiftFormEndTime(form.start_time, presetMinutes) === toNativeTimeInputValue(form.end_time)
  ) {
    return presetMinutes;
  }
  const manualMinutes = parseTimeToMinutes(form.end_time) - parseTimeToMinutes(form.start_time);
  return manualMinutes > 0 ? manualMinutes : 0;
}


export function getSelectedCourtIds(form) {
  if (Array.isArray(form.court_ids) && form.court_ids.length) return form.court_ids;
  return form.court_id ? [form.court_id] : [];
}

export function inferPlaceholderDurationMode(startTime, endTime) {
  const duration = parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime);
  if (PLACEHOLDER_DURATION_OPTIONS.some((option) => option.minutes === duration)) return String(duration);
  const normalizedEndTime = toNativeTimeInputValue(endTime);
  const cappedOption = PLACEHOLDER_DURATION_OPTIONS.find((option) => shiftFormEndTime(startTime, option.minutes) === normalizedEndTime);
  return cappedOption ? String(cappedOption.minutes) : 'custom';
}

export function getPlaceholderDurationMinutes(form) {
  const presetMinutes = Number(form.duration_mode);
  if (presetMinutes > 0) return presetMinutes;
  const manualMinutes = parseTimeToMinutes(form.end_time) - parseTimeToMinutes(form.start_time);
  return manualMinutes > 0 ? manualMinutes : 60;
}


export function formatConflictError(error) {
  if (error?.code !== 'PLACEHOLDER_OVERLAP' && error?.code !== 'BOOKING_OVERLAP') return error?.message || 'Unable to save placeholder.';
  const conflict = error.payload?.conflict;
  if (!conflict) return 'This placeholder overlaps with another booking. Refresh the calendar and choose another time.';
  const name = conflict.customer_name || conflict.booking_owner || 'another booking';
  const time = conflict.start_time && conflict.end_time ? `${conflict.start_time}-${conflict.end_time}` : conflict.time;
  const court = conflict.court_name || conflict.court_id || 'this court';
  return `This placeholder overlaps with ${name} on ${court}${time ? ` at ${time}` : ''}.`;
}
