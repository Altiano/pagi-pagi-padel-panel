import { useState } from 'react';
import { CalendarDays, ChevronRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UsersRound } from 'lucide-react';
import { login } from '../api/auth.js';
import { usePreferredMobileView } from '../hooks.js';

const appIconSrc = `${import.meta.env.BASE_URL}icons/icon-192.png`;

export function LoginScreen({ isMobileRoute = false, onAuthenticated }) {
  const [form, setForm] = useState({ username: '', password: '', remember: false });
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const mobileView = usePreferredMobileView(isMobileRoute);
  const isWorking = status.state === 'loading';
  const statusId = status.message ? 'login-status' : undefined;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setStatus((current) => (
      current.state === 'error' || current.state === 'success'
        ? { state: 'idle', message: '' }
        : current
    ));
  }

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
        <aside className="login-brand" aria-label="Pagi Pagi Padel operations">
          <div className="login-brand-lockup">
            <img alt="" className="login-brand-icon" src={appIconSrc} />
            <div>
              <p className="login-eyebrow">Venue operations</p>
              <h1>Pagi Pagi Padel Panel</h1>
            </div>
          </div>

          <p className="login-brand-copy">
            Calendar, bookings, and staff access for daily court operations.
          </p>

          <div className="login-scope-grid" aria-label="Panel areas">
            <span><CalendarDays size={17} /> Calendar</span>
            <span><ShieldCheck size={17} /> Bookings</span>
            <span><UsersRound size={17} /> Staff access</span>
          </div>
        </aside>

        <div className="login-card">
          <div className="form-heading">
            <div className="icon-bubble">
              <LockKeyhole size={22} />
            </div>
            <div>
              <h2>Sign in</h2>
              <p>Use your panel credentials to continue.</p>
            </div>
          </div>

          <form aria-describedby={statusId} onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="login-username">Username</label>
              <input
                aria-invalid={status.state === 'error' ? 'true' : undefined}
                autoFocus
                autoComplete="username"
                id="login-username"
                name="username"
                onChange={(event) => updateField('username', event.target.value)}
                placeholder="Enter username"
                required
                value={form.username}
              />
            </div>

            <div className="form-field">
              <label htmlFor="login-password">Password</label>
              <div className="password-field">
                <input
                  aria-invalid={status.state === 'error' ? 'true' : undefined}
                  autoComplete="current-password"
                  id="login-password"
                  name="password"
                  onChange={(event) => updateField('password', event.target.value)}
                  placeholder="Enter password"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                />
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  type="button"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <label className="check-row">
              <input
                checked={form.remember}
                onChange={(event) => updateField('remember', event.target.checked)}
                type="checkbox"
              />
              Keep me signed in for 30 days
            </label>

            <button className="primary-button" disabled={isWorking} type="submit">
              {isWorking ? 'Signing in...' : 'Sign in'}
              <ChevronRight size={18} />
            </button>

            {status.message ? (
              <p
                aria-live={status.state === 'error' ? 'assertive' : 'polite'}
                className={`status-line ${status.state}`}
                id="login-status"
                role={status.state === 'error' ? 'alert' : 'status'}
              >
                {status.message}
              </p>
            ) : null}
          </form>
        </div>
      </section>
    </main>
  );
}
