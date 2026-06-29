import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
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
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
  UserPlus,
  X,
} from 'lucide-react';
import { clearStoredAuth, getStoredAuth, login } from './api/auth.js';
import { apiRequest } from './api/client.js';
import { createVirtualUser, deleteVirtualUser, listVirtualUsers, updateVirtualUser } from './api/virtualUsers.js';

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
const CALENDAR_REVENUE_PERMISSION = 'Calendar revenue';
const CALENDAR_BOOKING_PERMISSION = 'Calendar booking';
const CALENDAR_DATA_CACHE_TTL_MS = 30 * 1000;
const PLACEHOLDER_DURATION_OPTIONS = [
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
];
const REGISTERED_PLAYER_SEARCH_MIN_LENGTH = 2;
// The capture redacted this field; keep the guessed value centralized for upstream verification.
const RECEIPT_ATTACHMENT_TYPE = 'payment_proof';
const calendarDataCache = new Map();

const mobileNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, nav: 'Dashboard' },
  { label: 'Calendar', icon: CalendarDays, nav: 'Calendar' },
  { label: 'Service', icon: ClipboardList, nav: 'Court Prices' },
  { label: 'Customers', icon: Users, nav: 'Customers' },
  { label: 'Setting', icon: Settings, nav: 'Setting' },
];

const screenPermissionOptions = navGroups.flatMap((group) => group.items.map((item) => item.label));
const virtualPermissionGroups = [
  { label: 'Visible screens', options: screenPermissionOptions },
  { label: 'Calendar actions', options: [CALENDAR_BOOKING_PERMISSION] },
  { label: 'Calendar data', options: [CALENDAR_REVENUE_PERMISSION] },
];
const virtualPermissionOptions = virtualPermissionGroups.flatMap((group) => group.options);

export function App() {
  const [auth, setAuth] = useState(() => getStoredAuth());
  const isMobileRoute = isMobileViewPath(window.location);

  if (!auth) {
    return <LoginScreen isMobileRoute={isMobileRoute} onAuthenticated={setAuth} />;
  }

  return <PanelShell auth={auth} isMobileRoute={isMobileRoute} onLogout={() => {
    clearStoredAuth();
    clearCalendarDataCache();
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
  const allowedNav = getAllowedNav(auth);
  const visibleNavGroups = filterNavGroups(navGroups, allowedNav);
  const visibleMobileNavItems = mobileNavItems.filter((item) => isNavAllowed(item.nav, allowedNav));
  const firstAllowedNav = getFirstAllowedNav(allowedNav);
  const currentNav = isNavAllowed(activeNav, allowedNav) ? activeNav : firstAllowedNav;
  const canViewCalendarRevenue = hasPermission(auth, CALENDAR_REVENUE_PERMISSION);
  const canWriteCalendarBookings = hasPermission(auth, CALENDAR_BOOKING_PERMISSION);
  const isVirtualUser = Boolean(auth.virtualUser);

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

  useEffect(() => {
    if (!isNavAllowed(activeNav, allowedNav)) {
      setActiveNav(firstAllowedNav || '');
    }
  }, [activeNav, allowedNav, firstAllowedNav]);

  const displayName = auth.virtualUser?.display_name || meState.data?.data?.name || meState.data?.name || auth.username || 'Owner';
  const mitraId = findMitraId(meState.data) || FALLBACK_MITRA_ID;
  const calendarCacheScope = getCalendarCacheScope(auth, canViewCalendarRevenue);
  const shellClassName = `panel-shell ${mobileView.isMobileApp ? 'mobile-app' : ''}`;

  const content = !currentNav ? (
    <NoAccessPage displayName={displayName} onLogout={onLogout} />
  ) : currentNav === 'Calendar' ? (
    <CalendarPage
      cacheScope={calendarCacheScope}
      canViewRevenue={canViewCalendarRevenue}
      canWriteBookings={canWriteCalendarBookings}
      displayName={displayName}
      isVirtualUser={isVirtualUser}
      isMobileApp={mobileView.isMobileApp}
      mitraId={mitraId}
      onLogout={onLogout}
      onUseMobileView={() => mobileView.setPreference('mobile')}
    />
  ) : currentNav === 'Setting' ? (
    <VirtualUsersPage
      auth={auth}
      displayName={displayName}
      meState={meState}
      onLogout={onLogout}
    />
  ) : (
    <PlaceholderPage
      activeNav={currentNav}
      displayName={displayName}
      meState={meState}
      onLogout={onLogout}
    />
  );

  return (
    <main className={shellClassName}>
      {mobileView.isMobileApp ? (
        <MobileAppShell
          activeNav={currentNav}
          displayName={displayName}
          navItems={visibleMobileNavItems}
          onChangeNav={setActiveNav}
          onLogout={onLogout}
          onUseDesktopView={() => mobileView.setPreference('desktop')}
        >
          {content}
        </MobileAppShell>
      ) : (
        <>
          <DesktopSidebar activeNav={currentNav} navGroups={visibleNavGroups} onChangeNav={setActiveNav} />

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

function useEscapeKey(onEscape, enabled = true) {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!enabled) return undefined;

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onEscapeRef.current?.();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}

function getAllowedNav(auth) {
  if (!auth?.virtualUser) return null;
  const permissions = Array.isArray(auth.virtualUser.permissions) ? auth.virtualUser.permissions : [];
  return new Set(permissions);
}

function isNavAllowed(nav, allowedNav) {
  if (!allowedNav) return true;
  if (nav === 'Court Prices' && allowedNav.has('Service')) return true;
  return allowedNav.has(nav);
}

function filterNavGroups(groups, allowedNav) {
  if (!allowedNav) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isNavAllowed(item.label, allowedNav)),
    }))
    .filter((group) => group.items.length);
}

function getFirstAllowedNav(allowedNav) {
  if (!allowedNav) return 'Calendar';
  return navGroups.flatMap((group) => group.items).find((item) => isNavAllowed(item.label, allowedNav))?.label || '';
}

function hasPermission(auth, permission) {
  if (!auth?.virtualUser) return true;
  const permissions = Array.isArray(auth.virtualUser.permissions) ? auth.virtualUser.permissions : [];
  return permissions.includes(permission);
}

function getCalendarCacheScope(auth, canViewRevenue) {
  const identity = auth?.virtualUser?.id || auth?.accessToken || auth?.username || 'session';
  return `${identity}:${canViewRevenue ? 'revenue' : 'masked'}`;
}

function DesktopSidebar({ activeNav, navGroups: visibleNavGroups, onChangeNav }) {
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
        {visibleNavGroups.map((group) => (
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

function MobileAppShell({ activeNav, children, displayName, navItems, onChangeNav, onLogout, onUseDesktopView }) {
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
        {navItems.map((item) => {
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

function VirtualUsersPage({ auth, displayName, meState, onLogout }) {
  const [users, setUsers] = useState([]);
  const [state, setState] = useState({ loading: true, error: '', status: '', canManage: false });
  const [editor, setEditor] = useState({ mode: 'closed', user: null });

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: '', status: '', canManage: false });
    listVirtualUsers()
      .then((items) => {
        if (active) {
          setUsers(items);
          setState({ loading: false, error: '', status: '', canManage: true });
        }
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: error.message, status: '', canManage: false });
      });

    return () => {
      active = false;
    };
  }, []);

  async function refreshUsers() {
    const items = await listVirtualUsers();
    setUsers(items);
  }

  async function saveUser(form) {
    setState((current) => ({ ...current, status: 'Saving virtual user...' }));
    if (editor.mode === 'edit') {
      await updateVirtualUser(editor.user.id, form);
    } else {
      await createVirtualUser(form);
    }
    await refreshUsers();
    setEditor({ mode: 'closed', user: null });
    setState({ loading: false, error: '', status: 'Virtual user saved.', canManage: true });
  }

  async function removeUser(user) {
    const confirmed = window.confirm(`Delete virtual user _${user.username}?`);
    if (!confirmed) return;
    setState((current) => ({ ...current, status: 'Deleting virtual user...' }));
    try {
      await deleteVirtualUser(user.id);
      await refreshUsers();
      setState({ loading: false, error: '', status: 'Virtual user deleted.', canManage: true });
    } catch (error) {
      setState({ loading: false, error: error.message, status: '', canManage: false });
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Settings</h1>
          <p>Manage wrapper-only virtual accounts that sign in with an underscore prefix.</p>
        </div>
        <div className="topbar-actions">
          <span className="user-chip">{auth.virtualUser ? `_${auth.virtualUser.username}` : displayName}</span>
          <button className="logout-button" onClick={onLogout} type="button">
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </header>

      <section className="settings-layout">
        <article className="settings-panel">
          <div className="settings-panel-heading">
            <div>
              <span className="panel-label">Virtual accounts</span>
              <h2>Users</h2>
            </div>
            {state.canManage ? (
              <button className="primary-button compact-button" onClick={() => setEditor({ mode: 'create', user: null })} type="button">
              <UserPlus size={16} />
              Add user
              </button>
            ) : null}
          </div>

          {state.error ? <p className="status-line error">{state.error}</p> : null}
          {state.status ? <p className="status-line">{state.status}</p> : null}

          <div className="virtual-user-list">
            {state.loading ? (
              <div className="empty-state">Loading virtual users...</div>
            ) : !state.canManage ? (
              <div className="empty-state">Sign in with the master username to manage virtual users.</div>
            ) : users.length ? users.map((user) => (
              <article className="virtual-user-card" key={user.id}>
                <div>
                  <strong>{user.display_name}</strong>
                  <span>{user.login_username}</span>
                </div>
                <div className="virtual-user-permissions">
                  {user.permissions.length ? user.permissions.map((permission) => (
                    <span key={permission}>{permission}</span>
                  )) : <span>No access</span>}
                </div>
                <div className="virtual-user-actions">
                  <span className={`state-pill ${user.is_active ? 'active' : 'inactive'}`}>{user.is_active ? 'Active' : 'Inactive'}</span>
                  <button onClick={() => copyText(user.login_username)} type="button"><Copy size={15} /> Copy</button>
                  <button onClick={() => setEditor({ mode: 'edit', user })} type="button"><Pencil size={15} /> Edit</button>
                  <button className="danger-action" onClick={() => removeUser(user)} type="button"><Trash2 size={15} /> Delete</button>
                </div>
              </article>
            )) : (
              <div className="empty-state">No virtual users yet.</div>
            )}
          </div>
        </article>

        <aside className="settings-panel settings-info">
          <span className="panel-label">Current session</span>
          <h2>{displayName}</h2>
          <dl>
            <div><dt>Login type</dt><dd>{auth.virtualUser ? 'Virtual account' : 'Regular upstream account'}</dd></div>
            <div><dt>Upstream</dt><dd>{meState.loading ? 'Checking...' : meState.error ? 'Needs attention' : 'Connected'}</dd></div>
            <div><dt>Virtual prefix</dt><dd>_username</dd></div>
          </dl>
          <p>Virtual users authenticate with their own wrapper password. The Worker then signs into the upstream service with the configured master account.</p>
        </aside>
      </section>

      {editor.mode !== 'closed' ? (
        <VirtualUserEditor
          mode={editor.mode}
          user={editor.user}
          onClose={() => setEditor({ mode: 'closed', user: null })}
          onSave={saveUser}
        />
      ) : null}
    </>
  );
}

function VirtualUserEditor({ mode, user, onClose, onSave }) {
  const [form, setForm] = useState(() => buildVirtualUserForm(user));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEscapeKey(onClose);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function togglePermission(permission) {
    setForm((current) => {
      const permissions = new Set(current.permissions);
      if (permissions.has(permission)) {
        permissions.delete(permission);
      } else {
        permissions.add(permission);
      }
      return { ...current, permissions: [...permissions] };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSave({
        ...form,
        username: form.username.replace(/^_+/, ''),
        password: form.password,
        permissions: form.permissions,
      });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor virtual-user-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">{mode === 'edit' ? 'Edit virtual user' : 'New virtual user'}</span>
          <button aria-label="Close virtual user editor" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>{mode === 'edit' ? 'Update access' : 'Create wrapper login'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <div className="form-grid two">
              <label>
                Username
                <input onChange={(event) => updateField('username', event.target.value)} placeholder="_frontdesk" required value={form.username} />
              </label>
              <label>
                Display name
                <input onChange={(event) => updateField('display_name', event.target.value)} placeholder="Front desk" required value={form.display_name} />
              </label>
            </div>
            <label>
              {mode === 'edit' ? 'New password' : 'Password'}
              <input
                autoComplete="new-password"
                onChange={(event) => updateField('password', event.target.value)}
                placeholder={mode === 'edit' ? 'Leave blank to keep current password' : 'Set password'}
                required={mode === 'create'}
                type="password"
                value={form.password}
              />
            </label>
            <label className="check-row">
              <input checked={form.is_active} onChange={(event) => updateField('is_active', event.target.checked)} type="checkbox" />
              Active
            </label>
            <div className="permission-picker">
              {virtualPermissionGroups.map((group) => (
                <div className="permission-section" key={group.label}>
                  <span>{group.label}</span>
                  <div>
                    {group.options.map((permission) => (
                      <label className="check-row" key={permission}>
                        <input checked={form.permissions.includes(permission)} onChange={() => togglePermission(permission)} type="checkbox" />
                        {permission}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={saving} type="submit">
                {saving ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create user'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
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

function NoAccessPage({ displayName, onLogout }) {
  return (
    <>
      <header className="topbar">
        <div>
          <h1>Limited access</h1>
          <p>{displayName} does not have any screens enabled yet.</p>
        </div>
        <button className="logout-button" onClick={onLogout} type="button">
          <LogOut size={17} />
          Logout
        </button>
      </header>

      <section className="handoff-grid">
        <article>
          <span>Permissions</span>
          <strong>No screens selected</strong>
          <p>Ask the master account to update this virtual user's visible screens.</p>
        </article>
      </section>
    </>
  );
}

function CalendarPage({ cacheScope = 'session', canViewRevenue = true, canWriteBookings = true, displayName, isMobileApp = false, isVirtualUser = false, mitraId, onLogout, onUseMobileView }) {
  const [view, setView] = useState(() => (isMobileApp ? 'day' : 'week'));
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({ loading: true, error: '', courts: [], openHour: null, bookingsByDate: {} });
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [placeholderEditor, setPlaceholderEditor] = useState({ mode: 'closed', booking: null });
  const [bookingActionEditor, setBookingActionEditor] = useState({ mode: 'closed', booking: null, draft: null });
  const [placeholderStatus, setPlaceholderStatus] = useState({ state: 'idle', message: '' });
  const [hiddenAboveCount, setHiddenAboveCount] = useState(0);
  const [hiddenBelowCount, setHiddenBelowCount] = useState(0);
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);
  const calendarPanelRef = useRef(null);
  const lastRefreshKeyRef = useRef(refreshKey);
  const lastSelectionScopeRef = useRef({ cacheScope, mitraId, selectedDate });
  const autoDayScrollKeyRef = useRef('');

  const weekDays = getWeekDays(selectedDate);
  const activeBookings = state.bookingsByDate[selectedDate] || [];
  const selectedDaySummary = summarizeDay(activeBookings, state.openHour, state.courts.length, canViewRevenue);
  const weekSummary = summarizeWeek(weekDays, state.bookingsByDate, state.openHour, state.courts.length, canViewRevenue);
  const showDetailPanel = !isMobileApp && (selectedBooking || showSummaryPanel);
  const isPlaceholderEditorOpen = placeholderEditor.mode !== 'closed';
  const isBookingActionEditorOpen = bookingActionEditor.mode !== 'closed';
  const showCalendarFeedback = Boolean(state.error || (placeholderStatus.message && !isPlaceholderEditorOpen && !isBookingActionEditorOpen));

  useEffect(() => {
    if (isMobileApp) setView('day');
  }, [isMobileApp]);

  function closePlaceholderEditor() {
    setPlaceholderEditor({ mode: 'closed', booking: null, draft: null });
  }

  function closeBookingActionEditor() {
    setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
  }

  function closeCalendarDetail() {
    setSelectedBooking(null);
    setShowSummaryPanel(false);
  }

  useEscapeKey(() => {
    if (isBookingActionEditorOpen) {
      closeBookingActionEditor();
      return;
    }
    if (isPlaceholderEditorOpen) {
      closePlaceholderEditor();
      return;
    }
    closeCalendarDetail();
  }, isBookingActionEditorOpen || isPlaceholderEditorOpen || Boolean(selectedBooking) || showSummaryPanel);

  useEffect(() => {
    let active = true;
    const forceRefresh = refreshKey !== lastRefreshKeyRef.current;
    const selectionScopeChanged = lastSelectionScopeRef.current.cacheScope !== cacheScope
      || lastSelectionScopeRef.current.mitraId !== mitraId
      || lastSelectionScopeRef.current.selectedDate !== selectedDate;
    const hasFreshCachedData = !forceRefresh && hasCalendarDataCache({ cacheScope, mitraId, selectedDate, weekDays });

    lastRefreshKeyRef.current = refreshKey;
    lastSelectionScopeRef.current = { cacheScope, mitraId, selectedDate };

    setState((current) => ({ ...current, loading: !hasFreshCachedData, error: '' }));
    if (selectionScopeChanged) setSelectedBooking(null);

    loadCalendarData({ cacheScope, forceRefresh, mitraId, selectedDate, weekDays })
      .then((data) => {
        if (active) setState({ loading: false, error: '', ...data });
      })
      .catch((error) => {
        if (active) setState((current) => ({ ...current, loading: false, error: error.message }));
      });

    return () => {
      active = false;
    };
  }, [cacheScope, mitraId, selectedDate, refreshKey]);

  useEffect(() => {
    if (view !== 'day' || state.loading || !isTodayDate(selectedDate)) {
      autoDayScrollKeyRef.current = '';
      return undefined;
    }

    if (autoDayScrollKeyRef.current === selectedDate) return undefined;
    autoDayScrollKeyRef.current = selectedDate;

    const frame = window.requestAnimationFrame(() => {
      scrollDayCalendarToCurrentTime(calendarPanelRef.current, state.openHour);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedDate, state.loading, state.openHour, view]);

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

  function requireBookingWriteAccess() {
    if (canWriteBookings) return true;
    setPlaceholderStatus({
      state: 'error',
      message: 'This virtual user needs Calendar booking permission to write real bookings.',
    });
    return false;
  }

  function openCreateRealBooking(draft = null) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'create-booking', booking: null, draft });
  }

  function openConvertPlaceholder(booking) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'convert-placeholder', booking, draft: null });
  }

  function openPaymentProof(booking) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'payment-proof', booking, draft: null });
  }

  function openRescheduleBooking(booking) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'reschedule', booking, draft: null });
  }

  function openCancelBooking(booking) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'cancel', booking, draft: null });
  }

  function openBookingNotes(booking) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'notes', booking, draft: null });
  }

  function requestCalendarRefresh() {
    setRefreshKey((current) => current + 1);
  }

  async function savePlaceholder(form) {
    setPlaceholderStatus({ state: 'loading', message: 'Saving placeholder...' });
    const editingId = placeholderEditor.mode === 'edit' ? placeholderEditor.booking?.placeholder_id || placeholderEditor.booking?.id : null;
    const selectedCourtIds = getSelectedCourtIds(form);
    const { court_ids: _courtIds, duration_mode: _durationMode, ...formPayload } = form;

    if (!selectedCourtIds.length) {
      throw new Error('Select at least one court.');
    }

    const buildPayload = (courtId) => {
      const court = state.courts.find((item) => item.id === courtId);
      const payload = {
        ...formPayload,
        mitra_id: mitraId,
        court_id: courtId,
        court_name: court?.name || form.court_name || '',
      };
      if (canViewRevenue) {
        payload.estimated_price = Number(form.estimated_price || 0);
      } else {
        delete payload.estimated_price;
      }
      return payload;
    };

    try {
      if (editingId) {
        const saved = await apiRequest(`/api/placeholder-bookings/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(buildPayload(form.court_id || selectedCourtIds[0])),
        });
        setPlaceholderStatus({ state: 'success', message: 'Placeholder saved.' });
        setPlaceholderEditor({ mode: 'closed', booking: null, draft: null });
        requestCalendarRefresh();
        if (saved?.data) setSelectedBooking(normalizePlaceholderBooking(saved.data));
        return;
      }

      // Each court is an independent POST. Use allSettled so one failure does
      // not discard the placeholders that did save (Promise.all would still
      // fire every request but report the whole batch as failed).
      const results = await Promise.allSettled(selectedCourtIds.map((courtId) => apiRequest('/api/placeholder-bookings', {
        method: 'POST',
        body: JSON.stringify(buildPayload(courtId)),
      })));
      const saved = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      const failed = results.filter((result) => result.status === 'rejected');

      // Nothing saved: surface the error in the still-open editor so the user
      // can retry without creating duplicates.
      if (!saved.length) throw failed[0].reason;

      requestCalendarRefresh();
      const firstSaved = saved.map((item) => item?.data).find(Boolean);
      if (firstSaved) setSelectedBooking(normalizePlaceholderBooking(firstSaved));

      // Partial success: the saved courts are committed, so close the editor to
      // avoid duplicate re-submits and report which courts still need attention.
      if (failed.length) {
        setPlaceholderStatus({
          state: 'error',
          message: `Saved ${saved.length} of ${selectedCourtIds.length} placeholders. ${failed.length} failed: ${failed[0].reason?.message || 'unknown error'}`,
        });
        setPlaceholderEditor({ mode: 'closed', booking: null, draft: null });
        return;
      }

      setPlaceholderStatus({
        state: 'success',
        message: saved.length > 1 ? `${saved.length} placeholders saved.` : 'Placeholder saved.',
      });
      setPlaceholderEditor({ mode: 'closed', booking: null, draft: null });
    } catch (error) {
      // Clear the loading state so the submit button recovers; rethrow so the
      // editor can surface the friendly conflict message inline.
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to save placeholder.' });
      throw error;
    }
  }

  async function deletePlaceholder(booking) {
    const id = booking?.placeholder_id || booking?.id;
    if (!id) return;
    setPlaceholderStatus({ state: 'loading', message: 'Deleting placeholder...' });
    await apiRequest(`/api/placeholder-bookings/${id}`, { method: 'DELETE' });
    setPlaceholderStatus({ state: 'success', message: 'Placeholder deleted.' });
    setSelectedBooking(null);
    requestCalendarRefresh();
  }

  async function saveRealBooking(booking, form) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    const isPlaceholderConversion = Boolean(booking?.is_placeholder);
    const placeholderId = booking?.placeholder_id || booking?.id;
    if (isPlaceholderConversion && !placeholderId) throw new Error('Placeholder booking ID is missing.');

    const bookingDates = isPlaceholderConversion ? [form.date].filter(Boolean) : getBookingFormDates(form);
    const bulkCount = bookingDates.length;
    const createdBookings = [];
    let currentDate = '';
    if (!bookingDates.length) throw new Error('Select at least one date.');

    setPlaceholderStatus({
      state: 'loading',
      message: isPlaceholderConversion ? 'Converting placeholder...' : bulkCount > 1 ? `Creating ${bulkCount} bookings...` : 'Creating booking...',
    });

    try {
      for (const date of bookingDates) {
        currentDate = date;
        const response = await apiRequest('/api/admin/court-booking', {
          method: 'POST',
          body: JSON.stringify(buildCourtBookingPayload({ form: { ...form, date }, mitraId })),
        });

        const bookingId = response?.booking_id || response?.data?.booking_id || response?.id || '';
        const transId = response?.trans_id || response?.data?.trans_id || '';
        createdBookings.push({ bookingId, date, transId });
      }

      const warnings = [];

      if (form.receiptFile) {
        for (const createdBooking of createdBookings) {
          if (!createdBooking.transId) {
            warnings.push(`Receipt was not uploaded for ${formatLongDate(createdBooking.date)} because the booking response did not include a transaction ID.`);
          } else {
            try {
              await uploadBookingReceipt({ attachmentType: form.attachmentType, file: form.receiptFile, transId: createdBooking.transId });
            } catch (uploadError) {
              warnings.push(`Receipt upload failed for ${formatLongDate(createdBooking.date)}: ${uploadError.message}`);
            }
          }
        }
      }

      if (isPlaceholderConversion) {
        try {
          await apiRequest(`/api/placeholder-bookings/${placeholderId}`, { method: 'DELETE' });
        } catch (deleteError) {
          warnings.push(`Real booking was created, but the placeholder could not be removed: ${deleteError.message}`);
        }
      }

      setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
      setSelectedBooking(null);
      setPlaceholderStatus({
        state: warnings.length ? 'warning' : 'success',
        message: warnings.length
          ? `${bulkCount > 1 ? `${bulkCount} bookings created` : `Booking created${createdBookings[0]?.bookingId ? ` (${createdBookings[0].bookingId})` : ''}`}. ${warnings.join(' ')}`
          : isPlaceholderConversion ? 'Placeholder converted to a real booking.' : bulkCount > 1 ? `${bulkCount} bookings created.` : 'Booking created.',
      });
      requestCalendarRefresh();
    } catch (convertError) {
      const partialMessage = createdBookings.length
        ? `${createdBookings.length} of ${bulkCount} bookings were created before ${formatLongDate(currentDate)} failed. `
        : '';
      const message = `${partialMessage}${convertError.message || 'Unable to save booking.'}`;
      setPlaceholderStatus({ state: 'error', message });
      if (createdBookings.length) requestCalendarRefresh();
      throw new Error(message);
    }
  }

  async function markBookingPaid(booking) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    setPlaceholderStatus({ state: 'loading', message: 'Marking booking paid...' });
    try {
      await apiRequest('/api/admin/pay-court-booking', {
        method: 'POST',
        body: JSON.stringify({
          mitra_id: mitraId,
          id: booking.id,
          payment_method: 'offline',
        }),
      });
      setPlaceholderStatus({ state: 'success', message: 'Booking marked paid.' });
      requestCalendarRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to mark booking paid.' });
      throw error;
    }
  }

  async function savePaymentProof(booking, form) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    if (!booking?.trans_id) throw new Error('This booking does not have a transaction ID for attachment upload.');
    if (!form.receiptFile) throw new Error('Select a transfer receipt first.');
    setPlaceholderStatus({ state: 'loading', message: 'Uploading receipt...' });
    try {
      await uploadBookingReceipt({ attachmentType: form.attachmentType, file: form.receiptFile, transId: booking.trans_id });
      setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
      setPlaceholderStatus({ state: 'success', message: 'Receipt uploaded.' });
      requestCalendarRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to upload receipt.' });
      throw error;
    }
  }

  async function rescheduleBooking(booking, form) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    setPlaceholderStatus({ state: 'loading', message: 'Rescheduling booking...' });
    try {
      await apiRequest('/api/admin/reschedule-court-time', {
        method: 'POST',
        body: JSON.stringify({
          mitra_id: mitraId,
          id: booking.id,
          date: form.date,
          type: getCourtBookingWriteType(booking),
          court_id: form.court_id,
          start_hours: formatUpstreamTime(form.start_time),
          duration: getTimeRangeDurationMinutes(form),
          adjust_payment: true,
          adjust_payment_method: 'offline',
        }),
      });
      setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
      setSelectedBooking(null);
      setPlaceholderStatus({ state: 'success', message: 'Booking rescheduled.' });
      requestCalendarRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to reschedule booking.' });
      throw error;
    }
  }

  async function cancelBooking(booking, form) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    setPlaceholderStatus({ state: 'loading', message: 'Canceling booking...' });
    try {
      const detailedBooking = await fetchBookingDetailForAction({ booking, mitraId }).catch(() => booking);
      await apiRequest('/api/admin/cancel-cal-court', {
        method: 'POST',
        body: JSON.stringify(buildCancelBookingPayload({ booking: detailedBooking, form, mitraId })),
      });
      setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
      setSelectedBooking(null);
      setPlaceholderStatus({ state: 'success', message: 'Booking canceled.' });
      requestCalendarRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to cancel booking.' });
      throw error;
    }
  }

  async function saveBookingNotes(booking, form) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    setPlaceholderStatus({ state: 'loading', message: 'Saving notes...' });
    try {
      await apiRequest('/api/admin/change-notes', {
        method: 'POST',
        body: JSON.stringify({
          mitra_id: mitraId,
          id: booking.id,
          type: getCourtBookingWriteType(booking),
          notes: form.notes || '',
        }),
      });
      setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
      setPlaceholderStatus({ state: 'success', message: 'Booking notes saved.' });
      requestCalendarRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to save notes.' });
      throw error;
    }
  }

  function findPlaceholderConflicts(form) {
    const bookings = state.bookingsByDate[form.date] || [];
    const selectedCourtIds = new Set(getSelectedCourtIds(form));
    const candidate = {
      time: `${form.start_time}-${form.end_time}`,
    };
    const editingIds = new Set([placeholderEditor.booking?.id, placeholderEditor.booking?.placeholder_id].filter(Boolean));
    return bookings.filter((booking) => {
      if (editingIds.has(booking.id) || editingIds.has(booking.placeholder_id)) return false;
      return selectedCourtIds.has(booking.court_id) && bookingsOverlap(candidate, booking);
    });
  }

  function findRealBookingConflicts(form, sourceBooking = null) {
    const candidate = {
      time: `${form.start_time}-${form.end_time}`,
    };
    const sourceIds = new Set([sourceBooking?.id, sourceBooking?.placeholder_id].filter(Boolean));
    return getBookingFormDates(form).flatMap((date) => {
      const bookings = state.bookingsByDate[date] || [];
      return bookings.filter((booking) => {
        if (sourceIds.has(booking.id) || sourceIds.has(booking.placeholder_id)) return false;
        return !booking.is_placeholder && booking.court_id === form.court_id && bookingsOverlap(candidate, booking);
      }).map((booking) => ({ ...booking, conflict_date: date }));
    });
  }

  return (
    <div className={`calendar-page ${view}-mode ${showCalendarFeedback ? 'has-feedback' : ''} ${isMobileApp ? 'mobile-calendar-page' : ''}`}>
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
          <button onClick={requestCalendarRefresh} type="button">
            <RefreshCw size={15} />
          </button>
        </div>
        <button className="placeholder-create-button" onClick={openCreatePlaceholder} type="button">
          <Plus size={16} />
          Placeholder
        </button>
        {canWriteBookings ? (
          <button className="real-booking-create-button" onClick={() => openCreateRealBooking()} type="button">
            <CheckCircle2 size={16} />
            Booking
          </button>
        ) : null}
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

      {showCalendarFeedback ? (
        <div className="calendar-feedback">
          {state.error ? (
            <div className="calendar-error">
              <strong>Could not load calendar.</strong>
              <p>{state.error}</p>
            </div>
          ) : null}

          {placeholderStatus.message && !isPlaceholderEditorOpen && !isBookingActionEditorOpen ? (
            <div className={`calendar-status-message ${placeholderStatus.state}`} role="status">
              <span>{placeholderStatus.message}</span>
              {placeholderStatus.state !== 'loading' ? (
                <button
                  aria-label="Dismiss status message"
                  onClick={() => setPlaceholderStatus({ state: 'idle', message: '' })}
                  type="button"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
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
                canViewRevenue={canViewRevenue}
                courts={state.courts}
                openHour={state.openHour}
                selectedBooking={selectedBooking}
                selectedDate={selectedDate}
                onSelectBooking={setSelectedBooking}
              />
            ) : isMobileApp && view === 'week' ? (
              <MobileWeekCalendar
                bookingsByDate={state.bookingsByDate}
                canViewRevenue={canViewRevenue}
                courts={state.courts}
                openHour={state.openHour}
                selectedDate={selectedDate}
                weekDays={weekDays}
                onCreatePlaceholder={openCreatePlaceholder}
                onCreateRealBooking={openCreateRealBooking}
                onSelectBooking={setSelectedBooking}
                onSelectDate={setSelectedDate}
                onSwitchDay={() => setView('day')}
              />
            ) : view === 'day' ? (
              <DayCalendar
                bookings={activeBookings}
                canViewRevenue={canViewRevenue}
                courts={state.courts}
                openHour={state.openHour}
                selectedBooking={selectedBooking}
                selectedDate={selectedDate}
                onCreatePlaceholder={openCreatePlaceholder}
                onCreateRealBooking={openCreateRealBooking}
                onSelectBooking={setSelectedBooking}
              />
            ) : (
              <WeekCalendar
                bookingsByDate={state.bookingsByDate}
                canViewRevenue={canViewRevenue}
                courts={state.courts}
                openHour={state.openHour}
                selectedDate={selectedDate}
                weekDays={weekDays}
                onCreatePlaceholder={openCreatePlaceholder}
                onCreateRealBooking={openCreateRealBooking}
                onSelectBooking={setSelectedBooking}
                onSelectDate={setSelectedDate}
                onSwitchDay={() => setView('day')}
              />
            )}
          </div>
          {view === 'day' && hiddenAboveCount > 0 ? (
            <div className="scroll-more-indicator above">
              <span>{hiddenAboveCount} hidden above</span>
              <ChevronRight size={16} />
            </div>
          ) : null}
          {view === 'day' && hiddenBelowCount > 0 ? (
            <div className="scroll-more-indicator below">
              <span>{hiddenBelowCount} hidden below</span>
              <ChevronRight size={16} />
            </div>
          ) : null}
        </div>
        {showDetailPanel ? (
          <CalendarDetailPanel
            booking={selectedBooking}
            canViewRevenue={canViewRevenue}
            canWriteBookings={canWriteBookings}
            selectedDate={selectedDate}
            selectedDaySummary={selectedDaySummary}
            view={view}
            weekSummary={weekSummary}
            onClose={closeCalendarDetail}
            onCancelBooking={openCancelBooking}
            onConvertPlaceholder={openConvertPlaceholder}
            onCreatePlaceholder={openCreatePlaceholder}
            onDeletePlaceholder={deletePlaceholder}
            onEditPlaceholder={openEditPlaceholder}
            onEditBookingNotes={openBookingNotes}
            onMarkBookingPaid={markBookingPaid}
            onOpenDay={() => setView('day')}
            onRescheduleBooking={openRescheduleBooking}
            onUploadPaymentProof={openPaymentProof}
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
          canViewRevenue={canViewRevenue}
          conflicts={findPlaceholderConflicts}
          courts={state.courts}
          defaultDate={selectedDate}
          defaultName={displayName}
          draft={placeholderEditor.draft}
          isSaving={placeholderStatus.state === 'loading'}
          isVirtualUser={isVirtualUser}
          mode={placeholderEditor.mode}
          openHour={state.openHour}
          onClose={closePlaceholderEditor}
          onSave={savePlaceholder}
        />
      ) : null}
      {['create-booking', 'convert-placeholder'].includes(bookingActionEditor.mode) ? (
        <BookingWriteDialog
          actionMode={bookingActionEditor.mode}
          booking={bookingActionEditor.booking}
          canViewRevenue={canViewRevenue}
          conflicts={findRealBookingConflicts}
          courts={state.courts}
          defaultDate={selectedDate}
          draft={bookingActionEditor.draft}
          isSaving={placeholderStatus.state === 'loading'}
          openHour={state.openHour}
          onClose={closeBookingActionEditor}
          onSave={saveRealBooking}
        />
      ) : null}
      {bookingActionEditor.mode === 'payment-proof' ? (
        <PaymentProofDialog
          booking={bookingActionEditor.booking}
          isSaving={placeholderStatus.state === 'loading'}
          onClose={closeBookingActionEditor}
          onSave={savePaymentProof}
        />
      ) : null}
      {bookingActionEditor.mode === 'reschedule' ? (
        <RescheduleBookingDialog
          booking={bookingActionEditor.booking}
          canViewRevenue={canViewRevenue}
          courts={state.courts}
          isSaving={placeholderStatus.state === 'loading'}
          mitraId={mitraId}
          openHour={state.openHour}
          onClose={closeBookingActionEditor}
          onSave={rescheduleBooking}
        />
      ) : null}
      {bookingActionEditor.mode === 'cancel' ? (
        <CancelBookingDialog
          booking={bookingActionEditor.booking}
          isSaving={placeholderStatus.state === 'loading'}
          onClose={closeBookingActionEditor}
          onSave={cancelBooking}
        />
      ) : null}
      {bookingActionEditor.mode === 'notes' ? (
        <BookingNotesDialog
          booking={bookingActionEditor.booking}
          isSaving={placeholderStatus.state === 'loading'}
          onClose={closeBookingActionEditor}
          onSave={saveBookingNotes}
        />
      ) : null}
      {isMobileApp && selectedBooking ? (
        <div className="mobile-detail-backdrop" onClick={() => setSelectedBooking(null)}>
          <div onClick={(event) => event.stopPropagation()}>
            <CalendarDetailPanel
              booking={selectedBooking}
              canViewRevenue={canViewRevenue}
              canWriteBookings={canWriteBookings}
              selectedDate={selectedDate}
              selectedDaySummary={selectedDaySummary}
              view={view}
              weekSummary={weekSummary}
              onClose={() => setSelectedBooking(null)}
              onCancelBooking={openCancelBooking}
              onConvertPlaceholder={openConvertPlaceholder}
              onCreatePlaceholder={openCreatePlaceholder}
              onDeletePlaceholder={deletePlaceholder}
              onEditPlaceholder={openEditPlaceholder}
              onEditBookingNotes={openBookingNotes}
              onMarkBookingPaid={markBookingPaid}
              onOpenDay={() => setView('day')}
              onRescheduleBooking={openRescheduleBooking}
              onUploadPaymentProof={openPaymentProof}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileDayAgenda({ bookings, canViewRevenue = true, courts, openHour, selectedBooking, selectedDate, onSelectBooking }) {
  const courtBookings = courts.length ? courts.map((court) => ({
    court,
    entries: buildCourtTimelineEntries(buildCalendarDisplayBookings(bookings.filter((booking) => booking.court_id === court.id)), openHour),
  })) : [{ court: { id: 'all', name: 'All courts' }, entries: buildCourtTimelineEntries(buildCalendarDisplayBookings(bookings), openHour) }];

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
                    <strong>{getBookingTitle(entry.booking)}</strong>
                    <small>{getBookingMeta(entry.booking, canViewRevenue)}</small>
                  </span>
                  <span className="mobile-payment-pill">
                    {getBookingPillLabel(entry.booking) || (entry.booking.booking_paid ? 'Paid' : 'Unpaid')}
                  </span>
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

function MobileWeekCalendar({ bookingsByDate, canViewRevenue = true, courts, openHour, selectedDate, weekDays, onCreatePlaceholder, onSelectBooking, onSelectDate, onSwitchDay }) {
  return (
    <div className="mobile-week-list">
      {weekDays.map((date) => {
        const bookings = bookingsByDate[date] || [];
        const summary = summarizeDay(bookings, openHour, courts.length, canViewRevenue);
        return (
          <article className={`mobile-week-row ${date === selectedDate ? 'selected' : ''}`} key={date}>
            <button className="mobile-week-summary" onClick={() => onSelectDate(date)} type="button">
              <span>
                <strong>{formatWeekday(date)}</strong>
                <small>{formatDayNumber(date)}</small>
              </span>
              <span className="mobile-week-stats">
                <strong>{bookings.length} bookings</strong>
                <small>{summary.bookedHours.toFixed(1)}h · {formatMoney(summary.revenue, canViewRevenue)}</small>
              </span>
              <span className="occupancy-bar">
                <span style={{ width: `${summary.occupancy}%` }} />
              </span>
            </button>

            {date === selectedDate ? (
              <div className="mobile-week-detail">
                {courts.slice(0, 4).map((court) => {
                  const courtBookings = buildCalendarDisplayBookings(bookings.filter((booking) => booking.court_id === court.id));
                  return (
                    <div className="mobile-week-court" key={court.id}>
                      <span>{court.name}</span>
                      {courtBookings.length ? courtBookings.slice(0, 2).map((booking) => (
                        <button className={getBookingTone(booking)} key={booking.id} onClick={() => onSelectBooking(booking)} type="button">
                          <strong>{getStartLabel(booking)}</strong>
                          <span>{getBookingTitle(booking)}</span>
                        </button>
                      )) : (
                        <button
                          className="mobile-week-availability"
                          onClick={() => onCreatePlaceholder?.({
                            court_id: court.id,
                            court_name: court.name,
                            date,
                            start_time: openHour?.open_hours || '06:00',
                            end_time: shiftTime(openHour?.open_hours || '06:00', 60),
                          })}
                          type="button"
                        >
                          <strong>{formatCompactTime(parseTimeToMinutes(openHour?.open_hours || '06:00'))}</strong>
                          <span>Available</span>
                        </button>
                      )}
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

function DayCalendar({ bookings, canViewRevenue = true, courts, openHour, selectedBooking, selectedDate, onCreatePlaceholder, onSelectBooking }) {
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
            {buildCalendarDisplayBookings(bookings.filter((booking) => booking.court_id === court.id)).map((booking) => {
              const position = getBookingPosition(booking, startMinutes, totalMinutes);
              return (
                <button
                  className={`booking-block ${getBookingTone(booking)} ${selectedBooking?.id === booking.id ? 'selected' : ''}`}
                  key={booking.id}
                  onClick={() => onSelectBooking(booking)}
                  style={{ top: `${position.top}%`, height: `${position.height}%` }}
                  type="button"
                >
                  <strong>{getBookingTitle(booking)}</strong>
                  <span>{booking.time}</span>
                  <small>{getBookingMeta(booking, canViewRevenue)}</small>
                  {getBookingPillLabel(booking) ? (
                    <em className={booking.is_waitlist ? 'waitlist-pill' : ''}>{getBookingPillLabel(booking)}</em>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekCalendar({ bookingsByDate, canViewRevenue = true, courts, openHour, selectedDate, weekDays, onCreatePlaceholder, onSelectBooking, onSelectDate, onSwitchDay }) {
  return (
    <div className="week-calendar">
      {weekDays.map((date) => {
        const bookings = bookingsByDate[date] || [];
        return (
          <WeekDayColumn
            bookings={bookings}
            canViewRevenue={canViewRevenue}
            courts={courts}
            date={date}
            isSelected={date === selectedDate}
            key={date}
            openHour={openHour}
            onCreatePlaceholder={onCreatePlaceholder}
            onSelectBooking={onSelectBooking}
            onSelectDate={onSelectDate}
            onSwitchDay={onSwitchDay}
          />
        );
      })}
    </div>
  );
}

function WeekDayColumn({ bookings, canViewRevenue = true, courts, date, isSelected, openHour, onCreatePlaceholder, onSelectBooking, onSelectDate, onSwitchDay }) {
  const [hiddenCounts, setHiddenCounts] = useState({ above: 0, below: 0 });
  const courtListRef = useRef(null);
  const summary = summarizeDay(bookings, openHour, courts.length, canViewRevenue);
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
      <div className="week-day-header">
        <span>{formatWeekday(date)}</span>
        <strong>{formatDayNumber(date)}</strong>
        <small>{bookingLabel}</small>
        <div className="occupancy-bar">
          <span style={{ width: `${summary.occupancy}%` }} />
        </div>
      </div>
      <div className="week-day-metrics">
        <span>{summary.bookedHours.toFixed(1)}h booked</span>
        <em>{formatMoney(summary.revenue, canViewRevenue)}</em>
      </div>
      <div className="week-day-body">
        <div className="week-court-list" ref={courtListRef}>
          {courts.map((court) => {
            const courtBookings = bookings.filter((booking) => booking.court_id === court.id);
            const timelineEntries = buildCourtTimelineEntries(buildCalendarDisplayBookings(courtBookings), openHour);
            return (
              <div className="week-court" key={court.id}>
                <p>{court.name}</p>
                {timelineEntries.length ? timelineEntries.map((entry) => (
                  entry.type === 'availability' ? (
                    <button
                      aria-label={`Create placeholder for ${court.name} on ${formatLongDate(date)} at ${formatTimeInput(entry.startMinutes)}`}
                      className="availability-gap"
                      key={entry.id}
                      onClick={() => onCreatePlaceholder?.({
                        court_id: court.id,
                        court_name: court.name,
                        date,
                        start_time: formatTimeInput(entry.startMinutes),
                        end_time: formatTimeInput(Math.min(entry.startMinutes + 60, entry.endMinutes)),
                      })}
                      type="button"
                    >
                      <strong>{entry.label}</strong>
                    </button>
                  ) : (
                    <button className={`week-booking-card ${getBookingTone(entry.booking)}`} key={entry.booking.id} onClick={() => onSelectBooking(entry.booking)} type="button">
                      <span>{getStartLabel(entry.booking)}</span>
                      <strong>{getBookingTitle(entry.booking)}</strong>
                      {getBookingPillLabel(entry.booking) ? (
                        <small className={entry.booking.is_waitlist ? 'waitlist-pill' : ''}>{getBookingPillLabel(entry.booking)}</small>
                      ) : null}
                    </button>
                  )
                )) : <span className="empty-slot">Available</span>}
              </div>
            );
          })}
        </div>
        {hiddenCounts.above > 0 ? (
          <div className="week-scroll-more-indicator above">
            <span>{hiddenCounts.above} hidden above</span>
            <ChevronRight size={14} />
          </div>
        ) : null}
        {hiddenCounts.below > 0 ? (
          <div className="week-scroll-more-indicator below">
            <span>{hiddenCounts.below} hidden below</span>
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

function CalendarDetailPanel({
  booking,
  canViewRevenue = true,
  canWriteBookings = true,
  selectedDate,
  selectedDaySummary,
  view,
  weekSummary,
  onCancelBooking,
  onClose,
  onConvertPlaceholder,
  onCreatePlaceholder,
  onDeletePlaceholder,
  onEditBookingNotes,
  onEditPlaceholder,
  onMarkBookingPaid,
  onOpenDay,
  onRescheduleBooking,
  onUploadPaymentProof,
}) {
  if (booking) {
    const isPlaceholder = booking.is_placeholder;
    const conflictItems = getBookingConflictItems(booking);
    const placeholderStack = getPlaceholderStackItems(booking);
    const waitlistItems = getWaitlistItems(booking);
    const hasPlaceholderStack = placeholderStack.length > 1;
    const canConvertPlaceholder = canWriteBookings && isPlaceholder && !hasBookingConflict(booking);
    return (
      <aside className="calendar-detail">
        <div className="panel-label-row">
          <span className="panel-label">{isPlaceholder ? hasPlaceholderStack ? 'Placeholder stack' : 'Placeholder booking' : 'Booking detail'}</span>
          {onClose ? (
            <button aria-label="Close booking detail" onClick={onClose} type="button">
              <X size={16} />
            </button>
          ) : null}
        </div>
        <h2>{getBookingTitle(booking)}</h2>
        {isPlaceholder && conflictItems.length ? (
          <div className="detail-conflict-alert">
            <strong>Blocked by live booking</strong>
            {conflictItems.slice(0, 3).map((item) => (
              <span key={`${item.type}-${item.id}-${item.time}`}>
                {item.name} · {item.court} · {item.time}
              </span>
            ))}
          </div>
        ) : null}
        {!isPlaceholder && waitlistItems.length ? (
          <div className="detail-conflict-alert waitlist">
            <strong>{waitlistItems.length} waitlist placeholder{waitlistItems.length > 1 ? 's' : ''}</strong>
            {waitlistItems.slice(0, 4).map((item) => (
              <span key={`${item.type}-${item.id}-${item.time}`}>
                {item.name} · {item.time}
              </span>
            ))}
          </div>
        ) : null}
        {hasPlaceholderStack ? (
          <div className="detail-stack-list">
            <strong>Placeholder candidates</strong>
            {placeholderStack.map((item) => (
              <div key={item.placeholder_id || item.id}>
                <span>
                  <b>{item.booking_owner || item.name}</b>
                  <small>{formatStatus(item.status)} · {item.customer_contact || 'No contact'}</small>
                </span>
                <button onClick={() => onEditPlaceholder?.(item)} type="button"><Pencil size={14} /> Edit</button>
                <button className="danger-action" onClick={() => onDeletePlaceholder?.(item)} type="button"><Trash2 size={14} /> Delete</button>
              </div>
            ))}
          </div>
        ) : null}
        <dl>
          <div><dt>Court</dt><dd>{booking.court_name || booking.court_id}</dd></div>
          {isPlaceholder ? <div><dt>Date</dt><dd>{formatLongDate(booking.date)}</dd></div> : null}
          <div><dt>Time</dt><dd>{booking.time}</dd></div>
          <div><dt>Duration</dt><dd>{booking.duration || getDurationMinutes(booking)} min</dd></div>
          <div><dt>Type</dt><dd>{isPlaceholder ? booking.is_waitlist ? 'Waitlist placeholder' : hasPlaceholderStack ? 'Placeholder stack' : 'Local placeholder' : booking.booking_type || booking.type}</dd></div>
          <div><dt>Payment</dt><dd>{isPlaceholder ? formatStatus(booking.status) : booking.booking_paid ? 'Paid' : 'Unpaid'}</dd></div>
          <div><dt>Price</dt><dd>{formatMoney(booking.price, canViewRevenue)}</dd></div>
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
            {canWriteBookings ? (
              <button className="primary-detail-action" disabled={!canConvertPlaceholder} onClick={() => onConvertPlaceholder?.(booking)} type="button">
                <CheckCircle2 size={15} /> Convert to booking
              </button>
            ) : null}
            <button onClick={() => onCreatePlaceholder?.(getSlotDraftFromBooking(booking, selectedDate))} type="button"><Plus size={15} /> Add another placeholder</button>
            <button onClick={() => onEditPlaceholder?.(booking)} type="button"><Pencil size={15} /> Edit placeholder</button>
            <button className="danger-action" onClick={() => onDeletePlaceholder?.(booking)} type="button"><Trash2 size={15} /> Delete</button>
            {canWriteBookings && hasBookingConflict(booking) ? <p className="detail-action-note danger">A live booking already owns this slot. Move or cancel that booking before converting this placeholder.</p> : null}
          </div>
        ) : canWriteBookings ? (
          <div className="detail-actions">
            {!booking.booking_paid ? (
              <button className="primary-detail-action" onClick={() => onMarkBookingPaid?.(booking)} type="button">
                <CheckCircle2 size={15} /> Mark paid
              </button>
            ) : null}
            <button onClick={() => onCreatePlaceholder?.(getSlotDraftFromBooking(booking, selectedDate))} type="button"><Plus size={15} /> Add waitlist placeholder</button>
            <button onClick={() => onUploadPaymentProof?.(booking)} type="button"><Upload size={15} /> Upload receipt</button>
            <button onClick={() => onRescheduleBooking?.(booking)} type="button"><CalendarDays size={15} /> Reschedule</button>
            <button onClick={() => onEditBookingNotes?.(booking)} type="button"><Pencil size={15} /> Edit notes</button>
            <button onClick={() => copyText(booking.trans_id)} type="button"><Copy size={15} /> Copy ID</button>
            <button className="danger-action" onClick={() => onCancelBooking?.(booking)} type="button"><Trash2 size={15} /> Cancel booking</button>
          </div>
        ) : (
          <div className="detail-actions">
            <button onClick={() => copyText(booking.trans_id)} type="button"><Copy size={15} /> Copy ID</button>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="calendar-detail">
      <div className="panel-label-row">
        <span className="panel-label">{view === 'week' ? 'Week summary' : 'Day summary'}</span>
        {onClose ? (
          <button aria-label="Close summary" onClick={onClose} type="button">
            <X size={16} />
          </button>
        ) : null}
      </div>
      <h2>{view === 'week' ? formatWeekRange(selectedDate) : formatLongDate(selectedDate)}</h2>
      <dl>
        <div><dt>Total bookings</dt><dd>{view === 'week' ? weekSummary.totalBookings : selectedDaySummary.bookingCount}</dd></div>
        <div><dt>Booked hours</dt><dd>{(view === 'week' ? weekSummary.bookedHours : selectedDaySummary.bookedHours).toFixed(1)}h</dd></div>
        <div><dt>Estimated revenue</dt><dd>{formatMoney(view === 'week' ? weekSummary.revenue : selectedDaySummary.revenue, canViewRevenue)}</dd></div>
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

function BookingWriteDialog({ actionMode, booking, canViewRevenue = true, conflicts, courts, defaultDate, draft, isSaving, openHour, onClose, onSave }) {
  const [form, setForm] = useState(() => buildBookingWriteForm({ booking, courts, defaultDate, draft, openHour }));
  const [error, setError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => form.date || defaultDate || toDateInputValue(new Date()));
  const [multiDate, setMultiDate] = useState(() => (form.additional_dates?.length || 0) > 0);
  const [playerState, setPlayerState] = useState({ error: '', loading: false, results: [] });
  const isRegistered = form.customerMode === 'registered';
  const searchQuery = form.playerSearch.trim();
  const isConversion = actionMode === 'convert-placeholder';
  const bookingDates = isConversion ? [form.date].filter(Boolean) : getBookingFormDates(form);
  const selectedDateSet = new Set(bookingDates);
  const monthCells = buildMonthMatrix(calendarMonth);
  const todayValue = toDateInputValue(new Date());
  const conflictList = conflicts(form, booking);
  const hasConflict = conflictList.length > 0;
  const title = isConversion ? 'Create real booking' : bookingDates.length > 1 ? 'Create bookings' : 'Create booking';
  const panelLabel = isConversion ? 'Convert placeholder' : 'New real booking';

  useEffect(() => {
    if (!isRegistered || form.selectedPlayer || searchQuery.length < REGISTERED_PLAYER_SEARCH_MIN_LENGTH) {
      setPlayerState({ error: '', loading: false, results: [] });
      return undefined;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setPlayerState((current) => ({ ...current, error: '', loading: true }));
      apiRequest(`/api/admin/player/search-player-lists?per_page=100&search=${encodeURIComponent(searchQuery)}`)
        .then((response) => {
          if (!active) return;
          setPlayerState({ error: '', loading: false, results: normalizePlayerSearchResults(response) });
        })
        .catch((searchError) => {
          if (!active) return;
          setPlayerState({ error: searchError.message, loading: false, results: [] });
        });
    }, 260);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [form.selectedPlayer, isRegistered, searchQuery]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'court_id' ? { court_name: courts.find((court) => court.id === value)?.name || '' } : null),
      ...(field === 'date' ? { additional_dates: normalizeAdditionalBookingDates(current.additional_dates, value) } : null),
      ...(field === 'start_time' ? { end_time: shiftTime(value, getTimeRangeDurationMinutes(current)) } : null),
      ...(field === 'end_time' ? { duration_mode: inferPlaceholderDurationMode(current.start_time, value) } : null),
      ...(field === 'playerSearch' ? { selectedPlayer: null } : null),
      ...(field === 'customerMode' && value === 'offline' ? { selectedPlayer: null } : null),
    }));
  }

  function selectPlayer(player) {
    setForm((current) => ({
      ...current,
      playerSearch: player.name || '',
      selectedPlayer: player,
    }));
  }

  function applyBookingDates(dates) {
    const sorted = [...new Set(dates.map((date) => String(date || '').trim()).filter(Boolean))].sort();
    if (!sorted.length) return;
    const [anchor, ...rest] = sorted;
    setForm((current) => ({ ...current, date: anchor, additional_dates: rest }));
  }

  function toggleBookingDate(dateValue) {
    if (!dateValue) return;
    if (isConversion) {
      updateField('date', dateValue);
      return;
    }
    const next = new Set(getBookingFormDates(form));
    if (next.has(dateValue)) {
      if (next.size === 1) return; // keep at least one date
      next.delete(dateValue);
    } else {
      next.add(dateValue);
    }
    applyBookingDates([...next]);
  }

  function shiftCalendarMonth(delta) {
    const base = new Date(`${calendarMonth}T00:00:00`);
    setCalendarMonth(toDateInputValue(new Date(base.getFullYear(), base.getMonth() + delta, 1)));
  }

  function enableMultiDate() {
    setCalendarMonth(form.date || calendarMonth);
    setMultiDate(true);
  }

  function collapseToSingleDate() {
    setForm((current) => ({ ...current, additional_dates: [] }));
    setMultiDate(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const selectedDates = isConversion ? [form.date].filter(Boolean) : getBookingFormDates(form);

    if (!form.court_id) {
      setError('Select a court.');
      return;
    }
    if (!selectedDates.length) {
      setError('Select at least one date.');
      return;
    }
    if (parseTimeToMinutes(form.end_time) <= parseTimeToMinutes(form.start_time)) {
      setError('End time must be after start time.');
      return;
    }
    if (hasConflict) {
      setError('This booking overlaps with another booking on the selected court.');
      return;
    }
    if (isRegistered && !form.selectedPlayer?.id) {
      setError('Select a registered player first.');
      return;
    }
    if (!isRegistered && !form.offlineUser.trim()) {
      setError('Enter the offline customer name.');
      return;
    }
    if (Number.isNaN(Number(form.price || 0)) || Number(form.price || 0) < 0) {
      setError('Booking price must be zero or greater.');
      return;
    }

    try {
      await onSave(booking, form);
    } catch (convertError) {
      setError(convertError.message || 'Unable to save booking.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor conversion-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">{panelLabel}</span>
          <button aria-label="Close booking panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>{title}</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <div className="conversion-summary">
              <span>{form.court_name || form.court_id || 'Court'}</span>
              <strong>{bookingDates.length > 1 ? `${bookingDates.length} dates` : form.date ? formatLongDate(form.date) : 'Select date'} · {form.start_time}-{form.end_time}</strong>
              <small>{bookingDates.length > 1 ? `${formatDayNumber(bookingDates[0])} - ${formatDayNumber(bookingDates[bookingDates.length - 1])} · ` : ''}{getTimeRangeDurationMinutes(form)} min{canViewRevenue ? ` · ${formatMoney(form.price, canViewRevenue)}` : ''}</small>
            </div>

            {hasConflict ? (
              <div className="detail-conflict-alert">
                <strong>Booking conflict</strong>
                <span>Overlaps with {conflictList.slice(0, 2).map((item) => `${item.booking_owner || item.name}${item.conflict_date ? ` on ${formatDayNumber(item.conflict_date)}` : ''}`).join(', ')}.</span>
              </div>
            ) : null}

            <label>
              Court
              <select onChange={(event) => updateField('court_id', event.target.value)} required value={form.court_id}>
                <option value="">Select court</option>
                {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
              </select>
            </label>

            <div className="form-grid time-grid">
              <label>
                Start time
                <input onChange={(event) => updateField('start_time', event.target.value)} required type="time" value={form.start_time} />
              </label>
              <label>
                End time
                <input onChange={(event) => updateField('end_time', event.target.value)} required type="time" value={form.end_time} />
              </label>
              <div className="duration-control">
                <span>Duration</span>
                <div className="duration-options">
                  {PLACEHOLDER_DURATION_OPTIONS.map((option) => (
                    <button
                      className={form.duration_mode === String(option.minutes) ? 'selected' : ''}
                      key={option.minutes}
                      onClick={() => setBookingWriteDuration(option.minutes)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    className={form.duration_mode === 'custom' ? 'selected' : ''}
                    onClick={() => updateField('duration_mode', 'custom')}
                    type="button"
                  >
                    Custom
                  </button>
                </div>
              </div>
            </div>

            {isConversion || !multiDate ? (
              <div className="booking-date-single">
                <label>
                  Date
                  <input onChange={(event) => updateField('date', event.target.value)} required type="date" value={form.date} />
                </label>
                {isConversion ? null : (
                  <button className="booking-date-advanced-toggle" onClick={enableMultiDate} type="button">
                    <CalendarDays size={15} />
                    Book on multiple dates
                  </button>
                )}
              </div>
            ) : (
            <div className="booking-calendar">
              <div className="booking-calendar-heading">
                <span>Booking dates</span>
                <strong>{bookingDates.length} {bookingDates.length === 1 ? 'day' : 'days'}</strong>
              </div>
              <p className="booking-calendar-hint">Tap days to book this court &amp; time on each.</p>
              <div className="booking-calendar-nav">
                <button aria-label="Previous month" onClick={() => shiftCalendarMonth(-1)} type="button">
                  <ChevronLeft size={16} />
                </button>
                <strong>{formatMonthLabel(calendarMonth)}</strong>
                <button aria-label="Next month" onClick={() => shiftCalendarMonth(1)} type="button">
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="booking-calendar-grid">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
                  <span className="booking-calendar-dow" key={day}>{day}</span>
                ))}
                {monthCells.map((cell) => {
                  const isSelected = selectedDateSet.has(cell.value);
                  const classes = [
                    'booking-calendar-day',
                    cell.inMonth ? '' : 'muted',
                    isSelected ? 'selected' : '',
                    cell.value === todayValue ? 'today' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <button
                      aria-label={`${isSelected ? 'Remove' : 'Add'} ${formatLongDate(cell.value)}`}
                      aria-pressed={isSelected}
                      className={classes}
                      key={cell.value}
                      onClick={() => toggleBookingDate(cell.value)}
                      type="button"
                    >
                      {Number(cell.value.slice(8, 10))}
                    </button>
                  );
                })}
              </div>
              {bookingDates.length > 1 ? (
                <div className="booking-calendar-chips">
                  {bookingDates.map((date) => (
                    <span key={date}>
                      {formatDayNumber(date)}
                      <button aria-label={`Remove ${formatLongDate(date)}`} onClick={() => toggleBookingDate(date)} type="button">
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <button className="booking-calendar-collapse" onClick={collapseToSingleDate} type="button">
                Use a single date
              </button>
            </div>
            )}

            <div className="conversion-mode-control">
              <span>Customer</span>
              <div>
                <button
                  className={form.customerMode === 'offline' ? 'selected' : ''}
                  onClick={() => updateField('customerMode', 'offline')}
                  type="button"
                >
                  Offline
                </button>
                <button
                  className={form.customerMode === 'registered' ? 'selected' : ''}
                  onClick={() => updateField('customerMode', 'registered')}
                  type="button"
                >
                  Registered
                </button>
              </div>
            </div>

            {isRegistered ? (
              <div className="registered-player-field">
                <label>
                  Search player
                  <span className="search-input-wrap">
                    <Search size={15} />
                    <input
                      onChange={(event) => updateField('playerSearch', event.target.value)}
                      placeholder="Type customer name"
                      value={form.playerSearch}
                    />
                  </span>
                </label>
                {form.selectedPlayer ? (
                  <div className="selected-player">
                    <UserCheck size={16} />
                    <span>
                      <strong>{form.selectedPlayer.name}</strong>
                      <small>{form.selectedPlayer.mobile || form.selectedPlayer.email || 'Registered player'}</small>
                    </span>
                    <button onClick={() => updateField('playerSearch', form.selectedPlayer.name || '')} type="button">Change</button>
                  </div>
                ) : (
                  <div className="player-results">
                    {playerState.loading ? <span>Searching...</span> : null}
                    {playerState.error ? <span className="error">{playerState.error}</span> : null}
                    {!playerState.loading && !playerState.error && searchQuery.length >= REGISTERED_PLAYER_SEARCH_MIN_LENGTH && !playerState.results.length ? (
                      <span>No players found.</span>
                    ) : null}
                    {playerState.results.slice(0, 6).map((player) => (
                      <button key={player.id} onClick={() => selectPlayer(player)} type="button">
                        <strong>{player.name}</strong>
                        <small>{player.mobile || player.email || 'Registered player'}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <label>
                Offline customer name
                <input
                  onChange={(event) => updateField('offlineUser', event.target.value)}
                  placeholder="Customer or group name"
                  required
                  value={form.offlineUser}
                />
              </label>
            )}

            <div className="form-grid two">
              {canViewRevenue ? (
                <label>
                  Booking price
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateField('price', parseMoneyInput(event.target.value))}
                    placeholder="Rp 0"
                    value={formatMoneyInput(form.price)}
                  />
                </label>
              ) : null}
              <label>
                Payment
                <input readOnly value="Paid offline" />
              </label>
            </div>

            <label>
              Transfer receipt
              <span className="receipt-upload-control">
                <Upload size={16} />
                <span>{form.receiptFile?.name || 'No file selected'}</span>
                <input
                  accept="image/*"
                  onChange={(event) => updateField('receiptFile', event.target.files?.[0] || null)}
                  type="file"
                />
              </span>
            </label>

            <label>
              Notes
              <textarea onChange={(event) => updateField('notes', event.target.value)} rows={4} value={form.notes} />
            </label>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving || hasConflict} type="submit">
                {isSaving ? 'Saving...' : title}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );

  function setBookingWriteDuration(minutes) {
    setForm((current) => ({
      ...current,
      duration_mode: String(minutes),
      end_time: shiftTime(current.start_time, minutes),
    }));
  }
}

function PaymentProofDialog({ booking, isSaving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ attachmentType: RECEIPT_ATTACHMENT_TYPE, receiptFile: null }));
  const [error, setError] = useState('');

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!booking?.trans_id) {
      setError('This booking does not have a transaction ID for attachment upload.');
      return;
    }
    if (!form.receiptFile) {
      setError('Select a transfer receipt first.');
      return;
    }

    try {
      await onSave(booking, form);
    } catch (saveError) {
      setError(saveError.message || 'Unable to upload receipt.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor compact-action-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">Payment proof</span>
          <button aria-label="Close payment proof panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>Upload receipt</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <BookingActionSummary booking={booking} />
            <label>
              Attachment type
              <input onChange={(event) => updateField('attachmentType', event.target.value)} required value={form.attachmentType} />
            </label>
            <label>
              Transfer receipt
              <span className="receipt-upload-control">
                <Upload size={16} />
                <span>{form.receiptFile?.name || 'No file selected'}</span>
                <input
                  accept="image/*,.pdf"
                  onChange={(event) => updateField('receiptFile', event.target.files?.[0] || null)}
                  required
                  type="file"
                />
              </span>
            </label>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving || !form.receiptFile} type="submit">
                {isSaving ? 'Uploading...' : 'Upload receipt'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

function RescheduleBookingDialog({ booking, canViewRevenue = true, courts, isSaving, mitraId, openHour, onClose, onSave }) {
  const [form, setForm] = useState(() => buildRescheduleBookingForm({ booking, courts, openHour }));
  const [error, setError] = useState('');
  const [slotState, setSlotState] = useState({ closed: false, error: '', items: [], loading: false });
  const [priceState, setPriceState] = useState({ data: null, error: '', loading: false });
  const durationMinutes = getTimeRangeDurationMinutes(form);
  const priceSummary = buildReschedulePriceSummary(priceState.data, canViewRevenue);

  useEffect(() => {
    if (!booking?.id || !mitraId || !form.date || !form.court_id) {
      setSlotState({ closed: false, error: '', items: [], loading: false });
      return undefined;
    }

    let active = true;
    setSlotState((current) => ({ ...current, error: '', loading: true }));
    apiRequest('/api/admin/reschedule-court-time-lists', {
      method: 'POST',
      body: JSON.stringify({
        mitra_id: mitraId,
        id: booking.id,
        date: form.date,
        court_id: form.court_id,
      }),
    })
      .then((response) => {
        if (!active) return;
        setSlotState({
          closed: Boolean(response?.closed),
          error: '',
          items: normalizeRescheduleSlots(response),
          loading: false,
        });
      })
      .catch((slotError) => {
        if (!active) return;
        setSlotState({ closed: false, error: slotError.message, items: [], loading: false });
      });

    return () => {
      active = false;
    };
  }, [booking?.id, form.court_id, form.date, mitraId]);

  useEffect(() => {
    if (!booking?.id || !mitraId || !form.date || !form.court_id || durationMinutes <= 0) {
      setPriceState({ data: null, error: '', loading: false });
      return undefined;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setPriceState((current) => ({ ...current, error: '', loading: true }));
      apiRequest('/api/admin/check-reschedule-court-price', {
        method: 'POST',
        body: JSON.stringify({
          mitra_id: mitraId,
          id: booking.id,
          date: form.date,
          court_id: form.court_id,
          start_hours: formatUpstreamTime(form.start_time),
          duration: durationMinutes,
        }),
      })
        .then((response) => {
          if (!active) return;
          setPriceState({ data: response, error: '', loading: false });
        })
        .catch((priceError) => {
          if (!active) return;
          setPriceState({ data: null, error: priceError.message, loading: false });
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [booking?.id, durationMinutes, form.court_id, form.date, form.start_time, mitraId]);

  function updateField(field, value) {
    setForm((current) => {
      if (field === 'court_id') {
        return { ...current, court_id: value, court_name: courts.find((court) => court.id === value)?.name || '' };
      }
      if (field === 'start_time') {
        return { ...current, start_time: value, end_time: shiftTime(value, getTimeRangeDurationMinutes(current)) };
      }
      if (field === 'end_time') {
        return { ...current, end_time: value, duration_mode: inferPlaceholderDurationMode(current.start_time, value) };
      }
      return { ...current, [field]: value };
    });
  }

  function setDuration(minutes) {
    setForm((current) => ({
      ...current,
      duration_mode: String(minutes),
      end_time: shiftTime(current.start_time, minutes),
    }));
  }

  function selectSlot(time) {
    setForm((current) => ({
      ...current,
      start_time: time,
      end_time: shiftTime(time, getTimeRangeDurationMinutes(current)),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!form.court_id) {
      setError('Select a court.');
      return;
    }
    if (!form.date) {
      setError('Select a date.');
      return;
    }
    if (durationMinutes <= 0) {
      setError('End time must be after start time.');
      return;
    }
    if (slotState.closed) {
      setError('The selected date is closed.');
      return;
    }

    try {
      await onSave(booking, form);
    } catch (saveError) {
      setError(saveError.message || 'Unable to reschedule booking.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor conversion-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">Reschedule</span>
          <button aria-label="Close reschedule panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>Move booking</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <BookingActionSummary booking={booking} />

            <label>
              Court
              <select onChange={(event) => updateField('court_id', event.target.value)} required value={form.court_id}>
                <option value="">Select court</option>
                {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
              </select>
            </label>

            <div className="form-grid time-grid">
              <label>
                Date
                <input onChange={(event) => updateField('date', event.target.value)} required type="date" value={form.date} />
              </label>
              <label>
                Start time
                <input onChange={(event) => updateField('start_time', event.target.value)} required type="time" value={form.start_time} />
              </label>
              <label>
                End time
                <input onChange={(event) => updateField('end_time', event.target.value)} required type="time" value={form.end_time} />
              </label>
              <div className="duration-control">
                <span>Duration</span>
                <div className="duration-options">
                  {PLACEHOLDER_DURATION_OPTIONS.map((option) => (
                    <button
                      className={form.duration_mode === String(option.minutes) ? 'selected' : ''}
                      key={option.minutes}
                      onClick={() => setDuration(option.minutes)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    className={form.duration_mode === 'custom' ? 'selected' : ''}
                    onClick={() => updateField('duration_mode', 'custom')}
                    type="button"
                  >
                    Custom
                  </button>
                </div>
              </div>
            </div>

            <div className="reschedule-slot-list">
              <span>Available starts</span>
              {slotState.loading ? <p>Loading slots...</p> : null}
              {slotState.closed ? <p className="danger">Closed for selected date.</p> : null}
              {slotState.error ? <p className="danger">{slotState.error}</p> : null}
              {!slotState.loading && !slotState.closed && !slotState.error && !slotState.items.length ? <p>No slots returned.</p> : null}
              {slotState.items.length ? (
                <div>
                  {slotState.items.slice(0, 18).map((slot) => (
                    <button
                      className={form.start_time === slot.time ? 'selected' : ''}
                      key={slot.id}
                      onClick={() => selectSlot(slot.time)}
                      type="button"
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="price-check-card">
              <span>Price check</span>
              {priceState.loading ? <strong>Checking...</strong> : <strong>{priceSummary.heading}</strong>}
              {priceSummary.lines.map((line) => <small key={line}>{line}</small>)}
              {priceState.error ? <small className="danger">{priceState.error}</small> : null}
            </div>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving || slotState.closed || durationMinutes <= 0} type="submit">
                {isSaving ? 'Saving...' : 'Reschedule'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

function CancelBookingDialog({ booking, isSaving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ cancel_note: 'Cancel' }));
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await onSave(booking, form);
    } catch (saveError) {
      setError(saveError.message || 'Unable to cancel booking.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor compact-action-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">Cancel booking</span>
          <button aria-label="Close cancel booking panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>Cancel booking</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <BookingActionSummary booking={booking} />
            <div className="conversion-warning danger">
              <AlertTriangle size={16} />
              <span>This booking will be removed from the upstream schedule.</span>
            </div>
            <label>
              Cancel note
              <textarea
                onChange={(event) => setForm({ cancel_note: event.target.value })}
                rows={4}
                value={form.cancel_note}
              />
            </label>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Keep booking</button>
              <button className="primary-button danger-button" disabled={isSaving} type="submit">
                {isSaving ? 'Canceling...' : 'Cancel booking'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

function BookingNotesDialog({ booking, isSaving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ notes: booking?.notes || '' }));
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await onSave(booking, form);
    } catch (saveError) {
      setError(saveError.message || 'Unable to save notes.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor compact-action-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">Booking notes</span>
          <button aria-label="Close notes panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>Edit notes</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <BookingActionSummary booking={booking} />
            <label>
              Notes
              <textarea
                onChange={(event) => setForm({ notes: event.target.value })}
                rows={6}
                value={form.notes}
              />
            </label>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? 'Saving...' : 'Save notes'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

function BookingActionSummary({ booking }) {
  return (
    <div className="conversion-summary">
      <span>{booking?.court_name || booking?.court_id || 'Court'}</span>
      <strong>{booking?.booking_owner || booking?.name || 'Booking'} · {booking?.time || getStartLabel(booking)}</strong>
      <small>{booking?.date ? `${formatLongDate(booking.date)} · ` : ''}{booking?.trans_id || booking?.id || '-'}</small>
    </div>
  );
}

function PlaceholderBookingEditor({ booking, canViewRevenue = true, conflicts, courts, defaultDate, defaultName, draft, isSaving, isVirtualUser = false, mode, openHour, onClose, onSave }) {
  const [form, setForm] = useState(() => buildPlaceholderForm({ booking, courts, defaultDate, defaultName, draft, isVirtualUser, openHour }));
  const [error, setError] = useState('');
  const overlapList = conflicts(form);
  const liveOverlapCount = overlapList.filter((item) => !item.is_placeholder).length;
  const placeholderOverlapCount = overlapList.filter((item) => item.is_placeholder).length;
  const selectedCourtIds = getSelectedCourtIds(form);

  function updateField(field, value) {
    setForm((current) => {
      if (field === 'start_time') {
        const durationMinutes = getPlaceholderDurationMinutes(current);
        return { ...current, start_time: value, end_time: shiftTime(value, durationMinutes) };
      }
      if (field === 'end_time') {
        return { ...current, end_time: value, duration_mode: inferPlaceholderDurationMode(current.start_time, value) };
      }
      if (field === 'court_id') {
        return { ...current, court_id: value, court_ids: value ? [value] : [] };
      }
      return { ...current, [field]: value };
    });
  }

  function toggleCourt(courtId) {
    setForm((current) => {
      const courtIds = new Set(getSelectedCourtIds(current));
      if (courtIds.has(courtId)) {
        courtIds.delete(courtId);
      } else {
        courtIds.add(courtId);
      }
      const nextCourtIds = [...courtIds];
      return {
        ...current,
        court_id: nextCourtIds[0] || '',
        court_ids: nextCourtIds,
      };
    });
  }

  function setDuration(minutes) {
    setForm((current) => ({
      ...current,
      duration_mode: String(minutes),
      end_time: shiftTime(current.start_time, minutes),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!selectedCourtIds.length) {
      setError('Select at least one court.');
      return;
    }
    if (parseTimeToMinutes(form.end_time) <= parseTimeToMinutes(form.start_time)) {
      setError('End time must be after start time.');
      return;
    }
    try {
      await onSave(form);
    } catch (saveError) {
      setError(formatConflictError(saveError));
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
          <div className="placeholder-editor-fields">
            {mode === 'edit' ? (
              <label>
                Court
                <select onChange={(event) => updateField('court_id', event.target.value)} required value={form.court_id}>
                  <option value="">Select court</option>
                  {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
                </select>
              </label>
            ) : (
              <div className="court-picker">
                <span>Courts</span>
                <div className="court-choice-grid">
                  {courts.map((court) => (
                    <label className={`court-choice ${selectedCourtIds.includes(court.id) ? 'selected' : ''}`} key={court.id}>
                      <input
                        checked={selectedCourtIds.includes(court.id)}
                        onChange={() => toggleCourt(court.id)}
                        type="checkbox"
                      />
                      {court.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
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
            <div className="form-grid time-grid">
              <label>
                Start time
                <input onChange={(event) => updateField('start_time', event.target.value)} required type="time" value={form.start_time} />
              </label>
              <label>
                End time
                <input onChange={(event) => updateField('end_time', event.target.value)} required type="time" value={form.end_time} />
              </label>
              <div className="duration-control">
                <span>Duration</span>
                <div className="duration-options">
                  {PLACEHOLDER_DURATION_OPTIONS.map((option) => (
                    <button
                      className={form.duration_mode === String(option.minutes) ? 'selected' : ''}
                      key={option.minutes}
                      onClick={() => setDuration(option.minutes)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    className={form.duration_mode === 'custom' ? 'selected' : ''}
                    onClick={() => updateField('duration_mode', 'custom')}
                    type="button"
                  >
                    Custom
                  </button>
                </div>
              </div>
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
              {canViewRevenue ? (
                <label>
                  Estimated price
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateField('estimated_price', parseMoneyInput(event.target.value))}
                    placeholder="Rp 0"
                    value={formatMoneyInput(form.estimated_price)}
                  />
                </label>
              ) : null}
              <label>
                Created by
                <input
                  onChange={(event) => updateField('created_by_name', event.target.value)}
                  placeholder="PIC name"
                  readOnly={isVirtualUser}
                  value={form.created_by_name}
                />
              </label>
            </div>
            <label>
              Updated by
              <input
                onChange={(event) => updateField('updated_by_name', event.target.value)}
                placeholder="PIC name"
                readOnly={isVirtualUser}
                value={form.updated_by_name}
              />
            </label>
            <label>
              Notes
              <textarea onChange={(event) => updateField('notes', event.target.value)} placeholder="Negotiation/payment context" rows={4} value={form.notes} />
            </label>
          </div>
          <div className="editor-footer">
            {liveOverlapCount ? (
              <p className="status-line warning">
                A live booking already uses this slot. This placeholder will be saved as waitlist.
              </p>
            ) : placeholderOverlapCount ? (
              <p className="status-line warning">
                Stacks with {placeholderOverlapCount} existing placeholder{placeholderOverlapCount > 1 ? 's' : ''} in this slot.
              </p>
            ) : null}
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create placeholder'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

function buildVirtualUserForm(user) {
  if (user) {
    return {
      username: user.login_username || `_${user.username || ''}`,
      display_name: user.display_name || '',
      password: '',
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      is_active: user.is_active !== false,
    };
  }

  return {
    username: '',
    display_name: '',
    password: '',
    permissions: ['Calendar', CALENDAR_BOOKING_PERMISSION, 'Setting'],
    is_active: true,
  };
}

async function loadCalendarData({ cacheScope, forceRefresh = false, mitraId, selectedDate, weekDays }) {
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

function calendarCacheKey(cacheScope, type, mitraId, date = '') {
  return [cacheScope || 'session', type, mitraId || '', date].join('|');
}

function hasCalendarDataCache({ cacheScope, mitraId, selectedDate, weekDays }) {
  return isCalendarCacheFresh(calendarCacheKey(cacheScope, 'courts', mitraId))
    && isCalendarCacheFresh(calendarCacheKey(cacheScope, 'open-hour', mitraId, selectedDate))
    && weekDays.every((date) => isCalendarCacheFresh(calendarCacheKey(cacheScope, 'schedule', mitraId, date))
      && isCalendarCacheFresh(calendarCacheKey(cacheScope, 'placeholders', mitraId, date)));
}

function getCachedCalendarValue(key, fetcher, { forceRefresh = false } = {}) {
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

function isCalendarCacheFresh(key) {
  const cached = calendarDataCache.get(key);
  return Boolean(cached?.value && cached.expiresAt > Date.now());
}

function clearCalendarDataCache() {
  calendarDataCache.clear();
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

function annotatePlaceholderConflicts(upstreamBookings, localPlaceholders) {
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

function buildBookingConflictSummary(booking) {
  return {
    court: booking.court_name || booking.court_id || 'Court',
    id: booking.placeholder_id || booking.id || '',
    name: booking.booking_owner || booking.name || 'Booking',
    time: booking.time || `${getStartLabel(booking)}-${formatTimeInput(getBookingEndMinutes(booking))}`,
    type: booking.is_placeholder ? 'placeholder' : 'booking',
  };
}

function buildPlaceholderForm({ booking, courts, defaultDate, defaultName, draft, isVirtualUser = false, openHour }) {
  if (booking) {
    const [startTime, endTime] = String(booking.time || '').split('-');
    const courtId = booking.court_id || '';
    return {
      court_id: courtId,
      court_ids: courtId ? [courtId] : [],
      court_name: booking.court_name || '',
      date: booking.date || defaultDate,
      start_time: startTime || openHour?.open_hours || '06:00',
      end_time: endTime || shiftTime(startTime || openHour?.open_hours || '06:00', 60),
      duration_mode: inferPlaceholderDurationMode(startTime || openHour?.open_hours || '06:00', endTime || shiftTime(startTime || openHour?.open_hours || '06:00', 60)),
      customer_name: booking.booking_owner || booking.name || '',
      customer_contact: booking.customer_contact || '',
      estimated_price: String(booking.price || 0),
      status: booking.status || 'awaiting_payment',
      notes: booking.notes || '',
      created_by_name: booking.created_by_name || defaultName || '',
      updated_by_name: isVirtualUser ? defaultName || '' : booking.updated_by_name || defaultName || '',
    };
  }

  const startTime = draft?.start_time || openHour?.open_hours || '06:00';
  const court = courts.find((item) => item.id === draft?.court_id) || courts[0];
  const endTime = draft?.end_time || shiftTime(startTime, 60);
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

function buildBookingWriteForm({ booking, courts, defaultDate, draft, openHour }) {
  const [bookingStart, bookingEnd] = String(booking?.time || '').split('-');
  const startTime = draft?.start_time || bookingStart || openHour?.open_hours || '06:00';
  const endTime = draft?.end_time || bookingEnd || shiftTime(startTime, 60);
  const court = courts.find((item) => item.id === (draft?.court_id || booking?.court_id)) || courts[0];
  return {
    additional_dates: [],
    attachmentType: RECEIPT_ATTACHMENT_TYPE,
    court_id: draft?.court_id || booking?.court_id || court?.id || '',
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

function getBookingFormDates(form) {
  const dates = [
    form?.date,
    ...(Array.isArray(form?.additional_dates) ? form.additional_dates : []),
  ].map((date) => String(date || '').trim()).filter(Boolean);
  return [...new Set(dates)].sort();
}

function normalizeAdditionalBookingDates(dates, primaryDate) {
  return [...new Set((dates || []).map((date) => String(date || '').trim()).filter(Boolean))]
    .filter((date) => date !== primaryDate)
    .sort();
}

function buildRescheduleBookingForm({ booking, courts, openHour }) {
  const [bookingStart, bookingEnd] = String(booking?.time || '').split('-');
  const duration = getDurationMinutes(booking) || 60;
  const startTime = bookingStart || openHour?.open_hours || '06:00';
  const endTime = bookingEnd || shiftTime(startTime, duration);
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

function buildCourtBookingPayload({ form, mitraId }) {
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

function buildCancelBookingPayload({ booking, form, mitraId }) {
  const email = getBookingEmail(booking);
  const offlineName = getOfflineBookingName(booking);
  const payload = {
    mitra_id: mitraId,
    id: booking.id,
    type: getCourtBookingWriteType(booking),
    user_offline: !email && offlineName ? offlineName : null,
    email_verified: Boolean(email),
    already_wd: false,
    use_package: Boolean(booking.use_package),
    cancel_note: form.cancel_note || 'Cancel',
    is_recurring: false,
    start_date: null,
    end_date: null,
  };

  if (email) payload.email = email;
  return payload;
}

function getTimeRangeDurationMinutes(form) {
  const manualMinutes = parseTimeToMinutes(form.end_time) - parseTimeToMinutes(form.start_time);
  return manualMinutes > 0 ? manualMinutes : 0;
}

function normalizePlayerSearchResults(response) {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.lists)) return response.lists;
  if (Array.isArray(response)) return response;
  return [];
}

function normalizeRescheduleSlots(response) {
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

function buildReschedulePriceSummary(response, canViewRevenue = true) {
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

async function fetchBookingDetailForAction({ booking, mitraId }) {
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

function normalizeBookingDetailResponse(response) {
  if (response?.data?.booking && typeof response.data.booking === 'object') return response.data.booking;
  if (response?.data && typeof response.data === 'object' && !Array.isArray(response.data)) return response.data;
  if (response?.booking && typeof response.booking === 'object') return response.booking;
  if (response?.detail && typeof response.detail === 'object') return response.detail;
  return response;
}

function getCourtBookingWriteType(booking) {
  const type = String(booking?.type || '').trim();
  if (!type || type === 'booking') return 'booking-court';
  return type;
}

const EMAIL_VALUE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Some booking-detail shapes nest the customer email under keys we don't list
// explicitly (e.g. `customer.email`, `member.email`, `owner.email`). This is the
// case for placeholder-converted registered bookings: the row reads as offline,
// so without finding the email we wrongly cancel with `user_offline` and upstream
// rejects it with "Email required !". Fall back to a key-scoped deep scan.
function findNestedBookingEmail(value, keyHint = '', depth = 0) {
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

function getBookingEmail(booking) {
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

function getOfflineBookingName(booking) {
  const hasRegisteredIdentity = Boolean(
    booking?.user_id
    || booking?.user?.id
    || booking?.player_id
    || (Array.isArray(booking?.players) && booking.players.length),
  );

  if (hasRegisteredIdentity) return '';
  return String(
    booking?.user_offline
    || booking?.offline_user
    || booking?.booking_owner
    || booking?.name
    || '',
  ).trim();
}

function formatStatusText(value) {
  return String(value || 'ready')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function uploadBookingReceipt({ attachmentType = RECEIPT_ATTACHMENT_TYPE, file, transId }) {
  const formData = new FormData();
  formData.append('trans_id', transId);
  formData.append('attachment_type[0]', attachmentType || RECEIPT_ATTACHMENT_TYPE);
  formData.append('attachment_file[0]', file);
  return apiRequest('/api/admin/schedule/attachments', {
    method: 'POST',
    body: formData,
  });
}

function formatUpstreamTime(value) {
  return String(value || '').replace(':', '.');
}

function getSelectedCourtIds(form) {
  if (Array.isArray(form.court_ids) && form.court_ids.length) return form.court_ids;
  return form.court_id ? [form.court_id] : [];
}

function inferPlaceholderDurationMode(startTime, endTime) {
  const duration = parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime);
  return PLACEHOLDER_DURATION_OPTIONS.some((option) => option.minutes === duration) ? String(duration) : 'custom';
}

function getPlaceholderDurationMinutes(form) {
  const presetMinutes = Number(form.duration_mode);
  if (presetMinutes > 0) return presetMinutes;
  const manualMinutes = parseTimeToMinutes(form.end_time) - parseTimeToMinutes(form.start_time);
  return manualMinutes > 0 ? manualMinutes : 60;
}

function parseMoneyInput(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatMoneyInput(value) {
  const digits = parseMoneyInput(value);
  if (!digits) return '';
  return `Rp ${new Intl.NumberFormat('id-ID').format(Number(digits))}`;
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

function formatMonthLabel(dateValue) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${dateValue}T00:00:00`));
}

function buildMonthMatrix(dateValue) {
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

function formatWeekRange(dateValue) {
  const days = getWeekDays(dateValue);
  return `${formatDayNumber(days[0])} - ${formatDayNumber(days[6])}`;
}

function isTodayDate(dateValue) {
  return dateValue === toDateInputValue(new Date());
}

function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function scrollDayCalendarToCurrentTime(panel, openHour) {
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

function formatMoney(value, canViewRevenue = true) {
  return canViewRevenue ? formatCurrency(value) : 'Hidden';
}

function parseTimeToMinutes(value) {
  const normalized = String(value || '00:00').replace('.', ':');
  const [hour, minute = '0'] = normalized.split(':').map(Number);
  if (hour === 24) return 24 * 60;
  return (hour || 0) * 60 + (minute || 0);
}

function getStartLabel(booking) {
  return String(booking?.time || '').split('-')[0] || '--:--';
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

function buildCalendarDisplayBookings(bookings) {
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

function buildAvailabilityEntry(startMinutes, endMinutes) {
  return {
    id: `availability-${startMinutes}-${endMinutes}`,
    endMinutes,
    label: formatAvailabilityRange(startMinutes, endMinutes),
    startMinutes,
    type: 'availability',
  };
}

function getBookingStartMinutes(booking) {
  const [start] = String(booking?.time || '').split('-');
  return start ? parseTimeToMinutes(start) : minutesFromEpoch(booking?.start);
}

function getBookingEndMinutes(booking) {
  const [, end] = String(booking?.time || '').split('-');
  return end ? parseTimeToMinutes(end) : minutesFromEpoch(booking?.end);
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

function getBookingMeta(booking, canViewRevenue = true) {
  if (booking.is_placeholder && booking.is_waitlist) return `Waitlist · ${formatStatus(booking.status)}`;
  if (booking.is_placeholder && booking.stack_count > 1) {
    const stackNames = getPlaceholderStackItems(booking).map((item) => item.booking_owner || item.name).filter(Boolean);
    return `${stackNames.slice(0, 2).join(', ')}${stackNames.length > 2 ? ` +${stackNames.length - 2}` : ''}`;
  }
  if (booking.has_conflict) return 'Blocked';
  if (booking.is_placeholder) return `${formatMoney(booking.price, canViewRevenue)} · ${formatStatus(booking.status)}`;
  return `${booking.booking_type || booking.type || 'booking'} · ${formatMoney(booking.price, canViewRevenue)}`;
}

function hasBookingConflict(booking) {
  return Boolean(booking?.has_conflict);
}

function getBookingConflictItems(booking) {
  if (booking?.is_placeholder) return booking.blocked_by_bookings || booking.conflict_bookings || [];
  return booking?.waitlist_placeholders || booking?.conflict_placeholders || [];
}

function getWaitlistItems(booking) {
  return booking?.waitlist_placeholders || booking?.conflict_placeholders || [];
}

function getPlaceholderStackItems(booking) {
  if (!booking?.is_placeholder) return [];
  return Array.isArray(booking.placeholder_stack) && booking.placeholder_stack.length ? booking.placeholder_stack : [booking];
}

function getBookingTitle(booking) {
  if (booking?.is_placeholder && booking.stack_count > 1) return `${booking.stack_count} placeholders`;
  return booking?.booking_owner || booking?.name || 'Booking';
}

function getBookingPillLabel(booking) {
  const waitlistCount = getWaitlistItems(booking).length;
  if (!booking?.is_placeholder && waitlistCount) return `+${waitlistCount} waitlist`;
  if (booking?.is_placeholder && booking.is_waitlist) return 'Waitlist';
  if (booking?.is_placeholder && booking.stack_count > 1) return `${booking.stack_count} holds`;
  if (booking?.is_placeholder) return 'Placeholder';
  if (booking?.notes) return 'Notes';
  return '';
}

function getSlotDraftFromBooking(booking, fallbackDate = '') {
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

function formatConflictError(error) {
  if (error?.code !== 'PLACEHOLDER_OVERLAP' && error?.code !== 'BOOKING_OVERLAP') return error?.message || 'Unable to save placeholder.';
  const conflict = error.payload?.conflict;
  if (!conflict) return 'This placeholder overlaps with another booking. Refresh the calendar and choose another time.';
  const name = conflict.customer_name || conflict.booking_owner || 'another booking';
  const time = conflict.start_time && conflict.end_time ? `${conflict.start_time}-${conflict.end_time}` : conflict.time;
  const court = conflict.court_name || conflict.court_id || 'this court';
  return `This placeholder overlaps with ${name} on ${court}${time ? ` at ${time}` : ''}.`;
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
  if (value === undefined || value === null || value === '') return 0;
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return 0;
  return date.getHours() * 60 + date.getMinutes();
}

function getDurationMinutes(booking) {
  const duration = Number(booking?.duration || 0);
  if (duration > 0) return duration;
  const calculated = getBookingEndMinutes(booking) - getBookingStartMinutes(booking);
  return Number.isFinite(calculated) ? Math.max(calculated, 0) : 0;
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

function summarizeDay(bookings, openHour, courtCount = 1, canViewRevenue = true) {
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

function summarizeWeek(weekDays, bookingsByDate, openHour, courtCount = 1, canViewRevenue = true) {
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

function copyText(value) {
  if (!value) return;
  navigator.clipboard?.writeText(value);
}
