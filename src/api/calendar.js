// Calendar data layer: loads courts / open hours / schedule / placeholder rows,
// merges them, and owns the in-memory TTL cache. Also wraps the captured
// upstream booking-action endpoints (detail, receipt upload, reschedule lookups).
import { CALENDAR_DATA_CACHE_TTL_MS, RECEIPT_ATTACHMENT_TYPE } from '../constants.js';
import { apiRequest } from './client.js';
import { formatCompactTime, formatTimeInput, parseTimeToMinutes } from '../lib/datetime.js';
import { formatMoney, formatStatusText } from '../lib/format.js';
import {
  annotatePlaceholderConflicts,
  getBookingStartMinutes,
  getCourtBookingWriteType,
  normalizePlaceholderBooking,
} from '../lib/bookings.js';

export const calendarDataCache = new Map();

export async function loadCalendarData({ cacheScope, forceRefresh = false, mitraId, selectedDate, weekDays }) {
  const [courts, openHourResponses, weekResponses, placeholderResponses] = await Promise.all([
    getCachedCalendarValue(calendarCacheKey(cacheScope, 'courts', mitraId), () => apiRequest(`/api/admin/mitra/court/${mitraId}/list`), { forceRefresh }),
    Promise.all(weekDays.map((date) => getCachedCalendarValue(
      calendarCacheKey(cacheScope, 'open-hour', mitraId, date),
      () => apiRequest(`/api/admin/schedule/open-hour-date?mitra_id=${mitraId}&date=${date}`)
        .then((response) => response?.data || { open_hours: '06:00', close_hours: '24:00' }),
      { forceRefresh },
    ).then((openHour) => [date, openHour]))),
    Promise.all(weekDays.map((date) => getCachedCalendarValue(
      calendarCacheKey(cacheScope, 'schedule', mitraId, date),
      () => apiRequest(`/api/admin/schedule-cal-courts?mitra_id=${mitraId}&date=${date}`)
        .then((response) => response?.lists || []),
      { forceRefresh },
    ).then((bookings) => [date, bookings]))),
    Promise.all(weekDays.map((date) => getCachedCalendarValue(
      calendarCacheKey(cacheScope, 'placeholders', mitraId, date),
      () => apiRequest(`/api/placeholder-bookings?mitra_id=${mitraId}&from=${date}&to=${date}`)
        .then((response) => response?.lists || [])
        .catch(() => []),
      { forceRefresh },
    ).then((placeholders) => [date, placeholders]))),
  ]);

  const courtList = Array.isArray(courts) ? courts : [];
  const openHoursByDate = new Map(openHourResponses);
  const courtNames = new Map(courtList.map((court) => [court.id, court.name]));
  const placeholdersByDate = Object.fromEntries(placeholderResponses.map(([date, placeholders]) => [
    date,
    placeholders.map(normalizePlaceholderBooking),
  ]));
  const bookingsByDate = Object.fromEntries(weekResponses.map(([date, bookings]) => {
    const upstreamBookings = bookings.map((booking) => ({ ...booking, court_name: courtNames.get(booking.court_id) }));
    const localPlaceholders = placeholdersByDate[date] || [];
    const annotated = annotatePlaceholderConflicts(upstreamBookings, localPlaceholders);
    return [date, [...annotated.upstreamBookings, ...annotated.localPlaceholders]
      .sort((first, second) => getBookingStartMinutes(first) - getBookingStartMinutes(second))];
  }));

  return {
    courts: courtList,
    openHour: openHoursByDate.get(selectedDate) || { open_hours: '06:00', close_hours: '24:00' },
    bookingsByDate,
  };
}

export function calendarCacheKey(cacheScope, type, mitraId, date = '') {
  return [cacheScope || 'session', type, mitraId || '', date].join('|');
}

export function hasCalendarDataCache({ cacheScope, mitraId, selectedDate, weekDays }) {
  return isCalendarCacheFresh(calendarCacheKey(cacheScope, 'courts', mitraId))
    && isCalendarCacheFresh(calendarCacheKey(cacheScope, 'open-hour', mitraId, selectedDate))
    && weekDays.every((date) => isCalendarCacheFresh(calendarCacheKey(cacheScope, 'schedule', mitraId, date))
      && isCalendarCacheFresh(calendarCacheKey(cacheScope, 'placeholders', mitraId, date)));
}

export function getCachedCalendarValue(key, fetcher, { forceRefresh = false } = {}) {
  const now = Date.now();
  const cached = calendarDataCache.get(key);
  if (!forceRefresh && cached?.expiresAt > now) {
    return cached.promise || Promise.resolve(cached.value);
  }

  const promise = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      calendarDataCache.set(key, { expiresAt: Date.now() + CALENDAR_DATA_CACHE_TTL_MS, value });
      return value;
    })
    .catch((error) => {
      if (calendarDataCache.get(key)?.promise === promise) {
        calendarDataCache.delete(key);
      }
      throw error;
    });

  calendarDataCache.set(key, { expiresAt: now + CALENDAR_DATA_CACHE_TTL_MS, promise });
  return promise;
}

export function isCalendarCacheFresh(key) {
  const cached = calendarDataCache.get(key);
  return Boolean(cached?.value && cached.expiresAt > Date.now());
}

export function clearCalendarDataCache() {
  calendarDataCache.clear();
}

export function findMitraId(value, depth = 0) {
  if (!value || depth > 4) return null;
  if (typeof value !== 'object') return null;
  if (typeof value.mitra_id === 'string') return value.mitra_id;
  if (typeof value.mitraId === 'string') return value.mitraId;
  for (const nested of Object.values(value)) {
    const found = findMitraId(nested, depth + 1);
    if (found) return found;
  }
  return null;
}


export function normalizePlayerSearchResults(response) {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.lists)) return response.lists;
  if (Array.isArray(response)) return response;
  return [];
}

export function normalizeRescheduleSlots(response) {
  const rows = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response?.lists)
      ? response.lists
      : Array.isArray(response)
        ? response
        : [];

  return rows
    .map((row, index) => {
      const rawTime = typeof row === 'string'
        ? row
        : row?.time || row?.start_time || row?.start_hours || row?.label || '';
      if (!rawTime) return null;
      const time = formatTimeInput(parseTimeToMinutes(rawTime));
      return {
        id: row?.id || `${time}-${index}`,
        label: formatCompactTime(parseTimeToMinutes(time)),
        time,
      };
    })
    .filter(Boolean);
}

export function buildReschedulePriceSummary(response, canViewRevenue = true) {
  if (!response) return { heading: 'Waiting for schedule', lines: ['Select a valid date, court, start time, and duration.'] };
  const paymentCheck = response.payment_check || response.data?.payment_check || {};
  const oldSchedule = response.old_schedule || response.data?.old_schedule || {};
  const newSchedule = response.new_schedule || response.data?.new_schedule || {};
  const status = paymentCheck.status || response.status || 'ready';
  const oldPrice = oldSchedule.grand_total ?? oldSchedule.price ?? oldSchedule.total_price;
  const newPrice = newSchedule.grand_total ?? newSchedule.price ?? newSchedule.total_price;
  const adjustment = paymentCheck.adjustment_amount ?? response.adjustment_amount;
  const lines = [];

  if (oldPrice !== undefined || newPrice !== undefined) {
    lines.push(`${formatMoney(oldPrice || 0, canViewRevenue)} -> ${formatMoney(newPrice || 0, canViewRevenue)}`);
  }
  if (adjustment !== undefined) {
    lines.push(`Adjustment ${formatMoney(adjustment || 0, canViewRevenue)}`);
  }
  if (!lines.length && response.message) lines.push(response.message);
  if (!lines.length) lines.push('Upstream price check returned no amount changes.');

  return {
    heading: formatStatusText(status),
    lines,
  };
}

export async function fetchBookingDetailForAction({ booking, mitraId }) {
  if (!booking?.id) return booking;
  const response = await apiRequest('/api/admin/schedule-cal-courts-detail', {
    method: 'POST',
    body: JSON.stringify({
      mitra_id: mitraId,
      id: booking.id,
      type: getCourtBookingWriteType(booking),
    }),
  });
  const detail = normalizeBookingDetailResponse(response);
  return detail && typeof detail === 'object' ? { ...booking, ...detail } : booking;
}

export function normalizeBookingDetailResponse(response) {
  if (response?.data?.booking && typeof response.data.booking === 'object') return response.data.booking;
  if (response?.data && typeof response.data === 'object' && !Array.isArray(response.data)) return response.data;
  if (response?.booking && typeof response.booking === 'object') return response.booking;
  if (response?.detail && typeof response.detail === 'object') return response.detail;
  return response;
}


export async function uploadBookingReceipt({ attachmentType = RECEIPT_ATTACHMENT_TYPE, file, transId }) {
  const formData = new FormData();
  formData.append('trans_id', transId);
  formData.append('attachment_type[0]', attachmentType || RECEIPT_ATTACHMENT_TYPE);
  formData.append('attachment_file[0]', file);
  return apiRequest('/api/admin/schedule/attachments', {
    method: 'POST',
    body: formData,
  });
}


