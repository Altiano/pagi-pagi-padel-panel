const SAFE_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'x-requested-with',
]);

const DEFAULT_ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'authorization,content-type,x-requested-with,x-panel-virtual-user';
const PLACEHOLDER_PREFIX = '/api/placeholder-bookings';
const VIRTUAL_USERS_PREFIX = '/api/virtual-users';
const VIRTUAL_LOGIN_PREFIX = '_';
const CALENDAR_REVENUE_PERMISSION = 'Calendar revenue';
const CALENDAR_BOOKING_PERMISSION = 'Calendar booking';
const UPSTREAM_TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const DEFAULT_VIRTUAL_SESSION_TTL_SECONDS = 12 * 60 * 60;
const REMEMBERED_VIRTUAL_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MONEY_FIELD_NAMES = new Set([
  'amount',
  'balance',
  'estimated_price',
  'income',
  'nominal',
  'paid_amount',
  'price',
  'remaining_amount',
  'revenue',
  'subtotal',
  'total',
  'total_balance',
  'total_price',
]);
const CALENDAR_BOOKING_ENDPOINT_PATTERNS = [
  /^\/api\/admin\/cancel-cal-court(?:\/|$)/,
  /^\/api\/admin\/change-notes(?:\/|$)/,
  /^\/api\/admin\/check-reschedule-court-price(?:\/|$)/,
  /^\/api\/admin\/court-booking(?:\/|$)/,
  /^\/api\/admin\/pay-court-booking(?:\/|$)/,
  /^\/api\/admin\/player\/search-player-lists(?:\/|$)/,
  /^\/api\/admin\/reschedule-court-time(?:\/|$|-)/,
  /^\/api\/admin\/schedule\/attachments(?:\/|$)/,
  /^\/api\/admin\/schedule-cal-courts-detail(?:\/|$)/,
];
const VIRTUAL_ENDPOINT_RULES = [
  {
    permission: 'Dashboard',
    matches: [
      /^\/api\/admin\/dashboard(?:\/|$)/,
      /^\/api\/admin\/mitra\/info(?:\/|$)/,
      /^\/api\/admin\/mitra\/notifications(?:\/|$)/,
      /^\/api\/admin\/transaction\/addon-trans-summary(?:\/|$)/,
      /^\/api\/admin\/transaction\/list(?:\/|$)/,
    ],
  },
  {
    permission: 'Calendar',
    matches: [
      /^\/api\/admin\/cancel-cal-court(?:\/|$)/,
      /^\/api\/admin\/change-notes(?:\/|$)/,
      /^\/api\/admin\/check-reschedule-court-price(?:\/|$)/,
      /^\/api\/admin\/court-booking(?:\/|$)/,
      /^\/api\/admin\/pay-court-booking(?:\/|$)/,
      /^\/api\/admin\/player\/search-player-lists(?:\/|$)/,
      /^\/api\/admin\/reschedule-court-time(?:\/|$)/,
      /^\/api\/admin\/reschedule-court-time-lists(?:\/|$)/,
      /^\/api\/admin\/schedule(?:\/|$|-)/,
      /^\/api\/admin\/schedule-cal-courts(?:\/|$)/,
      /^\/api\/admin\/mitra\/court\/[^/]+\/list$/,
      /^\/api\/admin\/mitra\/operation-hour(?:\/|$)/,
    ],
  },
  {
    permission: 'Court Prices',
    matches: [/^\/api\/admin\/services(?:\/|$)/],
  },
  {
    permission: 'Event',
    matches: [/^\/api\/admin\/event(?:\/|$)/],
  },
  {
    permission: 'Coach',
    matches: [/^\/api\/admin\/coach(?:\/|$)/],
  },
  {
    permission: 'Add On',
    matches: [/^\/api\/admin\/addons(?:\/|$)/],
  },
  {
    permission: 'Customers',
    matches: [
      /^\/api\/admin\/player(?:\/|$)/,
      /^\/api\/admin\/voucher(?:\/|$)/,
      /^\/api\/admin\/promotion(?:\/|$)/,
      /^\/api\/admin\/membership(?:\/|$)/,
      /^\/api\/admin\/mitra\/discount(?:\/|$)/,
    ],
  },
  {
    permission: 'Setting',
    matches: [
      /^\/api\/admin\/user(?:\/|$)/,
      /^\/api\/media\/image-get(?:\/|$)/,
    ],
  },
];
const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};
const SENSITIVE_LOG_KEYS = new Set([
  'access_token',
  'authorization',
  'cookie',
  'password',
  'refresh_token',
  'set-cookie',
  'token',
  'upstream_access_token',
  'upstream_refresh_token',
]);

function createRequestContext(request) {
  const url = new URL(request.url);
  return {
    method: request.method,
    origin: request.headers.get('Origin') || '',
    pathname: url.pathname,
    requestId: request.headers.get('X-Request-ID') || crypto.randomUUID(),
  };
}

function shouldLog(env, level) {
  const configuredLevel = String(env.WORKER_LOG_LEVEL || 'info').toLowerCase();
  const threshold = LOG_LEVELS[configuredLevel] ?? LOG_LEVELS.info;
  return (LOG_LEVELS[level] ?? LOG_LEVELS.info) >= threshold;
}

function sanitizeLogValue(value, depth = 0) {
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => sanitizeLogValue(item, depth + 1));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
    if (SENSITIVE_LOG_KEYS.has(key.toLowerCase())) return [key, '[redacted]'];
    return [key, sanitizeLogValue(nested, depth + 1)];
  }));
}

function logWorker(env, level, event, context = {}, details = {}) {
  if (!shouldLog(env, level)) return;

  const entry = sanitizeLogValue({
    event,
    level,
    method: context.method,
    origin: context.origin,
    pathname: context.pathname,
    request_id: context.requestId,
    timestamp: new Date().toISOString(),
    ...details,
  });
  if (level === 'error') {
    console.error(entry);
  } else if (level === 'warn') {
    console.warn(entry);
  } else {
    console.log(entry);
  }
}

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

function buildUpstreamHeaders(request, upstreamOrigin, upstreamAuth = null) {
  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    if (SAFE_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }

  if (upstreamAuth?.accessToken) {
    headers.set('Authorization', `${upstreamAuth.tokenType || 'Bearer'} ${upstreamAuth.accessToken}`);
  }

  headers.set('Origin', upstreamOrigin);
  headers.set('Referer', `${upstreamOrigin}/`);

  return headers;
}

async function proxyApiRequest(request, env, { context = createRequestContext(request), transformResponse, upstreamAuth } = {}) {
  if (!env.UPSTREAM_ORIGIN) {
    logWorker(env, 'error', 'proxy.missing_upstream_origin', context);
    return withCors(Response.json({ error: 'Proxy upstream is not configured.' }, { status: 500 }), request, env, context);
  }

  const requestUrl = new URL(request.url);
  if (!requestUrl.pathname.startsWith('/api/')) {
    return withCors(Response.json({ error: 'Not found.' }, { status: 404 }), request, env, context);
  }

  const upstreamOrigin = env.UPSTREAM_ORIGIN.replace(/\/$/, '');
  const upstreamUrl = new URL(`${upstreamOrigin}${requestUrl.pathname}${requestUrl.search}`);

  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(upstreamUrl, {
      method: request.method,
      headers: buildUpstreamHeaders(request, upstreamOrigin, upstreamAuth),
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });
  } catch (error) {
    logWorker(env, 'error', 'proxy.upstream_fetch_exception', context, {
      duration_ms: Date.now() - startedAt,
      error_message: error?.message || String(error),
      upstream_pathname: upstreamUrl.pathname,
    });
    return withCors(Response.json({ error: 'Unable to reach the upstream service.' }, { status: 502 }), request, env, context);
  }

  const logLevel = response.ok ? 'info' : 'warn';
  logWorker(env, logLevel, 'proxy.upstream_response', context, {
    duration_ms: Date.now() - startedAt,
    upstream_pathname: upstreamUrl.pathname,
    upstream_status: response.status,
    upstream_status_text: response.statusText,
  });

  const responseHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) {
    responseHeaders.set(key, value);
  }
  responseHeaders.set('X-Panel-Request-ID', context.requestId);

  if (transformResponse) {
    const payload = await readJsonResponse(response);
    const transformedPayload = transformResponse(payload);
    responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(transformedPayload), {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
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

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function ensureTableColumns(db, tableName, columns) {
  const { results } = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  const existingColumns = new Set((results || []).map((row) => row.name));

  for (const column of columns) {
    if (!existingColumns.has(column.name)) {
      await db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition}`).run();
    }
  }
}

function requireAppDb(env) {
  if (!env.PLACEHOLDER_DB) {
    return Response.json({ error: 'Application database is not configured.' }, { status: 500 });
  }
  return null;
}

async function ensureVirtualUsersTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS virtual_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_virtual_users_username ON virtual_users (username)').run();
}

async function ensureVirtualSessionsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS virtual_sessions (
      token_hash TEXT PRIMARY KEY,
      virtual_user_id TEXT NOT NULL,
      upstream_account_username TEXT,
      remember INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `).run();
  await ensureTableColumns(db, 'virtual_sessions', [
    { name: 'upstream_account_username', definition: 'TEXT' },
    { name: 'remember', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'updated_at', definition: 'TEXT' },
  ]);
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_virtual_sessions_expires_at ON virtual_sessions (expires_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_virtual_sessions_upstream_account ON virtual_sessions (upstream_account_username, expires_at)').run();
}

async function ensureUpstreamAccountTokensTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS upstream_account_tokens (
      username TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_type TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await ensureTableColumns(db, 'upstream_account_tokens', [
    { name: 'refresh_token', definition: 'TEXT' },
    { name: 'token_type', definition: 'TEXT' },
    { name: 'expires_at', definition: 'TEXT' },
    { name: 'created_at', definition: 'TEXT' },
    { name: 'updated_at', definition: 'TEXT' },
  ]);
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_upstream_account_tokens_expires_at ON upstream_account_tokens (expires_at)').run();
}

async function ensureUpstreamAccountUsageTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS upstream_account_usage (
      username TEXT PRIMARY KEY,
      last_selected_at TEXT,
      updated_at TEXT NOT NULL
    )
  `).run();
}

async function ensureMasterSessionsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS master_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at TEXT,
      created_at TEXT NOT NULL
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_master_sessions_expires_at ON master_sessions (expires_at)').run();
}

function normalizeVirtualUsername(value = '') {
  return String(value).trim().replace(/^_+/, '').toLowerCase();
}

function normalizePermissions(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function validateVirtualUser(payload, { requirePassword = false } = {}) {
  if (!payload.username) return 'Username is required.';
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(payload.username)) {
    return 'Username must be 2-32 characters and use letters, numbers, dots, dashes, or underscores.';
  }
  if (!payload.display_name) return 'Display name is required.';
  if (requirePassword && !payload.password) return 'Password is required.';
  if (payload.password && String(payload.password).length < 4) return 'Password must be at least 4 characters.';
  return '';
}

function rowToVirtualUser(row) {
  let permissions = [];
  try {
    permissions = JSON.parse(row.permissions || '[]');
  } catch {
    permissions = [];
  }

  return {
    id: row.id,
    username: row.username,
    login_username: `${VIRTUAL_LOGIN_PREFIX}${row.username}`,
    display_name: row.display_name,
    permissions,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getUpstreamTokenStatus(expiresAt) {
  if (!expiresAt) return 'missing';
  if (isIsoExpired(expiresAt)) return 'expired';
  if (isIsoExpired(expiresAt, UPSTREAM_TOKEN_REFRESH_SKEW_MS)) return 'expiring';
  return 'fresh';
}

function rowToVirtualSession(row) {
  return {
    virtual_user_id: row.virtual_user_id || '',
    username: row.username || '',
    login_username: row.username ? `${VIRTUAL_LOGIN_PREFIX}${row.username}` : '',
    display_name: row.display_name || '',
    is_active: row.is_active === null || row.is_active === undefined ? null : Boolean(row.is_active),
    upstream_account_username: row.upstream_account_username || '',
    session_expires_at: row.session_expires_at || null,
    session_created_at: row.session_created_at || null,
    session_updated_at: row.session_updated_at || null,
    remember: Boolean(row.remember),
    upstream_token_expires_at: row.upstream_token_expires_at || null,
    upstream_token_updated_at: row.upstream_token_updated_at || null,
    upstream_token_status: getUpstreamTokenStatus(row.upstream_token_expires_at),
  };
}

function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
  const encoded = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashValue(value) {
  const encoded = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(first, second) {
  if (first.length !== second.length) return false;
  let result = 0;
  for (let index = 0; index < first.length; index += 1) {
    result |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return result === 0;
}

function getBearerToken(request) {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function normalizeUpstreamAccount(rawAccount, index = 0) {
  if (!rawAccount || typeof rawAccount !== 'object') return null;
  const username = String(rawAccount.username || rawAccount.email || rawAccount.login || '').trim();
  const passwordValue = Object.prototype.hasOwnProperty.call(rawAccount, 'password')
    ? rawAccount.password
    : rawAccount.pass;
  const password = passwordValue === undefined || passwordValue === null ? '' : String(passwordValue);
  if (!username || !password) return null;
  return {
    id: String(rawAccount.id || username).trim() || username,
    index,
    password,
    username,
  };
}

function parseUpstreamAccounts(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    const rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.accounts)
        ? parsed.accounts
        : [];
    return rows.map(normalizeUpstreamAccount).filter(Boolean);
  } catch {
    return [];
  }
}

function dedupeUpstreamAccounts(accounts) {
  const seen = new Set();
  const unique = [];
  for (const account of accounts) {
    const key = account.username.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ ...account, index: unique.length });
    }
  }
  return unique;
}

function getConfiguredUpstreamAccounts(env) {
  const pooledAccounts = parseUpstreamAccounts(env.UPSTREAM_ACCOUNTS_JSON || env.UPSTREAM_ACCOUNTS);
  if (pooledAccounts.length) return dedupeUpstreamAccounts(pooledAccounts);

  const fallback = normalizeUpstreamAccount({
    password: env.MASTER_PASSWORD,
    username: env.MASTER_USERNAME,
  });
  return fallback ? [fallback] : [];
}

function compareNullableIso(first, second) {
  if (!first && !second) return 0;
  if (!first) return -1;
  if (!second) return 1;
  return String(first).localeCompare(String(second));
}

async function cleanupExpiredVirtualSessions(db, now) {
  await db.prepare('DELETE FROM virtual_sessions WHERE expires_at IS NOT NULL AND expires_at <= ?').bind(now).run();
}

async function getActiveVirtualSessionCounts(db, now) {
  const { results } = await db.prepare(`
    SELECT upstream_account_username, COUNT(*) AS active_count
    FROM virtual_sessions
    WHERE upstream_account_username IS NOT NULL
      AND upstream_account_username != ''
      AND (expires_at IS NULL OR expires_at > ?)
    GROUP BY upstream_account_username
  `).bind(now).all();

  return new Map((results || []).map((row) => [
    String(row.upstream_account_username || '').toLowerCase(),
    Number(row.active_count || 0),
  ]));
}

async function getUpstreamAccountUsage(db) {
  await ensureUpstreamAccountUsageTable(db);
  const { results } = await db.prepare('SELECT username, last_selected_at FROM upstream_account_usage').all();
  return new Map((results || []).map((row) => [
    String(row.username || '').toLowerCase(),
    row.last_selected_at || '',
  ]));
}

async function rankUpstreamAccountsForVirtualLogin(db, accounts) {
  await ensureVirtualSessionsTable(db);
  await ensureUpstreamAccountUsageTable(db);

  const now = new Date().toISOString();
  await cleanupExpiredVirtualSessions(db, now);
  const activeCounts = await getActiveVirtualSessionCounts(db, now);
  const usage = await getUpstreamAccountUsage(db);

  return accounts
    .map((account) => {
      const key = account.username.toLowerCase();
      return {
        account,
        activeCount: activeCounts.get(key) || 0,
        lastSelectedAt: usage.get(key) || '',
      };
    })
    .sort((first, second) => (
      first.activeCount - second.activeCount ||
      compareNullableIso(first.lastSelectedAt, second.lastSelectedAt) ||
      first.account.index - second.account.index
    ))
    .map((entry) => entry.account);
}

async function markUpstreamAccountSelected(db, username, now) {
  await ensureUpstreamAccountUsageTable(db);
  await db.prepare(`
    INSERT INTO upstream_account_usage (username, last_selected_at, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      last_selected_at = excluded.last_selected_at,
      updated_at = excluded.updated_at
  `).bind(username, now, now).run();
}

function hasVirtualPermission(virtualUser, permission) {
  const permissions = Array.isArray(virtualUser?.permissions) ? virtualUser.permissions : [];
  return permissions.includes(permission);
}

function responseWithStatus(error, status = 403) {
  return Response.json({ error }, { status });
}

function findIdentityValues(value, depth = 0) {
  if (!value || depth > 5 || typeof value !== 'object') return [];
  const identities = [];
  for (const [key, nested] of Object.entries(value)) {
    if (['email', 'username', 'user_name', 'login', 'name'].includes(key.toLowerCase()) && typeof nested === 'string') {
      identities.push(nested);
    } else if (nested && typeof nested === 'object') {
      identities.push(...findIdentityValues(nested, depth + 1));
    }
  }
  return identities;
}

function getPayloadExpiresAt(payload) {
  const expiresInMs = Number(payload?.expires_in || 0) * 1000;
  return expiresInMs ? new Date(Date.now() + expiresInMs).toISOString() : null;
}

function getVirtualSessionTtlSeconds(env, remember = false) {
  const configured = Number(remember ? env.VIRTUAL_SESSION_REMEMBER_TTL_SECONDS : env.VIRTUAL_SESSION_TTL_SECONDS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return remember ? REMEMBERED_VIRTUAL_SESSION_TTL_SECONDS : DEFAULT_VIRTUAL_SESSION_TTL_SECONDS;
}

function getExpiresAtFromSeconds(seconds) {
  return seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null;
}

function isIsoExpired(value, skewMs = 0) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now() + skewMs;
}

async function loginToUpstreamAccount(env, account, { remember = false } = {}) {
  if (!env.UPSTREAM_ORIGIN) {
    return { ok: false, status: 500, statusText: 'Missing upstream origin', message: 'Proxy upstream is not configured.' };
  }

  const upstreamOrigin = env.UPSTREAM_ORIGIN.replace(/\/$/, '');
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(`${upstreamOrigin}/api/auth/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        Origin: upstreamOrigin,
        Referer: `${upstreamOrigin}/`,
      },
      body: JSON.stringify({
        username: account.username,
        password: account.password,
        remember,
      }),
      redirect: 'manual',
    });
  } catch (error) {
    return {
      durationMs: Date.now() - startedAt,
      error,
      message: 'Unable to reach the configured upstream account.',
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    };
  }

  const payload = await readJsonResponse(response);
  const message = payload?.message || payload?.error || 'Unable to sign in with the configured upstream account.';
  return {
    durationMs: Date.now() - startedAt,
    message,
    ok: response.ok && Boolean(payload?.access_token),
    payload,
    status: response.ok && !payload?.access_token ? 502 : response.status,
    statusText: response.ok && !payload?.access_token ? 'Missing access token' : response.statusText,
  };
}

async function getStoredUpstreamAccountToken(db, username) {
  await ensureUpstreamAccountTokensTable(db);
  return db.prepare(`
    SELECT username, access_token, refresh_token, token_type, expires_at
    FROM upstream_account_tokens
    WHERE username = ?
  `).bind(username).first();
}

async function storeUpstreamAccountToken(db, account, payload) {
  await ensureUpstreamAccountTokensTable(db);
  const now = new Date().toISOString();
  const expiresAt = getPayloadExpiresAt(payload);
  await db.prepare(`
    INSERT INTO upstream_account_tokens (
      username, access_token, refresh_token, token_type, expires_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_type = excluded.token_type,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).bind(
    account.username,
    payload.access_token,
    payload.refresh_token || '',
    payload.token_type || 'Bearer',
    expiresAt,
    now,
    now,
  ).run();
  return {
    accessToken: payload.access_token,
    expiresAt,
    tokenType: payload.token_type || 'Bearer',
  };
}

async function ensureUpstreamAccountAuth(env, account, { context, remember = false, virtualUser = null } = {}) {
  const stored = await getStoredUpstreamAccountToken(env.PLACEHOLDER_DB, account.username);
  if (stored?.access_token && !isIsoExpired(stored.expires_at, UPSTREAM_TOKEN_REFRESH_SKEW_MS)) {
    return {
      auth: {
        accessToken: stored.access_token,
        tokenType: stored.token_type || 'Bearer',
      },
      reused: true,
    };
  }

  const loginResult = await loginToUpstreamAccount(env, account, { remember });
  if (!loginResult.ok) {
    logWorker(env, 'warn', 'auth.upstream_account.login_failed', context, {
      duration_ms: loginResult.durationMs,
      upstream_account_username: account.username,
      upstream_error: loginResult.message,
      upstream_status: loginResult.status,
      upstream_status_text: loginResult.statusText,
      virtual_user_id: virtualUser?.id,
      virtual_username: virtualUser?.username,
    });
    return { error: responseWithStatus(loginResult.message, loginResult.status || 502), loginResult };
  }

  const storedToken = await storeUpstreamAccountToken(env.PLACEHOLDER_DB, account, loginResult.payload);
  logWorker(env, 'info', 'auth.upstream_account.login_success', context, {
    duration_ms: loginResult.durationMs,
    upstream_account_username: account.username,
    upstream_status: loginResult.status,
    virtual_user_id: virtualUser?.id,
    virtual_username: virtualUser?.username,
  });

  return {
    auth: {
      accessToken: storedToken.accessToken,
      tokenType: storedToken.tokenType,
    },
    loginResult,
    reused: false,
  };
}

async function getVirtualSessionContext(request, env) {
  const token = getBearerToken(request);
  if (!token || !env.PLACEHOLDER_DB) return null;
  await ensureVirtualSessionsTable(env.PLACEHOLDER_DB);
  await ensureVirtualUsersTable(env.PLACEHOLDER_DB);
  const now = new Date().toISOString();
  await cleanupExpiredVirtualSessions(env.PLACEHOLDER_DB, now);
  const tokenHash = await hashValue(token);
  const row = await env.PLACEHOLDER_DB.prepare(`
    SELECT
      vu.*,
      vs.token_hash AS session_token_hash,
      vs.expires_at AS session_expires_at,
      vs.upstream_account_username AS session_upstream_account_username,
      vs.remember AS session_remember
    FROM virtual_sessions vs
    LEFT JOIN virtual_users vu ON vu.id = vs.virtual_user_id
    WHERE vs.token_hash = ? AND (vs.expires_at IS NULL OR vs.expires_at > ?)
  `).bind(tokenHash, now).first();

  if (!row) return null;
  if (!row.id || row.deleted_at || !row.is_active) {
    return { error: responseWithStatus('Virtual user was not found or is inactive.', 403) };
  }
  if (!row.session_upstream_account_username) {
    return { error: responseWithStatus('Virtual session has expired. Please sign in again.', 401) };
  }

  return {
    session: {
      expiresAt: row.session_expires_at || null,
      remember: Boolean(row.session_remember),
      tokenHash: row.session_token_hash,
      upstreamAccountUsername: row.session_upstream_account_username || '',
    },
    user: rowToVirtualUser(row),
  };
}

async function isVirtualSession(request, env) {
  const context = await getVirtualSessionContext(request, env);
  return Boolean(context?.user || context?.error);
}

async function isMasterSession(request, env) {
  const token = getBearerToken(request);
  if (!token) return false;
  await ensureMasterSessionsTable(env.PLACEHOLDER_DB);
  const now = new Date().toISOString();
  await env.PLACEHOLDER_DB.prepare('DELETE FROM master_sessions WHERE expires_at IS NOT NULL AND expires_at <= ?').bind(now).run();
  const tokenHash = await hashValue(token);
  const session = await env.PLACEHOLDER_DB.prepare(`
    SELECT token_hash FROM master_sessions
    WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > ?)
  `).bind(tokenHash, now).first();
  return Boolean(session);
}

async function storeMasterSession(env, payload) {
  if (!payload?.access_token) return;
  await ensureMasterSessionsTable(env.PLACEHOLDER_DB);
  const now = new Date().toISOString();
  const expiresInMs = Number(payload.expires_in || 0) * 1000;
  const expiresAt = expiresInMs ? new Date(Date.now() + expiresInMs).toISOString() : null;
  await env.PLACEHOLDER_DB.prepare(`
    INSERT OR REPLACE INTO master_sessions (token_hash, expires_at, created_at)
    VALUES (?, ?, ?)
  `).bind(await hashValue(payload.access_token), expiresAt, now).run();
}

async function requireMasterVirtualUserAccess(request, env) {
  if (!env.MASTER_USERNAME) {
    return Response.json({ error: 'Virtual user management master username is not configured.' }, { status: 500 });
  }

  const token = getBearerToken(request);
  if (!token) {
    return Response.json({ error: 'Authentication is required.' }, { status: 401 });
  }

  if (request.headers.get('X-Panel-Virtual-User')) {
    return Response.json({ error: 'Only the master account can manage virtual users.' }, { status: 403 });
  }

  if (await isVirtualSession(request, env)) {
    return Response.json({ error: 'Only the master account can manage virtual users.' }, { status: 403 });
  }

  if (await isMasterSession(request, env)) {
    return null;
  }

  if (!env.UPSTREAM_ORIGIN) {
    return Response.json({ error: 'Proxy upstream is not configured.' }, { status: 500 });
  }

  const upstreamOrigin = env.UPSTREAM_ORIGIN.replace(/\/$/, '');
  const response = await fetch(`${upstreamOrigin}/api/auth/me`, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: `Bearer ${token}`,
      Origin: upstreamOrigin,
      Referer: `${upstreamOrigin}/`,
    },
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    return Response.json({ error: payload?.message || payload?.error || 'Unable to verify the current account.' }, { status: response.status });
  }

  const masterUsername = String(env.MASTER_USERNAME).trim().toLowerCase();
  const identities = findIdentityValues(payload).map((value) => String(value).trim().toLowerCase());
  if (!identities.includes(masterUsername)) {
    return Response.json({ error: 'Only the master account can manage virtual users.' }, { status: 403 });
  }

  return null;
}

function findEndpointPermission(pathname) {
  return VIRTUAL_ENDPOINT_RULES.find((rule) => rule.matches.some((pattern) => pattern.test(pathname)))?.permission || '';
}

function requiresCalendarBookingPermission(pathname) {
  return CALENDAR_BOOKING_ENDPOINT_PATTERNS.some((pattern) => pattern.test(pathname));
}

function authorizeVirtualProxyRequest(request, virtualContext) {
  if (!virtualContext) return null;
  if (virtualContext.error) return virtualContext.error;

  const pathname = new URL(request.url).pathname;
  if (pathname === '/api/auth/me' || pathname === '/api/auth/logout') return null;

  const requiredPermission = findEndpointPermission(pathname);
  if (!requiredPermission) {
    return responseWithStatus('This virtual user does not have permission to access that endpoint.', 403);
  }

  if (!hasVirtualPermission(virtualContext.user, requiredPermission)) {
    return responseWithStatus('This virtual user does not have permission to access that endpoint.', 403);
  }

  if (requiresCalendarBookingPermission(pathname) && !hasVirtualPermission(virtualContext.user, CALENDAR_BOOKING_PERMISSION)) {
    return responseWithStatus('This virtual user does not have permission to write calendar bookings.', 403);
  }

  return null;
}

function shouldMaskCalendarMoney(pathname, virtualContext) {
  return Boolean(
    virtualContext?.user &&
    !hasVirtualPermission(virtualContext.user, CALENDAR_REVENUE_PERMISSION) &&
    /^\/api\/admin\/schedule-cal-courts(?:\/|$)/.test(pathname)
  );
}

function stripMoneyFields(value) {
  if (Array.isArray(value)) return value.map(stripMoneyFields);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !MONEY_FIELD_NAMES.has(key.toLowerCase()))
    .map(([key, nested]) => [key, stripMoneyFields(nested)]));
}

function requireVirtualPermission(virtualContext, permission) {
  if (!virtualContext) return null;
  if (virtualContext.error) return virtualContext.error;
  if (hasVirtualPermission(virtualContext.user, permission)) return null;
  return responseWithStatus('This virtual user does not have permission to access that data.', 403);
}

async function ensureVirtualUpstreamAuth(virtualContext, env, context) {
  if (!virtualContext?.user) return { auth: null };
  const session = virtualContext.session;
  if (!session?.upstreamAccountUsername) {
    return { error: responseWithStatus('Virtual session has expired. Please sign in again.', 401) };
  }

  const upstreamAccounts = getConfiguredUpstreamAccounts(env);
  const account = upstreamAccounts.find((candidate) => (
    candidate.username.toLowerCase() === String(session.upstreamAccountUsername || '').toLowerCase()
  ));
  if (!account) {
    logWorker(env, 'warn', 'auth.virtual_session.upstream_account_missing', context, {
      upstream_account_username: session.upstreamAccountUsername,
      virtual_user_id: virtualContext.user.id,
      virtual_username: virtualContext.user.username,
    });
    return { error: responseWithStatus('The upstream account for this virtual session is no longer configured.', 401) };
  }

  return ensureUpstreamAccountAuth(env, account, {
    context,
    remember: session.remember,
    virtualUser: virtualContext.user,
  });
}

async function handleVirtualUsersRequest(request, env) {
  const dbError = requireAppDb(env);
  if (dbError) return withCors(dbError, request, env);

  await ensureVirtualUsersTable(env.PLACEHOLDER_DB);
  await ensureVirtualSessionsTable(env.PLACEHOLDER_DB);
  await ensureMasterSessionsTable(env.PLACEHOLDER_DB);

  const accessError = await requireMasterVirtualUserAccess(request, env);
  if (accessError) return withCors(accessError, request, env);

  const url = new URL(request.url);
  const id = url.pathname.slice(VIRTUAL_USERS_PREFIX.length).replace(/^\//, '');

  if (request.method === 'GET' && id === 'sessions') {
    const now = new Date().toISOString();
    await ensureUpstreamAccountTokensTable(env.PLACEHOLDER_DB);
    await cleanupExpiredVirtualSessions(env.PLACEHOLDER_DB, now);
    const { results } = await env.PLACEHOLDER_DB.prepare(`
      SELECT
        vs.virtual_user_id,
        vs.upstream_account_username,
        vs.remember,
        vs.expires_at AS session_expires_at,
        vs.created_at AS session_created_at,
        vs.updated_at AS session_updated_at,
        vu.username,
        vu.display_name,
        vu.is_active,
        uat.expires_at AS upstream_token_expires_at,
        uat.updated_at AS upstream_token_updated_at
      FROM virtual_sessions vs
      LEFT JOIN virtual_users vu ON vu.id = vs.virtual_user_id
      LEFT JOIN upstream_account_tokens uat ON LOWER(uat.username) = LOWER(vs.upstream_account_username)
      WHERE vs.expires_at IS NULL OR vs.expires_at > ?
      ORDER BY vs.created_at DESC
    `).bind(now).all();
    return withCors(Response.json({ lists: (results || []).map(rowToVirtualSession) }), request, env);
  }

  if (request.method === 'GET' && !id) {
    const { results } = await env.PLACEHOLDER_DB.prepare(`
      SELECT * FROM virtual_users
      WHERE deleted_at IS NULL
      ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE
    `).all();
    return withCors(Response.json({ lists: (results || []).map(rowToVirtualUser) }), request, env);
  }

  if (request.method === 'POST' && !id) {
    const body = await readJsonBody(request) || {};
    const payload = {
      username: normalizeVirtualUsername(body.username),
      display_name: String(body.display_name || '').trim(),
      password: String(body.password || ''),
      permissions: normalizePermissions(body.permissions),
      is_active: body.is_active !== false,
    };
    const validationError = validateVirtualUser(payload, { requirePassword: true });
    if (validationError) {
      return withCors(Response.json({ error: validationError }, { status: 400 }), request, env);
    }

    const existing = await env.PLACEHOLDER_DB.prepare('SELECT id FROM virtual_users WHERE username = ? AND deleted_at IS NULL').bind(payload.username).first();
    if (existing) {
      return withCors(Response.json({ error: 'A virtual user with that username already exists.' }, { status: 409 }), request, env);
    }

    const now = new Date().toISOString();
    const salt = randomHex();
    const passwordHash = await hashPassword(payload.password, salt);
    const newId = crypto.randomUUID();
    await env.PLACEHOLDER_DB.prepare(`
      INSERT INTO virtual_users (
        id, username, display_name, password_salt, password_hash,
        permissions, is_active, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newId,
      payload.username,
      payload.display_name,
      salt,
      passwordHash,
      JSON.stringify(payload.permissions),
      payload.is_active ? 1 : 0,
      now,
      now,
    ).run();

    const row = await env.PLACEHOLDER_DB.prepare('SELECT * FROM virtual_users WHERE id = ?').bind(newId).first();
    return withCors(Response.json({ data: rowToVirtualUser(row) }, { status: 201 }), request, env);
  }

  if ((request.method === 'PUT' || request.method === 'PATCH') && id) {
    const existing = await env.PLACEHOLDER_DB.prepare('SELECT * FROM virtual_users WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (!existing) return withCors(Response.json({ error: 'Virtual user not found.' }, { status: 404 }), request, env);

    const body = await readJsonBody(request) || {};
    const payload = {
      username: Object.prototype.hasOwnProperty.call(body, 'username') ? normalizeVirtualUsername(body.username) : existing.username,
      display_name: Object.prototype.hasOwnProperty.call(body, 'display_name') ? String(body.display_name || '').trim() : existing.display_name,
      password: String(body.password || ''),
      permissions: Object.prototype.hasOwnProperty.call(body, 'permissions') ? normalizePermissions(body.permissions) : normalizePermissions(rowToVirtualUser(existing).permissions),
      is_active: Object.prototype.hasOwnProperty.call(body, 'is_active') ? body.is_active !== false : Boolean(existing.is_active),
    };
    const validationError = validateVirtualUser(payload);
    if (validationError) {
      return withCors(Response.json({ error: validationError }, { status: 400 }), request, env);
    }

    const duplicate = await env.PLACEHOLDER_DB.prepare('SELECT id FROM virtual_users WHERE username = ? AND id != ? AND deleted_at IS NULL').bind(payload.username, id).first();
    if (duplicate) {
      return withCors(Response.json({ error: 'A virtual user with that username already exists.' }, { status: 409 }), request, env);
    }

    const now = new Date().toISOString();
    let salt = existing.password_salt;
    let passwordHash = existing.password_hash;
    if (payload.password) {
      salt = randomHex();
      passwordHash = await hashPassword(payload.password, salt);
    }

    await env.PLACEHOLDER_DB.prepare(`
      UPDATE virtual_users
      SET username = ?, display_name = ?, password_salt = ?, password_hash = ?,
        permissions = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      payload.username,
      payload.display_name,
      salt,
      passwordHash,
      JSON.stringify(payload.permissions),
      payload.is_active ? 1 : 0,
      now,
      id,
    ).run();

    const row = await env.PLACEHOLDER_DB.prepare('SELECT * FROM virtual_users WHERE id = ?').bind(id).first();
    return withCors(Response.json({ data: rowToVirtualUser(row) }), request, env);
  }

  if (request.method === 'DELETE' && id) {
    const now = new Date().toISOString();
    await env.PLACEHOLDER_DB.prepare('UPDATE virtual_users SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, id).run();
    return withCors(Response.json({ ok: true }), request, env);
  }

  return withCors(Response.json({ error: 'Not found.' }, { status: 404 }), request, env);
}

async function handleVirtualLoginRequest(request, env, context = createRequestContext(request)) {
  const body = await readJsonBody(request.clone()) || {};
  const username = String(body.username || '');
  if (!username.startsWith(VIRTUAL_LOGIN_PREFIX)) {
    return handleRegularLoginRequest(request, env, body, context);
  }

  const dbError = requireAppDb(env);
  if (dbError) {
    logWorker(env, 'error', 'auth.virtual_login.missing_db', context);
    return withCors(dbError, request, env, context);
  }
  if (!env.UPSTREAM_ORIGIN) {
    logWorker(env, 'error', 'auth.virtual_login.missing_upstream_origin', context);
    return withCors(Response.json({ error: 'Proxy upstream is not configured.' }, { status: 500 }), request, env, context);
  }

  const upstreamAccounts = getConfiguredUpstreamAccounts(env);
  if (!upstreamAccounts.length) {
    logWorker(env, 'error', 'auth.virtual_login.missing_upstream_accounts', context);
    return withCors(Response.json({ error: 'Virtual login upstream accounts are not configured.' }, { status: 500 }), request, env, context);
  }

  await ensureVirtualUsersTable(env.PLACEHOLDER_DB);
  await ensureVirtualSessionsTable(env.PLACEHOLDER_DB);

  const virtualUsername = normalizeVirtualUsername(username);
  const virtualUser = await env.PLACEHOLDER_DB.prepare('SELECT * FROM virtual_users WHERE username = ? AND deleted_at IS NULL').bind(virtualUsername).first();
  if (!virtualUser || !virtualUser.is_active) {
    logWorker(env, 'warn', 'auth.virtual_login.virtual_user_unavailable', context, {
      virtual_username: virtualUsername,
    });
    return withCors(Response.json({ error: 'Virtual user was not found or is inactive.' }, { status: 401 }), request, env, context);
  }

  const passwordHash = await hashPassword(String(body.password || ''), virtualUser.password_salt);
  if (!safeEqual(passwordHash, virtualUser.password_hash)) {
    logWorker(env, 'warn', 'auth.virtual_login.invalid_virtual_password', context, {
      virtual_user_id: virtualUser.id,
      virtual_username: virtualUsername,
    });
    return withCors(Response.json({ error: 'Unable to sign in with those credentials.' }, { status: 401 }), request, env, context);
  }

  const rankedAccounts = await rankUpstreamAccountsForVirtualLogin(env.PLACEHOLDER_DB, upstreamAccounts);
  let lastLoginFailure = null;
  for (const upstreamAccount of rankedAccounts) {
    const upstreamAuthResult = await ensureUpstreamAccountAuth(env, upstreamAccount, {
      context,
      remember: Boolean(body.remember),
      virtualUser: rowToVirtualUser(virtualUser),
    });
    if (upstreamAuthResult.error) {
      lastLoginFailure = upstreamAuthResult.loginResult || {
        message: 'Unable to sign in with the configured upstream account.',
        status: upstreamAuthResult.error.status || 502,
      };
      continue;
    }

    const panelToken = randomHex(32);
    const tokenHash = await hashValue(panelToken);
    const now = new Date().toISOString();
    const sessionTtlSeconds = getVirtualSessionTtlSeconds(env, Boolean(body.remember));
    const expiresAt = getExpiresAtFromSeconds(sessionTtlSeconds);
    await env.PLACEHOLDER_DB.prepare(`
      INSERT OR REPLACE INTO virtual_sessions (
        token_hash, virtual_user_id, upstream_account_username,
        remember, expires_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tokenHash,
      virtualUser.id,
      upstreamAccount.username,
      Boolean(body.remember) ? 1 : 0,
      expiresAt,
      now,
      now,
    ).run();

    await markUpstreamAccountSelected(env.PLACEHOLDER_DB, upstreamAccount.username, now);

    logWorker(env, 'info', 'auth.virtual_login.success', context, {
      upstream_account_username: upstreamAccount.username,
      upstream_token_reused: Boolean(upstreamAuthResult.reused),
      virtual_user_id: virtualUser.id,
      virtual_username: virtualUsername,
    });

    return withCors(Response.json({
      access_token: panelToken,
      expires_in: sessionTtlSeconds,
      refresh_token: null,
      token_type: 'Bearer',
      upstream_account_username: upstreamAccount.username,
      virtual_user: rowToVirtualUser(virtualUser),
    }, { status: 200 }), request, env, context);
  }

  const message = lastLoginFailure?.message || 'Unable to sign in with any configured upstream account.';
  return withCors(Response.json({ error: message }, { status: lastLoginFailure?.status || 502 }), request, env, context);
}

async function handleRegularLoginRequest(request, env, body, context = createRequestContext(request)) {
  const response = await proxyApiRequest(request, env, { context });
  const masterUsername = String(env.MASTER_USERNAME || '').trim().toLowerCase();
  const loginUsername = String(body.username || '').trim().toLowerCase();
  if (!env.PLACEHOLDER_DB || !masterUsername || loginUsername !== masterUsername || !response.ok) {
    return response;
  }

  const payload = await readJsonResponse(response.clone());
  await storeMasterSession(env, payload);
  return response;
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
  if (payload.start_time && payload.end_time && parsePlaceholderTimeToMinutes(payload.end_time) <= parsePlaceholderTimeToMinutes(payload.start_time)) {
    return 'End time must be after start time.';
  }
  if (Number.isNaN(payload.estimated_price) || payload.estimated_price < 0) return 'Estimated price must be zero or greater.';
  return '';
}

function parsePlaceholderTimeToMinutes(value) {
  const normalized = String(value || '00:00').replace('.', ':');
  const [hourValue, minuteValue = '0'] = normalized.split(':').map(Number);
  const hour = Number.isFinite(hourValue) ? hourValue : 0;
  const minute = Number.isFinite(minuteValue) ? minuteValue : 0;
  if (hour === 24) return 24 * 60;
  return hour * 60 + minute;
}

function placeholderRangesOverlap(first, second) {
  const firstStart = parsePlaceholderTimeToMinutes(first.start_time);
  const firstEnd = parsePlaceholderTimeToMinutes(first.end_time);
  const secondStart = parsePlaceholderTimeToMinutes(second.start_time);
  const secondEnd = parsePlaceholderTimeToMinutes(second.end_time);
  return firstStart < secondEnd && secondStart < firstEnd;
}

function getUpstreamBookingRange(booking) {
  if (booking.start_time && booking.end_time) {
    return {
      end_time: String(booking.end_time).replace('.', ':'),
      start_time: String(booking.start_time).replace('.', ':'),
    };
  }

  if (booking.time && String(booking.time).includes('-')) {
    const [startTime, endTime] = String(booking.time).split('-');
    return {
      end_time: String(endTime || '').trim().replace('.', ':'),
      start_time: String(startTime || '').trim().replace('.', ':'),
    };
  }

  if (booking.start && booking.end) {
    return {
      end_time: epochToTimeInput(booking.end),
      start_time: epochToTimeInput(booking.start),
    };
  }

  return null;
}

function epochToTimeInput(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '';
  const date = new Date(numericValue);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function findPlaceholderOverlap(db, payload, excludeId = '') {
  const { results } = await db.prepare(`
    SELECT * FROM placeholder_bookings
    WHERE mitra_id = ? AND court_id = ? AND date = ? AND deleted_at IS NULL
  `).bind(payload.mitra_id, payload.court_id, payload.date).all();

  return (results || []).find((row) => row.id !== excludeId && placeholderRangesOverlap(payload, row));
}

async function findUpstreamBookingOverlap(request, env, payload, upstreamAuth = null) {
  if (!env.UPSTREAM_ORIGIN) return null;

  const upstreamOrigin = env.UPSTREAM_ORIGIN.replace(/\/$/, '');
  const upstreamUrl = new URL(`${upstreamOrigin}/api/admin/schedule-cal-courts`);
  upstreamUrl.searchParams.set('mitra_id', payload.mitra_id);
  upstreamUrl.searchParams.set('date', payload.date);

  const response = await fetch(upstreamUrl, {
    headers: buildUpstreamHeaders(request, upstreamOrigin, upstreamAuth),
    method: 'GET',
    redirect: 'manual',
  });

  if (!response.ok) return null;

  const schedule = await readJsonResponse(response);
  const bookings = Array.isArray(schedule?.lists) ? schedule.lists : [];
  return bookings.find((booking) => {
    if (String(booking.court_id || '') !== String(payload.court_id || '')) return false;
    const range = getUpstreamBookingRange(booking);
    return range && placeholderRangesOverlap(payload, range);
  });
}

function placeholderOverlapResponse(request, env, conflict, canViewMoney) {
  return withCors(Response.json({
    error: 'This placeholder overlaps with an existing placeholder booking.',
    code: 'PLACEHOLDER_OVERLAP',
    conflict: rowToPlaceholder(conflict, { includeMoney: canViewMoney }),
  }, { status: 409 }), request, env);
}

function upstreamBookingOverlapResponse(request, env, conflict) {
  const range = getUpstreamBookingRange(conflict);
  return withCors(Response.json({
    error: 'This placeholder overlaps with a live booking.',
    code: 'BOOKING_OVERLAP',
    conflict: {
      booking_owner: conflict.booking_owner || conflict.name || '',
      booking_type: conflict.booking_type || conflict.type || '',
      court_id: conflict.court_id || '',
      court_name: conflict.court_name || '',
      end_time: range?.end_time || '',
      id: conflict.id || conflict.trans_id || '',
      start_time: range?.start_time || '',
      trans_id: conflict.trans_id || '',
    },
  }, { status: 409 }), request, env);
}

function rowToPlaceholder(row, { includeMoney = true } = {}) {
  const placeholder = {
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
  if (!includeMoney) delete placeholder.estimated_price;
  return placeholder;
}

async function handlePlaceholderRequest(request, env, virtualContext = null) {
  const dbError = requirePlaceholderDb(env);
  if (dbError) return withCors(dbError, request, env);

  await ensurePlaceholderTable(env.PLACEHOLDER_DB);

  const accessError = requireVirtualPermission(virtualContext, 'Calendar');
  if (accessError) return withCors(accessError, request, env);

  const canViewMoney = !virtualContext?.user || hasVirtualPermission(virtualContext.user, CALENDAR_REVENUE_PERMISSION);
  const virtualDisplayName = virtualContext?.user?.display_name || '';

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

    return withCors(Response.json({
      lists: (results || []).map((row) => rowToPlaceholder(row, { includeMoney: canViewMoney })),
    }), request, env);
  }

  if (request.method === 'POST' && !id) {
    const payload = normalizePlaceholderPayload(await readJsonBody(request));
    if (virtualDisplayName) {
      payload.created_by_name = virtualDisplayName;
      payload.updated_by_name = virtualDisplayName;
    }
    if (!canViewMoney) {
      payload.estimated_price = 0;
    }
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
    return withCors(Response.json({
      data: rowToPlaceholder(row, { includeMoney: canViewMoney }),
    }, { status: 201 }), request, env);
  }

  if ((request.method === 'PUT' || request.method === 'PATCH') && id) {
    const existing = await env.PLACEHOLDER_DB.prepare('SELECT * FROM placeholder_bookings WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (!existing) return withCors(Response.json({ error: 'Placeholder booking not found.' }, { status: 404 }), request, env);

    const payload = mergePlaceholderPayload(existing, await readJsonBody(request));
    if (virtualDisplayName) {
      payload.created_by_name = existing.created_by_name;
      payload.updated_by_name = virtualDisplayName;
    }
    if (!canViewMoney) {
      payload.estimated_price = existing.estimated_price;
    }
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
    return withCors(Response.json({
      data: rowToPlaceholder(row, { includeMoney: canViewMoney }),
    }), request, env);
  }

  if (request.method === 'DELETE' && id) {
    const existing = await env.PLACEHOLDER_DB.prepare('SELECT * FROM placeholder_bookings WHERE id = ? AND deleted_at IS NULL').bind(id).first();
    if (!existing) return withCors(Response.json({ error: 'Placeholder booking not found.' }, { status: 404 }), request, env);

    // Virtual users may only delete placeholders they created. Ownership follows the same
    // display-name stamp the POST/PUT handlers write, so a virtual session can never remove
    // another operator's hold. Master/regular sessions (no virtualDisplayName) are unrestricted.
    if (virtualDisplayName && existing.created_by_name !== virtualDisplayName) {
      return withCors(Response.json({ error: 'Virtual users can only delete placeholder bookings they created.' }, { status: 403 }), request, env);
    }

    const now = new Date().toISOString();
    await env.PLACEHOLDER_DB.prepare('UPDATE placeholder_bookings SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, id).run();
    return withCors(Response.json({ ok: true }), request, env);
  }

  return withCors(Response.json({ error: 'Not found.' }, { status: 404 }), request, env);
}

function withCors(response, request, env, context = null) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) {
    headers.set(key, value);
  }
  if (context?.requestId) {
    headers.set('X-Panel-Request-ID', context.requestId);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const context = createRequestContext(request);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        return handleVirtualLoginRequest(request, env, context);
      }

      const virtualContext = await getVirtualSessionContext(request, env);

      if (url.pathname === VIRTUAL_USERS_PREFIX || url.pathname.startsWith(`${VIRTUAL_USERS_PREFIX}/`)) {
        return handleVirtualUsersRequest(request, env);
      }

      if (url.pathname === PLACEHOLDER_PREFIX || url.pathname.startsWith(`${PLACEHOLDER_PREFIX}/`)) {
        return handlePlaceholderRequest(request, env, virtualContext);
      }

      const accessError = authorizeVirtualProxyRequest(request, virtualContext);
      if (accessError) return withCors(accessError, request, env, context);

      const upstreamAuthResult = virtualContext?.user
        ? await ensureVirtualUpstreamAuth(virtualContext, env, context)
        : null;
      if (upstreamAuthResult?.error) return withCors(upstreamAuthResult.error, request, env, context);

      return proxyApiRequest(request, env, {
        context,
        transformResponse: shouldMaskCalendarMoney(url.pathname, virtualContext) ? stripMoneyFields : null,
        upstreamAuth: upstreamAuthResult?.auth,
      });
    } catch (error) {
      logWorker(env, 'error', 'worker.unhandled_exception', context, {
        error_message: error?.message || String(error),
      });
      return withCors(Response.json({ error: 'Internal server error.', request_id: context.requestId }, { status: 500 }), request, env, context);
    }
  },
};
