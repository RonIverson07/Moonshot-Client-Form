import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 5174);

const POSTGRES_URL = String(
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DATABASE_URL || ''
).trim();

const DB_PATH = (() => {
  const raw = process.env.SQLITE_DB_PATH || process.env.DB_PATH;
  if (raw) return path.isAbsolute(raw) ? raw : path.resolve(raw);
  if (process.env.DATA_DIR) return path.join(process.env.DATA_DIR, 'moonshot.sqlite');
  return path.join(__dirname, 'moonshot.sqlite');
})();

let _sqliteDb;
let _pgPool;

const { Pool } = pg;

const dbMode = () => (POSTGRES_URL ? 'postgres' : 'sqlite');

const toPgSql = (sql) => {
  let i = 0;
  return String(sql).replace(/\?/g, () => `$${++i}`);
};

const dbExec = async (sql) => {
  if (dbMode() === 'postgres') {
    await _pgPool.query(String(sql));
    return;
  }
  _sqliteDb.exec(sql);
};

const dbGet = async (sql, args = []) => {
  if (dbMode() === 'postgres') {
    const res = await _pgPool.query({ text: toPgSql(sql), values: args });
    return res.rows?.[0];
  }
  const stmt = _sqliteDb.prepare(sql);
  return stmt.get(...args);
};

const dbAll = async (sql, args = []) => {
  if (dbMode() === 'postgres') {
    const res = await _pgPool.query({ text: toPgSql(sql), values: args });
    return res.rows || [];
  }
  const stmt = _sqliteDb.prepare(sql);
  return stmt.all(...args);
};

const dbRun = async (sql, args = []) => {
  if (dbMode() === 'postgres') {
    const res = await _pgPool.query({ text: toPgSql(sql), values: args });
    return { changes: Number(res.rowCount || 0) };
  }
  const stmt = _sqliteDb.prepare(sql);
  const info = stmt.run(...args);
  return { changes: Number(info?.changes || 0) };
};

const initDb = async () => {
  if (dbMode() === 'postgres') {
    _pgPool = new Pool({
      connectionString: POSTGRES_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    });
    await _pgPool.query('SELECT 1');
  } else {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    } catch (e) {
      console.warn('[server] Failed to ensure DB directory exists:', e);
    }
    _sqliteDb = new DatabaseSync(DB_PATH);
    _sqliteDb.exec('PRAGMA journal_mode = WAL;');
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      submittedAt TEXT NOT NULL,
      data TEXT NOT NULL
    );
  `);

  await dbExec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      username TEXT PRIMARY KEY,
      passwordHash TEXT NOT NULL
    );
  `);

  await dbExec(`
    CREATE TABLE IF NOT EXISTS sessions (
      tokenHash TEXT PRIMARY KEY,
      expiresAt BIGINT NOT NULL
    );
  `);

  await dbExec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      supportEmail TEXT NOT NULL,
      notificationEmail TEXT NOT NULL,
      isEnabled INTEGER NOT NULL,
      smtpHost TEXT NOT NULL,
      smtpPort TEXT NOT NULL,
      smtpUser TEXT NOT NULL,
      smtpPass TEXT NOT NULL,
      useSSL INTEGER NOT NULL
    );
  `);

  await dbExec(`
    CREATE INDEX IF NOT EXISTS idx_submissions_submittedAt
    ON submissions(submittedAt);
  `);

  await dbExec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt
    ON sessions(expiresAt);
  `);
};

const ensureDefaults = async () => {
  const admin = await dbGet('SELECT username FROM admin_users WHERE username = ?', ['admin']);
  if (!admin) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    await dbRun('INSERT INTO admin_users (username, passwordHash) VALUES (?, ?)', ['admin', passwordHash]);
  }

  const s = await dbGet('SELECT id FROM settings WHERE id = 1');
  if (!s) {
    await dbRun(
      'INSERT INTO settings (id, supportEmail, notificationEmail, isEnabled, smtpHost, smtpPort, smtpUser, smtpPass, useSSL) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['it-support@moonshot.digital', '', 0, '', '465', '', '', 1]
    );
  }
};

const app = express();
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

const DIST_DIR = path.resolve(__dirname, '..', 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

const SESSION_COOKIE = 'moonshot_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const sessionTokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createSession = async () => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sessionTokenHash(token);
  const expiresAt = Date.now() + SESSION_TTL_MS;

  await dbRun('DELETE FROM sessions WHERE expiresAt < ?', [Date.now()]);
  await dbRun('INSERT INTO sessions (tokenHash, expiresAt) VALUES (?, ?)', [tokenHash, expiresAt]);

  return { token, expiresAt };
};

const isAuthenticated = async (req) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== 'string') return false;
  const tokenHash = sessionTokenHash(token);
  const row = await dbGet('SELECT expiresAt FROM sessions WHERE tokenHash = ?', [tokenHash]);
  if (!row) return false;
  const exp = Number(row.expiresAt);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return true;
};

const requireAuth = async (req, res, next) => {
  try {
    if (!(await isAuthenticated(req))) return res.status(401).json({ error: 'Unauthorized' });
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Auth check failed' });
  }
};

const trimString = (v) => (typeof v === 'string' ? v.trim() : v);

const sanitizeHost = (v) =>
  String(v || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9.-]/g, '');

const settingsSchema = z.object({
  supportEmail: z.preprocess(trimString, z.string().email()),
  notificationEmail: z.preprocess(trimString, z.string().email().or(z.literal(''))),
  isEnabled: z.boolean(),
  smtpHost: z.preprocess(trimString, z.string()),
  smtpPort: z.preprocess(trimString, z.string()),
  smtpUser: z.preprocess(trimString, z.string()),
  smtpPass: z.preprocess(trimString, z.string()),
  useSSL: z.boolean(),
});

const ALLOWED_EMAIL_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com']);
const restrictedEmail = z
  .string()
  .email()
  .refine(v => {
    const at = v.lastIndexOf('@');
    if (at === -1) return false;
    const domain = v.slice(at + 1).toLowerCase();
    return ALLOWED_EMAIL_DOMAINS.has(domain);
  }, 'Email domain must be gmail.com, yahoo.com, or Microsoft mail (outlook/hotmail/live)');

let _pdfBrowser;
const getPdfBrowser = async () => {
  if (_pdfBrowser) return _pdfBrowser;
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    return null;
  }
  _pdfBrowser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  return _pdfBrowser;
};

const formatPdfValue = (v) => {
  const s = String(v ?? '').trim();
  return s ? s : '—';
};

const escapeHtml = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildStrategyBriefHtml = (submission, { businessName, supportEmail }) => {
  const createdAt = submission?.submittedAt ? new Date(submission.submittedAt) : new Date();
  const featureList = Array.isArray(submission?.requestedFeatures)
    ? submission.requestedFeatures.join(', ')
    : '';

  const hasValue = (v) => {
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    return String(v).trim().length > 0;
  };

  const valueHtml = (value, { uppercase = false } = {}) => {
    if (!hasValue(value)) {
      return `<span class="placeholder ${uppercase ? 'uppercase' : ''}">Unreported Intelligence</span>`;
    }
    const v = escapeHtml(String(value));
    return uppercase ? `<span class="uppercase">${v}</span>` : v;
  };

  const box = (label, value, opts = {}) => {
    const large = !!opts.large;
    const upper = !large;
    return `
      <div class="data-box ${large ? 'data-box-large' : ''}">
        <div class="data-label">${escapeHtml(String(label))}</div>
        <div class="data-value ${large ? 'data-value-large' : 'data-value-compact'}">${valueHtml(value, { uppercase: upper })}</div>
      </div>`;
  };

  const section = (title, innerHtml) => `
    <div class="section">
      <div class="section-head">
        <div class="section-title">${escapeHtml(String(title))}</div>
        <div class="section-line"></div>
      </div>
      <div class="section-body">${innerHtml}</div>
    </div>`;

  const chips3 = (items) => `
    <div class="chips-3">
      ${items
        .map(
          (it) => `
        <div class="chip">
          <div class="chip-label">${escapeHtml(String(it.label))}</div>
          <div class="chip-value">${valueHtml(it.value, { uppercase: true })}</div>
        </div>`
        )
        .join('')}
    </div>`;

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Strategy Brief</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
      <style>
        :root{
          --bg:#ffffff;
          --page-bg:#f1f5f9;
          --ink:#0f172a;
          --muted:#64748b;
          --border-slate-300:#cbd5e1;
          --border-slate-200:#e2e8f0;
          --border-slate-100:#f1f5f9;
          --brand-green:#14C653;
          --brand-navy:#152237;
        }
        *{box-sizing:border-box;}
        html,body{margin:0;padding:0;background:var(--page-bg); color:var(--ink);}
        body{font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;}
        .page{width: 794px; margin: 0 auto; padding: 0;}
        .card{background:#ffffff; border:2px solid var(--border-slate-300); border-radius: 40px; padding: 80px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.10), 0 10px 10px -5px rgba(0,0,0,0.04); display:flex; flex-direction:column; gap: 80px;}
        .header{display:flex; align-items:flex-start; justify-content:space-between; padding-bottom: 64px; border-bottom: 4px solid #0f172a;}
        .badge{display:inline-block; background:var(--brand-green); color:white; padding:4px 16px; border-radius: 4px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.30em;}
        .title{margin:24px 0 0 0; font-size: 60px; line-height: 1; font-weight: 900; text-transform: uppercase; letter-spacing: -0.05em; color: var(--brand-navy);}
        .subtitle{margin:24px 0 0 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.10em; color: var(--muted);}
        .logo-wrap{display:flex; justify-content:flex-end; align-items:flex-start;}
        .logo{height: 48px; width:auto; object-fit:contain;}
        .grid-2{display:grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-top: 0;}
        .stack{margin-top: 0; display:flex; flex-direction:column; gap: 80px;}

        .section{min-width:0;}
        .section-head{display:flex; align-items:center; gap:16px;}
        .section-title{font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.40em; color: var(--brand-green);}
        .section-line{flex:1; height:2px; background:#e2e8f0;}
        .section-body{margin-top: 32px; display:flex; flex-direction:column; gap: 40px;}

        .data-box{min-width:0;}
        .data-label{font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.20em; color: #64748b; margin-bottom: 12px;}
        .data-value{color: var(--brand-navy);}
        .data-value-compact{font-size: 20px; font-weight: 900; letter-spacing: -0.025em; line-height: 1.625; white-space: pre-wrap;}
        .data-box-large{background: #f8fafc; padding: 32px; border-radius: 24px; border:2px solid var(--border-slate-200);}
        .data-value-large{font-size: 16px; font-weight: 700; line-height: 1.625; white-space: pre-wrap;}
        .placeholder{color:#94a3b8; font-style: italic; font-weight: 700;}
        .uppercase{text-transform: uppercase;}

        .chips-3{display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-bottom: 40px;}
        .chip{background:#f8fafc; border:2px solid var(--border-slate-100); border-radius: 24px; padding: 24px;}
        .chip-label{font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.10em; color: #94a3b8; display:block; margin-bottom: 8px;}
        .chip-value{font-size: 16px; font-weight: 900; color: var(--brand-navy);}

        .footer{margin-top: 0; padding-top: 80px; border-top: 2px solid var(--border-slate-100); display:flex; justify-content:space-between; align-items:center; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.40em; color: #94a3b8;}
        .footer-right{color: var(--brand-green);}

        @page{ size: A4; margin: 14mm; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="card">
          <div class="header">
            <div>
              <div class="badge">Comprehensive Strategy Brief</div>
              <h1 class="title">${escapeHtml(formatPdfValue(submission?.companyName))}</h1>
              <div class="subtitle">Analysis generated on ${escapeHtml(createdAt.toLocaleString())}</div>
            </div>
            <div class="logo-wrap">
              <img class="logo" src="https://moonshotdigital.com.ph/logo.svg" alt="Moonshot Digital" />
            </div>
          </div>

          <div class="grid-2">
            ${section(
              'Project Foundation',
              [
                box('Project Title', submission?.projectTitle),
                box('Project Type', submission?.projectType),
                box('Current Digital Footprint', submission?.currentWebsite),
                box('Asset Readiness', submission?.provideAssets),
              ].join('')
            )}
            ${section(
              'Contact Intel',
              [
                box('Lead Strategist', submission?.contactPerson),
                box('Official Email', submission?.email),
                box('Direct Line', submission?.phoneNumber),
                box('Base Location', submission?.companyLocation),
              ].join('')
            )}
          </div>

          <div class="stack">
            ${section(
              'Narrative Analysis',
              [
                box('Primary Motivation', submission?.projectExcitement, { large: true }),
                box('Company Background', submission?.companyDescription, { large: true }),
                box('The Problem We are Solving', submission?.reasonForNewSite, { large: true }),
                box('Internal Stakeholders', submission?.mainContactAuthority, { large: true }),
              ].join('')
            )}

            ${section(
              'Aesthetic Identity',
              [
                chips3([
                  { label: 'Existing Logo', value: submission?.hasLogo },
                  { label: 'Logo Design Needed', value: submission?.designLogoForYou || 'N/A' },
                  { label: 'Marketing Roadmap', value: submission?.hasMarketingRoadmap },
                ]),
                box('Visitor Emotional Goal', submission?.emotionalGoal, { large: true }),
                box('Color Palette & Mood', submission?.colorPreferences, { large: true }),
                box('Industry Benchmarks (Inspiration)', submission?.inspirationLinks, { large: true }),
              ].join('')
            )}

            ${section(
              'Commercial Strategy',
              [
                box('Ideal Customer Persona', submission?.targetMarket, { large: true }),
                box('Conversion Milestones', submission?.visitorActions, { large: true }),
                box('Unique Value Proposition', submission?.uniqueSellingPoint, { large: true }),
                box('Functional Requirements', featureList || 'Standard Build', { large: true }),
                box('SEO Performance Keywords', submission?.seoKeywords, { large: true }),
              ].join('')
            )}

            ${section(
              'Timeline & Logistics',
              [
                box('Budget Capacity & Hard Deadline', submission?.budgetDeadline, { large: true }),
                box('2-Year Growth Projection', submission?.longTermProjection, { large: true }),
                box('Referral & Loyalty Strategy', submission?.referralPlan, { large: true }),
              ].join('')
            )}
          </div>

          <div class="footer">
            <div>© ${escapeHtml(String(new Date().getFullYear()))} ${escapeHtml(String(businessName || '').trim() || 'Moonshot Digital')} Inc.</div>
            <div class="footer-right">Proprietary Strategic Intel</div>
          </div>
        </div>
      </div>
    </body>
  </html>`;
};

const renderPdfBufferFromHtml = async (html) => {
  const browser = await getPdfBrowser();
  if (!browser) throw new Error('PDF generation unavailable: playwright is not installed');
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'screen' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
    });
    return pdf;
  } finally {
    await page.close().catch(() => {});
  }
};

const emailSchema = z
  .object({
    notificationEmail: z.string().email().optional(),

    companyName: z.string().min(1),
    contactPerson: z.string().min(1),
    email: restrictedEmail,
    phoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Phone number must be international format like +639171234567'),
    projectType: z.string().min(1),
    budgetDeadline: z.string().min(1),

    projectTitle: z.string().optional(),
    companyLocation: z.string().optional(),
    currentWebsite: z.string().optional(),
  })
  .passthrough();

const sendEmailWithCurrentSettings = async (payload) => {
  const row = await dbGet(
    'SELECT supportEmail, notificationEmail, isEnabled, smtpHost, smtpPort, smtpUser, smtpPass, useSSL FROM settings WHERE id = 1'
  );

  if (!row) return { skipped: true, reason: 'settings_missing' };
  if (!row.isEnabled) return { skipped: true, reason: 'disabled' };
  const to = String(payload.notificationEmail || row.notificationEmail || '').trim();
  if (!to) return { skipped: true, reason: 'missing_destination_email' };
  const smtpHost = sanitizeHost(row.smtpHost);
  const smtpPort = String(row.smtpPort || '').trim();
  const smtpUser = String(row.smtpUser || '').trim();
  const smtpPass = String(row.smtpPass || '').trim();
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) return { skipped: true, reason: 'smtp_not_configured' };

  const portNum = Number(smtpPort);
  const secure = !!row.useSSL;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number.isFinite(portNum) ? portNum : 465,
    secure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const subject = `New Lead: ${payload.companyName} (${payload.projectType})`;

  const safe = {
    companyName: escapeHtml(payload.companyName),
    contactPerson: escapeHtml(payload.contactPerson),
    email: escapeHtml(payload.email),
    phoneNumber: escapeHtml(payload.phoneNumber),
    projectType: escapeHtml(payload.projectType),
    budgetDeadline: escapeHtml(payload.budgetDeadline),
    projectTitle: escapeHtml(payload.projectTitle || ''),
    companyLocation: escapeHtml(payload.companyLocation || ''),
    currentWebsite: escapeHtml(payload.currentWebsite || ''),
  };

  const preheader = `New lead from ${payload.companyName} — ${payload.projectType}`;
  const emailHref = `mailto:${encodeURIComponent(String(payload.email || '').trim())}`;
  const phoneHref = `tel:${encodeURIComponent(String(payload.phoneNumber || '').trim())}`;
  const websiteHref = String(payload.currentWebsite || '').trim();
  const websiteLink = websiteHref ? (websiteHref.startsWith('http') ? websiteHref : `https://${websiteHref}`) : '';
  const websiteDisplay = websiteLink ? escapeHtml(websiteHref) : '';

  const rowHtml = (label, valueHtml) => `
    <tr>
      <td style="padding:10px 12px; border-top:1px solid #eef2f7; color:#475569; font-size:13px; width:160px; vertical-align:top;">${label}</td>
      <td style="padding:10px 12px; border-top:1px solid #eef2f7; color:#0f172a; font-size:14px;">${valueHtml}</td>
    </tr>`;

  const html = `
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f5f7fb; margin:0; padding:0; width:100%;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px; width:100%;">
          <tr>
            <td style="padding:0 0 12px 0;">
              <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#0f172a; font-size:14px;">
                <div style="font-weight:700; font-size:16px; letter-spacing:0.2px;">Moonshot</div>
                <div style="color:#64748b; font-size:12px; margin-top:2px;">Client Form Notification</div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff; border:1px solid #e7edf6; border-radius:14px; overflow:hidden;">
              <div style="padding:18px 18px 14px 18px; border-bottom:1px solid #eef2f7; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
                <div style="color:#0f172a; font-weight:800; font-size:18px; line-height:1.2;">New lead received</div>
                <div style="color:#64748b; font-size:13px; margin-top:6px;">${safe.companyName} • ${safe.projectType} • ${safe.budgetDeadline}</div>
              </div>

              <div style="padding:14px 18px 18px 18px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
                <div style="display:flex; gap:10px; flex-wrap:wrap; margin:0 0 12px 0;">
                  <a href="${emailHref}" style="display:inline-block; background:#0ea5e9; color:#ffffff; text-decoration:none; padding:10px 12px; border-radius:10px; font-size:13px; font-weight:700;">Email lead</a>
                  <a href="${phoneHref}" style="display:inline-block; background:#0f172a; color:#ffffff; text-decoration:none; padding:10px 12px; border-radius:10px; font-size:13px; font-weight:700;">Call lead</a>
                  ${websiteLink ? `<a href="${escapeHtml(websiteLink)}" style="display:inline-block; background:#ffffff; color:#0f172a; text-decoration:none; padding:10px 12px; border-radius:10px; font-size:13px; font-weight:700; border:1px solid #e7edf6;">Visit website</a>` : ''}
                </div>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #eef2f7; border-radius:12px; overflow:hidden;">
                  ${rowHtml('Contact person', `<div style="font-weight:700;">${safe.contactPerson}</div><div style=\"color:#475569; font-size:13px; margin-top:2px;\">${safe.companyName}</div>`)}
                  ${rowHtml('Email', `<a href=\"${emailHref}\" style=\"color:#2563eb; text-decoration:none;\">${safe.email}</a>`)}
                  ${rowHtml('Phone', `<a href=\"${phoneHref}\" style=\"color:#2563eb; text-decoration:none;\">${safe.phoneNumber}</a>`)}
                  ${rowHtml('Project type', `${safe.projectType}`)}
                  ${rowHtml('Budget / deadline', `${safe.budgetDeadline}`)}
                  ${payload.projectTitle ? rowHtml('Project title', `${safe.projectTitle}`) : ''}
                  ${payload.companyLocation ? rowHtml('Location', `${safe.companyLocation}`) : ''}
                  ${websiteLink ? rowHtml('Website', `<a href=\"${escapeHtml(websiteLink)}\" style=\"color:#2563eb; text-decoration:none;\">${websiteDisplay}</a>`) : ''}
                </table>

                <div style="color:#94a3b8; font-size:12px; margin-top:12px; line-height:1.4;">
                  This message was generated by your Moonshot Client Form. Replying to this email will reply to the lead.
                </div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 6px 0 6px; text-align:center; color:#94a3b8; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-size:12px;">
              Support: <a href="mailto:${escapeHtml(String(row.supportEmail || '').trim())}" style="color:#64748b; text-decoration:none;">${escapeHtml(String(row.supportEmail || '').trim())}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

  const text = [
    `Company: ${payload.companyName}`,
    `Contact: ${payload.contactPerson}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phoneNumber}`,
    `Project Type: ${payload.projectType}`,
    `Budget/Deadline: ${payload.budgetDeadline}`,
    payload.projectTitle ? `Project Title: ${payload.projectTitle}` : null,
    payload.companyLocation ? `Location: ${payload.companyLocation}` : null,
    payload.currentWebsite ? `Website: ${payload.currentWebsite}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const pdfOnly = String(process.env.EMAIL_PDF_ONLY || 'true').toLowerCase() !== 'false';
  const shouldAttachPdf =
    pdfOnly || String(process.env.EMAIL_ATTACH_PDF || 'true').toLowerCase() !== 'false';
  let pdfAttachment;
  if (shouldAttachPdf) {
    try {
      const reportHtml = buildStrategyBriefHtml(payload, {
        businessName: process.env.BUSINESS_NAME || 'Moonshot Digital',
        supportEmail: String(row.supportEmail || '').trim(),
      });
      const pdfBuffer = await renderPdfBufferFromHtml(reportHtml);
      const safeName = String(payload.companyName || 'Lead')
        .trim()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
      pdfAttachment = {
        filename: `Strategy-Brief-${safeName || 'Lead'}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      };
    } catch (e) {
      console.error('[email] Failed to generate PDF attachment:', e);
    }
  }

  if (pdfOnly && !pdfAttachment) {
    throw new Error(
      'PDF-only email is enabled, but the PDF could not be generated. Install Playwright + Chromium (npm install, then npx playwright install chromium).'
    );
  }

  const mail = {
    from: `Moonshot Client Form <${row.smtpUser}>`,
    to,
    replyTo: String(payload.email || '').trim() || undefined,
    subject,
    attachments: pdfAttachment ? [pdfAttachment] : undefined,
  };

  if (pdfOnly) {
    mail.text = ' ';
  } else {
    mail.text = text;
    mail.html = html;
  }

  await transporter.sendMail(mail);

  return { success: true, to };
};

app.get('/api/admin/me', (req, res) => {
  isAuthenticated(req)
    .then((authenticated) => res.json({ authenticated }))
    .catch((e) => {
      console.error(e);
      res.status(500).json({ error: 'Auth check failed' });
    });
});

app.post('/api/admin/login', async (req, res) => {
  const schema = z.object({ password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { password } = parsed.data;
  const row = await dbGet('SELECT passwordHash FROM admin_users WHERE username = ?', ['admin']);
  if (!row || !bcrypt.compareSync(password, row.passwordHash)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const { token, expiresAt } = await createSession();
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(expiresAt),
    path: '/',
  });

  res.json({ success: true });
});

app.post('/api/admin/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token && typeof token === 'string') {
    const tokenHash = sessionTokenHash(token);
    await dbRun('DELETE FROM sessions WHERE tokenHash = ?', [tokenHash]);
  }

  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ success: true });
});

app.post('/api/admin/password', requireAuth, async (req, res) => {
  const schema = z.object({ password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const passwordHash = bcrypt.hashSync(parsed.data.password, 10);
  await dbRun('UPDATE admin_users SET passwordHash = ? WHERE username = ?', [passwordHash, 'admin']);
  res.json({ success: true });
});

app.get('/api/settings/public', async (req, res) => {
  const row = await dbGet('SELECT supportEmail FROM settings WHERE id = 1');
  res.json({ supportEmail: row?.supportEmail || 'it-support@moonshot.digital' });
});

app.get('/api/settings', requireAuth, async (req, res) => {
  const row = await dbGet(
    'SELECT supportEmail, notificationEmail, isEnabled, smtpHost, smtpPort, smtpUser, smtpPass, useSSL FROM settings WHERE id = 1'
  );

  if (!row) return res.status(500).json({ error: 'Settings missing' });

  res.json({
    supportEmail: row.supportEmail,
    notificationEmail: row.notificationEmail,
    isEnabled: !!row.isEnabled,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpUser: row.smtpUser,
    smtpPass: row.smtpPass,
    useSSL: !!row.useSSL,
  });
});

app.put('/api/settings', requireAuth, async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const s = parsed.data;
  await dbRun(
    'UPDATE settings SET supportEmail = ?, notificationEmail = ?, isEnabled = ?, smtpHost = ?, smtpPort = ?, smtpUser = ?, smtpPass = ?, useSSL = ? WHERE id = 1',
    [
      s.supportEmail,
      s.notificationEmail,
      s.isEnabled ? 1 : 0,
      s.smtpHost,
      s.smtpPort,
      s.smtpUser,
      s.smtpPass,
      s.useSSL ? 1 : 0,
    ]
  );

  res.json({ success: true });
});

app.post('/api/send-email', requireAuth, async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  try {
    const result = await sendEmailWithCurrentSettings(parsed.data);
    res.json({ success: !!result?.success, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: 'Email failed',
      details: {
        message: err?.message,
        code: err?.code,
        response: err?.response,
        responseCode: err?.responseCode,
        command: err?.command,
      },
    });
  }
});

app.get('/api/submissions', requireAuth, async (req, res) => {
  try {
    const rows = await dbAll('SELECT id, submittedAt, data FROM submissions ORDER BY submittedAt DESC');

    const submissions = rows.map(r => {
      const parsed = JSON.parse(r.data);
      return {
        ...parsed,
        id: r.id,
        submittedAt: r.submittedAt,
      };
    });

    res.json({ submissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load submissions' });
  }
});

const submissionSchema = z
  .object({
    id: z.string().min(1),
    submittedAt: z.string().min(1),

    companyName: z.string().min(1),
    companyLocation: z.string().min(1),
    contactPerson: z.string().min(1),
    email: restrictedEmail,
    phoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Phone number must be international format like +639171234567'),

    projectTitle: z.string().min(1),
    projectType: z.string().min(1),
    provideAssets: z.string().min(1),
    currentWebsite: z.string().url().optional().or(z.literal('')),

    projectExcitement: z.string().min(10).max(500),
    companyDescription: z.string().min(10).max(500),
    reasonForNewSite: z.string().min(10).max(500),
    mainContactAuthority: z.string().min(10).max(500),

    hasLogo: z.string().min(1),
    emotionalGoal: z.string().min(10).max(500),
    colorPreferences: z.string().min(10).max(500),
    inspirationLinks: z.string().min(10).max(500),

    targetMarket: z.string().min(10).max(500),
    visitorActions: z.string().min(10).max(500),
    uniqueSellingPoint: z.string().min(10).max(500),
    seoKeywords: z.string().min(10).max(500),

    budgetDeadline: z.string().min(10).max(500),
    longTermProjection: z.string().min(10).max(500),
    referralPlan: z.string().min(10).max(500),
    hasMarketingRoadmap: z.string().min(1),

    requestedFeatures: z.array(z.string().min(1)).optional(),
  })
  .passthrough();

app.post('/api/submissions', async (req, res) => {
  try {
    const parsed = submissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const submission = parsed.data;
    const { id, submittedAt } = submission;

    await dbRun('INSERT INTO submissions (id, submittedAt, data) VALUES (?, ?, ?)', [
      id,
      submittedAt,
      JSON.stringify(submission),
    ]);

    let emailResult = { skipped: true, reason: 'not_attempted' };
    try {
      emailResult = await sendEmailWithCurrentSettings(submission);
    } catch (e) {
      console.error(e);
      emailResult = {
        success: false,
        error: 'Email failed',
        details: {
          message: e?.message,
          code: e?.code,
          response: e?.response,
          responseCode: e?.responseCode,
          command: e?.command,
        },
      };
    }

    res.status(201).json({ submission, emailResult });
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Submission with this id already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

app.delete('/api/submissions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const info = await dbRun('DELETE FROM submissions WHERE id = ?', [id]);
    res.json({ success: true, deleted: info.changes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

if (fs.existsSync(DIST_DIR)) {
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

const startServer = async () => {
  await initDb();
  await ensureDefaults();

  app.listen(PORT, () => {
    console.log(`[server] API running on http://localhost:${PORT}`);
    console.log(`[server] DB mode: ${dbMode()}`);
    if (dbMode() === 'postgres') {
      console.log('[server] Postgres DB: connected');
    } else {
      console.log(`[server] SQLite DB: ${DB_PATH}`);
    }
  });
};

startServer().catch((e) => {
  console.error('[server] Failed to start:', e);
  process.exit(1);
});
