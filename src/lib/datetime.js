// Pure date / time / week helpers. No React, no network, no app state.

export function formatUpstreamTime(value) {
  return String(value || '').replace(':', '.');
}


export function buildSlotMinutes(startMinutes, endMinutes) {
  const minutes = [];
  for (let minute = startMinutes; minute < endMinutes; minute += 60) {
    minutes.push(minute);
  }
  return minutes;
}

export function formatTimeInput(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function shiftTime(time, minutesToAdd) {
  const total = Math.min(parseTimeToMinutes(time) + minutesToAdd, 24 * 60);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function toDateInputValue(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

export function shiftDate(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

export function getWeekDays(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(monday);
    next.setDate(monday.getDate() + index);
    return toDateInputValue(next);
  });
}

export function formatLongDate(dateValue) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${dateValue}T00:00:00`));
}

export function formatWeekday(dateValue) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(`${dateValue}T00:00:00`));
}

export function formatCompactDate(dateValue) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${dateValue}T00:00:00`));
}

export function formatDayNumber(dateValue) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(`${dateValue}T00:00:00`));
}

export function formatMonthLabel(dateValue) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${dateValue}T00:00:00`));
}

export function formatBuildVersion(timestampValue) {
  if (!timestampValue) return '';
  const date = new Date(timestampValue);
  if (Number.isNaN(date.getTime())) return timestampValue;
  const parts = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ].map((part) => String(part).padStart(2, '0'));
  return `build.${parts.join('.')}`;
}

export function formatBuildDateTime(timestampValue) {
  if (!timestampValue) return 'Not set';
  const date = new Date(timestampValue);
  if (Number.isNaN(date.getTime())) return timestampValue;
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    timeZoneName: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatCommitHash(commitValue, length = 12) {
  if (!commitValue) return 'Not set';
  const normalized = String(commitValue).trim();
  if (!normalized) return 'Not set';
  return normalized.length > length ? normalized.slice(0, length) : normalized;
}

export function buildMonthMatrix(dateValue) {
  const base = new Date(`${dateValue}T00:00:00`);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const mondayOffset = firstDay === 0 ? -6 : 1 - firstDay;
  const start = new Date(year, month, 1 + mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const cell = new Date(start);
    cell.setDate(start.getDate() + index);
    return { value: toDateInputValue(cell), inMonth: cell.getMonth() === month };
  });
}

export function shiftMonth(dateValue, months) {
  const date = new Date(`${dateValue}T00:00:00`);
  // Clamp to the 1st so e.g. Jan 31 + 1 month lands in February, not March.
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  return toDateInputValue(date);
}

export function formatWeekRange(dateValue) {
  const days = getWeekDays(dateValue);
  return `${formatDayNumber(days[0])} - ${formatDayNumber(days[6])}`;
}

export function isTodayDate(dateValue) {
  return dateValue === toDateInputValue(new Date());
}

export function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function scrollDayCalendarToCurrentTime(panel, openHour) {
  if (!panel) return;
  const grid = panel.querySelector('.day-calendar-grid');
  const header = panel.querySelector('.day-calendar-header');
  if (!grid) return;

  const openMinutes = parseTimeToMinutes(openHour?.open_hours || '06:00');
  const closeMinutes = parseTimeToMinutes(openHour?.close_hours || '24:00');
  const totalMinutes = Math.max(closeMinutes - openMinutes, 60);
  const currentMinutes = clampNumber(getCurrentMinutes(), openMinutes, closeMinutes);
  const gridPosition = ((currentMinutes - openMinutes) / totalMinutes) * grid.scrollHeight;
  const headerHeight = header?.offsetHeight || 0;
  const targetScrollTop = headerHeight + gridPosition - panel.clientHeight * 0.35;
  const maxScrollTop = Math.max(panel.scrollHeight - panel.clientHeight, 0);

  panel.scrollTop = clampNumber(targetScrollTop, 0, maxScrollTop);
}


export function parseTimeToMinutes(value) {
  const normalized = String(value || '00:00').replace('.', ':');
  const [hour, minute = '0'] = normalized.split(':').map(Number);
  if (hour === 24) return 24 * 60;
  return (hour || 0) * 60 + (minute || 0);
}


export function formatAvailabilityRange(startMinutes, endMinutes) {
  return `${formatCompactTime(startMinutes)}-${formatCompactTime(endMinutes)}`;
}

export function formatCompactTime(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 || 12;
  return minute ? `${normalizedHour}:${String(minute).padStart(2, '0')}${suffix}` : `${normalizedHour}${suffix}`;
}


export function minutesFromEpoch(value) {
  if (value === undefined || value === null || value === '') return 0;
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return 0;
  return date.getHours() * 60 + date.getMinutes();
}


export function buildHours(openHour) {
  const start = parseTimeToMinutes(openHour?.open_hours || '06:00');
  const end = parseTimeToMinutes(openHour?.close_hours || '24:00');
  const hours = [];
  for (let minutes = start; minutes <= end; minutes += 30) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    hours.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }
  return hours;
}

