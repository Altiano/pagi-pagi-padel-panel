import { useState } from 'react';
import { ChevronRight, LockKeyhole } from 'lucide-react';
import { login } from '../api/auth.js';
import { usePreferredMobileView } from '../hooks.js';

export function LoginScreen({ isMobileRoute = false, onAuthenticated }) {
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


