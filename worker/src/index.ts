import { createClient, type Client } from '@libsql/client/web';

type Env = {
  ADMIN_PASSWORD?: string;
  ADMIN_TOKEN_SECRET?: string;
  ADMIN_TOKEN_TTL?: string;
  FRONTEND_ORIGIN?: string;
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
  })();

  return schemaReady;
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
      const expected = String(env.ADMIN_PASSWORD || '').trim();
      if (!expected) {
        return json(request, env, { error: 'Admin password not configured' }, { status: 500 });
      }

      if (!password || password !== expected) {
        return json(request, env, { error: 'Invalid password' }, { status: 401 });
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
      return json(request, env, { success: false, result: { skipped: true, reason: 'not_supported_on_worker' } });
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
