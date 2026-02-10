import { createClient, type Client } from '@libsql/client/web';

type Env = {
  ADMIN_PASSWORD?: string;
  ADMIN_TOKEN_SECRET?: string;
  ADMIN_TOKEN_TTL?: string;
  EMAIL_RELAY_URL?: string;
  EMAIL_RELAY_SECRET?: string;
  FRONTEND_ORIGIN?: string;
  PASSWORD_RESET_SECRET?: string;
  PASSWORD_RESET_TTL_MINUTES?: string;
  SUPPORT_EMAIL?: string;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
};

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

const getClient = (env: Env) => {
  if (client) return client;

  const url = String(env.TURSO_DATABASE_URL || '').trim();
  const authToken = String(env.TURSO_AUTH_TOKEN || '').trim();

  if (!url) throw new Error('Missing TURSO_DATABASE_URL');
  if (!authToken) throw new Error('Missing TURSO_AUTH_TOKEN');

  client = createClient({ url, authToken });
  return client;
};

const ensureSchema = (env: Env) => {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = getClient(env);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        submittedAt TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        supportEmail TEXT,
        notificationEmail TEXT,
        isEnabled INTEGER,
        smtpHost TEXT,
        smtpPort TEXT,
        smtpUser TEXT,
        smtpPass TEXT,
        useSSL INTEGER
      );
    `);

    await db.execute({
      sql: `
        INSERT OR IGNORE INTO settings (
          id, supportEmail, notificationEmail, isEnabled, smtpHost, smtpPort, smtpUser, smtpPass, useSSL
        ) VALUES (1, ?, '', 0, '', '465', '', '', 1);
      `,
      args: [String(env.SUPPORT_EMAIL || 'it-support@moonshot.digital').trim()],
    });

    await db.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        username TEXT PRIMARY KEY,
        passwordHash TEXT NOT NULL,
        salt TEXT NOT NULL,
        iterations INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        tokenHash TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        usedAt TEXT
      );
    `);

    const columnExists = async (table: string, column: string) => {
      const res = await db.execute({ sql: `PRAGMA table_info(${table})`, args: [] });
      const rows: any[] = Array.isArray((res as any)?.rows) ? (res as any).rows : [];
      return rows.some(r => String((r as any)?.name || '') === column);
    };

    const addColumnIfMissing = async (table: string, column: string, typeSql: string) => {
      try {
        const exists = await columnExists(table, column);
        if (exists) return;
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
      } catch {
        // ignore
      }
    };

    await addColumnIfMissing('admin_users', 'salt', "TEXT NOT NULL DEFAULT ''");
    await addColumnIfMissing('admin_users', 'iterations', 'INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing('admin_users', 'createdAt', "TEXT NOT NULL DEFAULT ''");
    await addColumnIfMissing('admin_users', 'updatedAt', "TEXT NOT NULL DEFAULT ''");
    await addColumnIfMissing('password_reset_tokens', 'usedAt', 'TEXT');
  })();

  return schemaReady;
};

const base64UrlFromBytes = (bytes: Uint8Array) => base64UrlEncode(bytes);

const utf8 = (s: string) => new TextEncoder().encode(s);

const hmacSha256B64Url = async (secret: string, message: string) => {
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, utf8(message));
  return base64UrlFromBytes(new Uint8Array(sig));
};

const derivePasswordHash = async (password: string, saltB64Url: string, iterations: number) => {
  const salt = base64UrlDecode(saltB64Url);
  const keyMaterial = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    256
  );
  return base64UrlFromBytes(new Uint8Array(bits));
};

const verifyPassword = async (password: string, record: any) => {
  const salt = String(record?.salt || '');
  const iterations = Number(record?.iterations || 0);
  const expected = String(record?.passwordHash || '');
  if (!salt || !expected || !Number.isFinite(iterations) || iterations < 1) return false;
  const actual = await derivePasswordHash(password, salt, iterations);
  return actual === expected;
};

const corsHeaders = (request: Request, env: Env) => {
  const reqOrigin = request.headers.get('Origin') || '';
  const allowedRaw = String(env.FRONTEND_ORIGIN || '').trim();
  const allowed = allowedRaw.replace(/\/+$/, '');
  const reqNorm = reqOrigin.replace(/\/+$/, '');
  const allowOrigin = allowed && reqNorm === allowed ? reqOrigin : allowed || reqOrigin || '*';

  const allowCredentials = allowOrigin !== '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    ...(allowCredentials ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

const json = (request: Request, env: Env, body: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  const cors = corsHeaders(request, env);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
};

const base64UrlEncode = (input: Uint8Array) => {
  let str = '';
  for (let i = 0; i < input.length; i++) str += String.fromCharCode(input[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecode = (input: string) => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

const signToken = async (env: Env, payload: Record<string, any>) => {
  const secret = String(env.ADMIN_TOKEN_SECRET || '').trim();
  if (!secret) throw new Error('Missing ADMIN_TOKEN_SECRET');

  const encoder = new TextEncoder();
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(encoder.encode(payloadJson));

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(sigBuf));
  return `${payloadB64}.${sigB64}`;
};

const verifyToken = async (env: Env, token: string) => {
  const secret = String(env.ADMIN_TOKEN_SECRET || '').trim();
  if (!secret) throw new Error('Missing ADMIN_TOKEN_SECRET');

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const expectedSigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const expectedSig = new Uint8Array(expectedSigBuf);
  const actualSig = base64UrlDecode(sigB64);
  if (!timingSafeEqual(expectedSig, actualSig)) return null;

  try {
    const payloadBytes = base64UrlDecode(payloadB64);
    const payloadJson = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadJson);

    const exp = Number(payload?.exp || 0);
    const now = Math.floor(Date.now() / 1000);
    if (!exp || exp < now) return null;
    return payload;
  } catch {
    return null;
  }
};

const getBearerToken = (request: Request) => {
  const header = request.headers.get('Authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
};

const requireAuth = async (request: Request, env: Env) => {
  const token = getBearerToken(request);
  if (!token) return false;
  const payload = await verifyToken(env, token);
  return !!payload;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json(request, env, { ok: true });
    }

    if (url.pathname === '/api/admin/me' && request.method === 'GET') {
      try {
        const authenticated = await requireAuth(request, env);
        return json(request, env, { authenticated });
      } catch (e: any) {
        return json(request, env, { error: 'Auth check failed', details: String(e?.message || e) }, { status: 500 });
      }
    }

    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json(request, env, { error: 'Invalid JSON' }, { status: 400 });
      }

      const password = typeof body?.password === 'string' ? body.password : '';
      if (!password) return json(request, env, { error: 'Invalid password' }, { status: 401 });

      let hasDbUser = false;
      let dbAuthed = false;
      try {
        await ensureSchema(env);
        const db = getClient(env);
        const res = await db.execute({ sql: 'SELECT passwordHash, salt, iterations FROM admin_users WHERE username = ?', args: ['admin'] });
        const row: any = res?.rows?.[0];
        if (row) hasDbUser = true;
        if (row) dbAuthed = await verifyPassword(password, row);
      } catch {
        // ignore
      }

      if (hasDbUser) {
        if (!dbAuthed) return json(request, env, { error: 'Invalid password' }, { status: 401 });
      } else {
        const expected = String(env.ADMIN_PASSWORD || '').trim();
        if (!expected) {
          return json(request, env, { error: 'Admin password not configured' }, { status: 500 });
        }
        if (password !== expected) {
          return json(request, env, { error: 'Invalid password' }, { status: 401 });
        }
      }

      const ttl = Number(env.ADMIN_TOKEN_TTL || 60 * 60 * 24 * 7);
      const now = Math.floor(Date.now() / 1000);
      const token = await signToken(env, { sub: 'admin', iat: now, exp: now + ttl });
      return json(request, env, { success: true, token });
    }

    if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
      return json(request, env, { success: true });
    }

    if (url.pathname === '/api/admin/password' && request.method === 'POST') {
      return json(request, env, { error: 'Not implemented' }, { status: 501 });
    }

    if (url.pathname === '/api/admin/password-reset/request' && request.method === 'POST') {
      try {
        const relayUrl = String(env.EMAIL_RELAY_URL || '').trim();
        const relaySecret = String(env.EMAIL_RELAY_SECRET || '').trim();
        const resetSecret = String(env.PASSWORD_RESET_SECRET || '').trim();
        const ttlMinutes = Number(env.PASSWORD_RESET_TTL_MINUTES || 15);
        if (!relayUrl || !relaySecret || !resetSecret) {
          return json(request, env, { success: true, sent: false }, { status: 200 });
        }

        let supportEmail = String(env.SUPPORT_EMAIL || '').trim();
        try {
          await ensureSchema(env);
          const db = getClient(env);
          const res = await db.execute('SELECT supportEmail FROM settings WHERE id = 1');
          const row: any = res?.rows?.[0];
          const fromDb = String(row?.supportEmail || '').trim();
          if (fromDb) supportEmail = fromDb;
        } catch {
          // ignore
        }
        if (!supportEmail) return json(request, env, { success: true, sent: false }, { status: 200 });

        const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
        const token = base64UrlFromBytes(tokenBytes);
        const tokenHash = await hmacSha256B64Url(resetSecret, token);

        const now = new Date();
        const expires = new Date(now.getTime() + (Number.isFinite(ttlMinutes) ? ttlMinutes : 15) * 60 * 1000);
        const createdAt = now.toISOString();
        const expiresAt = expires.toISOString();

        try {
          await ensureSchema(env);
          const db = getClient(env);
          await db.execute({
            sql: 'INSERT OR REPLACE INTO password_reset_tokens (tokenHash, username, expiresAt, createdAt, usedAt) VALUES (?, ?, ?, ?, NULL)',
            args: [tokenHash, 'admin', expiresAt, createdAt],
          });
        } catch (e: any) {
          return json(request, env, { success: true, sent: false, error: 'Failed to store reset token', details: String(e?.message || e) }, { status: 200 });
        }

        const origin = String(env.FRONTEND_ORIGIN || '').replace(/\/+$/, '');
        const resetUrl = `${origin}/#admin-reset?token=${encodeURIComponent(token)}`;

        const payload = {
          notificationEmail: supportEmail,
          subject: 'Moonshot Command Center — Reset Password',
          body:
            'A password reset was requested for Moonshot Command Center.\n\n' +
            `Reset Link: ${resetUrl}\n\n` +
            `This link expires in ${Number.isFinite(ttlMinutes) ? ttlMinutes : 15} minutes.\n\n` +
            `Support Contact: ${supportEmail}`,
        };

        const res = await fetch(relayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Relay-Secret': relaySecret,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return json(request, env, { success: true, sent: false, error: 'Email relay failed', details: text }, { status: 200 });
        }

        return json(request, env, { success: true, sent: true }, { status: 200 });
      } catch (e: any) {
        return json(request, env, { success: true, sent: false, error: String(e?.message || e) }, { status: 200 });
      }
    }

    if (url.pathname === '/api/admin/password-reset/confirm' && request.method === 'POST') {
      try {
        const resetSecret = String(env.PASSWORD_RESET_SECRET || '').trim();
        if (!resetSecret) {
          return json(request, env, { success: false, error: 'Reset not configured' }, { status: 500 });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return json(request, env, { error: 'Invalid JSON' }, { status: 400 });
        }

        const token = typeof body?.token === 'string' ? body.token.trim() : '';
        const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
        if (!token || newPassword.length < 8) {
          return json(request, env, { success: false, error: 'Invalid token or password' }, { status: 400 });
        }

        await ensureSchema(env);
        const db = getClient(env);
        const tokenHash = await hmacSha256B64Url(resetSecret, token);
        const res = await db.execute({
          sql: 'SELECT tokenHash, username, expiresAt, usedAt FROM password_reset_tokens WHERE tokenHash = ?',
          args: [tokenHash],
        });
        const row: any = res?.rows?.[0];
        if (!row) return json(request, env, { success: false, error: 'Invalid or expired token' }, { status: 400 });
        if (row.usedAt) return json(request, env, { success: false, error: 'Token already used' }, { status: 400 });

        const expiresAt = String(row.expiresAt || '');
        if (!expiresAt || Date.parse(expiresAt) < Date.now()) {
          return json(request, env, { success: false, error: 'Invalid or expired token' }, { status: 400 });
        }

        const saltBytes = crypto.getRandomValues(new Uint8Array(16));
        const salt = base64UrlFromBytes(saltBytes);
        const iterations = 100_000;
        const passwordHash = await derivePasswordHash(newPassword, salt, iterations);
        const now = new Date().toISOString();
        const username = String(row.username || 'admin');

        await db.execute({
          sql: 'INSERT OR REPLACE INTO admin_users (username, passwordHash, salt, iterations, createdAt, updatedAt) VALUES (?, ?, ?, ?, COALESCE((SELECT createdAt FROM admin_users WHERE username = ?), ?), ?)',
          args: [username, passwordHash, salt, iterations, username, now, now],
        });

        await db.execute({
          sql: 'UPDATE password_reset_tokens SET usedAt = ? WHERE tokenHash = ?',
          args: [now, tokenHash],
        });

        return json(request, env, { success: true }, { status: 200 });
      } catch (e: any) {
        return json(request, env, { success: false, error: String(e?.message || e) }, { status: 500 });
      }
    }

    if (url.pathname === '/api/admin/access-recovery' && request.method === 'POST') {
      try {
        const relayUrl = String(env.EMAIL_RELAY_URL || '').trim();
        const relaySecret = String(env.EMAIL_RELAY_SECRET || '').trim();
        if (!relayUrl || !relaySecret) {
          return json(request, env, { success: true, sent: false }, { status: 200 });
        }

        let supportEmail = String(env.SUPPORT_EMAIL || '').trim();
        try {
          await ensureSchema(env);
          const db = getClient(env);
          const res = await db.execute('SELECT supportEmail FROM settings WHERE id = 1');
          const row: any = res?.rows?.[0];
          const fromDb = String(row?.supportEmail || '').trim();
          if (fromDb) supportEmail = fromDb;
        } catch {
          // ignore
        }

        if (!supportEmail) {
          return json(request, env, { success: true, sent: false }, { status: 200 });
        }

        const payload = {
          notificationEmail: supportEmail,
          subject: 'Moonshot Command Center — Access Recovery Request',
          body:
            'An access recovery request was made for Moonshot Command Center.\n\n' +
            'If you lost access, please rotate the ADMIN_PASSWORD secret in Cloudflare Worker settings and then log in using the new password.\n\n' +
            `Support Contact: ${supportEmail}`,
        };

        const res = await fetch(relayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Relay-Secret': relaySecret,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return json(
            request,
            env,
            { success: true, sent: false, error: 'Email relay failed', details: text },
            { status: 200 }
          );
        }

        return json(request, env, { success: true, sent: true }, { status: 200 });
      } catch (e: any) {
        return json(request, env, { success: true, sent: false, error: String(e?.message || e) }, { status: 200 });
      }
    }

    if (url.pathname === '/api/settings/public' && request.method === 'GET') {
      try {
        await ensureSchema(env);
        const db = getClient(env);
        const res = await db.execute('SELECT supportEmail FROM settings WHERE id = 1');
        const row: any = res?.rows?.[0];
        return json(request, env, {
          supportEmail: String(row?.supportEmail || env.SUPPORT_EMAIL || 'it-support@moonshot.digital').trim(),
        });
      } catch {
        return json(request, env, {
          supportEmail: String(env.SUPPORT_EMAIL || 'it-support@moonshot.digital').trim(),
        });
      }
    }

    if (url.pathname === '/api/settings' && request.method === 'GET') {
      if (!(await requireAuth(request, env))) {
        return json(request, env, { error: 'Unauthorized' }, { status: 401 });
      }

      try {
        await ensureSchema(env);
        const db = getClient(env);
        const res = await db.execute(
          'SELECT supportEmail, notificationEmail, isEnabled, smtpHost, smtpPort, smtpUser, smtpPass, useSSL FROM settings WHERE id = 1'
        );
        const row: any = res?.rows?.[0];
        if (!row) return json(request, env, { error: 'Settings missing' }, { status: 500 });

        return json(request, env, {
          supportEmail: String(row.supportEmail || env.SUPPORT_EMAIL || 'it-support@moonshot.digital'),
          notificationEmail: String(row.notificationEmail || ''),
          isEnabled: !!row.isEnabled,
          smtpHost: String(row.smtpHost || ''),
          smtpPort: String(row.smtpPort || '465'),
          smtpUser: String(row.smtpUser || ''),
          smtpPass: String(row.smtpPass || ''),
          useSSL: row.useSSL !== 0,
        });
      } catch (e: any) {
        return json(
          request,
          env,
          { error: 'Failed to load settings', details: String(e?.message || e) },
          { status: 500 }
        );
      }
    }

    if (url.pathname === '/api/settings' && request.method === 'PUT') {
      if (!(await requireAuth(request, env))) {
        return json(request, env, { error: 'Unauthorized' }, { status: 401 });
      }

      let body: any;
      try {
        body = await request.json();
      } catch {
        return json(request, env, { error: 'Invalid JSON' }, { status: 400 });
      }

      const next = {
        supportEmail: typeof body?.supportEmail === 'string' ? body.supportEmail : String(env.SUPPORT_EMAIL || 'it-support@moonshot.digital'),
        notificationEmail: typeof body?.notificationEmail === 'string' ? body.notificationEmail : '',
        isEnabled: !!body?.isEnabled,
        smtpHost: typeof body?.smtpHost === 'string' ? body.smtpHost : '',
        smtpPort: typeof body?.smtpPort === 'string' ? body.smtpPort : '465',
        smtpUser: typeof body?.smtpUser === 'string' ? body.smtpUser : '',
        smtpPass: typeof body?.smtpPass === 'string' ? body.smtpPass : '',
        useSSL: body?.useSSL !== false,
      };

      try {
        await ensureSchema(env);
        const db = getClient(env);
        await db.execute({
          sql: `
            UPDATE settings
            SET supportEmail = ?, notificationEmail = ?, isEnabled = ?, smtpHost = ?, smtpPort = ?, smtpUser = ?, smtpPass = ?, useSSL = ?
            WHERE id = 1
          `,
          args: [
            String(next.supportEmail).trim(),
            String(next.notificationEmail).trim(),
            next.isEnabled ? 1 : 0,
            String(next.smtpHost).trim(),
            String(next.smtpPort).trim(),
            String(next.smtpUser).trim(),
            String(next.smtpPass),
            next.useSSL ? 1 : 0,
          ],
        });

        return json(request, env, { success: true });
      } catch (e: any) {
        return json(
          request,
          env,
          { error: 'Failed to save settings', details: String(e?.message || e) },
          { status: 500 }
        );
      }
    }

    if (url.pathname === '/api/send-email' && request.method === 'POST') {
      if (!(await requireAuth(request, env))) {
        return json(request, env, { error: 'Unauthorized' }, { status: 401 });
      }

      const relayUrl = String(env.EMAIL_RELAY_URL || '').trim();
      const relaySecret = String(env.EMAIL_RELAY_SECRET || '').trim();
      if (!relayUrl || !relaySecret) {
        return json(
          request,
          env,
          { success: false, result: { skipped: true, reason: 'email_relay_not_configured' } },
          { status: 501 }
        );
      }

      let payload: any;
      try {
        payload = await request.json();
      } catch {
        return json(request, env, { error: 'Invalid JSON' }, { status: 400 });
      }

      try {
        const res = await fetch(relayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Relay-Secret': relaySecret,
          },
          body: JSON.stringify(payload || {}),
        });

        const text = await res.text();
        let parsed: any = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = { raw: text };
        }

        if (!res.ok) {
          return json(
            request,
            env,
            { success: false, error: 'Email relay failed', details: parsed },
            { status: res.status }
          );
        }

        const relaySuccess = !!(parsed && typeof parsed === 'object' ? (parsed as any).success : false);
        return json(request, env, { success: relaySuccess, result: parsed });
      } catch (e: any) {
        return json(
          request,
          env,
          { success: false, error: 'Failed to call email relay', details: String(e?.message || e) },
          { status: 502 }
        );
      }
    }

    if (url.pathname === '/api/submissions' && request.method === 'POST') {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json(request, env, { error: 'Invalid JSON' }, { status: 400 });
      }

      const submission = {
        ...(body && typeof body === 'object' ? body : {}),
        id: typeof body?.id === 'string' && body.id ? body.id : crypto.randomUUID(),
        submittedAt:
          typeof body?.submittedAt === 'string' && body.submittedAt
            ? body.submittedAt
            : new Date().toISOString(),
      };

      try {
        await ensureSchema(env);
        const db = getClient(env);

        await db.execute({
          sql: 'INSERT INTO submissions (id, submittedAt, data) VALUES (?, ?, ?)',
          args: [submission.id, submission.submittedAt, JSON.stringify(submission)],
        });

        return json(request, env, { submission, stored: true }, { status: 201 });
      } catch (e: any) {
        const message = String(e?.message || e);
        if (message.toLowerCase().includes('unique')) {
          return json(request, env, { error: 'Submission already exists' }, { status: 409 });
        }
        return json(
          request,
          env,
          { error: 'Failed to store submission', details: message },
          { status: 500 }
        );
      }
    }

    if (url.pathname === '/api/submissions' && request.method === 'GET') {
      if (!(await requireAuth(request, env))) {
        return json(request, env, { error: 'Unauthorized' }, { status: 401 });
      }

      try {
        await ensureSchema(env);
        const db = getClient(env);
        const res = await db.execute('SELECT id, submittedAt, data FROM submissions ORDER BY submittedAt DESC');
        const submissions = (res?.rows || []).map((r: any) => {
          const parsed = JSON.parse(String(r.data || '{}'));
          return {
            ...parsed,
            id: String(r.id),
            submittedAt: String(r.submittedAt),
          };
        });
        return json(request, env, { submissions });
      } catch (e: any) {
        return json(
          request,
          env,
          { error: 'Failed to load submissions', details: String(e?.message || e) },
          { status: 500 }
        );
      }
    }

    if (url.pathname.startsWith('/api/submissions/') && request.method === 'DELETE') {
      if (!(await requireAuth(request, env))) {
        return json(request, env, { error: 'Unauthorized' }, { status: 401 });
      }

      const id = decodeURIComponent(url.pathname.slice('/api/submissions/'.length));
      if (!id) return json(request, env, { error: 'Missing id' }, { status: 400 });

      try {
        await ensureSchema(env);
        const db = getClient(env);
        await db.execute({
          sql: 'DELETE FROM submissions WHERE id = ?',
          args: [id],
        });
        return json(request, env, { success: true });
      } catch (e: any) {
        return json(
          request,
          env,
          { error: 'Failed to delete submission', details: String(e?.message || e) },
          { status: 500 }
        );
      }
    }

    return json(request, env, { error: 'Not found' }, { status: 404 });
    } catch (e: any) {
      return json(
        request,
        env,
        { error: 'Internal error', details: String(e?.message || e) },
        { status: 500 }
      );
    }
  },
};
