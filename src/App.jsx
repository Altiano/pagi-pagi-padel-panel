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
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
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
const MOBILE_VIEW_STORAGE_KEY = 'ppp-panel-view-mode';
const MOBILE_MEDIA_QUERY = '(max-width: 760px)';
const PLACEHOLDER_STATUSES = [
  { label: 'Negotiating', value: 'negotiating' },
  { label: 'Awaiting payment', value: 'awaiting_payment' },
  { label: 'Ready to confirm', value: 'ready_to_confirm' },
  { label: 'Cancelled', value: 'cancelled' },
];

const mobileNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, nav: 'Dashboard' },
  { label: 'Calendar', icon: CalendarDays, nav: 'Calendar' },
  { label: 'Service', icon: ClipboardList, nav: 'Court Prices' },
  { label: 'Customers', icon: Users, nav: 'Customers' },
  { label: 'Setting', icon: Settings, nav: 'Setting' },
];

export function App() {
  const [auth, setAuth] = useState(() => getStoredAuth());
  const isMobileRoute = isMobileViewPath(window.location);

  if (!auth) {
    return <LoginScreen isMobileRoute={isMobileRoute} onAuthenticated={setAuth} />;
  }

  return <PanelShell auth={auth} isMobileRoute={isMobileRoute} onLogout={() => {
    clearStoredAuth();
    setAuth(null);
  }} />;
}


function isMobileViewPath(location) {
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const hashPath = location.hash.replace(/^#/, '').replace(/^\//, '');
  return pathSegments.includes('mobile') || hashPath.split('/').filter(Boolean)[0] === 'mobile';
}

function LoginScreen({ isMobileRoute = false, onAuthenticated }) {
  const [form, setForm] = useState({ username: '', password: '', remember: false });
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const mobileView = usePreferredMobileView(isMobileRoute);

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
    <main className={`login-page ${mobileView.isMobileApp ? 'mobile-app mobile-login' : ''}`}>
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

function PanelShell({ auth, isMobileRoute = false, onLogout }) {
  const [meState, setMeState] = useState({ loading: true, data: null, error: '' });
  const [activeNav, setActiveNav] = useState('Calendar');
  const mobileView = usePreferredMobileView(isMobileRoute);

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
  const shellClassName = `panel-shell ${mobileView.isMobileApp ? 'mobile-app' : ''}`;

  const content = activeNav === 'Calendar' ? (
    <CalendarPage
      displayName={displayName}
      isMobileApp={mobileView.isMobileApp}
      mitraId={mitraId}
      onLogout={onLogout}
      onUseMobileView={() => mobileView.setPreference('mobile')}
    />
  ) : (
    <PlaceholderPage
      activeNav={activeNav}
      displayName={displayName}
      meState={meState}
      onLogout={onLogout}
    />
  );

  return (
    <main className={shellClassName}>
      {mobileView.isMobileApp ? (
        <MobileAppShell
          activeNav={activeNav}
          displayName={displayName}
          onChangeNav={setActiveNav}
          onLogout={onLogout}
          onUseDesktopView={() => mobileView.setPreference('desktop')}
        >
          {content}
        </MobileAppShell>
      ) : (
        <>
          <DesktopSidebar activeNav={activeNav} onChangeNav={setActiveNav} />

          <section className="content">
            {content}
          </section>
        </>
      )}
    </main>
  );
}

function usePreferredMobileView(isMobileRoute) {
  const [isSmallScreen, setIsSmallScreen] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  });
  const [preference, setPreferenceState] = useState(() => {
    if (typeof window === 'undefined') return 'auto';
    return window.localStorage.getItem(MOBILE_VIEW_STORAGE_KEY) || (isMobileRoute ? 'mobile' : 'auto');
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia(MOBILE_MEDIA_QUERY);
    const update = () => setIsSmallScreen(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  function setPreference(nextPreference) {
    setPreferenceState(nextPreference);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MOBILE_VIEW_STORAGE_KEY, nextPreference);
    }
  }

  return {
    isMobileApp: preference === 'mobile' || (preference !== 'desktop' && isSmallScreen),
    preference,
    setPreference,
  };
}

function DesktopSidebar({ activeNav, onChangeNav }) {
  return (
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
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={activeNav === item.label ? 'active' : ''}
                  key={item.label}
                  onClick={() => onChangeNav(item.label)}
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
  );
}

function MobileAppShell({ activeNav, children, displayName, onChangeNav, onLogout, onUseDesktopView }) {
  return (
    <>
      <header className="mobile-app-header">
        <div className="mobile-brand">
          <span className="brand-mark small">PP</span>
          <div>
            <strong>pagipagipadel</strong>
            <span>{displayName}</span>
          </div>
        </div>
        <div className="mobile-header-actions">
          <button onClick={onUseDesktopView} type="button">Desktop</button>
          <button aria-label="Logout" onClick={onLogout} type="button">
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <section className="mobile-app-content">
        {children}
      </section>

      <nav className="mobile-bottom-nav" aria-label="Primary">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const selected = activeNav === item.nav || (item.nav === 'Court Prices' && ['Court Prices', 'Event', 'Coach', 'Add On'].includes(activeNav));
          return (
            <button
              className={selected ? 'active' : ''}
              key={item.label}
              onClick={() => onChangeNav(item.nav)}
              type="button"
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
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

function CalendarPage({ displayName, isMobileApp = false, mitraId, onLogout, onUseMobileView }) {
  const [view, setView] = useState(() => (isMobileApp ? 'day' : 'week'));
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({ loading: true, error: '', courts: [], openHour: null, bookingsByDate: {} });
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [placeholderEditor, setPlaceholderEditor] = useState({ mode: 'closed', booking: null });
  const [placeholderStatus, setPlaceholderStatus] = useState({ state: 'idle', message: '' });
  const [hiddenAboveCount, setHiddenAboveCount] = useState(0);
  const [hiddenBelowCount, setHiddenBelowCount] = useState(0);
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);
  const calendarPanelRef = useRef(null);

  const weekDays = getWeekDays(selectedDate);
  const activeBookings = state.bookingsByDate[selectedDate] || [];
  const selectedDaySummary = summarizeDay(activeBookings, state.openHour, state.courts.length);
  const weekSummary = summarizeWeek(weekDays, state.bookingsByDate, state.openHour, state.courts.length);
  const showDetailPanel = !isMobileApp && (selectedBooking || showSummaryPanel);

  useEffect(() => {
    if (isMobileApp) setView('day');
  }, [isMobileApp]);

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
      const headerRect = panel.querySelector('.day-calendar-header')?.getBoundingClientRect();
      const visibleTop = Math.max(panelRect.top, headerRect?.bottom || panelRect.top);
      const visibleBottom = panelRect.bottom - 24;
      const blocks = Array.from(panel.querySelectorAll('.booking-block'));
      const above = blocks.filter((block) => block.getBoundingClientRect().bottom < visibleTop + 8);
      const below = blocks.filter((block) => block.getBoundingClientRect().top > visibleBottom);
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

  function openCreatePlaceholder(draft = null) {
    setPlaceholderStatus({ state: 'idle', message: '' });
    setPlaceholderEditor({ mode: 'create', booking: null, draft });
  }

  function openEditPlaceholder(booking) {
    setPlaceholderStatus({ state: 'idle', message: '' });
    setPlaceholderEditor({ mode: 'edit', booking });
  }

  async function savePlaceholder(form) {
    setPlaceholderStatus({ state: 'loading', message: 'Saving placeholder...' });
    const court = state.courts.find((item) => item.id === form.court_id);
    const payload = {
      ...form,
      mitra_id: mitraId,
      court_name: court?.name || form.court_name || '',
      estimated_price: Number(form.estimated_price || 0),
    };
    const editingId = placeholderEditor.mode === 'edit' ? placeholderEditor.booking?.placeholder_id || placeholderEditor.booking?.id : null;
    const saved = await apiRequest(editingId ? `/api/placeholder-bookings/${editingId}` : '/api/placeholder-bookings', {
      method: editingId ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    setPlaceholderStatus({ state: 'success', message: 'Placeholder saved.' });
    setPlaceholderEditor({ mode: 'closed', booking: null });
    setRefreshKey((current) => current + 1);
    if (saved?.data) setSelectedBooking(normalizePlaceholderBooking(saved.data));
  }

  async function deletePlaceholder(booking) {
    const id = booking?.placeholder_id || booking?.id;
    if (!id) return;
    setPlaceholderStatus({ state: 'loading', message: 'Deleting placeholder...' });
    await apiRequest(`/api/placeholder-bookings/${id}`, { method: 'DELETE' });
    setPlaceholderStatus({ state: 'success', message: 'Placeholder deleted.' });
    setSelectedBooking(null);
    setRefreshKey((current) => current + 1);
  }

  function findPlaceholderConflicts(form) {
    const bookings = state.bookingsByDate[form.date] || [];
    const candidate = {
      court_id: form.court_id,
      time: `${form.start_time}-${form.end_time}`,
    };
    const editingId = placeholderEditor.booking?.id;
    return bookings.filter((booking) => {
      if (booking.id === editingId || booking.placeholder_id === editingId) return false;
      return booking.court_id === candidate.court_id && bookingsOverlap(candidate, booking);
    });
  }

  return (
    <div className={`calendar-page ${view}-mode ${isMobileApp ? 'mobile-calendar-page' : ''}`}>
      <header className="calendar-topbar">
        <div>
          <h1>Calendar</h1>
          <p>{view === 'day' ? 'Manage daily court bookings and availability.' : 'Plan weekly occupancy and jump into daily operations.'}</p>
        </div>
        <div className="topbar-actions">
          {!isMobileApp && onUseMobileView ? (
            <button className="desktop-view-toggle-button" onClick={onUseMobileView} type="button">
              Mobile app view
            </button>
          ) : null}
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
        <button className="placeholder-create-button" onClick={openCreatePlaceholder} type="button">
          <Plus size={16} />
          Placeholder
        </button>
        {!isMobileApp ? (
          <button
            className={`summary-toggle-button ${showSummaryPanel ? 'selected' : ''}`}
            onClick={() => setShowSummaryPanel((current) => !current)}
            type="button"
          >
            <ClipboardList size={15} />
            Summary
          </button>
        ) : null}
        <div className="open-hours">
          Open: {formatAvailabilityRange(
            parseTimeToMinutes(state.openHour?.open_hours || '06:00'),
            parseTimeToMinutes(state.openHour?.close_hours || '24:00'),
          )}
        </div>
      </section>

      {state.error ? (
        <div className="calendar-error">
          <strong>Could not load calendar.</strong>
          <p>{state.error}</p>
        </div>
      ) : null}

      <section className={`calendar-layout ${showDetailPanel ? '' : 'summary-collapsed'}`}>
        <div className="calendar-main-panel">
          <div className="calendar-scroll-area" ref={calendarPanelRef}>
            {state.loading ? (
              <div className="calendar-loading">Loading calendar...</div>
            ) : isMobileApp && view === 'day' ? (
              <MobileDayAgenda
                bookings={activeBookings}
                courts={state.courts}
                openHour={state.openHour}
                selectedBooking={selectedBooking}
                selectedDate={selectedDate}
                onSelectBooking={setSelectedBooking}
              />
            ) : isMobileApp && view === 'week' ? (
              <MobileWeekCalendar
                bookingsByDate={state.bookingsByDate}
                courts={state.courts}
                openHour={state.openHour}
                selectedDate={selectedDate}
                weekDays={weekDays}
                onSelectBooking={setSelectedBooking}
                onSelectDate={setSelectedDate}
                onSwitchDay={() => setView('day')}
              />
            ) : view === 'day' ? (
              <DayCalendar
                bookings={activeBookings}
                courts={state.courts}
                openHour={state.openHour}
                selectedBooking={selectedBooking}
                selectedDate={selectedDate}
                onCreatePlaceholder={openCreatePlaceholder}
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
        {showDetailPanel ? (
          <CalendarDetailPanel
            booking={selectedBooking}
            selectedDate={selectedDate}
            selectedDaySummary={selectedDaySummary}
            view={view}
            weekSummary={weekSummary}
            onDeletePlaceholder={deletePlaceholder}
            onEditPlaceholder={openEditPlaceholder}
            onOpenDay={() => setView('day')}
          />
        ) : null}
      </section>
      {isMobileApp ? (
        <button className="mobile-placeholder-fab" onClick={openCreatePlaceholder} type="button">
          <Plus size={20} />
        </button>
      ) : null}
      {placeholderEditor.mode !== 'closed' ? (
        <PlaceholderBookingEditor
          booking={placeholderEditor.booking}
          conflicts={findPlaceholderConflicts}
          courts={state.courts}
          defaultDate={selectedDate}
          defaultName={displayName}
          draft={placeholderEditor.draft}
          isSaving={placeholderStatus.state === 'loading'}
          mode={placeholderEditor.mode}
          openHour={state.openHour}
          onClose={() => setPlaceholderEditor({ mode: 'closed', booking: null })}
          onSave={savePlaceholder}
        />
      ) : null}
      {isMobileApp && selectedBooking ? (
        <div className="mobile-detail-backdrop" onClick={() => setSelectedBooking(null)}>
          <div onClick={(event) => event.stopPropagation()}>
            <CalendarDetailPanel
              booking={selectedBooking}
              selectedDate={selectedDate}
              selectedDaySummary={selectedDaySummary}
              view={view}
              weekSummary={weekSummary}
              onClose={() => setSelectedBooking(null)}
              onDeletePlaceholder={deletePlaceholder}
              onEditPlaceholder={openEditPlaceholder}
              onOpenDay={() => setView('day')}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileDayAgenda({ bookings, courts, openHour, selectedBooking, selectedDate, onSelectBooking }) {
  const courtBookings = courts.length ? courts.map((court) => ({
    court,
    entries: buildCourtTimelineEntries(bookings.filter((booking) => booking.court_id === court.id), openHour),
  })) : [{ court: { id: 'all', name: 'All courts' }, entries: buildCourtTimelineEntries(bookings, openHour) }];

  return (
    <div className="mobile-agenda">
      <div className="mobile-agenda-heading">
        <span>{formatLongDate(selectedDate)}</span>
        <strong>{bookings.length} booking{bookings.length === 1 ? '' : 's'}</strong>
      </div>

      {courtBookings.map(({ court, entries }) => (
        <section className="mobile-court-agenda" key={court.id}>
          <div className="mobile-court-heading">
            <strong>{court.name}</strong>
            <span>{entries.filter((entry) => entry.type === 'booking').length} bookings</span>
          </div>

          <div className="mobile-agenda-list">
            {entries.length ? entries.map((entry) => (
              entry.type === 'availability' ? (
                <div className="mobile-availability-row" key={entry.id}>
                  <span>{entry.label}</span>
                  <strong>Available</strong>
                </div>
              ) : (
                <button
                  className={`mobile-booking-row ${getBookingTone(entry.booking)} ${selectedBooking?.id === entry.booking.id ? 'selected' : ''}`}
                  key={entry.booking.id}
                  onClick={() => onSelectBooking(entry.booking)}
                  type="button"
                >
                  <span className="mobile-booking-time">{entry.booking.time || getStartLabel(entry.booking)}</span>
                  <span className="mobile-booking-main">
                    <strong>{entry.booking.booking_owner || entry.booking.name}</strong>
                    <small>{getBookingMeta(entry.booking)}</small>
                  </span>
                  <span className="mobile-payment-pill">{entry.booking.is_placeholder ? 'Placeholder' : entry.booking.booking_paid ? 'Paid' : 'Unpaid'}</span>
                </button>
              )
            )) : (
              <div className="mobile-availability-row">
                <span>{formatAvailabilityRange(parseTimeToMinutes(openHour?.open_hours || '06:00'), parseTimeToMinutes(openHour?.close_hours || '24:00'))}</span>
                <strong>Available</strong>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function MobileWeekCalendar({ bookingsByDate, courts, openHour, selectedDate, weekDays, onSelectBooking, onSelectDate, onSwitchDay }) {
  return (
    <div className="mobile-week-list">
      {weekDays.map((date) => {
        const bookings = bookingsByDate[date] || [];
        const summary = summarizeDay(bookings, openHour, courts.length);
        return (
          <article className={`mobile-week-row ${date === selectedDate ? 'selected' : ''}`} key={date}>
            <button className="mobile-week-summary" onClick={() => onSelectDate(date)} type="button">
              <span>
                <strong>{formatWeekday(date)}</strong>
                <small>{formatDayNumber(date)}</small>
              </span>
              <span className="mobile-week-stats">
                <strong>{bookings.length} bookings</strong>
                <small>{summary.bookedHours.toFixed(1)}h · {formatCurrency(summary.revenue)}</small>
              </span>
              <span className="occupancy-bar">
                <span style={{ width: `${summary.occupancy}%` }} />
              </span>
            </button>

            {date === selectedDate ? (
              <div className="mobile-week-detail">
                {courts.slice(0, 4).map((court) => {
                  const courtBookings = bookings.filter((booking) => booking.court_id === court.id);
                  return (
                    <div className="mobile-week-court" key={court.id}>
                      <span>{court.name}</span>
                      {courtBookings.length ? courtBookings.slice(0, 2).map((booking) => (
                        <button className={getBookingTone(booking)} key={booking.id} onClick={() => onSelectBooking(booking)} type="button">
                          <strong>{getStartLabel(booking)}</strong>
                          <span>{booking.booking_owner || booking.name}</span>
                        </button>
                      )) : <small>Available</small>}
                    </div>
                  );
                })}
                <button className="open-day-link" onClick={onSwitchDay} type="button">Open day view</button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function DayCalendar({ bookings, courts, openHour, selectedBooking, selectedDate, onCreatePlaceholder, onSelectBooking }) {
  const hours = buildHours(openHour);
  const intervalCount = Math.max(hours.length - 1, 1);
  const startMinutes = parseTimeToMinutes(openHour?.open_hours || '06:00');
  const endMinutes = parseTimeToMinutes(openHour?.close_hours || '24:00');
  const totalMinutes = Math.max(endMinutes - startMinutes, 60);
  const slotMinutes = buildSlotMinutes(startMinutes, endMinutes);

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
            {slotMinutes.map((minutes) => {
              const slotBooking = {
                court_id: court.id,
                  time: `${formatTimeInput(minutes)}-${formatTimeInput(Math.min(minutes + 60, endMinutes))}`,
              };
              const isAvailable = !bookings.some((booking) => booking.court_id === court.id && bookingsOverlap(slotBooking, booking));
              if (!isAvailable) return null;
              return (
                <button
                  aria-label={`Create placeholder for ${court.name} at ${formatTimeInput(minutes)}`}
                  className="day-slot-button"
                  key={`${court.id}-${minutes}`}
                  onClick={() => onCreatePlaceholder?.({
                    court_id: court.id,
                    court_name: court.name,
                    date: selectedDate,
                    start_time: formatTimeInput(minutes),
                    end_time: formatTimeInput(Math.min(minutes + 60, endMinutes)),
                  })}
                  style={{
                    top: `${((minutes - startMinutes) / totalMinutes) * 100}%`,
                    height: `${(60 / totalMinutes) * 100}%`,
                  }}
                  title={`Create placeholder at ${formatTimeInput(minutes)}`}
                  type="button"
                >
                  <span>+</span>
                </button>
              );
            })}
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
                  <small>{getBookingMeta(booking)}</small>
                  {booking.is_placeholder ? <em>Placeholder</em> : booking.notes ? <em>Notes</em> : null}
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
        return (
          <WeekDayColumn
            bookings={bookings}
            courts={courts}
            date={date}
            isSelected={date === selectedDate}
            key={date}
            openHour={openHour}
            onSelectBooking={onSelectBooking}
            onSelectDate={onSelectDate}
            onSwitchDay={onSwitchDay}
          />
        );
      })}
    </div>
  );
}

function WeekDayColumn({ bookings, courts, date, isSelected, openHour, onSelectBooking, onSelectDate, onSwitchDay }) {
  const [hiddenCounts, setHiddenCounts] = useState({ above: 0, below: 0 });
  const courtListRef = useRef(null);
  const summary = summarizeDay(bookings, openHour, courts.length);
  const bookingLabel = `${bookings.length} booking${bookings.length === 1 ? '' : 's'}`;

  useEffect(() => {
    const list = courtListRef.current;
    if (!list) return undefined;

    const updateHiddenBookings = () => {
      const listRect = list.getBoundingClientRect();
      const bookingButtons = Array.from(list.querySelectorAll('.week-booking-card'));
      const above = bookingButtons.filter((button) => button.getBoundingClientRect().bottom < listRect.top + 8);
      const below = bookingButtons.filter((button) => button.getBoundingClientRect().top > listRect.bottom - 8);
      setHiddenCounts({ above: above.length, below: below.length });
    };

    updateHiddenBookings();
    list.addEventListener('scroll', updateHiddenBookings, { passive: true });
    window.addEventListener('resize', updateHiddenBookings);

    return () => {
      list.removeEventListener('scroll', updateHiddenBookings);
      window.removeEventListener('resize', updateHiddenBookings);
    };
  }, [bookings, courts, openHour]);

  return (
    <article className={`week-day ${isSelected ? 'selected' : ''}`}>
      <button className="week-day-header" onClick={() => onSelectDate(date)} type="button">
        <span>{formatWeekday(date)}</span>
        <strong>{formatDayNumber(date)}</strong>
        <small>{bookingLabel}</small>
        <div className="occupancy-bar">
          <span style={{ width: `${summary.occupancy}%` }} />
        </div>
      </button>
      <div className="week-day-metrics">
        <span>{summary.bookedHours.toFixed(1)}h booked</span>
        <em>{formatCurrency(summary.revenue)}</em>
      </div>
      <div className="week-day-body">
        <div className="week-court-list" ref={courtListRef}>
          {courts.map((court) => {
            const courtBookings = bookings.filter((booking) => booking.court_id === court.id);
            const timelineEntries = buildCourtTimelineEntries(courtBookings, openHour);
            return (
              <div className="week-court" key={court.id}>
                <p>{court.name}</p>
                {timelineEntries.length ? timelineEntries.map((entry) => (
                  entry.type === 'availability' ? (
                    <span className="availability-gap" key={entry.id}>
                      <strong>{entry.label}</strong>
                    </span>
                  ) : (
                    <button className={`week-booking-card ${getBookingTone(entry.booking)}`} key={entry.booking.id} onClick={() => onSelectBooking(entry.booking)} type="button">
                      <span>{getStartLabel(entry.booking)}</span>
                      <strong>{entry.booking.booking_owner || entry.booking.name}</strong>
                      {entry.booking.is_placeholder ? <small>Placeholder</small> : null}
                    </button>
                  )
                )) : <span className="empty-slot">Available</span>}
              </div>
            );
          })}
        </div>
        {hiddenCounts.above > 0 ? (
          <div className="week-scroll-more-indicator above">
            <span>{hiddenCounts.above} booking{hiddenCounts.above > 1 ? 's' : ''} above</span>
            <ChevronRight size={14} />
          </div>
        ) : null}
        {hiddenCounts.below > 0 ? (
          <div className="week-scroll-more-indicator below">
            <span>{hiddenCounts.below} more below</span>
            <ChevronRight size={14} />
          </div>
        ) : null}
      </div>
      <button className="open-day-link" onClick={() => {
        onSelectDate(date);
        onSwitchDay();
      }} type="button">Open day view</button>
    </article>
  );
}

function CalendarDetailPanel({ booking, selectedDate, selectedDaySummary, view, weekSummary, onClose, onDeletePlaceholder, onEditPlaceholder, onOpenDay }) {
  if (booking) {
    const isPlaceholder = booking.is_placeholder;
    return (
      <aside className="calendar-detail">
        <div className="panel-label-row">
          <span className="panel-label">{isPlaceholder ? 'Placeholder booking' : 'Booking detail'}</span>
          {onClose ? (
            <button aria-label="Close booking detail" onClick={onClose} type="button">
              <X size={16} />
            </button>
          ) : null}
        </div>
        <h2>{booking.booking_owner || booking.name}</h2>
        <dl>
          <div><dt>Court</dt><dd>{booking.court_name || booking.court_id}</dd></div>
          {isPlaceholder ? <div><dt>Date</dt><dd>{formatLongDate(booking.date)}</dd></div> : null}
          <div><dt>Time</dt><dd>{booking.time}</dd></div>
          <div><dt>Duration</dt><dd>{booking.duration || getDurationMinutes(booking)} min</dd></div>
          <div><dt>Type</dt><dd>{isPlaceholder ? 'Local placeholder' : booking.booking_type || booking.type}</dd></div>
          <div><dt>Payment</dt><dd>{isPlaceholder ? formatStatus(booking.status) : booking.booking_paid ? 'Paid' : 'Unpaid'}</dd></div>
          <div><dt>Price</dt><dd>{formatCurrency(booking.price)}</dd></div>
          {isPlaceholder ? <div><dt>Contact</dt><dd>{booking.customer_contact || '-'}</dd></div> : null}
          <div><dt>Notes</dt><dd>{booking.notes || 'No notes'}</dd></div>
          {isPlaceholder ? (
            <>
              <div><dt>Created by</dt><dd>{booking.created_by_name || '-'}</dd></div>
              <div><dt>Updated by</dt><dd>{booking.updated_by_name || '-'}</dd></div>
            </>
          ) : (
            <div><dt>Transaction ID</dt><dd>{booking.trans_id || '-'}</dd></div>
          )}
        </dl>
        {isPlaceholder ? (
          <div className="detail-actions">
            <button onClick={() => onEditPlaceholder?.(booking)} type="button"><Pencil size={15} /> Edit placeholder</button>
            <button disabled type="button"><ExternalLink size={15} /> Mark paid & confirm</button>
            <button className="danger-action" onClick={() => onDeletePlaceholder?.(booking)} type="button"><Trash2 size={15} /> Delete</button>
          </div>
        ) : (
          <div className="detail-actions">
            <button type="button"><ExternalLink size={15} /> View transaction</button>
            <button onClick={() => copyText(booking.trans_id)} type="button"><Copy size={15} /> Copy ID</button>
          </div>
        )}
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

function PlaceholderBookingEditor({ booking, conflicts, courts, defaultDate, defaultName, draft, isSaving, mode, openHour, onClose, onSave }) {
  const [form, setForm] = useState(() => buildPlaceholderForm({ booking, courts, defaultDate, defaultName, draft, openHour }));
  const [error, setError] = useState('');
  const conflictList = conflicts(form);
  const hasConflict = conflictList.length > 0;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (parseTimeToMinutes(form.end_time) <= parseTimeToMinutes(form.start_time)) {
      setError('End time must be after start time.');
      return;
    }
    if (hasConflict) {
      setError('This placeholder overlaps with an existing booking.');
      return;
    }

    try {
      await onSave(form);
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">{mode === 'edit' ? 'Edit placeholder' : 'New placeholder'}</span>
          <button aria-label="Close placeholder editor" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>{mode === 'edit' ? 'Update tentative hold' : 'Create tentative hold'}</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Court
            <select onChange={(event) => updateField('court_id', event.target.value)} required value={form.court_id}>
              <option value="">Select court</option>
              {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
            </select>
          </label>
          <div className="form-grid two">
            <label>
              Date
              <input onChange={(event) => updateField('date', event.target.value)} required type="date" value={form.date} />
            </label>
            <label>
              Status
              <select onChange={(event) => updateField('status', event.target.value)} value={form.status}>
                {PLACEHOLDER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
          </div>
          <div className="form-grid two">
            <label>
              Start time
              <input onChange={(event) => updateField('start_time', event.target.value)} required type="time" value={form.start_time} />
            </label>
            <label>
              End time
              <input onChange={(event) => updateField('end_time', event.target.value)} required type="time" value={form.end_time} />
            </label>
          </div>
          <label>
            Customer name
            <input onChange={(event) => updateField('customer_name', event.target.value)} placeholder="Customer or group name" required value={form.customer_name} />
          </label>
          <label>
            Contact
            <input onChange={(event) => updateField('customer_contact', event.target.value)} placeholder="Phone, WhatsApp, or email" value={form.customer_contact} />
          </label>
          <div className="form-grid two">
            <label>
              Estimated price
              <input min="0" onChange={(event) => updateField('estimated_price', event.target.value)} type="number" value={form.estimated_price} />
            </label>
            <label>
              Created by
              <input onChange={(event) => updateField('created_by_name', event.target.value)} placeholder="PIC name" value={form.created_by_name} />
            </label>
          </div>
          <label>
            Updated by
            <input onChange={(event) => updateField('updated_by_name', event.target.value)} placeholder="PIC name" value={form.updated_by_name} />
          </label>
          <label>
            Notes
            <textarea onChange={(event) => updateField('notes', event.target.value)} placeholder="Negotiation/payment context" rows={4} value={form.notes} />
          </label>
          {hasConflict ? (
            <p className="status-line error">Overlaps with {conflictList.length} booking{conflictList.length > 1 ? 's' : ''} on this court.</p>
          ) : null}
          {error ? <p className="status-line error">{error}</p> : null}
          <div className="editor-actions">
            <button className="logout-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-button" disabled={isSaving || hasConflict} type="submit">
              {isSaving ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create placeholder'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

async function loadCalendarData({ mitraId, selectedDate, weekDays }) {
  const [courts, openHour, weekResponses, placeholdersResponse] = await Promise.all([
    apiRequest(`/api/admin/mitra/court/${mitraId}/list`),
    apiRequest(`/api/admin/schedule/open-hour-date?mitra_id=${mitraId}&date=${selectedDate}`),
    Promise.all(weekDays.map((date) => apiRequest(`/api/admin/schedule-cal-courts?mitra_id=${mitraId}&date=${date}`)
      .then((response) => [date, response?.lists || []]))),
    apiRequest(`/api/placeholder-bookings?mitra_id=${mitraId}&from=${weekDays[0]}&to=${weekDays[weekDays.length - 1]}`)
      .catch(() => ({ lists: [] })),
  ]);

  const courtList = Array.isArray(courts) ? courts : [];
  const courtNames = new Map(courtList.map((court) => [court.id, court.name]));
  const placeholdersByDate = (placeholdersResponse?.lists || []).reduce((map, placeholder) => {
    const booking = normalizePlaceholderBooking(placeholder);
    map[booking.date] = [...(map[booking.date] || []), booking];
    return map;
  }, {});
  const bookingsByDate = Object.fromEntries(weekResponses.map(([date, bookings]) => {
    const upstreamBookings = bookings.map((booking) => ({ ...booking, court_name: courtNames.get(booking.court_id) }));
    const localPlaceholders = placeholdersByDate[date] || [];
    return [date, [...upstreamBookings, ...localPlaceholders].sort((first, second) => getBookingStartMinutes(first) - getBookingStartMinutes(second))];
  }));

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

function normalizePlaceholderBooking(placeholder) {
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

function buildPlaceholderForm({ booking, courts, defaultDate, defaultName, draft, openHour }) {
  if (booking) {
    const [startTime, endTime] = String(booking.time || '').split('-');
    return {
      court_id: booking.court_id || '',
      court_name: booking.court_name || '',
      date: booking.date || defaultDate,
      start_time: startTime || openHour?.open_hours || '06:00',
      end_time: endTime || shiftTime(startTime || openHour?.open_hours || '06:00', 60),
      customer_name: booking.booking_owner || booking.name || '',
      customer_contact: booking.customer_contact || '',
      estimated_price: String(booking.price || 0),
      status: booking.status || 'awaiting_payment',
      notes: booking.notes || '',
      created_by_name: booking.created_by_name || defaultName || '',
      updated_by_name: booking.updated_by_name || defaultName || '',
    };
  }

  const startTime = draft?.start_time || openHour?.open_hours || '06:00';
  const court = courts.find((item) => item.id === draft?.court_id) || courts[0];
  return {
    court_id: court?.id || '',
    court_name: court?.name || draft?.court_name || '',
    date: draft?.date || defaultDate,
    start_time: startTime,
    end_time: draft?.end_time || shiftTime(startTime, 60),
    customer_name: '',
    customer_contact: '',
    estimated_price: '',
    status: 'awaiting_payment',
    notes: '',
    created_by_name: defaultName || '',
    updated_by_name: defaultName || '',
  };
}

function buildSlotMinutes(startMinutes, endMinutes) {
  const minutes = [];
  for (let minute = startMinutes; minute < endMinutes; minute += 60) {
    minutes.push(minute);
  }
  return minutes;
}

function formatTimeInput(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function shiftTime(time, minutesToAdd) {
  const total = Math.min(parseTimeToMinutes(time) + minutesToAdd, 24 * 60);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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

function formatCompactCurrency(value) {
  const amount = Number(value || 0);
  if (!amount) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 1,
    notation: 'compact',
    style: 'currency',
  }).format(amount);
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
  if (booking.is_placeholder) return 'tone-placeholder';
  if (booking.booking_paid) return 'tone-blue';
  if (booking.is_paylink || booking.booking_type === 'online') return 'tone-blue';
  if (booking.type === 'event') return 'tone-sky';
  if (booking.type === 'coach' || booking.type === 'coaching') return 'tone-mint';
  if (booking.booking_type === 'offline') return 'tone-blue';
  return 'tone-slate';
}

function getBookingMeta(booking) {
  if (booking.is_placeholder) return `${formatCurrency(booking.price)} · ${formatStatus(booking.status)}`;
  return `${booking.booking_type || booking.type || 'booking'} · ${formatCurrency(booking.price)}`;
}

function formatStatus(value) {
  return PLACEHOLDER_STATUSES.find((status) => status.value === value)?.label || 'Awaiting payment';
}

function bookingsOverlap(first, second) {
  const firstStart = getBookingStartMinutes(first);
  const firstEnd = getBookingEndMinutes(first);
  const secondStart = getBookingStartMinutes(second);
  const secondEnd = getBookingEndMinutes(second);
  return firstStart < secondEnd && secondStart < firstEnd;
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

function summarizeDay(bookings, openHour, courtCount = 1) {
  const openMinutes = parseTimeToMinutes(openHour?.close_hours || '24:00') - parseTimeToMinutes(openHour?.open_hours || '06:00');
  const bookedMinutes = bookings.reduce((sum, booking) => sum + Number(booking.duration || getDurationMinutes(booking)), 0);
  const revenue = bookings.reduce((sum, booking) => sum + Number(booking.price || 0), 0);
  const capacityMinutes = openMinutes * Math.max(Number(courtCount) || 1, 1);
  return {
    bookedHours: bookedMinutes / 60,
    bookingCount: bookings.length,
    occupancy: Math.min(capacityMinutes ? (bookedMinutes / capacityMinutes) * 100 : 0, 100),
    revenue,
  };
}

function summarizeWeek(weekDays, bookingsByDate, openHour, courtCount = 1) {
  const summaries = weekDays.map((date) => ({ date, ...summarizeDay(bookingsByDate[date] || [], openHour, courtCount) }));
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
