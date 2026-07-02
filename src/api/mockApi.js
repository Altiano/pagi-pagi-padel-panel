import {
  CALENDAR_BOOKING_PERMISSION,
  CALENDAR_REVENUE_PERMISSION,
  FALLBACK_MITRA_ID,
} from '../constants.js';
import { formatTimeInput, parseTimeToMinutes, shiftDate, shiftTime, toDateInputValue } from '../lib/datetime.js';

const MOCK_STATE_KEY = 'panel.mockApiState.v1';
const MOCK_MASTER_USERNAME = 'admin@example.com';
const MOCK_PASSWORD = 'password';
const MOCK_DELAY_MS = Number(import.meta.env.VITE_MOCK_API_DELAY_MS || 80);
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const COURTS = [
  { id: 'mock-court-1', name: 'Court 1' },
  { id: 'mock-court-2', name: 'Court 2' },
  { id: 'mock-court-3', name: 'Court 3' },
  { id: 'mock-court-4', name: 'Court 4' },
];

const PLAYERS = [
  { id: 'player-adelia', name: 'Adelia Tan', email: 'adelia@example.test', mobile: '+62 812 1000 0101' },
  { id: 'player-bayu', name: 'Bayu Prakoso', email: 'bayu@example.test', mobile: '+62 812 1000 0102' },
  { id: 'player-citra', name: 'Citra Dewi', email: 'citra@example.test', mobile: '+62 812 1000 0103' },
  { id: 'player-dimas', name: 'Dimas Wibawa', email: 'dimas@example.test', mobile: '+62 812 1000 0104' },
];

export async function mockLogin({ password, remember = false, username }) {
  await waitForMockDelay();

  const normalizedUsername = String(username || '').trim();
  if (!normalizedUsername || !password) {
    throw createMockError('Enter the mock username and password.', 422);
  }

  const state = readMockState();
  const now = Date.now();

  if (normalizedUsername.startsWith('_')) {
    const virtualUsername = normalizedUsername.replace(/^_+/, '').toLowerCase();
    const virtualUser = state.virtualUsers.find((user) => user.username.toLowerCase() === virtualUsername);
    if (!virtualUser || !virtualUser.is_active || virtualUser.password !== password) {
      throw createMockError('Mock virtual user not found or password does not match.', 401);
    }

    const session = createSession({
      remember,
      upstreamAccountUsername: chooseMockUpstreamAccount(state),
      username: virtualUser.login_username,
      virtualUserId: virtualUser.id,
    });
    state.sessions = pruneExpiredSessions(state.sessions, now).concat(session);
    writeMockState(state);

    return {
      token_type: 'Bearer',
      access_token: session.token,
      refresh_token: null,
      expires_in: Math.round((session.expiresAt - now) / 1000),
      upstream_account_username: session.upstreamAccountUsername,
      virtual_user: sanitizeVirtualUser(virtualUser),
    };
  }

  const session = createSession({
    remember,
    upstreamAccountUsername: normalizedUsername,
    username: normalizedUsername,
    virtualUserId: null,
  });
  state.sessions = pruneExpiredSessions(state.sessions, now).concat(session);
  writeMockState(state);

  return {
    token_type: 'Bearer',
    access_token: session.token,
    refresh_token: null,
    expires_in: Math.round((session.expiresAt - now) / 1000),
    upstream_account_username: normalizedUsername,
  };
}

export async function mockApiRequest(path, options = {}) {
  await waitForMockDelay();

  const url = toUrl(path);
  const method = String(options.method || 'GET').toUpperCase();
  const state = readMockState();

  if (method === 'GET' && url.pathname === '/api/panel/version') {
    return {
      data: {
        service: 'backend',
        name: 'pagi-pagi-padel-mock-api',
        runtime: 'browser-local-mock',
        version: 'mock',
        commit: 'local',
        built_at: new Date().toISOString(),
      },
    };
  }

  const session = findSession(state, options.headers);
  if (!session) throw createMockError('Mock session expired. Sign in again.', 401);

  if (method === 'GET' && url.pathname === '/api/auth/me') {
    return buildMockMeResponse(state, session);
  }

  if (url.pathname === '/api/virtual-users' || url.pathname.startsWith('/api/virtual-users/')) {
    return handleVirtualUsers({ method, options, state, url }, session);
  }

  if (url.pathname === '/api/placeholder-bookings' || url.pathname.startsWith('/api/placeholder-bookings/')) {
    ensureCalendarAccess(state, session);
    return handlePlaceholderBookings({ method, options, state, url }, session);
  }

  if (method === 'GET' && /^\/api\/admin\/mitra\/court\/[^/]+\/list$/.test(url.pathname)) {
    ensureCalendarAccess(state, session);
    return COURTS.map((court) => ({ ...court }));
  }

  if (method === 'GET' && url.pathname === '/api/admin/schedule/open-hour-date') {
    ensureCalendarAccess(state, session);
    return { data: getOpenHourForDate(url.searchParams.get('date')) };
  }

  if (method === 'GET' && url.pathname === '/api/admin/schedule-cal-courts') {
    ensureCalendarAccess(state, session);
    const date = url.searchParams.get('date') || toDateInputValue(new Date());
    return { lists: getScheduleRowsForDate(state, date, session) };
  }

  if (method === 'GET' && url.pathname === '/api/admin/player/search-player-lists') {
    ensureBookingWriteAccess(state, session);
    const query = String(url.searchParams.get('search') || '').trim().toLowerCase();
    const data = PLAYERS.filter((player) => (
      !query
      || player.name.toLowerCase().includes(query)
      || player.email.toLowerCase().includes(query)
      || player.mobile.includes(query)
    ));
    return { data, links: {}, meta: { total: data.length } };
  }

  if (method === 'POST' && url.pathname === '/api/admin/court-booking') {
    ensureBookingWriteAccess(state, session);
    return createRealBooking({ options, state });
  }

  if (method === 'POST' && url.pathname === '/api/admin/schedule-cal-courts-detail') {
    ensureBookingWriteAccess(state, session);
    const payload = await readRequestBody(options.body);
    const booking = findBookingById(state, payload.id);
    if (!booking) throw createMockError('Mock booking not found.', 404);
    return { data: buildBookingDetail(booking) };
  }

  if (method === 'POST' && url.pathname === '/api/admin/pay-court-booking') {
    ensureBookingWriteAccess(state, session);
    const payload = await readRequestBody(options.body);
    mutateBooking(state, payload.id, (booking) => {
      booking.booking_paid = true;
      booking.payment_method = payload.payment_method || 'offline';
    });
    writeMockState(state);
    return { status: true };
  }

  if (method === 'POST' && url.pathname === '/api/admin/schedule/attachments') {
    ensureBookingWriteAccess(state, session);
    const payload = await readRequestBody(options.body);
    return {
      status: true,
      message: 'Mock attachment uploaded.',
      data: [{
        id: nextId(state, 'attachment'),
        trans_id: payload.trans_id || '',
        attachment_type: payload['attachment_type[0]'] || 'payment_proof',
        attachment_name: payload['attachment_file[0]']?.name || 'mock-receipt.jpg',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    };
  }

  if (method === 'POST' && url.pathname === '/api/admin/reschedule-court-time-lists') {
    ensureBookingWriteAccess(state, session);
    const payload = await readRequestBody(options.body);
    return {
      closed: false,
      data: buildAvailableSlots(state, payload.date, payload.court_id, payload.id),
    };
  }

  if (method === 'POST' && url.pathname === '/api/admin/check-reschedule-court-price') {
    ensureBookingWriteAccess(state, session);
    const payload = await readRequestBody(options.body);
    const booking = findBookingById(state, payload.id);
    if (!booking) throw createMockError('Mock booking not found.', 404);
    const oldPrice = Number(booking.price || 0);
    const newPrice = calculateCourtPrice(payload.court_id, payload.start_hours, payload.duration);
    const adjustment = newPrice - oldPrice;
    return {
      status: true,
      old_schedule: { grand_total: oldPrice, price: oldPrice },
      new_schedule: { grand_total: newPrice, price: newPrice },
      payment_check: {
        status: adjustment > 0 ? 'underpayment' : adjustment < 0 ? 'overpayment' : 'settled',
        adjustment_amount: adjustment,
      },
    };
  }

  if (method === 'POST' && url.pathname === '/api/admin/reschedule-court-time') {
    ensureBookingWriteAccess(state, session);
    const payload = await readRequestBody(options.body);
    mutateBooking(state, payload.id, (booking) => {
      const startTime = normalizeClock(payload.start_hours, '06:00');
      const duration = Number(payload.duration || booking.duration || 60);
      const nextPrice = calculateCourtPrice(payload.court_id, startTime, duration);
      booking.date = payload.date || booking.date;
      booking.court_id = payload.court_id || booking.court_id;
      booking.duration = duration;
      booking.grand_total = nextPrice;
      booking.has_adjustment = Number(booking.price || 0) !== nextPrice;
      booking.price_parent = Number(booking.price || 0);
      booking.price = nextPrice;
      booking.time = `${startTime}-${shiftTime(startTime, duration)}`;
    });
    writeMockState(state);
    return { status: true };
  }

  if (method === 'POST' && url.pathname === '/api/admin/change-notes') {
    ensureBookingWriteAccess(state, session);
    const payload = await readRequestBody(options.body);
    mutateBooking(state, payload.id, (booking) => {
      booking.notes = payload.notes || '';
    });
    writeMockState(state);
    return { status: true };
  }

  if (method === 'POST' && url.pathname === '/api/admin/cancel-cal-court') {
    ensureBookingWriteAccess(state, session);
    const payload = await readRequestBody(options.body);
    if (!findBookingById(state, payload.id)) throw createMockError('Mock booking not found.', 404);
    state.deletedBookingIds = uniqueStrings(state.deletedBookingIds.concat(payload.id));
    state.bookings = state.bookings.filter((booking) => booking.id !== payload.id);
    writeMockState(state);
    return { status: true, data: null };
  }

  throw createMockError(`Mock API route not implemented: ${method} ${url.pathname}`, 404);
}

function handleVirtualUsers({ method, options, state, url }, session) {
  ensureMasterSession(session);

  if (method === 'GET' && url.pathname === '/api/virtual-users') {
    return { lists: state.virtualUsers.map(sanitizeVirtualUser) };
  }

  if (method === 'GET' && url.pathname === '/api/virtual-users/sessions') {
    const now = Date.now();
    const lists = pruneExpiredSessions(state.sessions, now)
      .filter((item) => item.virtualUserId)
      .map((item) => {
        const user = state.virtualUsers.find((virtualUser) => virtualUser.id === item.virtualUserId);
        return {
          virtual_user_id: item.virtualUserId,
          username: user?.username || item.username.replace(/^_+/, ''),
          login_username: user?.login_username || item.username,
          display_name: user?.display_name || item.username,
          is_active: user?.is_active !== false,
          upstream_account_username: item.upstreamAccountUsername,
          session_expires_at: new Date(item.expiresAt).toISOString(),
          session_created_at: item.createdAt,
          session_updated_at: item.createdAt,
          remember: Boolean(item.remember),
          upstream_token_expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
          upstream_token_updated_at: item.createdAt,
          upstream_token_status: 'fresh',
        };
      });
    return { lists };
  }

  const id = url.pathname.slice('/api/virtual-users'.length).replace(/^\//, '');

  if (method === 'POST' && !id) {
    return readRequestBody(options.body).then((payload) => {
      const user = normalizeVirtualUserPayload(payload);
      if (!user.username || !user.display_name || !user.password) {
        throw createMockError('Username, display name, and password are required.', 422);
      }
      if (state.virtualUsers.some((item) => item.username.toLowerCase() === user.username.toLowerCase())) {
        throw createMockError('A mock virtual user with that username already exists.', 409);
      }
      const now = new Date().toISOString();
      const saved = {
        ...user,
        id: nextId(state, 'virtual-user'),
        created_at: now,
        updated_at: now,
      };
      state.virtualUsers.push(saved);
      writeMockState(state);
      return { data: sanitizeVirtualUser(saved) };
    });
  }

  if (method === 'PUT' && id) {
    return readRequestBody(options.body).then((payload) => {
      const index = state.virtualUsers.findIndex((user) => user.id === id);
      if (index === -1) throw createMockError('Mock virtual user not found.', 404);
      const normalized = normalizeVirtualUserPayload(payload);
      const existing = state.virtualUsers[index];
      const saved = {
        ...existing,
        username: normalized.username || existing.username,
        login_username: normalized.username ? `_${normalized.username}` : existing.login_username,
        display_name: normalized.display_name || existing.display_name,
        password: normalized.password || existing.password,
        permissions: normalized.permissions,
        is_active: normalized.is_active,
        updated_at: new Date().toISOString(),
      };
      state.virtualUsers[index] = saved;
      writeMockState(state);
      return { data: sanitizeVirtualUser(saved) };
    });
  }

  if (method === 'DELETE' && id) {
    state.virtualUsers = state.virtualUsers.filter((user) => user.id !== id);
    state.sessions = state.sessions.filter((item) => item.virtualUserId !== id);
    writeMockState(state);
    return { ok: true };
  }

  throw createMockError('Mock virtual-user route not found.', 404);
}

async function handlePlaceholderBookings({ method, options, state, url }, session) {
  const id = url.pathname.slice('/api/placeholder-bookings'.length).replace(/^\//, '');

  if (method === 'GET' && !id) {
    const mitraId = url.searchParams.get('mitra_id');
    const from = url.searchParams.get('from') || url.searchParams.get('date');
    const to = url.searchParams.get('to') || from;
    const lists = state.placeholders
      .filter((booking) => !mitraId || booking.mitra_id === mitraId)
      .filter((booking) => !from || booking.date >= from)
      .filter((booking) => !to || booking.date <= to)
      .sort((first, second) => `${first.date}${first.start_time}${first.court_name}`.localeCompare(`${second.date}${second.start_time}${second.court_name}`))
      .map((booking) => applyPlaceholderRevenueMask(booking, state, session));
    return { lists };
  }

  if (method === 'POST' && !id) {
    const payload = normalizePlaceholderPayload(await readRequestBody(options.body));
    const validationError = validatePlaceholder(payload);
    if (validationError) throw createMockError(validationError, 422);

    const now = new Date().toISOString();
    const displayName = getSessionDisplayName(state, session);
    const booking = {
      ...payload,
      id: nextId(state, 'placeholder'),
      estimated_price: Math.round(payload.estimated_price),
      created_by_name: session.virtualUserId ? displayName : payload.created_by_name || displayName,
      updated_by_name: session.virtualUserId ? displayName : payload.updated_by_name || payload.created_by_name || displayName,
      created_at: now,
      updated_at: now,
    };

    state.placeholders.push(booking);
    writeMockState(state);
    return { data: applyPlaceholderRevenueMask(booking, state, session) };
  }

  if ((method === 'PUT' || method === 'PATCH') && id) {
    const index = state.placeholders.findIndex((booking) => booking.id === id);
    if (index === -1) throw createMockError('Mock placeholder booking not found.', 404);

    const existing = state.placeholders[index];
    const payload = normalizePlaceholderPayload({ ...existing, ...(await readRequestBody(options.body)) });
    const validationError = validatePlaceholder(payload);
    if (validationError) throw createMockError(validationError, 422);

    const displayName = getSessionDisplayName(state, session);
    const booking = {
      ...existing,
      ...payload,
      id,
      created_by_name: existing.created_by_name,
      estimated_price: Math.round(payload.estimated_price),
      updated_by_name: session.virtualUserId ? displayName : payload.updated_by_name || displayName,
      updated_at: new Date().toISOString(),
    };

    state.placeholders[index] = booking;
    writeMockState(state);
    return { data: applyPlaceholderRevenueMask(booking, state, session) };
  }

  if (method === 'DELETE' && id) {
    const existing = state.placeholders.find((booking) => booking.id === id);
    if (!existing) throw createMockError('Mock placeholder booking not found.', 404);
    const displayName = getSessionDisplayName(state, session);
    if (session.virtualUserId && existing.created_by_name !== displayName) {
      throw createMockError('Virtual users can only delete placeholders they created.', 403);
    }
    state.placeholders = state.placeholders.filter((booking) => booking.id !== id);
    writeMockState(state);
    return { ok: true };
  }

  throw createMockError('Mock placeholder route not found.', 404);
}

async function createRealBooking({ options, state }) {
  const payload = await readRequestBody(options.body);
  const court = COURTS.find((item) => item.id === payload.court_id) || COURTS[0];
  const duration = Number(payload.duration || 60);
  const startTime = normalizeClock(payload.start_hours, '06:00');
  const player = PLAYERS.find((item) => item.id === payload.user_id);
  const owner = payload.registered ? player?.name || 'Registered player' : String(payload.offline_user || 'Walk-in customer').trim();
  const bookingId = nextId(state, 'booking');
  const transId = nextId(state, 'trans');
  const booking = {
    id: bookingId,
    mitra_id: payload.mitra_id || FALLBACK_MITRA_ID,
    court_id: court.id,
    booking_owner: owner,
    name: owner,
    date: payload.date || toDateInputValue(new Date()),
    duration,
    price: Number(payload.harga || 0),
    booking_type: payload.registered ? 'online' : 'offline',
    type: 'booking-court',
    booking_paid: Boolean(payload.paid),
    is_paylink: false,
    notes: payload.notes || '',
    payment_method: payload.payment_method || 'offline',
    trans_id: transId,
    user_id: payload.registered ? player?.id || payload.user_id || null : null,
    user_email: payload.registered ? player?.email || '' : 'offline@example.test',
    time: `${startTime}-${shiftTime(startTime, duration)}`,
  };

  state.bookings.push(booking);
  writeMockState(state);
  return { status: true, trans_id: transId, booking_id: bookingId };
}

function readMockState() {
  const initial = buildInitialState();
  try {
    const parsed = JSON.parse(localStorage.getItem(MOCK_STATE_KEY) || '{}');
    return {
      bookings: Array.isArray(parsed.bookings) ? parsed.bookings : initial.bookings,
      deletedBookingIds: Array.isArray(parsed.deletedBookingIds) ? parsed.deletedBookingIds : initial.deletedBookingIds,
      placeholders: Array.isArray(parsed.placeholders) ? parsed.placeholders : initial.placeholders,
      sequence: Number(parsed.sequence || initial.sequence),
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : initial.sessions,
      virtualUsers: Array.isArray(parsed.virtualUsers) ? parsed.virtualUsers : initial.virtualUsers,
    };
  } catch {
    return initial;
  }
}

function writeMockState(state) {
  localStorage.setItem(MOCK_STATE_KEY, JSON.stringify(state));
}

function buildInitialState() {
  const today = toDateInputValue(new Date());
  const tomorrow = shiftDate(today, 1);
  const now = new Date().toISOString();

  return {
    bookings: [],
    deletedBookingIds: [],
    placeholders: [
      {
        id: 'seed-placeholder-waitlist',
        mitra_id: FALLBACK_MITRA_ID,
        court_id: COURTS[0].id,
        court_name: COURTS[0].name,
        date: today,
        start_time: '07:30',
        end_time: '08:30',
        customer_name: 'Waitlist - Tara',
        customer_contact: '+62 812 2100 0201',
        estimated_price: 210000,
        status: 'negotiating',
        notes: 'Wants the morning regular slot if it opens.',
        created_by_name: 'Front desk',
        updated_by_name: 'Front desk',
        confirmed_booking_id: '',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'seed-placeholder-stack-a',
        mitra_id: FALLBACK_MITRA_ID,
        court_id: COURTS[2].id,
        court_name: COURTS[2].name,
        date: today,
        start_time: '16:00',
        end_time: '17:00',
        customer_name: 'Raka Team',
        customer_contact: '+62 812 2100 0202',
        estimated_price: 185000,
        status: 'awaiting_payment',
        notes: 'Holding while team confirms payment.',
        created_by_name: 'Mock Admin',
        updated_by_name: 'Mock Admin',
        confirmed_booking_id: '',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'seed-placeholder-stack-b',
        mitra_id: FALLBACK_MITRA_ID,
        court_id: COURTS[2].id,
        court_name: COURTS[2].name,
        date: today,
        start_time: '16:00',
        end_time: '17:00',
        customer_name: 'Mira Group',
        customer_contact: '+62 812 2100 0203',
        estimated_price: 185000,
        status: 'ready_to_confirm',
        notes: 'Second candidate for the same slot.',
        created_by_name: 'Mock Admin',
        updated_by_name: 'Mock Admin',
        confirmed_booking_id: '',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'seed-placeholder-tomorrow',
        mitra_id: FALLBACK_MITRA_ID,
        court_id: COURTS[1].id,
        court_name: COURTS[1].name,
        date: tomorrow,
        start_time: '09:00',
        end_time: '10:30',
        customer_name: 'Maya Putri',
        customer_contact: 'maya@example.test',
        estimated_price: 280000,
        status: 'ready_to_confirm',
        notes: 'Convert after receipt lands.',
        created_by_name: 'Front desk',
        updated_by_name: 'Front desk',
        confirmed_booking_id: '',
        created_at: now,
        updated_at: now,
      },
    ],
    sequence: 1,
    sessions: [],
    virtualUsers: [
      {
        id: 'virtual-frontdesk',
        username: 'frontdesk',
        login_username: '_frontdesk',
        display_name: 'Front desk',
        password: MOCK_PASSWORD,
        permissions: ['Calendar', CALENDAR_BOOKING_PERMISSION, CALENDAR_REVENUE_PERMISSION, 'Setting'],
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'virtual-readonly',
        username: 'readonly',
        login_username: '_readonly',
        display_name: 'Read-only staff',
        password: MOCK_PASSWORD,
        permissions: ['Calendar'],
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ],
  };
}

function createSession({ remember, upstreamAccountUsername, username, virtualUserId }) {
  const now = Date.now();
  const ttl = remember ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS;
  return {
    token: `mock-token-${now.toString(36)}-${Math.random().toString(36).slice(2)}`,
    username,
    virtualUserId,
    upstreamAccountUsername,
    remember: Boolean(remember),
    createdAt: new Date(now).toISOString(),
    expiresAt: now + ttl,
  };
}

function pruneExpiredSessions(sessions, now = Date.now()) {
  return (sessions || []).filter((session) => Number(session.expiresAt || 0) > now);
}

function chooseMockUpstreamAccount(state) {
  const accountNames = ['mock-upstream-a@example.test', 'mock-upstream-b@example.test'];
  const activeVirtualSessions = pruneExpiredSessions(state.sessions).filter((session) => session.virtualUserId);
  const counts = new Map(accountNames.map((account) => [account, 0]));
  activeVirtualSessions.forEach((session) => counts.set(
    session.upstreamAccountUsername,
    (counts.get(session.upstreamAccountUsername) || 0) + 1,
  ));
  return [...counts.entries()].sort((first, second) => first[1] - second[1])[0][0];
}

function findSession(state, headers) {
  const authorization = getHeader(headers, 'Authorization');
  const token = String(authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return pruneExpiredSessions(state.sessions).find((session) => session.token === token) || null;
}

function buildMockMeResponse(state, session) {
  const displayName = getSessionDisplayName(state, session);
  return {
    data: {
      id: session.virtualUserId || 'mock-admin',
      name: displayName,
      email: session.virtualUserId ? `${session.username.replace(/^_+/, '')}@example.test` : session.username,
      mitra_id: FALLBACK_MITRA_ID,
      mitra: { id: FALLBACK_MITRA_ID, name: 'Pagi Pagi Padel' },
    },
  };
}

function getSessionDisplayName(state, session) {
  const virtualUser = getSessionVirtualUser(state, session);
  if (virtualUser) return virtualUser.display_name;
  if (session.username === MOCK_MASTER_USERNAME) return 'Mock Admin';
  return session.username;
}

function getSessionVirtualUser(state, session) {
  if (!session.virtualUserId) return null;
  return state.virtualUsers.find((user) => user.id === session.virtualUserId) || null;
}

function ensureMasterSession(session) {
  if (session.virtualUserId || session.username !== MOCK_MASTER_USERNAME) {
    throw createMockError(`Sign in as ${MOCK_MASTER_USERNAME} to manage mock virtual users.`, 403);
  }
}

function ensureCalendarAccess(state, session) {
  if (!session.virtualUserId) return;
  const user = getSessionVirtualUser(state, session);
  if (!user?.permissions?.includes('Calendar')) {
    throw createMockError('This mock virtual user does not have Calendar access.', 403);
  }
}

function ensureBookingWriteAccess(state, session) {
  ensureCalendarAccess(state, session);
  if (!session.virtualUserId) return;
  const user = getSessionVirtualUser(state, session);
  if (!user?.permissions?.includes(CALENDAR_BOOKING_PERMISSION)) {
    throw createMockError('This mock virtual user needs Calendar booking permission.', 403);
  }
}

function canViewRevenue(state, session) {
  if (!session.virtualUserId) return true;
  return Boolean(getSessionVirtualUser(state, session)?.permissions?.includes(CALENDAR_REVENUE_PERMISSION));
}

function getScheduleRowsForDate(state, date, session) {
  return getAllBookingsForDate(state, date)
    .sort((first, second) => parseTimeToMinutes(first.time) - parseTimeToMinutes(second.time))
    .map((booking) => applyBookingRevenueMask(booking, state, session));
}

function getAllBookingsForDate(state, date) {
  const overriddenIds = new Set(state.bookings.map((booking) => booking.id));
  const deletedIds = new Set(state.deletedBookingIds || []);
  const seedBookings = buildSeedBookings(date).filter((booking) => !overriddenIds.has(booking.id) && !deletedIds.has(booking.id));
  const storedBookings = state.bookings.filter((booking) => booking.date === date && !deletedIds.has(booking.id));
  return [...seedBookings, ...storedBookings];
}

function buildSeedBookings(date) {
  const day = new Date(`${date}T00:00:00`).getDay();
  const weekday = day >= 1 && day <= 5;
  const weekend = day === 0 || day === 6;
  const rows = [
    buildBooking({
      date,
      id: `mock-${date}-court-1-0700`,
      courtId: COURTS[0].id,
      owner: 'Anisa Hartono',
      time: '07:00-08:30',
      price: 330000,
      bookingType: 'online',
      paid: true,
      notes: 'Morning regular. Good regression row for waitlist conflicts.',
      email: 'anisa@example.test',
    }),
    buildBooking({
      date,
      id: `mock-${date}-court-2-1000`,
      courtId: COURTS[1].id,
      owner: 'Budi Santoso',
      time: '10:00-11:00',
      price: 185000,
      bookingType: 'offline',
      paid: false,
      notes: 'Awaiting transfer proof.',
      email: 'budi@example.test',
    }),
    buildBooking({
      date,
      id: `mock-${date}-court-4-1430`,
      courtId: COURTS[3].id,
      owner: 'Citra Dewi',
      time: '14:30-16:00',
      price: 300000,
      bookingType: 'online',
      paid: true,
      notes: '',
      email: 'citra@example.test',
    }),
  ];

  if (weekday) {
    rows.push(buildBooking({
      date,
      id: `mock-${date}-court-3-1900`,
      courtId: COURTS[2].id,
      owner: 'Coach Reza Class',
      time: '19:00-20:30',
      price: 450000,
      bookingType: 'coach',
      type: 'coaching',
      paid: true,
      notes: 'Evening coaching block.',
      email: 'coach@example.test',
    }));
  }

  if (weekend) {
    rows.push(buildBooking({
      date,
      id: `mock-${date}-court-3-1800`,
      courtId: COURTS[2].id,
      owner: 'Weekend Mini Tournament',
      time: '18:00-20:00',
      price: 720000,
      bookingType: 'event',
      type: 'event',
      paid: true,
      notes: 'Weekend event row for service/event styling.',
      email: 'events@example.test',
    }));
  }

  return rows;
}

function buildBooking({ bookingType, courtId, date, email, id, notes, owner, paid, price, time, type = 'booking-court' }) {
  const [startTime, endTime] = time.split('-');
  return {
    id,
    mitra_id: FALLBACK_MITRA_ID,
    court_id: courtId,
    booking_owner: owner,
    name: owner,
    date,
    duration: parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime),
    price,
    grand_total: price,
    booking_type: bookingType,
    type,
    booking_paid: paid,
    is_paylink: !paid,
    notes,
    payment_method: paid ? 'offline' : '',
    trans_id: `TRX-${id.replace(/[^a-z0-9]/gi, '').slice(-18).toUpperCase()}`,
    user_email: email,
    time,
  };
}

function findBookingById(state, id) {
  const stored = state.bookings.find((booking) => booking.id === id);
  if (stored) return clone(stored);
  const match = String(id || '').match(/^mock-(\d{4}-\d{2}-\d{2})-/);
  if (!match || state.deletedBookingIds.includes(id)) return null;
  return buildSeedBookings(match[1]).find((booking) => booking.id === id) || null;
}

function mutateBooking(state, id, mutator) {
  const booking = findBookingById(state, id);
  if (!booking) throw createMockError('Mock booking not found.', 404);
  mutator(booking);
  upsertBooking(state, booking);
  return booking;
}

function upsertBooking(state, booking) {
  const index = state.bookings.findIndex((item) => item.id === booking.id);
  if (index === -1) {
    state.bookings.push(booking);
  } else {
    state.bookings[index] = booking;
  }
}

function buildBookingDetail(booking) {
  return {
    ...booking,
    customer: {
      name: booking.booking_owner || booking.name,
      email: booking.user_email || 'offline@example.test',
    },
    players: booking.user_id ? PLAYERS.filter((player) => player.id === booking.user_id) : [],
    total_price: booking.price,
  };
}

function buildAvailableSlots(state, date, courtId, currentBookingId) {
  const openHour = getOpenHourForDate(date);
  const openMinutes = parseTimeToMinutes(openHour.open_hours);
  const closeMinutes = parseTimeToMinutes(openHour.close_hours);
  const bookings = getAllBookingsForDate(state, date)
    .filter((booking) => booking.court_id === courtId && booking.id !== currentBookingId);
  const slots = [];

  for (let minute = openMinutes; minute <= closeMinutes - 60; minute += 60) {
    const slot = { start: minute, end: minute + 60 };
    const blocked = bookings.some((booking) => {
      const [start, end] = String(booking.time || '').split('-').map(parseTimeToMinutes);
      return slot.start < end && start < slot.end;
    });
    if (!blocked) {
      slots.push({ time: formatTimeInput(minute).replace(':', '.') });
    }
  }

  return slots.slice(0, 12);
}

function getOpenHourForDate(dateValue) {
  const day = new Date(`${dateValue || toDateInputValue(new Date())}T00:00:00`).getDay();
  return day === 0
    ? { open_hours: '07:00', close_hours: '22:00' }
    : { open_hours: '06:00', close_hours: '24:00' };
}

function calculateCourtPrice(courtId, startTime, duration) {
  const startMinutes = parseTimeToMinutes(startTime || '06:00');
  const courtIndex = Math.max(COURTS.findIndex((court) => court.id === courtId), 0);
  const hourlyBase = startMinutes >= 17 * 60 ? 245000 : 185000;
  const courtPremium = courtIndex * 10000;
  return Math.round((hourlyBase + courtPremium) * (Number(duration || 60) / 60));
}

function applyBookingRevenueMask(booking, state, session) {
  const copy = clone(booking);
  if (canViewRevenue(state, session)) return copy;
  return {
    ...copy,
    grand_total: null,
    price: null,
    price_parent: null,
    total_price: null,
  };
}

function applyPlaceholderRevenueMask(booking, state, session) {
  const copy = clone(booking);
  if (canViewRevenue(state, session)) return copy;
  return { ...copy, estimated_price: null };
}

function normalizeVirtualUserPayload(payload = {}) {
  const username = String(payload.username || '').replace(/^_+/, '').trim();
  return {
    username,
    login_username: username ? `_${username}` : '',
    display_name: String(payload.display_name || '').trim(),
    password: String(payload.password || ''),
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    is_active: payload.is_active !== false,
  };
}

function sanitizeVirtualUser(user) {
  return {
    id: user.id,
    username: user.username,
    login_username: user.login_username || `_${user.username}`,
    display_name: user.display_name,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    is_active: user.is_active !== false,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function normalizePlaceholderPayload(payload = {}) {
  return {
    mitra_id: String(payload.mitra_id || '').trim(),
    court_id: String(payload.court_id || '').trim(),
    court_name: String(payload.court_name || '').trim(),
    date: String(payload.date || '').trim(),
    start_time: normalizeClock(payload.start_time, ''),
    end_time: normalizeClock(payload.end_time, ''),
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

async function readRequestBody(body) {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body || '{}');
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return Object.fromEntries([...body.entries()].map(([key, value]) => [
      key,
      typeof File !== 'undefined' && value instanceof File
        ? { name: value.name, size: value.size, type: value.type }
        : value,
    ]));
  }
  return body;
}

function getHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || '';
  return headers[name] || headers[name.toLowerCase()] || '';
}

function toUrl(path) {
  return new URL(path, window.location.origin);
}

function normalizeClock(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return formatTimeInput(parseTimeToMinutes(raw));
}

function nextId(state, prefix) {
  state.sequence = Number(state.sequence || 0) + 1;
  return `${prefix}-${Date.now().toString(36)}-${state.sequence}`;
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || '')).filter(Boolean))];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMockError(message, status = 400, code = '') {
  const error = new Error(message);
  error.status = status;
  error.payload = { message, code };
  error.code = code;
  return error;
}

function waitForMockDelay() {
  if (!MOCK_DELAY_MS || MOCK_DELAY_MS < 1) return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, MOCK_DELAY_MS);
  });
}
