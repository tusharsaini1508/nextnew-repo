'use client';

import Image from 'next/image';
import { cloneElement, isValidElement, useEffect, useMemo, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import styles from './dashboard-client.module.css';

type ApiResult = {
  ok: boolean;
  status: number;
  data: unknown;
};

type PendingUser = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  dept?: string;
  phone?: string;
  status?: string;
};

type LoginFormState = {
  email: string;
  password: string;
};

type RegisterFormState = {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: string;
  dept: string;
};

type ApproveFormState = {
  id: string;
  action: string;
};

type ImportFormState = {
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  role: string;
  dept: string;
  status: string;
  avatar: string;
};

type TokenFormState = {
  userId: string;
  expiresIn: string;
};

type ActivityEntry = {
  title: string;
  detail: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
  time: string;
};

const USERS_PER_PAGE = 8;
const STORAGE_KEY = 'mbi-opportunities-admin-token';

const defaultLogin: LoginFormState = {
  email: 'sukhpreet22@gmail.com',
  password: 'Skill#4343',
};
const defaultRegister: RegisterFormState = {
  name: '',
  email: '',
  password: '',
  phone: '',
  role: 'executive',
  dept: '',
};
const defaultApprove: ApproveFormState = { id: '', action: 'approve' };
const defaultImport: ImportFormState = {
  id: '',
  name: '',
  email: '',
  password: '',
  phone: '',
  role: 'executive',
  dept: '',
  status: 'pending',
  avatar: '',
};
const defaultToken: TokenFormState = { userId: '', expiresIn: '7d' };

const productPoints = [
  {
    title: 'Approval operations',
    description: 'Review pending users, approve or reject requests, and keep the workflow moving without context switching.',
  },
  {
    title: 'Identity workflows',
    description: 'Sign in, register, import users, and mint tokens from one secure control surface.',
  },
  {
    title: 'Live diagnostics',
    description: 'See API health, session state, response payloads, and activity history at a glance.',
  },
];

const ROLE_OPTIONS = ['executive', 'manager', 'reviewer', 'admin'] as const;
const STATUS_OPTIONS = ['pending', 'active', 'rejected'] as const;

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function extractToken(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  const candidate = payload as Record<string, unknown>;
  for (const key of ['token', 'accessToken', 'authToken', 'jwt']) {
    const value = candidate[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  const nested = candidate.data;
  if (nested && typeof nested === 'object') {
    const nestedCandidate = nested as Record<string, unknown>;
    for (const key of ['token', 'accessToken', 'authToken', 'jwt']) {
      const value = nestedCandidate[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  return null;
}

function extractUsers(payload: unknown): PendingUser[] {
  if (Array.isArray(payload)) {
    return payload as PendingUser[];
  }

  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>;
    for (const key of ['users', 'pendingUsers', 'data', 'rows', 'items']) {
      const value = candidate[key];
      if (Array.isArray(value)) {
        return value as PendingUser[];
      }
    }
  }

  return [];
}

function formatUserLabel(user: PendingUser): string {
  const parts = [user.name, user.email, user.role, user.dept].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Unnamed user';
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const control =
    isValidElement(children) && typeof children.type === 'string' && children.type === 'input'
      ? cloneElement(children as ReactElement<{ autoComplete?: string }>, {
          autoComplete: (children as ReactElement<{ autoComplete?: string }>).props.autoComplete ?? 'off',
        })
      : children;

  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {control}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </label>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className={styles.statCard}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>{value}</strong>
      {hint ? <span className={styles.statHint}>{hint}</span> : null}
    </article>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.sectionHeader}>
      <div className={styles.sectionCopy}>
        <p className={styles.sectionEyebrow}>{eyebrow}</p>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionDescription}>{description}</p>
      </div>
      {actions ? <div className={styles.sectionActions}>{actions}</div> : null}
    </header>
  );
}

function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; children: ReactNode }) {
  return <span className={`${styles.pill} ${styles[`pill_${tone}`]}`}>{children}</span>;
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  return (
    <li className={`${styles.activityItem} ${styles[`activity_${entry.tone}`]}`}>
      <div className={styles.activityIcon} />
      <div className={styles.activityCopy}>
        <strong>{entry.title}</strong>
        <p>{entry.detail}</p>
        <span>{entry.time}</span>
      </div>
    </li>
  );
}

function formatClock() {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

export default function DashboardClient() {
  const [adminToken, setAdminToken] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loginForm, setLoginForm] = useState<LoginFormState>(defaultLogin);
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(defaultRegister);
  const [approveForm, setApproveForm] = useState<ApproveFormState>(defaultApprove);
  const [importForm, setImportForm] = useState<ImportFormState>(defaultImport);
  const [tokenForm, setTokenForm] = useState<TokenFormState>(defaultToken);
  const [health, setHealth] = useState<ApiResult | null>(null);
  const [statusNote, setStatusNote] = useState('Ready to connect');
  const [lastAction, setLastAction] = useState('Awaiting first action');
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortMode, setSortMode] = useState<'name' | 'role' | 'dept'>('name');
  const [currentPage, setCurrentPage] = useState(1);
  const [copyFeedback, setCopyFeedback] = useState('Copy token');
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const tokenReady = adminToken.trim().length > 0;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setAdminToken(stored);
        setStatusNote('Restored saved session');
        setLastAction('Session restored from browser storage');
        pushActivity('Session restored', 'Admin token recovered from local storage.', 'success');
      }
    } catch {
      // ignore storage failures
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (adminToken.trim()) {
        window.localStorage.setItem(STORAGE_KEY, adminToken.trim());
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }, [adminToken, hydrated]);

  useEffect(() => {
    void checkHealth();
  }, []);

  useEffect(() => {
    if (!tokenReady) {
      setPendingUsers([]);
      return;
    }

    void refreshPendingUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenReady]);

  const roleOptions = useMemo(() => ROLE_OPTIONS.map((role) => role), []);

  const statusOptions = useMemo(() => STATUS_OPTIONS.map((status) => status), []);

  const filteredUsers = useMemo(() => {
    const term = normalizeText(searchTerm);

    const baseList = pendingUsers.filter((user) => {
      const searchable = [
        user.id,
        user.name,
        user.email,
        user.role,
        user.dept,
        user.phone,
        user.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesTerm = !term || searchable.includes(term);
      const matchesRole = roleFilter === 'all' || normalizeText(user.role) === roleFilter;
      const matchesStatus = statusFilter === 'all' || normalizeText(user.status) === statusFilter;

      return matchesTerm && matchesRole && matchesStatus;
    });

    const sorted = [...baseList];
    sorted.sort((a, b) => {
      const left =
        sortMode === 'role' ? a.role : sortMode === 'dept' ? a.dept : a.name ?? a.email ?? '';
      const right =
        sortMode === 'role' ? b.role : sortMode === 'dept' ? b.dept : b.name ?? b.email ?? '';
      return String(left ?? '').localeCompare(String(right ?? ''));
    });

    return sorted;
  }, [pendingUsers, roleFilter, searchTerm, sortMode, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, searchTerm, sortMode, statusFilter]);

  const stats = useMemo(() => {
    const activeCount = pendingUsers.filter((user) => normalizeText(user.status) === 'active').length;
    const rejected = pendingUsers.filter((user) => normalizeText(user.status) === 'rejected').length;
    return [
      {
        label: 'API health',
        value: health ? (health.ok ? 'Connected' : `HTTP ${health.status}`) : 'Not checked',
        hint: 'Pulled from /api/env-check',
      },
      {
        label: 'Pending users',
        value: String(pendingUsers.length),
        hint: `${filteredUsers.length} visible with current filters`,
      },
      {
        label: 'Active',
        value: String(activeCount),
        hint: 'Users approved through the workflow',
      },
      {
        label: 'Rejected',
        value: String(rejected),
        hint: 'Audit trail remains in the API',
      },
      {
        label: 'Session',
        value: tokenReady ? 'Saved token' : 'No token',
        hint: tokenReady ? 'Protected routes are ready' : 'Sign in to unlock admin actions',
      },
    ];
  }, [filteredUsers.length, health, pendingUsers, tokenReady]);

  const visibleUsers = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(visibleUsers / USERS_PER_PAGE));
  const pageIndex = (currentPage - 1) * USERS_PER_PAGE;
  const pageStart = visibleUsers > 0 ? pageIndex + 1 : 0;
  const pageEnd = visibleUsers > 0 ? Math.min(pageIndex + USERS_PER_PAGE, visibleUsers) : 0;
  const currentPageUsers = filteredUsers.slice(pageIndex, pageIndex + USERS_PER_PAGE);

  useEffect(() => {
    setCurrentPage((existingPage) => Math.min(Math.max(existingPage, 1), totalPages));
  }, [totalPages]);

  async function requestJson(path: string, init?: RequestInit, auth = false): Promise<ApiResult> {
    const headers = new Headers(init?.headers);

    if (!headers.has('Content-Type') && init?.body) {
      headers.set('Content-Type', 'application/json');
    }

    if (auth) {
      if (!adminToken.trim()) {
        throw new Error('Add an admin token first.');
      }
      headers.set('Authorization', `Bearer ${adminToken.trim()}`);
    }

    const response = await fetch(path, {
      ...init,
      headers,
    });

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const result = {
      ok: response.ok,
      status: response.status,
      data,
    } as const;

    const actionName = path.replace('/api/', '').split('-').join(' ');
    const activityTone: ActivityEntry['tone'] = response.ok ? 'success' : 'danger';

    setLastAction(`${actionName} responded with ${response.status}`);
    setActivity((current) => [
      {
        title: actionName,
        detail: response.ok ? 'Request completed successfully.' : 'Request returned an error response.',
        tone: activityTone,
        time: formatClock(),
      },
      ...current,
    ].slice(0, 6));
    setError(response.ok ? null : `HTTP ${response.status}`);

    return result;
  }

  function pushActivity(title: string, detail: string, tone: ActivityEntry['tone']) {
    setActivity((current) => [{ title, detail, tone, time: formatClock() }, ...current].slice(0, 6));
  }

  function resetForms() {
    setLoginForm(defaultLogin);
    setRegisterForm(defaultRegister);
    setApproveForm(defaultApprove);
    setImportForm(defaultImport);
    setTokenForm(defaultToken);
  }

  async function checkHealth() {
    setBusyAction('health');
    setStatusNote('Checking API health');
    try {
      const result = await requestJson('/api/env-check');
      setHealth(result);
      setStatusNote(result.ok ? 'API is reachable' : 'API reported an error');
      pushActivity('Health check complete', result.ok ? 'Environment variables and API bridge are reachable.' : 'Health check returned an error payload.', result.ok ? 'success' : 'warning');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to reach API';
      setError(message);
      setHealth({ ok: false, status: 0, data: { error: message } });
      setStatusNote('API check failed');
      pushActivity('Health check failed', message, 'danger');
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshPendingUsers() {
    if (!tokenReady) {
      setError('Add an admin token to load pending users.');
      setStatusNote('Token required');
      return;
    }

    setBusyAction('pending-users');
    setStatusNote('Loading pending users');
    try {
      const result = await requestJson('/api/pending-users', { method: 'GET' }, true);
      const users = extractUsers(result.data);
      setPendingUsers(users);
      setApproveForm((current) => (current.id ? current : { ...current, id: users[0]?.id ?? '' }));
      setStatusNote(`Loaded ${users.length} pending users`);
      pushActivity('Pending users refreshed', `${users.length} records loaded from the API bridge.`, 'success');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to load pending users';
      setError(message);
      setStatusNote('Pending users load failed');
      pushActivity('Pending users load failed', message, 'danger');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction('login');
    setStatusNote('Signing in');
    try {
      const result = await requestJson('/api/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      });

      if (!result.ok) {
        throw new Error(`Login failed with HTTP ${result.status}`);
      }

      const token = extractToken(result.data);
      if (!token) {
        throw new Error('Login succeeded but the response did not include a token.');
      }

      setAdminToken(token);
      setCopyFeedback('Copy token');
      setStatusNote('Signed in and session saved');
      setLastAction('Login succeeded');
      pushActivity('Admin session updated', 'Token stored in browser storage and ready for protected routes.', 'success');
      setLoginForm(defaultLogin);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Login failed';
      setError(message);
      setStatusNote('Login failed');
      pushActivity('Login failed', message, 'danger');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction('register');
    setStatusNote('Creating account');
    try {
      const result = await requestJson('/api/register', {
        method: 'POST',
        body: JSON.stringify(registerForm),
      });

      if (!result.ok) {
        throw new Error(`Register failed with HTTP ${result.status}`);
      }

      setRegisterForm(defaultRegister);
      setStatusNote('Registration submitted');
      setLastAction('Register request completed');
      pushActivity('Registration submitted', 'New user payload sent through the API bridge.', 'success');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Register failed';
      setError(message);
      setStatusNote('Registration failed');
      pushActivity('Registration failed', message, 'danger');
    } finally {
      setBusyAction(null);
    }
  }

  async function submitApproval(approval: ApproveFormState) {
    setBusyAction('approve');
    setStatusNote(`${approval.action} request queued`);
    try {
      const result = await requestJson(
        '/api/approve-user',
        {
          method: 'POST',
          body: JSON.stringify({
            id: approval.id,
            action: approval.action,
          }),
        },
        true,
      );

      if (!result.ok) {
        throw new Error(`Approval failed with HTTP ${result.status}`);
      }

      setApproveForm(defaultApprove);
      setStatusNote('Approval request completed');
      setLastAction('Approval workflow updated');
      pushActivity('Approval updated', `User ${approval.id} marked as ${approval.action}.`, 'success');
      await refreshPendingUsers();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Approval failed';
      setError(message);
      setStatusNote('Approval failed');
      pushActivity('Approval failed', message, 'danger');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApprove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitApproval(approveForm);
  }

  async function submitQuickApproval(id: string, action: string) {
    setApproveForm({ id, action });
    await submitApproval({ id, action });
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction('import');
    setStatusNote('Importing user');
    try {
      const result = await requestJson(
        '/api/import-user',
        {
          method: 'POST',
          body: JSON.stringify(importForm),
        },
        true,
      );

      if (!result.ok) {
        throw new Error(`Import failed with HTTP ${result.status}`);
      }

      setImportForm(defaultImport);
      setStatusNote('Import completed');
      setLastAction('Import request completed');
      pushActivity('Import completed', 'Local user payload imported into the server.', 'success');
      await refreshPendingUsers();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Import failed';
      setError(message);
      setStatusNote('Import failed');
      pushActivity('Import failed', message, 'danger');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGenerateToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction('generate-token');
    setStatusNote('Generating token');
    try {
      const result = await requestJson(
        '/api/generate-token',
        {
          method: 'POST',
          body: JSON.stringify({
            id: tokenForm.userId,
            userId: tokenForm.userId,
            expiresIn: tokenForm.expiresIn,
          }),
        },
        true,
      );

      if (!result.ok) {
        throw new Error(`Token generation failed with HTTP ${result.status}`);
      }

      setStatusNote('Token generated');
      setLastAction('Generated token from API');
      pushActivity('Token generated', `Issued token for user ${tokenForm.userId}.`, 'success');
      setTokenForm(defaultToken);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Token generation failed';
      setError(message);
      setStatusNote('Token generation failed');
      pushActivity('Token generation failed', message, 'danger');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCopyToken() {
    if (!tokenReady) {
      setError('No token available to copy.');
      return;
    }

    try {
      await navigator.clipboard.writeText(adminToken.trim());
      setCopyFeedback('Copied');
      setStatusNote('Token copied to clipboard');
      pushActivity('Token copied', 'Admin token copied to clipboard.', 'info');
      window.setTimeout(() => setCopyFeedback('Copy token'), 1600);
    } catch {
      setError('Unable to copy token from this browser session.');
    }
  }

  function clearToken() {
    setAdminToken('');
    setPendingUsers([]);
    setSearchTerm('');
    setRoleFilter('all');
    setStatusFilter('all');
    setCurrentPage(1);
    setCopyFeedback('Copy token');
    setStatusNote('Token cleared');
    setLastAction('Admin session cleared');
    setError(null);
    pushActivity('Token cleared', 'Admin session removed from browser storage.', 'warning');
  }

  if (!tokenReady) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.authHero}>
            <div className={styles.authGlow} aria-hidden="true" />
            <div className={styles.authGlowTwo} aria-hidden="true" />
            <div className={styles.authGlowThree} aria-hidden="true" />

            <aside className={styles.authBrandPanel}>
              <div className={styles.authBrandRow}>
                <div className={styles.authMark}>
                  <Image
                    src="/mindbridge-logo.png"
                    alt="Mindbridge Innovations"
                    width={1200}
                    height={420}
                    priority
                    className={styles.authLogo}
                  />
                </div>

                <div className={styles.authBrandCopy}>
                  <span className={`${styles.kicker} ${styles.authEyebrow}`}>Admin access</span>
                  <h1 className={styles.authTitle}>Sign in to the MBI Opportunities Hub</h1>
                  <p className={styles.authSubtitle}>A polished control room for approvals, user imports, and API diagnostics.</p>
                  <p className={styles.authDescription}>
                    The admin session is preloaded with the seeded credentials below so you can sign in immediately and reach the
                    protected dashboard without setup friction.
                  </p>
                </div>

                <div className={styles.authChipRow}>
                  <Pill tone="info">Admin ID: sukhpreet22@gmail.com</Pill>
                  <Pill tone="success">Password prefilled</Pill>
                  <Pill tone="neutral">Browser session token ready</Pill>
                </div>
              </div>
            </aside>

            <form className={`${styles.formCard} ${styles.authFormCard}`} onSubmit={handleLogin}>
              <div className={styles.formCardHead}>
                <span className={styles.formBadge}>Secure sign in</span>
                <h3>Welcome back</h3>
                <p>Use the seeded admin credentials to enter the operations dashboard and continue with the live API bridge.</p>
              </div>

              <div className={styles.formFields}>
                <Field label="Email ID" hint="Prefilled with the admin account">
                  <input
                    className={styles.input}
                    type="email"
                    autoComplete="email"
                    placeholder="sukhpreet22@gmail.com"
                    value={loginForm.email}
                    onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                  />
                </Field>

                <Field label="Password" hint="Prefilled for quick access">
                  <input
                    className={styles.input}
                    type="password"
                    autoComplete="current-password"
                    placeholder="Skill#4343"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  />
                </Field>
              </div>

              <div className={styles.formActions}>
                <button type="submit" className={styles.buttonPrimary} disabled={busyAction === 'login'}>
                  {busyAction === 'login' ? 'Signing in…' : 'Sign in'}
                </button>
                <span className={styles.formHint}>The session token is stored locally after sign in.</span>
              </div>
            </form>
          </section>
        </div>
      </main>
    );
  }

  const sessionPreview = `${adminToken.slice(0, 10)}…${adminToken.slice(-6)}`;
  const pendingPreview = currentPageUsers;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroHeader}>
              <div className={styles.brandBlock}>
                <p className={styles.kicker}>Mindbridge Industries</p>
                <h1 className={styles.title}>MBI Opportunities Hub</h1>
                <p className={styles.description}>
                  A deployable Next.js operations dashboard for approvals, imports, and API-driven workflows.
                  The legacy API contract is preserved, but the UI now behaves like a real product.
                </p>
              </div>

              <div className={styles.heroRail}>
                <div className={styles.connectionPill} data-connected={tokenReady}>
                  <span className={styles.connectionDot} />
                  <span>{tokenReady ? 'Live API connection' : 'Connect an admin session'}</span>
                </div>
                <div className={styles.heroMeta}>
                  <Pill tone={health?.ok ? 'success' : health ? 'warning' : 'info'}>
                    {health ? (health.ok ? 'Healthy' : `HTTP ${health.status}`) : 'Checking health'}
                  </Pill>
                  <Pill tone={tokenReady ? 'success' : 'warning'}>{tokenReady ? 'Session saved' : 'Session empty'}</Pill>
                </div>
              </div>
            </div>

            {error ? <div className={styles.errorBanner}>{error}</div> : null}
            <div className={styles.heroNote} aria-live="polite">
              <span className={styles.heroNoteLabel}>Status</span>
              <strong>{statusNote}</strong>
            </div>

            <div className={styles.statGrid}>
              {stats.map((stat) => (
                <StatCard key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
              ))}
            </div>
          </div>
        </section>

        <section className={styles.featuresGrid}>
          {productPoints.map((point, index) => (
            <article key={point.title} className={styles.surfaceCard} style={{ animationDelay: `${index * 90}ms` }}>
              <p className={styles.surfaceEyebrow}>Product surface</p>
              <h2 className={styles.surfaceTitle}>{point.title}</h2>
              <p className={styles.surfaceDescription}>{point.description}</p>
            </article>
          ))}
        </section>

        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <section className={styles.workspace}>
              <SectionHeader
                eyebrow="Operations workspace"
                title="Use the preserved API for sign-in, approvals, and imports"
                description="The forms below call the real App Router API bridge. Token-aware requests stay on the same session and update the dashboard automatically."
                actions={
                  <div className={styles.inlineActions}>
                    <button
                      type="button"
                      className={styles.buttonSecondary}
                      onClick={() => void checkHealth()}
                      disabled={busyAction === 'health'}
                    >
                      {busyAction === 'health' ? 'Checking…' : 'Check API health'}
                    </button>
                    <button
                      type="button"
                      className={styles.buttonGhost}
                      onClick={() => void refreshPendingUsers()}
                      disabled={busyAction === 'pending-users' || !tokenReady}
                    >
                      {busyAction === 'pending-users' ? 'Refreshing…' : 'Refresh pending users'}
                    </button>
                  </div>
                }
              />

              <div className={styles.formGrid}>
                <form onSubmit={handleLogin} className={styles.formCard}>
                  <div className={styles.formCardHead}>
                    <span className={styles.formBadge}>Auth</span>
                    <h3>Login</h3>
                    <p>Capture a session token for protected routes and keep it stored locally for the browser session.</p>
                  </div>

                  <div className={styles.formFields}>
                    <Field label="Email address" hint="Used as the login identity">
                      <input
                        className={styles.input}
                        value={loginForm.email}
                        onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                        type="email"
                        placeholder="admin@mindbridge.in"
                        autoComplete="username"
                      />
                    </Field>

                    <Field label="Password" hint="Keeps the browser autocomplete clean">
                      <input
                        className={styles.input}
                        value={loginForm.password}
                        onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                        type="password"
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                    </Field>
                  </div>

                  <div className={styles.formActions}>
                    <button type="submit" className={styles.buttonPrimary} disabled={busyAction === 'login'}>
                      {busyAction === 'login' ? 'Signing in…' : 'Sign in'}
                    </button>
                    <span className={styles.formHint}>The token is stored in browser localStorage.</span>
                  </div>
                </form>

                <form onSubmit={handleRegister} className={styles.formCard}>
                  <div className={styles.formCardHead}>
                    <span className={styles.formBadge}>Onboarding</span>
                    <h3>Register user</h3>
                    <p>Create a user payload with the same fields the legacy backend expects.</p>
                  </div>

                  <div className={styles.formFields}>
                    <Field label="Name">
                      <input
                        className={styles.input}
                        value={registerForm.name}
                        onChange={(event) => setRegisterForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Asha Patel"
                        autoComplete="name"
                      />
                    </Field>

                    <Field label="Email">
                      <input
                        className={styles.input}
                        value={registerForm.email}
                        onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))}
                        type="email"
                        placeholder="asha@company.com"
                        autoComplete="email"
                      />
                    </Field>

                    <Field label="Password">
                      <input
                        className={styles.input}
                        value={registerForm.password}
                        onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))}
                        type="password"
                        placeholder="Initial password"
                        autoComplete="new-password"
                      />
                    </Field>

                    <div className={styles.dualFields}>
                      <Field label="Phone">
                        <input
                          className={styles.input}
                          value={registerForm.phone}
                          onChange={(event) => setRegisterForm((current) => ({ ...current, phone: event.target.value }))}
                          placeholder="+91 98xxxxxx"
                          autoComplete="tel"
                        />
                      </Field>

                    <Field label="Role">
                      <select
                        className={styles.input}
                        value={registerForm.role}
                        onChange={(event) => setRegisterForm((current) => ({ ...current, role: event.target.value }))}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </Field>
                    </div>

                    <Field label="Department">
                      <input
                        className={styles.input}
                        value={registerForm.dept}
                        onChange={(event) => setRegisterForm((current) => ({ ...current, dept: event.target.value }))}
                        placeholder="Sales"
                      />
                    </Field>
                  </div>

                  <div className={styles.formActions}>
                    <button type="submit" className={styles.buttonPrimary} disabled={busyAction === 'register'}>
                      {busyAction === 'register' ? 'Submitting…' : 'Register user'}
                    </button>
                    <span className={styles.formHint}>Uses the same schema expected by the server.</span>
                  </div>
                </form>
              </div>

              <div className={styles.formGrid}>
                <form onSubmit={handleApprove} className={styles.formCard}>
                  <div className={styles.formCardHead}>
                    <span className={styles.formBadge}>Workflow</span>
                    <h3>Approve or reject</h3>
                    <p>Use the real workflow endpoint to move users through the approval process.</p>
                  </div>

                  <div className={styles.formFields}>
                    <Field label="User ID">
                      <input
                        className={styles.input}
                        value={approveForm.id}
                        onChange={(event) => setApproveForm((current) => ({ ...current, id: event.target.value }))}
                        placeholder="pending-user-id"
                      />
                    </Field>

                    <Field label="Action">
                      <select
                        className={styles.input}
                        value={approveForm.action}
                        onChange={(event) => setApproveForm((current) => ({ ...current, action: event.target.value }))}
                      >
                        <option value="approve">Approve</option>
                        <option value="reject">Reject</option>
                      </select>
                    </Field>
                  </div>

                  <div className={styles.formActions}>
                    <button type="submit" className={styles.buttonPrimary} disabled={busyAction === 'approve' || !tokenReady}>
                      {busyAction === 'approve' ? 'Updating…' : 'Submit approval'}
                    </button>
                    <span className={styles.formHint}>{tokenReady ? 'Protected route ready.' : 'Sign in first to unlock this action.'}</span>
                  </div>
                </form>

                <form onSubmit={handleImport} className={styles.formCard}>
                  <div className={styles.formCardHead}>
                    <span className={styles.formBadge}>Migration</span>
                    <h3>Import local user</h3>
                    <p>Bridge local data into the server and keep the migration path visible inside the UI.</p>
                  </div>

                  <div className={styles.formFields}>
                    <div className={styles.dualFields}>
                      <Field label="ID">
                        <input
                          className={styles.input}
                          value={importForm.id}
                          onChange={(event) => setImportForm((current) => ({ ...current, id: event.target.value }))}
                          placeholder="local-user-id"
                        />
                      </Field>

                      <Field label="Status">
                        <input
                          className={styles.input}
                          value={importForm.status}
                          onChange={(event) => setImportForm((current) => ({ ...current, status: event.target.value }))}
                          placeholder="pending"
                        />
                      </Field>
                    </div>

                    <div className={styles.dualFields}>
                      <Field label="Name">
                        <input
                          className={styles.input}
                          value={importForm.name}
                          onChange={(event) => setImportForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Asha Patel"
                        />
                      </Field>

                      <Field label="Email">
                        <input
                          className={styles.input}
                          value={importForm.email}
                          onChange={(event) => setImportForm((current) => ({ ...current, email: event.target.value }))}
                          type="email"
                          placeholder="asha@company.com"
                        />
                      </Field>
                    </div>

                    <div className={styles.dualFields}>
                      <Field label="Password">
                        <input
                          className={styles.input}
                          value={importForm.password}
                          onChange={(event) => setImportForm((current) => ({ ...current, password: event.target.value }))}
                          type="password"
                          placeholder="Initial password"
                          autoComplete="new-password"
                        />
                      </Field>

                      <Field label="Phone">
                        <input
                          className={styles.input}
                          value={importForm.phone}
                          onChange={(event) => setImportForm((current) => ({ ...current, phone: event.target.value }))}
                          placeholder="+91 98xxxxxx"
                        />
                      </Field>
                    </div>

                    <div className={styles.dualFields}>
                      <Field label="Role">
                        <select
                          className={styles.input}
                          value={importForm.role}
                          onChange={(event) => setImportForm((current) => ({ ...current, role: event.target.value }))}
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Department">
                        <input
                          className={styles.input}
                          value={importForm.dept}
                          onChange={(event) => setImportForm((current) => ({ ...current, dept: event.target.value }))}
                          placeholder="Operations"
                        />
                      </Field>
                    </div>

                    <Field label="Avatar URL">
                      <input
                        className={styles.input}
                        value={importForm.avatar}
                        onChange={(event) => setImportForm((current) => ({ ...current, avatar: event.target.value }))}
                        placeholder="https://..."
                      />
                    </Field>
                  </div>

                  <div className={styles.formActions}>
                    <button type="submit" className={styles.buttonPrimary} disabled={busyAction === 'import' || !tokenReady}>
                      {busyAction === 'import' ? 'Importing…' : 'Import user'}
                    </button>
                    <span className={styles.formHint}>{tokenReady ? 'Protected route ready.' : 'Login first to enable imports.'}</span>
                  </div>
                </form>
              </div>
            </section>

            <section className={styles.tableCard}>
              <SectionHeader
                eyebrow="Live data"
                title="Pending users"
                description="Search, filter, and act on records pulled from the preserved API bridge. The table updates after approvals and imports."
                actions={
                  <div className={styles.sectionActionsInline}>
                      <button
                        type="button"
                        className={styles.buttonSecondary}
                        onClick={() => void checkHealth()}
                        disabled={busyAction === 'health'}
                      >
                        {busyAction === 'health' ? 'Checking…' : 'Check health'}
                      </button>
                    <button
                      type="button"
                      className={styles.buttonGhost}
                      onClick={() => void refreshPendingUsers()}
                      disabled={busyAction === 'pending-users' || !tokenReady}
                    >
                      {busyAction === 'pending-users' ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>
                }
              />

              <div className={styles.toolbar}>
                <input
                  className={styles.input}
                  type="search"
                  placeholder="Search by name, email, role, department, or status"
                  autoComplete="off"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                <select className={styles.input} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="all">All roles</option>
                  {roleOptions.map((role) => (
                    <option key={role} value={normalizeText(role)}>
                      {role}
                    </option>
                  ))}
                </select>
                <select className={styles.input} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={normalizeText(status)}>
                      {status}
                    </option>
                  ))}
                </select>
                <select className={styles.input} value={sortMode} onChange={(event) => setSortMode(event.target.value as 'name' | 'role' | 'dept')}>
                  <option value="name">Sort by name</option>
                  <option value="role">Sort by role</option>
                  <option value="dept">Sort by department</option>
                </select>
              </div>

              <div className={styles.tableWrap}>
                <div className={styles.tableHead}>
                  <span>Name</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Department</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>

                {tokenReady ? (
                  pendingPreview.length > 0 ? (
                    pendingPreview.map((user, index) => {
                      const userId = String(user.id ?? '');
                      const userKey = `${user.id ?? user.email ?? index}`;
                      return (
                        <div key={userKey} className={styles.tableRow}>
                          <div className={styles.tableCellMain}>
                            <strong>{user.name ?? 'Unnamed user'}</strong>
                            <span>{user.phone ?? 'No phone saved'}</span>
                          </div>
                          <div className={styles.tableCell}>{user.email ?? '—'}</div>
                          <div className={styles.tableCell}>
                            <Pill tone="info">{user.role ?? '—'}</Pill>
                          </div>
                          <div className={styles.tableCell}>{user.dept ?? '—'}</div>
                          <div className={styles.tableCell}>
                            <Pill tone={normalizeText(user.status) === 'active' ? 'success' : normalizeText(user.status) === 'rejected' ? 'danger' : 'warning'}>
                              {user.status ?? 'pending'}
                            </Pill>
                          </div>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.buttonSecondarySmall}
                              onClick={() => void submitQuickApproval(userId, 'approve')}
                              disabled={busyAction === 'approve' || !userId}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className={styles.buttonGhostSmall}
                              onClick={() => void submitQuickApproval(userId, 'reject')}
                              disabled={busyAction === 'approve' || !userId}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.emptyState}>
                      <strong>No pending users loaded yet.</strong>
                      <p>Refresh the list after signing in to see records from the live API bridge.</p>
                    </div>
                  )
                ) : (
                  <div className={styles.emptyState}>
                    <strong>Add an admin token to load pending users.</strong>
                    <p>Sign in on the left or paste a saved token in the session panel to unlock protected routes.</p>
                  </div>
                )}
              </div>

              <div className={styles.tableFooter}>
                <span>
                  Showing {pageStart}-{pageEnd} of {visibleUsers} filtered users
                </span>
                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className={styles.buttonGhostSmall}
                    onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage <= 1}
                  >
                    Previous
                  </button>
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className={styles.buttonGhostSmall}
                    onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.surfaceCard}>
              <div className={styles.surfaceInner}>
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.surfaceEyebrow}>Session vault</p>
                    <h3 className={styles.surfaceTitle}>Admin token</h3>
                  </div>
                  <Pill tone={tokenReady ? 'success' : 'warning'}>{tokenReady ? 'Saved' : 'Empty'}</Pill>
                </div>

                <div className={styles.tokenBox}>
                  <strong>{sessionPreview}</strong>
                  <span>Stored in browser localStorage for protected route calls.</span>
                </div>

                <div className={styles.tokenActions}>
                  <button type="button" className={styles.buttonSecondary} onClick={handleCopyToken} disabled={!tokenReady}>
                    {copyFeedback}
                  </button>
                  <button type="button" className={styles.buttonGhost} onClick={clearToken} disabled={!tokenReady}>
                    Clear token
                  </button>
                </div>
              </div>
            </section>

            <section className={styles.surfaceCard}>
              <div className={styles.surfaceInner}>
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.surfaceEyebrow}>Utility action</p>
                    <h3 className={styles.surfaceTitle}>Generate token</h3>
                  </div>
                </div>

                <form onSubmit={handleGenerateToken} className={styles.compactForm}>
                  <Field label="User ID">
                    <input
                      className={styles.input}
                      value={tokenForm.userId}
                      onChange={(event) => setTokenForm((current) => ({ ...current, userId: event.target.value }))}
                      placeholder="user-id"
                    />
                  </Field>

                  <Field label="Expires In">
                    <select
                      className={styles.input}
                      value={tokenForm.expiresIn}
                      onChange={(event) => setTokenForm((current) => ({ ...current, expiresIn: event.target.value }))}
                    >
                      <option value="1h">1 hour</option>
                      <option value="1d">1 day</option>
                      <option value="7d">7 days</option>
                      <option value="30d">30 days</option>
                    </select>
                  </Field>

                  <button type="submit" className={styles.buttonPrimary} disabled={busyAction === 'generate-token' || !tokenReady}>
                    {busyAction === 'generate-token' ? 'Generating…' : 'Generate token'}
                  </button>
                </form>
              </div>
            </section>

            <section className={styles.logPanel}>
              <div className={styles.surfaceInner}>
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.surfaceEyebrow}>Response preview</p>
                    <h3 className={styles.surfaceTitle}>Last API payload</h3>
                  </div>
                </div>
                <pre className={styles.codeBlock}>
                  {health ? JSON.stringify(health, null, 2) : 'No response captured yet. Run health check or sign in to inspect the live payload.'}
                </pre>
              </div>
            </section>

            <section className={styles.logPanel}>
              <div className={styles.surfaceInner}>
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.surfaceEyebrow}>Activity feed</p>
                    <h3 className={styles.surfaceTitle}>Latest changes</h3>
                  </div>
                </div>

                <ul className={styles.activityList}>
                  {activity.length > 0 ? (
                    activity.map((entry, index) => <ActivityItem key={`${entry.title}-${index}`} entry={entry} />)
                  ) : (
                    <li className={styles.activityPlaceholder}>
                      <strong>No activity yet.</strong>
                      <p>Every request, import, approval, and session change will appear here.</p>
                    </li>
                  )}
                </ul>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
