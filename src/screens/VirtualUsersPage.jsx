import { useEffect, useState } from 'react';
import { Copy, LogOut, Moon, MonitorSmartphone, Pencil, Sun, Trash2, UserPlus, X } from 'lucide-react';
import {
  APP_BUILD_COMMIT,
  APP_BUILD_TIMESTAMP,
  APP_VERSION,
  CALENDAR_BOOKING_PERMISSION,
  virtualPermissionGroups,
} from '../constants.js';
import {
  createVirtualUser,
  deleteVirtualUser,
  listVirtualUserSessions,
  listVirtualUsers,
  updateVirtualUser,
} from '../api/virtualUsers.js';
import { getBackendVersion } from '../api/version.js';
import { formatBuildDateTime, formatCommitHash } from '../lib/datetime.js';
import { copyText } from '../lib/format.js';
import { useEscapeKey, useThemePreference } from '../hooks.js';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: MonitorSmartphone },
];

export function VirtualUsersPage({ auth, displayName, meState, onLogout }) {
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [state, setState] = useState({ loading: true, error: '', status: '', canManage: false });
  const [versionState, setVersionState] = useState({ loading: true, data: null, error: '' });
  const [editor, setEditor] = useState({ mode: 'closed', user: null });

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: '', status: '', canManage: false });
    loadVirtualUserData()
      .then(({ sessions: sessionItems, users: userItems }) => {
        if (active) {
          setUsers(userItems);
          setSessions(sessionItems);
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

  useEffect(() => {
    let active = true;
    getBackendVersion()
      .then((data) => {
        if (active) setVersionState({ loading: false, data, error: '' });
      })
      .catch((error) => {
        if (active) setVersionState({ loading: false, data: null, error: error.message });
      });

    return () => {
      active = false;
    };
  }, []);

  async function refreshData() {
    const data = await loadVirtualUserData();
    setUsers(data.users);
    setSessions(data.sessions);
  }

  async function saveUser(form) {
    setState((current) => ({ ...current, status: 'Saving virtual user...' }));
    if (editor.mode === 'edit') {
      await updateVirtualUser(editor.user.id, form);
    } else {
      await createVirtualUser(form);
    }
    await refreshData();
    setEditor({ mode: 'closed', user: null });
    setState({ loading: false, error: '', status: 'Virtual user saved.', canManage: true });
  }

  async function removeUser(user) {
    const confirmed = window.confirm(`Delete virtual user _${user.username}?`);
    if (!confirmed) return;
    setState((current) => ({ ...current, status: 'Deleting virtual user...' }));
    try {
      await deleteVirtualUser(user.id);
      await refreshData();
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
                  {user.permissions.length ? [...user.permissions].sort((a, b) => a.localeCompare(b)).map((permission) => (
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

          {state.canManage ? (
            <div className="virtual-session-section">
              <div className="settings-panel-heading compact-heading">
                <div>
                  <span className="panel-label">Active sessions</span>
                  <h2>Upstream use</h2>
                </div>
              </div>
              <div className="virtual-session-list">
                {state.loading ? (
                  <div className="empty-state">Loading sessions...</div>
                ) : sessions.length ? sessions.map((session, index) => (
                  <article className="virtual-session-row" key={`${session.virtual_user_id}-${session.session_created_at || index}`}>
                    <div>
                      <strong>{session.display_name || session.login_username || 'Unknown user'}</strong>
                      <span>{session.login_username || session.username || 'Unknown login'}</span>
                    </div>
                    <div>
                      <span>Upstream</span>
                      <strong>{session.upstream_account_username || 'Unassigned'}</strong>
                    </div>
                    <div>
                      <span>Panel expires</span>
                      <strong>{formatSessionDate(session.session_expires_at)}</strong>
                    </div>
                    <div>
                      <span>Token expires</span>
                      <strong>{formatSessionDate(session.upstream_token_expires_at)}</strong>
                    </div>
                    <span className={`state-pill ${session.upstream_token_status || 'missing'}`}>{formatTokenStatus(session.upstream_token_status)}</span>
                  </article>
                )) : (
                  <div className="empty-state">No active virtual sessions.</div>
                )}
              </div>
            </div>
          ) : null}
        </article>

        <div className="settings-side">
          <article className="settings-panel">
            <span className="panel-label">Appearance</span>
            <h2>Theme</h2>
            <ThemePicker />
          </article>

          <aside className="settings-panel settings-info">
            <span className="panel-label">Current session</span>
            <h2>{displayName}</h2>
            <dl>
              <div><dt>Login type</dt><dd>{auth.virtualUser ? 'Virtual account' : 'Regular upstream account'}</dd></div>
              <div><dt>Upstream</dt><dd>{meState.loading ? 'Checking...' : meState.error ? 'Needs attention' : 'Connected'}</dd></div>
              {auth.upstreamAccountUsername ? (
                <div><dt>Assigned account</dt><dd>{auth.upstreamAccountUsername}</dd></div>
              ) : null}
              <div><dt>Virtual prefix</dt><dd>_username</dd></div>
            </dl>
            <p>Virtual users authenticate with their own wrapper password. The Worker keeps upstream tokens server-side and assigns an upstream account per session.</p>
          </aside>
        </div>
      </section>

      <VersionInfoSection backendState={versionState} />

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

export function VersionInfoSection({ backendState }) {
  const backend = backendState.data || {};
  const backendLoadingValue = backendState.loading ? 'Checking...' : null;
  const backendErrorValue = backendState.error ? 'Unavailable' : null;

  return (
    <section className="settings-panel version-panel">
      <div className="settings-panel-heading compact-heading">
        <div>
          <span className="panel-label">Deployment</span>
          <h2>Versions</h2>
        </div>
      </div>
      <div className="version-grid">
        <VersionDetailCard
          builtAt={APP_BUILD_TIMESTAMP}
          commit={APP_BUILD_COMMIT}
          environment="GitHub Pages"
          title="Frontend"
          version={APP_VERSION}
        />
        <VersionDetailCard
          builtAt={backendLoadingValue || backendErrorValue || backend.built_at}
          commit={backendLoadingValue || backendErrorValue || backend.commit}
          environment={backend.runtime === 'cloudflare-worker' ? 'Cloudflare Worker' : backend.runtime || 'Cloudflare Worker'}
          error={backendState.error}
          title="Backend"
          version={backendLoadingValue || backendErrorValue || backend.version}
        />
      </div>
    </section>
  );
}

function VersionDetailCard({ builtAt, commit, environment, error = '', title, version }) {
  const commitValue = isPlaceholderVersionValue(commit) ? commit : formatCommitHash(commit);
  const builtAtValue = isPlaceholderVersionValue(builtAt) ? builtAt : formatBuildDateTime(builtAt);
  const versionValue = isPlaceholderVersionValue(version) ? version : formatVersionNumber(version);

  return (
    <article className="version-card">
      <div>
        <span>{environment}</span>
        <strong>{title}</strong>
      </div>
      <dl>
        <VersionRow label="Version" value={versionValue} />
        <VersionRow copyValue={commit} label="Commit" mono value={commitValue} />
        <VersionRow label="Built" value={builtAtValue} />
      </dl>
      {error ? <p className="status-line error">Backend version unavailable: {error}</p> : null}
    </article>
  );
}

function VersionRow({ copyValue = '', label, mono = false, value }) {
  const canCopy = copyValue && !isPlaceholderVersionValue(copyValue);

  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? 'monospace-value' : ''} title={copyValue || value}>
        <span>{value || 'Not set'}</span>
        {canCopy ? (
          <button aria-label={`Copy ${label.toLowerCase()}`} className="version-copy-button" onClick={() => copyText(copyValue)} type="button">
            <Copy size={13} />
          </button>
        ) : null}
      </dd>
    </div>
  );
}

function formatVersionNumber(value) {
  if (!value) return 'Not set';
  const normalized = String(value).trim();
  if (!normalized) return 'Not set';
  return normalized.startsWith('v') ? normalized : `v${normalized}`;
}

function isPlaceholderVersionValue(value) {
  return value === 'Checking...' || value === 'Unavailable' || value === 'Not set';
}

export function ThemePicker() {
  const { preference, setPreference } = useThemePreference();

  return (
    <>
      <div aria-label="Theme" className="theme-picker" role="group">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            aria-pressed={preference === value}
            className={preference === value ? 'selected' : ''}
            key={value}
            onClick={() => setPreference(value)}
            type="button"
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <p className="theme-picker-note">System follows this device's appearance. Saved in this browser only.</p>
    </>
  );
}

async function loadVirtualUserData() {
  const [users, sessions] = await Promise.all([
    listVirtualUsers(),
    listVirtualUserSessions(),
  ]);
  return { sessions, users };
}

function formatSessionDate(value) {
  if (!value) return 'No expiry';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date);
}

function formatTokenStatus(status) {
  if (status === 'fresh') return 'Fresh';
  if (status === 'expiring') return 'Expiring';
  if (status === 'expired') return 'Expired';
  return 'Missing';
}

export function VirtualUserEditor({ mode, user, onClose, onSave }) {
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


export function buildVirtualUserForm(user) {
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
