import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { NextRequest, NextResponse } from 'next/server';
import * as db from './db';
import { getCorsHeaders } from './cors';

type UserRow = {
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

type AuthUser = UserRow;

const allowedRoles = new Set(['executive', 'manager', 'reviewer', 'admin']);
const allowedStatuses = new Set(['pending', 'active', 'rejected']);

function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'development') return 'dev_secret_change_in_vercel';
  throw new Error('JWT_SECRET is not configured');
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: getCorsHeaders() });
}

function methodNotAllowed() {
  return json({ error: 'Method not allowed' }, 405);
}

function withCors204() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}

function getTokenFromRequest(request: NextRequest) {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
  return null;
}

async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  const secret = getJwtSecret();

  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload | string;
    if (!payload || typeof payload === 'string' || !payload.sub) return null;

    await db.init();
    const result = await db.query<UserRow>(
      'SELECT id, name, email, role, dept, phone, status, avatar, color, created_at FROM users WHERE id = $1',
      [payload.sub]
    );

    if (result.rowCount === 0) return null;
    return result.rows[0];
  } catch (error) {
    if (error instanceof Error && error.message === 'JWT_SECRET is not configured') {
      throw error;
    }

    return null;
  }
}

function makeAvatar(name: string) {
  return String(name)
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function makeColor() {
  return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
}

function issueToken(user: Pick<UserRow, 'id' | 'email' | 'role'>, expiresIn = '7d') {
  const secret = getJwtSecret();
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, secret, { expiresIn });
}

async function handleLogin(request: NextRequest) {
  if (request.method === 'OPTIONS') return withCors204();
  if (request.method !== 'POST') return methodNotAllowed();

  try {
    await db.init();
    const body = (await request.json().catch(() => null)) || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) return json({ error: 'Missing required fields' }, 400);

    const result = await db.query<UserRow>('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
    if (result.rowCount === 0) return json({ error: 'Invalid credentials' }, 401);

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password || '');
    if (!ok) return json({ error: 'Invalid credentials' }, 401);

    const token = issueToken(user);
    const safeUser = {
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

    return json({ ok: true, token, user: safeUser }, 200);
  } catch (error) {
    console.error('[login] error', error instanceof Error ? error.stack : error);
    return json({ error: 'Server error' }, 500);
  }
}

async function handleRegister(request: NextRequest) {
  if (request.method === 'OPTIONS') return withCors204();
  if (request.method !== 'POST') return methodNotAllowed();

  try {
    await db.init();
    const body = (await request.json().catch(() => null)) || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const phone = String(body.phone || '');
    const role = String(body.role || 'executive');
    const dept = String(body.dept || '');

    if (!name || !email || !password) return json({ error: 'Missing required fields' }, 400);

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if ((existing.rowCount ?? 0) > 0) return json({ error: 'Email already exists' }, 409);

    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const avatar = makeAvatar(name);
    const color = makeColor();
    const status = 'pending';

    const result = await db.query<UserRow>(
      `INSERT INTO users (id, name, email, password, phone, role, dept, status, avatar, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, email, role, dept, phone, status, avatar, color, created_at`,
      [id, name, email, hashed, phone, role, dept, status, avatar, color]
    );

    return json({ ok: true, user: result.rows[0] }, 201);
  } catch (error) {
    console.error('[register] error', error instanceof Error ? error.stack : error);
    return json({ error: 'Server error' }, 500);
  }
}

async function handlePendingUsers(request: NextRequest) {
  if (request.method === 'OPTIONS') return withCors204();
  if (request.method !== 'GET') return methodNotAllowed();

  try {
    const authUser = await getAuthUser(request);
    if (!authUser) return json({ error: 'Unauthorized' }, 401);
    if (authUser.role !== 'admin') return json({ error: 'Forbidden' }, 403);

    await db.init();
    const result = await db.query<UserRow>(
      `SELECT id, name, email, role, dept, phone, status, avatar, color, created_at
       FROM users
       WHERE status = 'pending'
       ORDER BY created_at ASC`
    );

    return json({ ok: true, users: result.rows }, 200);
  } catch (error) {
    console.error('[pending-users] error', error instanceof Error ? error.stack : error);
    return json({ error: 'Server error' }, 500);
  }
}

async function handleApproveUser(request: NextRequest) {
  if (request.method === 'OPTIONS') return withCors204();
  if (request.method !== 'POST') return methodNotAllowed();

  try {
    const authUser = await getAuthUser(request);
    if (!authUser) return json({ error: 'Unauthorized' }, 401);
    if (authUser.role !== 'admin') return json({ error: 'Forbidden' }, 403);

    const body = (await request.json().catch(() => null)) || {};
    const id = String(body.id || '');
    const action = String(body.action || '');

    if (!id) return json({ error: 'Missing id' }, 400);

    await db.init();
    const newStatus = action === 'reject' ? 'rejected' : 'active';
    const result = await db.query<UserRow>(
      'UPDATE users SET status = $1 WHERE id = $2 RETURNING id, name, email, role, dept, phone, status, avatar, color, created_at',
      [newStatus, id]
    );

    if (result.rowCount === 0) return json({ error: 'User not found' }, 404);
    return json({ ok: true, user: result.rows[0] }, 200);
  } catch (error) {
    console.error('[approve-user] error', error instanceof Error ? error.stack : error);
    return json({ error: 'Server error' }, 500);
  }
}

async function handleImportUser(request: NextRequest) {
  if (request.method === 'OPTIONS') return withCors204();
  if (request.method !== 'POST') return methodNotAllowed();

  try {
    const authUser = await getAuthUser(request);
    if (!authUser) return json({ error: 'Unauthorized' }, 401);
    if (authUser.role !== 'admin') return json({ error: 'Forbidden' }, 403);

    const body = (await request.json().catch(() => null)) || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    let password = String(body.password || '');
    const phone = String(body.phone || '');
    const role = String(body.role || 'executive');
    const dept = String(body.dept || '');
    const status = String(body.status || 'pending');
    const avatar = String(body.avatar || makeAvatar(name));
    const color = String(body.color || makeColor());

    if (!name || !email) return json({ error: 'Missing required fields' }, 400);
    if (!allowedRoles.has(role)) return json({ error: 'Invalid role' }, 400);
    if (!allowedStatuses.has(status)) return json({ error: 'Invalid status' }, 400);

    await db.init();
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if ((existing.rowCount ?? 0) > 0) return json({ error: 'Email already exists' }, 409);

    if (!password) password = `${Math.random().toString(36).slice(2, 10)}A1!`;
    const hashed = await bcrypt.hash(password, 10);
    const id = String(body.id || uuidv4());

    const result = await db.query<UserRow>(
      `INSERT INTO users (id, name, email, password, phone, role, dept, status, avatar, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, email, role, dept, phone, status, avatar, color, created_at`,
      [id, name, email, hashed, phone, role, dept, status, avatar, color]
    );

    return json({ ok: true, user: result.rows[0] }, 201);
  } catch (error) {
    console.error('[import-user] error', error instanceof Error ? error.stack : error);
    return json({ error: 'Server error' }, 500);
  }
}

async function handleGenerateToken(request: NextRequest) {
  if (request.method === 'OPTIONS') return withCors204();
  if (request.method !== 'POST') return methodNotAllowed();

  try {
    const authUser = await getAuthUser(request);
    if (!authUser) return json({ error: 'Unauthorized' }, 401);
    if (authUser.role !== 'admin') return json({ error: 'Forbidden' }, 403);

    const body = (await request.json().catch(() => null)) || {};
    const userId = String(body.userId || '');
    const expiresIn = String(body.expiresIn || '7d');
    const targetId = userId || authUser.id;

    await db.init();
    const result = await db.query<UserRow>(
      'SELECT id, name, email, role, dept, phone, status, avatar, color, created_at FROM users WHERE id = $1',
      [targetId]
    );

    if (result.rowCount === 0) return json({ error: 'User not found' }, 404);

    const user = result.rows[0];
    if (user.status !== 'active' && user.id !== authUser.id) {
      return json({ error: 'Cannot issue token for non-active user' }, 400);
    }

    const token = issueToken(user, expiresIn);

    return json({ ok: true, token, expiresIn, user }, 200);
  } catch (error) {
    console.error('[generate-token] error', error instanceof Error ? error.stack : error);
    return json({ error: 'Server error' }, 500);
  }
}

async function handleEnvCheck(request: NextRequest) {
  if (request.method === 'OPTIONS') return withCors204();
  if (request.method !== 'GET') return methodNotAllowed();

  const info: Record<string, unknown> = {
    databaseUrlPresent: !!process.env.DATABASE_URL,
    jwtSecretPresent: !!process.env.JWT_SECRET,
    dbSslEnv: process.env.DB_SSL || null,
    dbSslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED || null,
    pgSslMode: process.env.PGSSLMODE || null,
  };

  if (process.env.DATABASE_URL) {
    try {
      await db.init();
      await db.query('SELECT 1');
      info.dbConnected = true;
    } catch (error) {
      info.dbConnected = false;
      info.dbError = String(error instanceof Error ? error.message : error);
    }
  }

  return json({ ok: true, info }, 200);
}

export async function handleLegacyApi(request: NextRequest, path: string[]) {
  const endpoint = path[0] || '';

  switch (endpoint) {
    case 'login':
      return handleLogin(request);
    case 'register':
      return handleRegister(request);
    case 'pending-users':
      return handlePendingUsers(request);
    case 'approve-user':
      return handleApproveUser(request);
    case 'import-user':
      return handleImportUser(request);
    case 'generate-token':
      return handleGenerateToken(request);
    case 'env-check':
      return handleEnvCheck(request);
    default:
      return json({ error: 'Not found' }, 404);
  }
}
