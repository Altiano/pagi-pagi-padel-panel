import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Copy,
  ExternalLink,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { clearStoredAuth, getStoredAuth, login } from './api/auth.js';
import { apiRequest } from './api/client.js';

const navGroups = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard },
      { label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Service',
    items: [
      { label: 'Court Prices', icon: CircleDollarSign },
      { label: 'Event', icon: ClipboardList },
      { label: 'Coach', icon: ShieldCheck },
      { label: 'Add On', icon: Sparkles },
    ],
  },
  {
    label: 'Customer',
    items: [{ label: 'Customers', icon: Users }],
  },
  {
    label: 'Admin',
    items: [{ label: 'Setting', icon: Settings }],
  },
];

const FALLBACK_MITRA_ID = 'a074e244-76c0-4587-9dff-0c7833f0bfa3';
const DAY_MS = 24 * 60 * 60 * 1000;

export function App() {
  const [auth, setAuth] = useState(() => getStoredAuth());
  const isMobileExperiment = window.location.pathname.startsWith('/mobile');

  if (!auth) {
    return <LoginScreen isMobileExperiment={isMobileExperiment} onAuthenticated={setAuth} />;
  }

  return <PanelShell auth={auth} isMobileExperiment={isMobileExperiment} onLogout={() => {
    clearStoredAuth();
    setAuth(null);
  }} />;
}

function LoginScreen({ isMobileExperiment = false, onAuthenticated }) {
  const [form, setForm] = useState({ username: '', password: '', remember: false });
  const [status, setStatus] = useState({ state: 'idle', message: '' });

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus({ state: 'loading', message: 'Signing in...' });

    try {
      const auth = await login(form);
      setStatus({ state: 'success', message: 'Signed in.' });
      onAuthenticated(auth);
    } catch (error) {
      setStatus({ state: 'error', message: error.message });
    }
  }

  return (
    <main className={`login-page ${isMobileExperiment ? 'mobile-experiment mobile-login' : ''}`}>
      {isMobileExperiment ? (
        <div className="experiment-banner">Mobile experiment · /mobile</div>
      ) : null}
      <section className="login-panel" aria-label="Sign in">
        <div className="login-card">
          <div className="form-heading">
            <div className="icon-bubble">
              <LockKeyhole size={22} />
            </div>
            <div>
              <h2>Sign in</h2>
              <p>Use your panel credentials.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <label>
              Username
              <input
                autoComplete="username"
                name="username"
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="Enter username"
                required
                value={form.username}
              />
            </label>

            <label>
              Password
              <input
                autoComplete="current-password"
                name="password"
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Enter password"
                required
                type="password"
                value={form.password}
              />
            </label>

            <label className="check-row">
              <input
                checked={form.remember}
                onChange={(event) => setForm((current) => ({ ...current, remember: event.target.checked }))}
                type="checkbox"
              />
              Remember this session
            </label>

            <button className="primary-button" disabled={status.state === 'loading'} type="submit">
              {status.state === 'loading' ? 'Signing in...' : 'Login'}
              <ChevronRight size={18} />
            </button>

            {status.message ? (
              <p className={`status-line ${status.state}`}>{status.message}</p>
            ) : null}
          </form>
        </div>
      </section>
    </main>
  );
}

function PanelShell({ auth, isMobileExperiment = false, onLogout }) {
  const [meState, setMeState] = useState({ loading: true, data: null, error: '' });
  const [activeNav, setActiveNav] = useState('Calendar');

  useEffect(() => {
    let active = true;
    apiRequest('/api/auth/me')
      .then((data) => {
        if (active) setMeState({ loading: false, data, error: '' });
      })
      .catch((error) => {
        if (active) setMeState({ loading: false, data: null, error: error.message });
      });

    return () => {
      active = false;
    };
  }, []);

  const displayName = meState.data?.data?.name || meState.data?.name || auth.username || 'Owner';
  const mitraId = findMitraId(meState.data) || FALLBACK_MITRA_ID;

  return (
    <main className={`panel-shell ${isMobileExperiment ? 'mobile-experiment' : ''}`}>
      {isMobileExperiment ? (
        <div className="experiment-banner">Mobile-friendly experiment · live at /mobile</div>
      ) : null}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark small">PP</span>
          <div>
            <strong>pagipagipadel</strong>
            <span>Club panel</span>
          </div>
        </div>

        <nav>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    className={activeNav === item.label ? 'active' : ''}
                    key={item.label}
                    onClick={() => setActiveNav(item.label)}
                    type="button"
                  >
                    <Icon size={17} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <section className="content">
        {activeNav === 'Calendar' ? (
          <CalendarPage displayName={displayName} mitraId={mitraId} onLogout={onLogout} />
        ) : (
          <PlaceholderPage
            activeNav={activeNav}
            displayName={displayName}
            meState={meState}
            onLogout={onLogout}
          />
        )}
      </section>
    </main>
  );
}

function PlaceholderPage({ activeNav, displayName, meState, onLogout }) {
  return (
    <>
      <header className="topbar">
        <div>
          <h1>Good Night, {displayName}!</h1>
          <p>{activeNav} is queued up next. Calendar is the first fully wired feature module.</p>
        </div>
        <button className="logout-button" onClick={onLogout} type="button">
          <LogOut size={17} />
          Logout
        </button>
      </header>

      <section className="handoff-grid">
        <article>
          <span>Authentication</span>
          <strong>{meState.loading ? 'Checking session...' : meState.error ? 'Needs attention' : 'Connected'}</strong>
          <p>{meState.error || 'The client stores the bearer token and sends it through Authorization headers.'}</p>
        </article>
        <article>
          <span>Next build target</span>
          <strong>{activeNav}</strong>
          <p>We can wire this screen from the captured API map after Calendar.</p>
        </article>
        <article>
          <span>Backend</span>
          <strong>Configured panel API</strong>
          <p>Vite proxies local `/api` calls to the production panel API during development.</p>
        </article>
      </section>
    </>
  );
}

function CalendarPage({ displayName, mitraId, onLogout }) {
  const [view, setView] = useState('week');
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({ loading: true, error: '', courts: [], openHour: null, bookingsByDate: {} });
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [hiddenAboveCount, setHiddenAboveCount] = useState(0);
  const [hiddenBelowCount, setHiddenBelowCount] = useState(0);
  const calendarPanelRef = useRef(null);

  const weekDays = getWeekDays(selectedDate);
  const activeBookings = state.bookingsByDate[selectedDate] || [];
  const selectedDaySummary = summarizeDay(activeBookings, state.openHour);
  const weekSummary = summarizeWeek(weekDays, state.bookingsByDate, state.openHour);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    setSelectedBooking(null);

    loadCalendarData({ mitraId, selectedDate, weekDays })
      .then((data) => {
        if (active) setState({ loading: false, error: '', ...data });
      })
      .catch((error) => {
        if (active) setState((current) => ({ ...current, loading: false, error: error.message }));
      });

    return () => {
      active = false;
    };
  }, [mitraId, selectedDate, refreshKey]);

  useEffect(() => {
    const panel = calendarPanelRef.current;
    if (!panel || view !== 'day' || state.loading) {
      setHiddenAboveCount(0);
      setHiddenBelowCount(0);
      return undefined;
    }

    const updateHiddenBookings = () => {
      const panelRect = panel.getBoundingClientRect();
      const blocks = Array.from(panel.querySelectorAll('.booking-block'));
      const above = blocks.filter((block) => block.getBoundingClientRect().bottom < panelRect.top + 24);
      const below = blocks.filter((block) => block.getBoundingClientRect().top > panelRect.bottom - 24);
      setHiddenAboveCount(above.length);
      setHiddenBelowCount(below.length);
    };

    updateHiddenBookings();
    panel.addEventListener('scroll', updateHiddenBookings, { passive: true });
    window.addEventListener('resize', updateHiddenBookings);

    return () => {
      panel.removeEventListener('scroll', updateHiddenBookings);
      window.removeEventListener('resize', updateHiddenBookings);
    };
  }, [view, state.loading, activeBookings]);

  function moveDate(days) {
    setSelectedDate((current) => shiftDate(current, days));
  }

  function moveWeek(weeks) {
    setSelectedDate((current) => shiftDate(current, weeks * 7));
  }

  return (
    <div className={`calendar-page ${view}-mode`}>
      <header className="calendar-topbar">
        <div>
          <h1>Calendar</h1>
          <p>{view === 'day' ? 'Manage daily court bookings and availability.' : 'Plan weekly occupancy and jump into daily operations.'}</p>
        </div>
        <div className="topbar-actions">
          <span className="user-chip">{displayName}</span>
          <button className="logout-button" onClick={onLogout} type="button">
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </header>

      <section className="calendar-toolbar">
        <div className="segmented-control">
          <button className={view === 'day' ? 'selected' : ''} onClick={() => setView('day')} type="button">Day</button>
          <button className={view === 'week' ? 'selected' : ''} onClick={() => setView('week')} type="button">Week</button>
        </div>
        <div className="date-controls">
          <button onClick={() => (view === 'day' ? moveDate(-1) : moveWeek(-1))} type="button">
            <ChevronLeft size={16} />
          </button>
          <input
            aria-label="Selected date"
            onChange={(event) => setSelectedDate(event.target.value)}
            type="date"
            value={selectedDate}
          />
          <button onClick={() => (view === 'day' ? moveDate(1) : moveWeek(1))} type="button">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => setSelectedDate(toDateInputValue(new Date()))} type="button">Today</button>
        </div>
        <div className="calendar-filters">
          <span>All courts</span>
          <span>All booking types</span>
          <button onClick={() => setRefreshKey((current) => current + 1)} type="button">
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="open-hours">
          Open {state.openHour?.open_hours || '06:00'} - {state.openHour?.close_hours || '24:00'}
        </div>
      </section>

      {state.error ? (
        <div className="calendar-error">
          <strong>Could not load calendar.</strong>
          <p>{state.error}</p>
        </div>
      ) : null}

      <section className="calendar-layout">
        <div className="calendar-main-panel">
          <div className="calendar-scroll-area" ref={calendarPanelRef}>
            {state.loading ? (
              <div className="calendar-loading">Loading calendar...</div>
            ) : view === 'day' ? (
              <DayCalendar
                bookings={activeBookings}
                courts={state.courts}
                openHour={state.openHour}
                selectedBooking={selectedBooking}
                selectedDate={selectedDate}
                onSelectBooking={setSelectedBooking}
              />
            ) : (
              <WeekCalendar
                bookingsByDate={state.bookingsByDate}
                courts={state.courts}
                openHour={state.openHour}
                selectedDate={selectedDate}
                weekDays={weekDays}
                onSelectBooking={setSelectedBooking}
                onSelectDate={setSelectedDate}
                onSwitchDay={() => setView('day')}
              />
            )}
          </div>
          {view === 'day' && hiddenAboveCount > 0 ? (
            <div className="scroll-more-indicator above">
              <span>{hiddenAboveCount} booking{hiddenAboveCount > 1 ? 's' : ''} above</span>
              <ChevronRight size={16} />
            </div>
          ) : null}
          {view === 'day' && hiddenBelowCount > 0 ? (
            <div className="scroll-more-indicator below">
              <span>{hiddenBelowCount} booking{hiddenBelowCount > 1 ? 's' : ''} below</span>
              <ChevronRight size={16} />
            </div>
          ) : null}
        </div>
        <CalendarDetailPanel
          booking={selectedBooking}
          selectedDate={selectedDate}
          selectedDaySummary={selectedDaySummary}
          view={view}
          weekSummary={weekSummary}
          onOpenDay={() => setView('day')}
        />
      </section>
    </div>
  );
}

function DayCalendar({ bookings, courts, openHour, selectedBooking, selectedDate, onSelectBooking }) {
  const hours = buildHours(openHour);
  const intervalCount = Math.max(hours.length - 1, 1);
  const startMinutes = parseTimeToMinutes(openHour?.open_hours || '06:00');
  const endMinutes = parseTimeToMinutes(openHour?.close_hours || '24:00');
  const totalMinutes = Math.max(endMinutes - startMinutes, 60);

  return (
    <div className="day-calendar">
      <div className="day-calendar-header">
        <div>
          <span>{formatLongDate(selectedDate)}</span>
          <strong>{bookings.length} bookings</strong>
        </div>
        {courts.map((court) => <div key={court.id}>{court.name}</div>)}
      </div>
      <div
        className="day-calendar-grid"
        style={{ '--court-count': courts.length || 1, '--time-slot-count': intervalCount }}
      >
        <div className="time-axis">
          {hours.map((hour, index) => (
            <span key={hour} style={{ top: `${(index / intervalCount) * 100}%` }}>{hour}</span>
          ))}
        </div>
        {courts.map((court) => (
          <div className="court-lane" key={court.id}>
            {hours.slice(0, -1).map((hour) => <span className="hour-line" key={hour} />)}
            {bookings.filter((booking) => booking.court_id === court.id).map((booking) => {
              const position = getBookingPosition(booking, startMinutes, totalMinutes);
              return (
                <button
                  className={`booking-block ${getBookingTone(booking)} ${selectedBooking?.id === booking.id ? 'selected' : ''}`}
                  key={booking.id}
                  onClick={() => onSelectBooking(booking)}
                  style={{ top: `${position.top}%`, height: `${position.height}%` }}
                  type="button"
                >
                  <strong>{booking.booking_owner || booking.name}</strong>
                  <span>{booking.time}</span>
                  <small>{formatCurrency(booking.price)} · {booking.booking_type || 'booking'}</small>
                  {booking.notes ? <em>Notes</em> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekCalendar({ bookingsByDate, courts, openHour, selectedDate, weekDays, onSelectBooking, onSelectDate, onSwitchDay }) {
  return (
    <div className="week-calendar">
      {weekDays.map((date) => {
        const bookings = bookingsByDate[date] || [];
        const summary = summarizeDay(bookings, openHour);
        return (
          <article className={`week-day ${date === selectedDate ? 'selected' : ''}`} key={date}>
            <button className="week-day-header" onClick={() => onSelectDate(date)} type="button">
              <span>{formatWeekday(date)}</span>
              <strong>{formatDayNumber(date)}</strong>
              <small>{bookings.length} bookings</small>
              <div className="occupancy-bar">
                <span style={{ width: `${summary.occupancy}%` }} />
              </div>
            </button>
            <div className="week-day-metrics">
              <span>{summary.bookedHours.toFixed(1)}h booked</span>
              <span>{formatCurrency(summary.revenue)}</span>
            </div>
            <div className="week-court-list">
              {courts.map((court) => {
                const courtBookings = bookings.filter((booking) => booking.court_id === court.id);
                const timelineEntries = buildCourtTimelineEntries(courtBookings, openHour);
                return (
                  <div className="week-court" key={court.id}>
                    <p>{court.name}</p>
                    {timelineEntries.length ? timelineEntries.map((entry) => (
                      entry.type === 'availability' ? (
                        <span className="availability-gap" key={entry.id}>
                          <span>Available</span>
                          <strong>{entry.label}</strong>
                        </span>
                      ) : (
                        <button className={getBookingTone(entry.booking)} key={entry.booking.id} onClick={() => onSelectBooking(entry.booking)} type="button">
                          <span>{getStartLabel(entry.booking)}</span>
                          <strong>{entry.booking.booking_owner || entry.booking.name}</strong>
                        </button>
                      )
                    )) : <span className="empty-slot">Available</span>}
                  </div>
                );
              })}
            </div>
            <button className="open-day-link" onClick={() => {
              onSelectDate(date);
              onSwitchDay();
            }} type="button">Open day view</button>
          </article>
        );
      })}
    </div>
  );
}

function CalendarDetailPanel({ booking, selectedDate, selectedDaySummary, view, weekSummary, onOpenDay }) {
  if (booking) {
    return (
      <aside className="calendar-detail">
        <span className="panel-label">Booking detail</span>
        <h2>{booking.booking_owner || booking.name}</h2>
        <dl>
          <div><dt>Court</dt><dd>{booking.court_name || booking.court_id}</dd></div>
          <div><dt>Time</dt><dd>{booking.time}</dd></div>
          <div><dt>Duration</dt><dd>{booking.duration || getDurationMinutes(booking)} min</dd></div>
          <div><dt>Type</dt><dd>{booking.booking_type || booking.type}</dd></div>
          <div><dt>Payment</dt><dd>{booking.booking_paid ? 'Paid' : 'Unpaid'}</dd></div>
          <div><dt>Price</dt><dd>{formatCurrency(booking.price)}</dd></div>
          <div><dt>Notes</dt><dd>{booking.notes || 'No notes'}</dd></div>
          <div><dt>Transaction ID</dt><dd>{booking.trans_id || '-'}</dd></div>
        </dl>
        <div className="detail-actions">
          <button type="button"><ExternalLink size={15} /> View transaction</button>
          <button onClick={() => copyText(booking.trans_id)} type="button"><Copy size={15} /> Copy ID</button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="calendar-detail">
      <span className="panel-label">{view === 'week' ? 'Week summary' : 'Day summary'}</span>
      <h2>{view === 'week' ? formatWeekRange(selectedDate) : formatLongDate(selectedDate)}</h2>
      <dl>
        <div><dt>Total bookings</dt><dd>{view === 'week' ? weekSummary.totalBookings : selectedDaySummary.bookingCount}</dd></div>
        <div><dt>Booked hours</dt><dd>{(view === 'week' ? weekSummary.bookedHours : selectedDaySummary.bookedHours).toFixed(1)}h</dd></div>
        <div><dt>Estimated revenue</dt><dd>{formatCurrency(view === 'week' ? weekSummary.revenue : selectedDaySummary.revenue)}</dd></div>
        <div><dt>Busiest day</dt><dd>{weekSummary.busiestDay || 'No bookings'}</dd></div>
        <div><dt>Busiest band</dt><dd>{weekSummary.busiestBand || 'No bookings'}</dd></div>
      </dl>
      <div className="detail-actions">
        <button onClick={onOpenDay} type="button"><CalendarDays size={15} /> Open day view</button>
        <button type="button"><ExternalLink size={15} /> Export week</button>
      </div>
    </aside>
  );
}

async function loadCalendarData({ mitraId, selectedDate, weekDays }) {
  const [courts, openHour, weekResponses] = await Promise.all([
    apiRequest(`/api/admin/mitra/court/${mitraId}/list`),
    apiRequest(`/api/admin/schedule/open-hour-date?mitra_id=${mitraId}&date=${selectedDate}`),
    Promise.all(weekDays.map((date) => apiRequest(`/api/admin/schedule-cal-courts?mitra_id=${mitraId}&date=${date}`)
      .then((response) => [date, response?.lists || []]))),
  ]);

  const courtList = Array.isArray(courts) ? courts : [];
  const courtNames = new Map(courtList.map((court) => [court.id, court.name]));
  const bookingsByDate = Object.fromEntries(weekResponses.map(([date, bookings]) => [
    date,
    bookings.map((booking) => ({ ...booking, court_name: courtNames.get(booking.court_id) })),
  ]));

  return {
    courts: courtList,
    openHour: openHour?.data || { open_hours: '06:00', close_hours: '24:00' },
    bookingsByDate,
  };
}

function findMitraId(value, depth = 0) {
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

function toDateInputValue(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function shiftDate(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function getWeekDays(dateValue) {
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

function formatLongDate(dateValue) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${dateValue}T00:00:00`));
}

function formatWeekday(dateValue) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(`${dateValue}T00:00:00`));
}

function formatDayNumber(dateValue) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(`${dateValue}T00:00:00`));
}

function formatWeekRange(dateValue) {
  const days = getWeekDays(dateValue);
  return `${formatDayNumber(days[0])} - ${formatDayNumber(days[6])}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', { currency: 'IDR', maximumFractionDigits: 0, style: 'currency' }).format(Number(value || 0));
}

function parseTimeToMinutes(value) {
  const normalized = String(value || '00:00').replace('.', ':');
  const [hour, minute = '0'] = normalized.split(':').map(Number);
  if (hour === 24) return 24 * 60;
  return (hour || 0) * 60 + (minute || 0);
}

function getStartLabel(booking) {
  return String(booking.time || '').split('-')[0] || '--:--';
}

function getBookingPosition(booking, startMinutes, totalMinutes) {
  const bookingStart = getBookingStartMinutes(booking);
  const bookingEnd = getBookingEndMinutes(booking);
  const top = Math.max(((bookingStart - startMinutes) / totalMinutes) * 100, 0);
  const height = Math.max(((bookingEnd - bookingStart) / totalMinutes) * 100, 5);
  return { top, height };
}

function buildCourtTimelineEntries(bookings, openHour) {
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

function buildAvailabilityEntry(startMinutes, endMinutes) {
  return {
    id: `availability-${startMinutes}-${endMinutes}`,
    label: formatAvailabilityRange(startMinutes, endMinutes),
    type: 'availability',
  };
}

function getBookingStartMinutes(booking) {
  const [start] = String(booking.time || '').split('-');
  return start ? parseTimeToMinutes(start) : minutesFromEpoch(booking.start);
}

function getBookingEndMinutes(booking) {
  const [, end] = String(booking.time || '').split('-');
  return end ? parseTimeToMinutes(end) : minutesFromEpoch(booking.end);
}

function formatAvailabilityRange(startMinutes, endMinutes) {
  return `${formatCompactTime(startMinutes)}-${formatCompactTime(endMinutes)}`;
}

function formatCompactTime(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 || 12;
  return minute ? `${normalizedHour}:${String(minute).padStart(2, '0')}${suffix}` : `${normalizedHour}${suffix}`;
}

function getBookingTone(booking) {
  if (booking.booking_paid) return 'tone-blue';
  if (booking.is_paylink || booking.booking_type === 'online') return 'tone-blue';
  if (booking.notes) return 'tone-amber';
  if (booking.type === 'event') return 'tone-sky';
  if (booking.type === 'coach' || booking.type === 'coaching') return 'tone-mint';
  if (booking.booking_type === 'offline') return 'tone-blue';
  return 'tone-slate';
}

function minutesFromEpoch(value) {
  const date = new Date(Number(value));
  return date.getHours() * 60 + date.getMinutes();
}

function getDurationMinutes(booking) {
  const position = getBookingPosition(booking, 0, 24 * 60);
  return Math.round((position.height / 100) * 24 * 60);
}

function buildHours(openHour) {
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

function summarizeDay(bookings, openHour) {
  const openMinutes = parseTimeToMinutes(openHour?.close_hours || '24:00') - parseTimeToMinutes(openHour?.open_hours || '06:00');
  const bookedMinutes = bookings.reduce((sum, booking) => sum + Number(booking.duration || getDurationMinutes(booking)), 0);
  const revenue = bookings.reduce((sum, booking) => sum + Number(booking.price || 0), 0);
  return {
    bookedHours: bookedMinutes / 60,
    bookingCount: bookings.length,
    occupancy: Math.min(openMinutes ? (bookedMinutes / openMinutes) * 100 : 0, 100),
    revenue,
  };
}

function summarizeWeek(weekDays, bookingsByDate, openHour) {
  const summaries = weekDays.map((date) => ({ date, ...summarizeDay(bookingsByDate[date] || [], openHour) }));
  const totalBookings = summaries.reduce((sum, day) => sum + day.bookingCount, 0);
  const bookedHours = summaries.reduce((sum, day) => sum + day.bookedHours, 0);
  const revenue = summaries.reduce((sum, day) => sum + day.revenue, 0);
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

function copyText(value) {
  if (!value) return;
  navigator.clipboard?.writeText(value);
}
