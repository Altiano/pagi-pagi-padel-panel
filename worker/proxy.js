const SAFE_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'x-requested-with',
]);

const DEFAULT_ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'authorization,content-type,x-requested-with';
const PLACEHOLDER_PREFIX = '/api/placeholder-bookings';

function getAllowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return '*';

  const allowedOrigins = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || origin;
}

function corsHeaders(request, env) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(request, env),
    'Access-Control-Allow-Methods': DEFAULT_ALLOWED_METHODS,
    'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function buildUpstreamHeaders(request, upstreamOrigin) {
  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    if (SAFE_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }

  headers.set('Origin', upstreamOrigin);
  headers.set('Referer', `${upstreamOrigin}/`);

  return headers;
}

async function proxyApiRequest(request, env) {
  if (!env.UPSTREAM_ORIGIN) {
    return Response.json({ error: 'Proxy upstream is not configured.' }, { status: 500 });
  }

  const requestUrl = new URL(request.url);
  if (!requestUrl.pathname.startsWith('/api/')) {
    return Response.json({ error: 'Not found.' }, { status: 404, headers: corsHeaders(request, env) });
  }

  const upstreamOrigin = env.UPSTREAM_ORIGIN.replace(/\/$/, '');
  const upstreamUrl = new URL(`${upstreamOrigin}${requestUrl.pathname}${requestUrl.search}`);

  const response = await fetch(upstreamUrl, {
    method: request.method,
    headers: buildUpstreamHeaders(request, upstreamOrigin),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) {
    responseHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

async function ensurePlaceholderTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS placeholder_bookings (
      id TEXT PRIMARY KEY,
      mitra_id TEXT NOT NULL,
      court_id TEXT NOT NULL,
      court_name TEXT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_contact TEXT,
      estimated_price INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'awaiting_payment',
      notes TEXT,
      created_by_name TEXT,
      updated_by_name TEXT,
      confirmed_booking_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_placeholder_bookings_mitra_date ON placeholder_bookings (mitra_id, date)').run();
}

function requirePlaceholderDb(env) {
  if (!env.PLACEHOLDER_DB) {
    return Response.json({ error: 'Placeholder database is not configured.' }, { status: 500 });
  }
  return null;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
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

function mergePlaceholderPayload(existing, payload = {}) {
  const merged = { ...existing };
  for (const key of [
    'mitra_id',
    'court_id',
    'court_name',
    'date',
    'start_time',
    'end_time',
    'customer_name',
    'customer_contact',
    'estimated_price',
    'status',
    'notes',
    'created_by_name',
    'updated_by_name',
    'confirmed_booking_id',
  ]) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      merged[key] = payload[key];
    }
  }
  return normalizePlaceholderPayload(merged);
}

function validatePlaceholder(payload, partial = false) {
  const required = ['mitra_id', 'court_id', 'date', 'start_time', 'end_time', 'customer_name'];
  if (!partial) {
    const missing = required.filter((field) => !payload[field]);
    if (missing.length) return `Missing required fields: ${missing.join(', ')}.`;
  }

  if (payload.date && !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) return 'Date must use YYYY-MM-DD.';
  if (payload.start_time && !/^\d{2}:\d{2}$/.test(payload.start_time)) return 'Start time must use HH:mm.';
  if (payload.end_time && !/^\d{2}:\d{2}$/.test(payload.end_time)) return 'End time must use HH:mm.';
  if (Number.isNaN(payload.estimated_price) || payload.estimated_price < 0) return 'Estimated price must be zero or greater.';
  return '';
}

function rowToPlaceholder(row) {
  return {
    id: row.id,
    mitra_id: row.mitra_id,
    court_id: row.court_id,
    court_name: row.court_name,
    date: row.date,
    start_time: row.start_time,
    end_time: row.end_time,
    customer_name: row.customer_name,
    customer_contact: row.customer_contact,
    estimated_price: row.estimated_price,
    status: row.status,
    notes: row.notes,
    created_by_name: row.created_by_name,
    updated_by_name: row.updated_by_name,
    confirmed_booking_id: row.confirmed_booking_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function handlePlaceholderRequest(request, env) {
  const dbError = requirePlaceholderDb(env);
  if (dbError) return withCors(dbError, request, env);

  await ensurePlaceholderTable(env.PLACEHOLDER_DB);

  const url = new URL(request.url);
  const id = url.pathname.slice(PLACEHOLDER_PREFIX.length).replace(/^\//, '');

  if (request.method === 'GET' && !id) {
    const mitraId = url.searchParams.get('mitra_id');
    const from = url.searchParams.get('from') || url.searchParams.get('date');
    const to = url.searchParams.get('to') || from;

    if (!mitraId || !from || !to) {
      return withCors(Response.json({ error: 'mitra_id, from, and to are required.' }, { status: 400 }), request, env);
    }

    const { results } = await env.PLACEHOLDER_DB.prepare(`
      SELECT * FROM placeholder_bookings
      WHERE mitra_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
      ORDER BY date, start_time, court_name
    `).bind(mitraId, from, to).all();

    return withCors(Response.json({ lists: (results || []).map(rowToPlaceholder) }), request, env);
  }

  if (request.method === 'POST' && !id) {
    const payload = normalizePlaceholderPayload(await readJsonBody(request));
    const validationError = validatePlaceholder(payload);
    if (validationError) {
      return withCors(Response.json({ error: validationError }, { status: 400 }), request, env);
    }

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    await env.PLACEHOLDER_DB.prepare(`
      INSERT INTO placeholder_bookings (
        id, mitra_id, court_id, court_name, date, start_time, end_time,
        customer_name, customer_contact, estimated_price, status, notes,
        created_by_name, updated_by_name, confirmed_booking_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newId,
      payload.mitra_id,
      payload.court_id,
      payload.court_name,
      payload.date,
      payload.start_time,
      payload.end_time,
      payload.customer_name,
      payload.customer_contact,
      Math.round(payload.estimated_price),
      payload.status,
      payload.notes,
      payload.created_by_name,
      payload.updated_by_name || payload.created_by_name,
      payload.confirmed_booking_id,
      now,
      now,
    ).run();

    const row = await env.PLACEHOLDER_DB.prepare('SELECT * FROM placeholder_bookings WHERE id = ?').bind(newId).first();
    return withCors(Response.json({ data: rowToPlaceholder(row) }, { status: 201 }), request, env);
  }

  if ((request.method === 'PUT' || request.method === 'PATCH') && id) {
    const existing = await env.PLACEHOLDER_DB.prepare('SELECT * FROM placeholder_bookings WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (!existing) return withCors(Response.json({ error: 'Placeholder booking not found.' }, { status: 404 }), request, env);

    const payload = mergePlaceholderPayload(existing, await readJsonBody(request));
    const validationError = validatePlaceholder(payload);
    if (validationError) {
      return withCors(Response.json({ error: validationError }, { status: 400 }), request, env);
    }

    const now = new Date().toISOString();
    await env.PLACEHOLDER_DB.prepare(`
      UPDATE placeholder_bookings
      SET mitra_id = ?, court_id = ?, court_name = ?, date = ?, start_time = ?, end_time = ?,
        customer_name = ?, customer_contact = ?, estimated_price = ?, status = ?, notes = ?,
        created_by_name = ?, updated_by_name = ?, confirmed_booking_id = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      payload.mitra_id,
      payload.court_id,
      payload.court_name,
      payload.date,
      payload.start_time,
      payload.end_time,
      payload.customer_name,
      payload.customer_contact,
      Math.round(payload.estimated_price),
      payload.status,
      payload.notes,
      payload.created_by_name || existing.created_by_name,
      payload.updated_by_name || existing.updated_by_name,
      payload.confirmed_booking_id,
      now,
      id,
    ).run();

    const row = await env.PLACEHOLDER_DB.prepare('SELECT * FROM placeholder_bookings WHERE id = ?').bind(id).first();
    return withCors(Response.json({ data: rowToPlaceholder(row) }), request, env);
  }

  if (request.method === 'DELETE' && id) {
    const now = new Date().toISOString();
    await env.PLACEHOLDER_DB.prepare('UPDATE placeholder_bookings SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, id).run();
    return withCors(Response.json({ ok: true }), request, env);
  }

  return withCors(Response.json({ error: 'Not found.' }, { status: 404 }), request, env);
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    const url = new URL(request.url);
    if (url.pathname === PLACEHOLDER_PREFIX || url.pathname.startsWith(`${PLACEHOLDER_PREFIX}/`)) {
      return handlePlaceholderRequest(request, env);
    }

    return proxyApiRequest(request, env);
  },
};
