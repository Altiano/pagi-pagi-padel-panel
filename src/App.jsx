// App entry + panel shell. This is the composition root: it picks login vs.
// panel, loads /auth/me, applies virtual-user navigation/permission gating, and
// renders the active screen. Feature screens live under ./screens and ./calendar.
//
// Architecture map for agents:
//   constants.js        - shared constants (nav groups, permissions, cache TTL)
//   hooks.js            - usePreferredMobileView, useEscapeKey
//   lib/datetime.js     - pure date/time/week helpers
//   lib/format.js       - currency/status/clipboard formatting
//   lib/bookings.js     - booking-shape helpers (tone, meta, overlap, summaries)
//   lib/navigation.js   - virtual-user nav + permission gating
//   api/calendar.js     - calendar data loading + cache + booking-action endpoints
//   calendar/forms.js   - pure form-state + upstream-payload builders
//   calendar/*          - CalendarPage controller + views + dialogs + editors
//   screens/*           - LoginScreen, VirtualUsersPage
// See docs/architecture.md and AGENTS.md for the full guide.
import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import {
  APP_BUILD_TIMESTAMP,
  CALENDAR_BOOKING_PERMISSION,
  CALENDAR_REVENUE_PERMISSION,
  FALLBACK_MITRA_ID,
  mobileNavItems,
  navGroups,
} from './constants.js';
import { clearStoredAuth, getStoredAuth } from './api/auth.js';
import { apiRequest } from './api/client.js';
import { clearCalendarDataCache, findMitraId } from './api/calendar.js';
import { usePreferredMobileView } from './hooks.js';
import {
  filterNavGroups,
  getAllowedNav,
  getCalendarCacheScope,
  getFirstAllowedNav,
  hasPermission,
  isNavAllowed,
} from './lib/navigation.js';
import { formatBuildVersion } from './lib/datetime.js';
import { LoginScreen } from './screens/LoginScreen.jsx';
import { VirtualUsersPage } from './screens/VirtualUsersPage.jsx';
import { CalendarPage } from './calendar/CalendarPage.jsx';

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



export function isMobileViewPath(location) {
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const hashPath = location.hash.replace(/^#/, '').replace(/^\//, '');
  return pathSegments.includes('mobile') || hashPath.split('/').filter(Boolean)[0] === 'mobile';
}


export function PanelShell({ auth, isMobileRoute = false, onLogout }) {
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
  // Tab count picks the bottom-bar layout: with two tabs the create FAB docks
  // into the center notch; with more tabs it floats bottom-right instead.
  const shellClassName = `panel-shell ${mobileView.isMobileApp ? `mobile-app mobile-tabs-${visibleMobileNavItems.length}` : ''}`;

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
      onUseDesktopView={() => mobileView.setPreference('desktop')}
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
          navItems={visibleMobileNavItems}
          onChangeNav={setActiveNav}
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


export function DesktopSidebar({ activeNav, navGroups: visibleNavGroups, onChangeNav }) {
  const buildVersion = formatBuildVersion(APP_BUILD_TIMESTAMP);

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

      <div className="sidebar-build" title={buildVersion ? `Build ${buildVersion}` : 'Build'}>
        {buildVersion ? <span>{buildVersion}</span> : null}
      </div>
    </aside>
  );
}


/* No app-wide header: native apps let each screen own its top area. Account
   actions (logout, desktop switch, build info) live in the Calendar screen's
   avatar sheet; other screens keep their own topbars. */
export function MobileAppShell({ activeNav, children, navItems, onChangeNav }) {
  return (
    <>
      {/* Keyed by tab so switching tabs replays the content-enter animation,
          giving navigation the transition feel of a native app. */}
      <section className="mobile-app-content" key={activeNav}>
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


export function PlaceholderPage({ activeNav, displayName, meState, onLogout }) {
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


export function NoAccessPage({ displayName, onLogout }) {
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


