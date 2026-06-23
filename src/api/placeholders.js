const PLACEHOLDER_PREFIX = '/api/placeholder-bookings';
const STORAGE_KEY = 'panel.placeholderBookings';

export function isPlaceholderRequest(path) {
  const pathname = toUrl(path).pathname;
  return pathname === PLACEHOLDER_PREFIX || pathname.startsWith(`${PLACEHOLDER_PREFIX}/`);
}

export async function localPlaceholderRequest(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const url = toUrl(path);
  const id = url.pathname.slice(PLACEHOLDER_PREFIX.length).replace(/^\//, '');

  if (method === 'GET' && !id) {
    const mitraId = url.searchParams.get('mitra_id');
    const from = url.searchParams.get('from') || url.searchParams.get('date');
    const to = url.searchParams.get('to') || from;
    const lists = readPlaceholders()
      .filter((booking) => !mitraId || booking.mitra_id === mitraId)
      .filter((booking) => !from || booking.date >= from)
      .filter((booking) => !to || booking.date <= to)
      .sort((first, second) => `${first.date}${first.start_time}${first.court_name}`.localeCompare(`${second.date}${second.start_time}${second.court_name}`));

    return { lists };
  }

  if (method === 'POST' && !id) {
    const payload = normalizePlaceholderPayload(await readRequestBody(options.body));
    const validationError = validatePlaceholder(payload);
    if (validationError) throw new Error(validationError);

    const now = new Date().toISOString();
    const booking = {
      ...payload,
      id: crypto.randomUUID(),
      estimated_price: Math.round(payload.estimated_price),
      updated_by_name: payload.updated_by_name || payload.created_by_name,
      created_at: now,
      updated_at: now,
    };

    writePlaceholders([...readPlaceholders(), booking]);
    return { data: booking };
  }

  if ((method === 'PUT' || method === 'PATCH') && id) {
    const existing = readPlaceholders();
    const index = existing.findIndex((booking) => booking.id === id);
    if (index === -1) throw new Error('Placeholder booking not found.');

    const payload = normalizePlaceholderPayload({ ...existing[index], ...(await readRequestBody(options.body)) });
    const validationError = validatePlaceholder(payload);
    if (validationError) throw new Error(validationError);

    const booking = {
      ...existing[index],
      ...payload,
      id,
      estimated_price: Math.round(payload.estimated_price),
      updated_at: new Date().toISOString(),
    };

    existing[index] = booking;
    writePlaceholders(existing);
    return { data: booking };
  }

  if (method === 'DELETE' && id) {
    writePlaceholders(readPlaceholders().filter((booking) => booking.id !== id));
    return { ok: true };
  }

  throw new Error('Placeholder route not found.');
}

function toUrl(path) {
  return new URL(path, window.location.origin);
}

function readPlaceholders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePlaceholders(bookings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
}

async function readRequestBody(body) {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body || '{}');
  if (body instanceof FormData) return Object.fromEntries(body.entries());
  return body;
}

function normalizePlaceholderPayload(payload = {}) {
  return {
    mitra_id: String(payload.mitra_id || '').trim(),
    court_id: String(payload.court_id || '').trim(),
    court_name: String(payload.court_name || '').trim(),
    date: String(payload.date || '').trim(),
    start_time: String(payload.start_time || '').trim(),
    end_time: String(payload.end_time || '').trim(),
    customer_name: String(payload.customer_name || '').trim(),
    customer_contact: String(payload.customer_contact || '').trim(),
    estimated_price: Number(payload.estimated_price || 0),
    status: String(payload.status || 'awaiting_payment').trim(),
    notes: String(payload.notes || '').trim(),
    created_by_name: String(payload.created_by_name || '').trim(),
    updated_by_name: String(payload.updated_by_name || '').trim(),
    confirmed_booking_id: String(payload.confirmed_booking_id || '').trim(),
  };
}

function validatePlaceholder(payload) {
  const required = ['mitra_id', 'court_id', 'date', 'start_time', 'end_time', 'customer_name'];
  const missing = required.filter((field) => !payload[field]);
  if (missing.length) return `Missing required fields: ${missing.join(', ')}.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) return 'Date must use YYYY-MM-DD.';
  if (!/^\d{2}:\d{2}$/.test(payload.start_time)) return 'Start time must use HH:mm.';
  if (!/^\d{2}:\d{2}$/.test(payload.end_time)) return 'End time must use HH:mm.';
  if (Number.isNaN(payload.estimated_price) || payload.estimated_price < 0) return 'Estimated price must be zero or greater.';
  return '';
}
