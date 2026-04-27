import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { Pool, type PoolConfig } from 'pg';

type DbMode = 'postgres' | 'local';

type QueryResult<T> = {
  rowCount: number;
  rows: T[];
};

type StoredUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: string | null;
  dept: string | null;
  phone: string | null;
  status: string | null;
  avatar: string | null;
  color: string | null;
  created_at: string;
};

const connectionString = process.env.DATABASE_URL || '';
const isProduction = process.env.NODE_ENV === 'production';
const allowLocalFallback = process.env.ALLOW_LOCAL_DB_FALLBACK === 'true' || !isProduction;
const storageDir = path.join(process.cwd(), '.data');
const storageFile = path.join(storageDir, 'users.json');

const useSsl =
  process.env.DB_SSL === 'true' ||
  process.env.PGSSLMODE === 'require' ||
  (connectionString && connectionString.includes('sslmode=require'));

const rejectUnauthorizedEnv = (process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase();
const rejectUnauthorized = rejectUnauthorizedEnv === 'true';

const defaultAdminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@mindbridge.in').trim().toLowerCase();
const defaultAdminPassword = process.env.SEED_ADMIN_PASSWORD || 'Mindbridge@123';

if (!connectionString) {
  if (allowLocalFallback) {
    console.warn('[db] DATABASE_URL not set - using local JSON fallback store');
  } else {
    throw new Error('DATABASE_URL is required in production');
  }
}

type PoolState = {
  pool: Pool | null;
  mode: DbMode;
};

declare global {
  // eslint-disable-next-line no-var
  var __mbiDbState: PoolState | undefined;
  // eslint-disable-next-line no-var
  var __mbiDbCache: StoredUser[] | undefined;
  // eslint-disable-next-line no-var
  var __mbiDbInitPromise: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __mbiAdminHash: string | undefined;
}

const globalForDb = globalThis as typeof globalThis & {
  __mbiDbState?: PoolState;
  __mbiDbCache?: StoredUser[];
  __mbiDbInitPromise?: Promise<void>;
  __mbiAdminHash?: string;
};

const poolConfig: PoolConfig = {
  connectionString,
};

if (useSsl) {
  poolConfig.ssl = { rejectUnauthorized };
  console.info(`[db] SSL enabled for postgres pool (rejectUnauthorized=${rejectUnauthorized})`);
}

const state: PoolState =
  globalForDb.__mbiDbState ||
  {
    pool: connectionString ? new Pool(poolConfig) : null,
    mode: connectionString ? 'postgres' : 'local',
  };

if (!globalForDb.__mbiDbState) {
  globalForDb.__mbiDbState = state;
}

function normalizeSql(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isFallbackWorthyError(error: unknown) {
  if (!allowLocalFallback) return false;
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const fallbackSignals = [
    'enotfound',
    'econnrefused',
    'econnreset',
    'ecallback',
    'connection terminated',
    'terminating connection',
    'could not translate host name',
    'password authentication failed',
    'the database system is starting up',
    'connect ehostunreach',
    'server does not support ssl',
    'no pg_hba.conf',
    'timeout',
    'database "dbname" does not exist',
    'role "username" does not exist',
  ];

  return fallbackSignals.some((signal) => message.includes(signal));
}

async function ensureDir() {
  await mkdir(storageDir, { recursive: true });
}

async function getAdminPasswordHash() {
  if (globalForDb.__mbiAdminHash) return globalForDb.__mbiAdminHash;
  const hash = await bcrypt.hash(defaultAdminPassword, 10);
  globalForDb.__mbiAdminHash = hash;
  return hash;
}

function makeAvatar(name: string) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function makeColor() {
  const color = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `#${color}`;
}

async function getSeedUsers(): Promise<StoredUser[]> {
  const password = await getAdminPasswordHash();

  return [
    {
      id: 'seed-admin',
      name: 'Mindbridge Admin',
      email: defaultAdminEmail,
      password,
      role: 'admin',
      dept: 'Operations',
      phone: '',
      status: 'active',
      avatar: 'MA',
      color: '#2563eb',
      created_at: new Date().toISOString(),
    },
  ];
}

async function readLocalUsers(): Promise<StoredUser[]> {
  if (globalForDb.__mbiDbCache) return globalForDb.__mbiDbCache;

  await ensureDir();

  try {
    const raw = await readFile(storageFile, 'utf8');
    const parsed = JSON.parse(raw) as { users?: StoredUser[] } | StoredUser[];

    const users = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.users)
        ? parsed.users
        : [];

    if (users.length > 0) {
      globalForDb.__mbiDbCache = users.map(normalizeStoredUser);
      return globalForDb.__mbiDbCache;
    }
  } catch {
    // fall through to seed
  }

  const seeded = await getSeedUsers();
  globalForDb.__mbiDbCache = seeded;
  await writeLocalUsers(seeded);
  return seeded;
}

async function writeLocalUsers(users: StoredUser[]) {
  await ensureDir();
  globalForDb.__mbiDbCache = users.map(normalizeStoredUser);
  await writeFile(storageFile, JSON.stringify({ users: globalForDb.__mbiDbCache }, null, 2), 'utf8');
}

function normalizeStoredUser(user: StoredUser): StoredUser {
  return {
    id: String(user.id),
    name: String(user.name),
    email: String(user.email).toLowerCase(),
    password: String(user.password),
    role: user.role ?? null,
    dept: user.dept ?? null,
    phone: user.phone ?? null,
    status: user.status ?? null,
    avatar: user.avatar ?? null,
    color: user.color ?? null,
    created_at: user.created_at ? new Date(user.created_at).toISOString() : new Date().toISOString(),
  };
}

type UserSelect = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  dept: string | null;
  phone: string | null;
  status: string | null;
  avatar: string | null;
  color: string | null;
  created_at: string | Date | null;
  password?: string;
};

function toPublicUser(user: StoredUser): UserSelect {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    dept: user.dept,
    phone: user.phone,
    status: user.status,
    avatar: user.avatar,
    color: user.color,
    created_at: user.created_at,
  };
}

function toAuthUser(user: StoredUser): UserSelect {
  return {
    ...toPublicUser(user),
    password: user.password,
  };
}

function projectUsers(users: StoredUser[], includePassword: boolean) {
  return users.map((user) => (includePassword ? toAuthUser(user) : toPublicUser(user)));
}

async function ensureLocalInit() {
  await readLocalUsers();
}

async function ensureSeedUsersInPostgres() {
  if (!state.pool) return;

  const seedUsers = await getSeedUsers();
  for (const user of seedUsers) {
    await state.pool.query(
      `
        INSERT INTO users (id, name, email, password, role, dept, phone, status, avatar, color, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (email) DO NOTHING
      `,
      [
        user.id,
        user.name,
        user.email,
        user.password,
        user.role,
        user.dept,
        user.phone,
        user.status,
        user.avatar,
        user.color,
        user.created_at,
      ]
    );
  }
}

async function ensurePostgresInit() {
  if (!state.pool) return;
  await state.pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      name text NOT NULL,
      email text UNIQUE NOT NULL,
      password text NOT NULL,
      role text,
      dept text,
      phone text,
      status text DEFAULT 'pending',
      avatar text,
      color text,
      created_at timestamptz DEFAULT now()
    );
  `);
  await ensureSeedUsersInPostgres();
}

async function tryPostgresQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  if (!state.pool) {
    throw new Error('Postgres pool is not available');
  }

  const result = await state.pool.query<T>(text, params);
  return {
    rowCount: result.rowCount ?? result.rows.length,
    rows: result.rows,
  };
}

async function localQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const sql = normalizeSql(text);
  const values = params ?? [];
  const users = await readLocalUsers();

  if (sql === 'select 1') {
    return {
      rowCount: 1,
      rows: [{ '?column?': 1 } as unknown as T],
    };
  }

  if (sql.startsWith('create table if not exists users')) {
    return { rowCount: 0, rows: [] };
  }

  if (sql === 'select * from users where email = $1 limit 1') {
    const email = String(values[0] ?? '').toLowerCase();
    const user = users.find((entry) => entry.email === email);
    return {
      rowCount: user ? 1 : 0,
      rows: (user ? [toAuthUser(user)] : []) as unknown as T[],
    };
  }

  if (sql === 'select id from users where email = $1') {
    const email = String(values[0] ?? '').toLowerCase();
    const user = users.find((entry) => entry.email === email);
    return {
      rowCount: user ? 1 : 0,
      rows: (user ? [{ id: user.id }] : []) as unknown as T[],
    };
  }

  if (sql === 'select id, name, email, role, dept, phone, status, avatar, color, created_at from users where id = $1') {
    const id = String(values[0] ?? '');
    const user = users.find((entry) => entry.id === id);
    return {
      rowCount: user ? 1 : 0,
      rows: (user ? [toPublicUser(user)] : []) as unknown as T[],
    };
  }

  if (sql === "select id, name, email, role, dept, phone, status, avatar, color, created_at from users where status = 'pending' order by created_at asc") {
    const pending = users
      .filter((entry) => (entry.status || 'pending') === 'pending')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return {
      rowCount: pending.length,
      rows: projectUsers(pending, false) as unknown as T[],
    };
  }

  if (sql.startsWith('insert into users')) {
    const [idValue, nameValue, emailValue, passwordValue, phoneValue, roleValue, deptValue, statusValue, avatarValue, colorValue] =
      values;

    const id = String(idValue || randomUUID());
    const name = String(nameValue || '').trim();
    const email = String(emailValue || '').trim().toLowerCase();
    const password = String(passwordValue || '');
    const phone = String(phoneValue || '');
    const role = roleValue == null ? null : String(roleValue);
    const dept = deptValue == null ? null : String(deptValue);
    const status = statusValue == null ? 'pending' : String(statusValue);
    const avatar = avatarValue == null ? makeAvatar(name) : String(avatarValue);
    const color = colorValue == null ? makeColor() : String(colorValue);

    if (!name || !email || !password) {
      throw new Error('Missing required fields for insert');
    }

    const duplicate = users.find((entry) => entry.email === email);
    if (duplicate) {
      const error = new Error('duplicate key value violates unique constraint "users_email_key"');
      (error as Error & { code?: string }).code = '23505';
      throw error;
    }

    const createdAt = new Date().toISOString();
    const newUser: StoredUser = normalizeStoredUser({
      id,
      name,
      email,
      password,
      role,
      dept,
      phone,
      status,
      avatar,
      color,
      created_at: createdAt,
    });

    const nextUsers = [...users, newUser];
    await writeLocalUsers(nextUsers);

    return {
      rowCount: 1,
      rows: [
        {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          dept: newUser.dept,
          phone: newUser.phone,
          status: newUser.status,
          avatar: newUser.avatar,
          color: newUser.color,
          created_at: newUser.created_at,
        } as unknown as T,
      ],
    };
  }

  if (sql === 'update users set status = $1 where id = $2 returning id, name, email, role, dept, phone, status, avatar, color, created_at') {
    const newStatus = String(values[0] ?? '');
    const id = String(values[1] ?? '');
    const index = users.findIndex((entry) => entry.id === id);

    if (index === -1) {
      return { rowCount: 0, rows: [] };
    }

    const updated: StoredUser = {
      ...users[index],
      status: newStatus,
    };

    const nextUsers = [...users];
    nextUsers[index] = updated;
    await writeLocalUsers(nextUsers);

    return {
      rowCount: 1,
      rows: [
        {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          dept: updated.dept,
          phone: updated.phone,
          status: updated.status,
          avatar: updated.avatar,
          color: updated.color,
          created_at: updated.created_at,
        } as unknown as T,
      ],
    };
  }

  throw new Error(`Unsupported local query: ${text}`);
}

async function runQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  if (state.mode === 'local' || !connectionString) {
    await ensureLocalInit();
    return localQuery<T>(text, params);
  }

  try {
    await ensurePostgresInit();
    return await tryPostgresQuery<T>(text, params);
  } catch (error) {
    if (!allowLocalFallback || !isFallbackWorthyError(error)) {
      throw error;
    }

    console.warn('[db] Postgres query failed, switching to local fallback:', error instanceof Error ? error.message : error);
    state.mode = 'local';
    await ensureLocalInit();
    return localQuery<T>(text, params);
  }
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return runQuery<T>(text, params);
}

export async function init() {
  if (globalForDb.__mbiDbInitPromise) {
    return globalForDb.__mbiDbInitPromise;
  }

  globalForDb.__mbiDbInitPromise = (async () => {
    if (state.mode === 'postgres' && state.pool) {
      try {
        await ensurePostgresInit();
        return;
      } catch (error) {
        if (!allowLocalFallback) {
          throw error;
        }

        console.warn('[db] Postgres init failed, using local fallback:', error instanceof Error ? error.message : error);
        state.mode = 'local';
      }
    }

    await ensureLocalInit();
  })();

  return globalForDb.__mbiDbInitPromise;
}

export { state as dbState };
export { state as poolState };
export const pool = state.pool;
