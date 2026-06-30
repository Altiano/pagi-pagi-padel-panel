// Booking-shape helpers: derive times/labels/tone/meta from booking rows,
// detect overlaps, build placeholder stacks, and summarize day/week occupancy.
import {
  formatAvailabilityRange,
  formatCompactTime,
  formatTimeInput,
  formatWeekday,
  minutesFromEpoch,
  parseTimeToMinutes,
  shiftTime,
  toDateInputValue,
} from './datetime.js';
import { formatMoney, formatStatus } from './format.js';

export function normalizePlaceholderBooking(placeholder) {
  return {
    ...placeholder,
    id: `placeholder-${placeholder.id}`,
    placeholder_id: placeholder.id,
    booking_owner: placeholder.customer_name,
    name: placeholder.customer_name,
    booking_type: 'placeholder',
    booking_paid: false,
    court_id: placeholder.court_id,
    court_name: placeholder.court_name,
    customer_contact: placeholder.customer_contact,
    date: placeholder.date,
    duration: Math.max(parseTimeToMinutes(placeholder.end_time) - parseTimeToMinutes(placeholder.start_time), 0),
    is_placeholder: true,
    notes: placeholder.notes,
    price: placeholder.estimated_price,
    status: placeholder.status,
    time: `${placeholder.start_time}-${placeholder.end_time}`,
    type: 'placeholder',
  };
}

export function annotatePlaceholderConflicts(upstreamBookings, localPlaceholders) {
  const annotatedUpstream = upstreamBookings.map((booking) => ({ ...booking }));
  const waitlistSummariesByBookingId = new Map();

  const annotatedPlaceholders = localPlaceholders.map((placeholder) => {
    const blockedByBookings = annotatedUpstream
      .filter((booking) => booking.court_id === placeholder.court_id && bookingsOverlap(placeholder, booking))
      .map((booking) => {
        const summary = buildBookingConflictSummary(booking);
        const existing = waitlistSummariesByBookingId.get(booking.id) || [];
        waitlistSummariesByBookingId.set(booking.id, [...existing, buildBookingConflictSummary(placeholder)]);
        return summary;
      });

    if (!blockedByBookings.length) return placeholder;
    return {
      ...placeholder,
      blocked_by_bookings: blockedByBookings,
      conflict_bookings: blockedByBookings,
      has_conflict: true,
      is_waitlist: true,
    };
  });

  return {
    localPlaceholders: annotatedPlaceholders,
    upstreamBookings: annotatedUpstream.map((booking) => {
      const waitlistPlaceholders = waitlistSummariesByBookingId.get(booking.id) || [];
      if (!waitlistPlaceholders.length) return booking;
      return {
        ...booking,
        conflict_placeholders: waitlistPlaceholders,
        has_waitlist_placeholders: true,
        waitlist_placeholders: waitlistPlaceholders,
      };
    }),
  };
}

export function buildBookingConflictSummary(booking) {
  return {
    court: booking.court_name || booking.court_id || 'Court',
    created_by_name: booking.created_by_name || '',
    id: booking.placeholder_id || booking.id || '',
    name: booking.booking_owner || booking.name || 'Booking',
    time: booking.time || `${getStartLabel(booking)}-${formatTimeInput(getBookingEndMinutes(booking))}`,
    type: booking.is_placeholder ? 'placeholder' : 'booking',
  };
}

// Placeholder deletes are owner-scoped for virtual users: the Worker only lets a
// virtual session remove a placeholder whose created_by_name matches its display
// name. Mirror that rule in the UI so virtual users never see a Delete button that
// would 403. Master/regular operators (isVirtualUser=false) can delete any hold.
export function canDeletePlaceholder(item, { isVirtualUser = false, displayName = '' } = {}) {
  if (!isVirtualUser) return true;
  return Boolean(item) && (item.created_by_name || '') === displayName;
}


export function getCourtBookingWriteType(booking) {
  const type = String(booking?.type || '').trim();
  if (!type || type === 'booking') return 'booking-court';
  return type;
}

export const EMAIL_VALUE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Some booking-detail shapes nest the customer email under keys we don't list
// explicitly (e.g. `customer.email`, `member.email`, `owner.email`). This is the
// case for placeholder-converted registered bookings: the row reads as offline,
// so without finding the email we wrongly cancel with `user_offline` and upstream
// rejects it with "Email required !". Fall back to a key-scoped deep scan.
export function findNestedBookingEmail(value, keyHint = '', depth = 0) {
  if (value == null || depth > 6) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return /email/i.test(keyHint) && EMAIL_VALUE_PATTERN.test(trimmed) ? trimmed : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedBookingEmail(item, keyHint, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      const found = findNestedBookingEmail(nested, key, depth + 1);
      if (found) return found;
    }
  }
  return '';
}

export function getBookingEmail(booking) {
  const explicit = [
    booking?.user_email,
    booking?.email,
    booking?.customer_email,
    booking?.player_email,
    booking?.user?.email,
    Array.isArray(booking?.players) ? booking.players.find((player) => player?.email)?.email : '',
  ].map((value) => String(value || '').trim()).find(Boolean);
  if (explicit) return explicit;
  return findNestedBookingEmail(booking);
}


export function getStartLabel(booking) {
  return String(booking?.time || '').split('-')[0] || '--:--';
}

export function getCompactStartLabel(booking) {
  const [start, end] = String(booking?.time || '').split('-');
  if (!start) return '--:--';
  const startLabel = formatCompactTime(parseTimeToMinutes(start));
  return end ? `${startLabel}-${formatCompactTime(parseTimeToMinutes(end))}` : startLabel;
}

export function getBookingPosition(booking, startMinutes, totalMinutes) {
  const bookingStart = getBookingStartMinutes(booking);
  const bookingEnd = getBookingEndMinutes(booking);
  const top = Math.max(((bookingStart - startMinutes) / totalMinutes) * 100, 0);
  const height = Math.max(((bookingEnd - bookingStart) / totalMinutes) * 100, 5);
  return { top, height };
}

export function buildCourtTimelineEntries(bookings, openHour) {
  const openMinutes = parseTimeToMinutes(openHour?.open_hours || '06:00');
  const closeMinutes = parseTimeToMinutes(openHour?.close_hours || '24:00');
  const sortedBookings = [...bookings].sort((first, second) => getBookingStartMinutes(first) - getBookingStartMinutes(second));
  const entries = [];
  let availableFrom = openMinutes;

  for (const booking of sortedBookings) {
    const bookingStart = Math.max(getBookingStartMinutes(booking), openMinutes);
    const bookingEnd = Math.min(getBookingEndMinutes(booking), closeMinutes);

    if (bookingStart - availableFrom >= 30) {
      entries.push(buildAvailabilityEntry(availableFrom, bookingStart));
    }

    entries.push({ type: 'booking', booking });
    availableFrom = Math.max(availableFrom, bookingEnd);
  }

  if (closeMinutes - availableFrom >= 30) {
    entries.push(buildAvailabilityEntry(availableFrom, closeMinutes));
  }

  return entries;
}

export function buildCalendarDisplayBookings(bookings) {
  const liveBookings = bookings.filter((booking) => !booking.is_placeholder);
  const placeholdersBySlot = new Map();

  bookings
    .filter((booking) => booking.is_placeholder && !booking.is_waitlist)
    .forEach((booking) => {
      const slotKey = [
        booking.date || '',
        booking.court_id || '',
        getBookingStartMinutes(booking),
        getBookingEndMinutes(booking),
      ].join('|');
      const existing = placeholdersBySlot.get(slotKey) || [];
      placeholdersBySlot.set(slotKey, [...existing, booking]);
    });

  const placeholderStacks = [...placeholdersBySlot.values()].map((stack) => {
    const sortedStack = [...stack].sort((first, second) => {
      const firstUpdated = String(first.updated_at || first.created_at || '');
      const secondUpdated = String(second.updated_at || second.created_at || '');
      return secondUpdated.localeCompare(firstUpdated);
    });
    const representative = sortedStack[0];
    return {
      ...representative,
      placeholder_stack: sortedStack,
      stack_count: sortedStack.length,
    };
  });

  return [...liveBookings, ...placeholderStacks].sort((first, second) => {
    const startDifference = getBookingStartMinutes(first) - getBookingStartMinutes(second);
    if (startDifference) return startDifference;
    return getBookingEndMinutes(second) - getBookingEndMinutes(first);
  });
}

export function buildAvailabilityEntry(startMinutes, endMinutes) {
  return {
    id: `availability-${startMinutes}-${endMinutes}`,
    endMinutes,
    label: formatAvailabilityRange(startMinutes, endMinutes),
    startMinutes,
    type: 'availability',
  };
}

export function getBookingStartMinutes(booking) {
  const [start] = String(booking?.time || '').split('-');
  return start ? parseTimeToMinutes(start) : minutesFromEpoch(booking?.start);
}

export function getBookingEndMinutes(booking) {
  const [, end] = String(booking?.time || '').split('-');
  return end ? parseTimeToMinutes(end) : minutesFromEpoch(booking?.end);
}


export function getBookingTone(booking) {
  if (booking.is_placeholder && booking.is_waitlist) return 'tone-placeholder-waitlist';
  if (booking.is_placeholder && booking.has_conflict) return 'tone-placeholder-conflict';
  if (booking.is_placeholder) return 'tone-placeholder';
  if (booking.booking_paid) return 'tone-blue';
  if (booking.is_paylink || booking.booking_type === 'online') return 'tone-blue';
  if (booking.type === 'event') return 'tone-sky';
  if (booking.type === 'coach' || booking.type === 'coaching') return 'tone-mint';
  if (booking.booking_type === 'offline') return 'tone-blue';
  return 'tone-slate';
}

export function getBookingMeta(booking, canViewRevenue = true) {
  if (booking.is_placeholder && booking.is_waitlist) return `Waitlist · ${formatStatus(booking.status)}`;
  if (booking.is_placeholder && booking.stack_count > 1) {
    const stackNames = getPlaceholderStackItems(booking).map((item) => item.booking_owner || item.name).filter(Boolean);
    return `${stackNames.slice(0, 2).join(', ')}${stackNames.length > 2 ? ` +${stackNames.length - 2}` : ''}`;
  }
  if (booking.has_conflict) return 'Blocked';
  if (booking.is_placeholder) return `${formatMoney(booking.price, canViewRevenue)} · ${formatStatus(booking.status)}`;
  return `${booking.booking_type || booking.type || 'booking'} · ${formatMoney(booking.price, canViewRevenue)}`;
}

export function hasBookingConflict(booking) {
  return Boolean(booking?.has_conflict);
}

export function getBookingConflictItems(booking) {
  if (booking?.is_placeholder) return booking.blocked_by_bookings || booking.conflict_bookings || [];
  return booking?.waitlist_placeholders || booking?.conflict_placeholders || [];
}

export function getWaitlistItems(booking) {
  return booking?.waitlist_placeholders || booking?.conflict_placeholders || [];
}

export function getPlaceholderStackItems(booking) {
  if (!booking?.is_placeholder) return [];
  return Array.isArray(booking.placeholder_stack) && booking.placeholder_stack.length ? booking.placeholder_stack : [booking];
}

export function getBookingTitle(booking) {
  if (booking?.is_placeholder && booking.stack_count > 1) return `${booking.stack_count} placeholders`;
  return booking?.booking_owner || booking?.name || 'Booking';
}

export function getBookingPillLabel(booking) {
  const waitlistCount = getWaitlistItems(booking).length;
  if (!booking?.is_placeholder && waitlistCount) return `+${waitlistCount} waitlist`;
  if (booking?.is_placeholder && booking.is_waitlist) return 'Waitlist';
  if (booking?.is_placeholder && booking.stack_count > 1) return `${booking.stack_count} holds`;
  if (booking?.is_placeholder) return '';
  if (booking?.notes) return 'Notes';
  return '';
}

export function getSlotDraftFromBooking(booking, fallbackDate = '') {
  const [startTime, endTime] = String(booking?.time || '').split('-');
  const safeStartTime = startTime || '06:00';
  return {
    court_id: booking?.court_id || '',
    court_name: booking?.court_name || '',
    date: booking?.date || fallbackDate || toDateInputValue(new Date()),
    end_time: endTime || shiftTime(safeStartTime, getDurationMinutes(booking) || 60),
    start_time: safeStartTime,
  };
}


export function bookingsOverlap(first, second) {
  const firstStart = getBookingStartMinutes(first);
  const firstEnd = getBookingEndMinutes(first);
  const secondStart = getBookingStartMinutes(second);
  const secondEnd = getBookingEndMinutes(second);
  return firstStart < secondEnd && secondStart < firstEnd;
}


export function getDurationMinutes(booking) {
  const duration = Number(booking?.duration || 0);
  if (duration > 0) return duration;
  const calculated = getBookingEndMinutes(booking) - getBookingStartMinutes(booking);
  return Number.isFinite(calculated) ? Math.max(calculated, 0) : 0;
}


export function summarizeDay(bookings, openHour, courtCount = 1, canViewRevenue = true) {
  const openMinutes = parseTimeToMinutes(openHour?.close_hours || '24:00') - parseTimeToMinutes(openHour?.open_hours || '06:00');
  const bookingsByCourt = bookings.reduce((map, booking) => {
    const courtId = booking.court_id || 'all';
    const courtBookings = map.get(courtId) || [];
    map.set(courtId, [...courtBookings, booking]);
    return map;
  }, new Map());
  const bookedMinutes = [...bookingsByCourt.values()].reduce((sum, courtBookings) => (
    sum + buildCalendarDisplayBookings(courtBookings).reduce((courtSum, booking) => courtSum + Number(booking.duration || getDurationMinutes(booking)), 0)
  ), 0);
  const revenue = canViewRevenue ? bookings.reduce((sum, booking) => sum + Number(booking.price || 0), 0) : null;
  const capacityMinutes = openMinutes * Math.max(Number(courtCount) || 1, 1);
  return {
    bookedHours: bookedMinutes / 60,
    bookingCount: bookings.length,
    occupancy: Math.min(capacityMinutes ? (bookedMinutes / capacityMinutes) * 100 : 0, 100),
    revenue,
  };
}

export function summarizeWeek(weekDays, bookingsByDate, openHour, courtCount = 1, canViewRevenue = true) {
  const summaries = weekDays.map((date) => ({ date, ...summarizeDay(bookingsByDate[date] || [], openHour, courtCount, canViewRevenue) }));
  const totalBookings = summaries.reduce((sum, day) => sum + day.bookingCount, 0);
  const bookedHours = summaries.reduce((sum, day) => sum + day.bookedHours, 0);
  const revenue = canViewRevenue ? summaries.reduce((sum, day) => sum + Number(day.revenue || 0), 0) : null;
  const busiest = summaries.reduce((best, day) => day.bookingCount > best.bookingCount ? day : best, summaries[0] || {});
  const allBookings = weekDays.flatMap((date) => bookingsByDate[date] || []);
  const bands = allBookings.reduce((map, booking) => {
    const label = `${getStartLabel(booking).slice(0, 2)}:00`;
    map[label] = (map[label] || 0) + 1;
    return map;
  }, {});
  const busiestBand = Object.entries(bands).sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    bookedHours,
    busiestBand,
    busiestDay: busiest?.bookingCount ? formatWeekday(busiest.date) : '',
    revenue,
    totalBookings,
  };
}


