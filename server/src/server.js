import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import nodemailer from 'nodemailer';
import pg from 'pg';

const { Pool } = pg;

const PORT = Number(process.env.PORT || 8787);
const DATABASE_URL = process.env.DATABASE_URL || '';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const RESET_TOKEN_MINUTES = Number(process.env.RESET_TOKEN_MINUTES || 30);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,null')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
);

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!PUBLIC_BASE_URL) throw new Error('PUBLIC_BASE_URL is required');

const pool = new Pool({ connectionString: DATABASE_URL });

const smtp = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || (origin === 'null' && allowedOrigins.has('null'))) {
      callback(null, true);
      return;
    }
    callback(new Error('허용되지 않은 요청입니다.'));
  },
}));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isStrongPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone || undefined,
    shopName: row.shop_name || '',
    shopType: row.shop_type || '',
    plan: row.plan || 'trial',
    trialEndsAt: new Date(row.trial_ends_at).toISOString(),
    isOnboarded: Boolean(row.is_onboarded),
    role: row.role || 'staff',
    branchId: row.branch_id || undefined,
    branchName: row.branch_name || undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      name text NOT NULL,
      phone text,
      shop_name text NOT NULL DEFAULT '',
      shop_type text NOT NULL DEFAULT '',
      plan text NOT NULL DEFAULT 'trial',
      trial_ends_at timestamptz NOT NULL,
      is_onboarded boolean NOT NULL DEFAULT false,
      role text NOT NULL DEFAULT 'admin',
      branch_id text,
      branch_name text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      requested_ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS password_reset_expiry_idx ON password_reset_tokens(expires_at);
  `);
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await pool.query(
    'INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [crypto.randomUUID(), userId, tokenHash(token), expiresAt],
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

async function requireSession(req, res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { rows } = await pool.query(`
      SELECT u.*, s.id AS session_id
      FROM auth_sessions s
      JOIN auth_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
      LIMIT 1
    `, [tokenHash(token)]);
    if (!rows[0]) return res.status(401).json({ error: '로그인 정보가 만료되었습니다.' });

    req.authUser = rows[0];
    req.authSessionId = rows[0].session_id;
    pool.query('UPDATE auth_sessions SET last_used_at = now() WHERE id = $1', [req.authSessionId]).catch(() => {});
    next();
  } catch (error) {
    next(error);
  }
}

async function sendPasswordResetMail(email, name, token) {
  const resetUrl = `${PUBLIC_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await smtp.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: '[트로이아르케 CRM] 비밀번호 재설정',
    text: `${name || '고객'}님, 아래 링크에서 비밀번호를 재설정해주세요.\n\n${resetUrl}\n\n이 링크는 ${RESET_TOKEN_MINUTES}분 동안 한 번만 사용할 수 있습니다. 본인이 요청하지 않았다면 이 메일을 무시해주세요.`,
    html: `
      <div style="font-family:Arial,'Noto Sans KR',sans-serif;max-width:560px;margin:auto;color:#172033">
        <h2 style="color:#1a3a8f">트로이아르케 CRM 비밀번호 재설정</h2>
        <p>${escapeHtml(name || '고객')}님, 아래 버튼을 눌러 새 비밀번호를 설정해주세요.</p>
        <p style="margin:28px 0"><a href="${resetUrl}" style="background:#1a3a8f;color:white;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block">새 비밀번호 설정</a></p>
        <p style="font-size:13px;color:#667085">이 링크는 ${RESET_TOKEN_MINUTES}분 동안 한 번만 사용할 수 있습니다. 본인이 요청하지 않았다면 이 메일을 무시해주세요.</p>
      </div>`,
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

function renderResetPage(token, message = '', success = false) {
  const safeToken = escapeHtml(token);
  const messageBlock = message
    ? `<div class="message ${success ? 'success' : 'error'}">${escapeHtml(message)}</div>`
    : '';
  return `<!doctype html>
  <html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>트로이아르케 CRM 비밀번호 재설정</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f7fb;font-family:Arial,'Noto Sans KR',sans-serif;color:#172033}.wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{width:100%;max-width:420px;background:white;border-radius:22px;padding:32px;box-shadow:0 18px 45px rgba(20,42,90,.12)}h1{font-size:24px;margin:0 0 8px}.sub{color:#667085;font-size:14px;line-height:1.6;margin-bottom:24px}label{font-size:13px;font-weight:700;display:block;margin:14px 0 7px}input{width:100%;padding:13px 14px;border:1px solid #d8deea;border-radius:11px;font-size:16px}button{width:100%;margin-top:22px;padding:14px;border:0;border-radius:11px;background:#1a3a8f;color:white;font-size:15px;font-weight:700;cursor:pointer}.message{padding:12px 14px;border-radius:10px;margin:18px 0;font-size:14px;line-height:1.5}.error{background:#fff1f1;color:#b42318}.success{background:#ecfdf3;color:#027a48}
  </style></head><body><main class="wrap"><section class="card"><h1>${success ? '변경 완료' : '새 비밀번호 설정'}</h1><p class="sub">${success ? 'CRM 앱으로 돌아가 새 비밀번호로 로그인해주세요.' : '8자 이상의 새 비밀번호를 입력해주세요.'}</p>${messageBlock}${success ? '' : `<form method="post" action="/reset-password"><input type="hidden" name="token" value="${safeToken}"><label for="password">새 비밀번호</label><input id="password" type="password" name="password" minlength="8" maxlength="128" required autocomplete="new-password"><label for="confirmPassword">새 비밀번호 확인</label><input id="confirmPassword" type="password" name="confirmPassword" minlength="8" maxlength="128" required autocomplete="new-password"><button type="submit">비밀번호 변경하기</button></form>`}</section></main></body></html>`;
}

async function consumeResetToken(token, password) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT * FROM password_reset_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      FOR UPDATE
    `, [tokenHash(token)]);
    const reset = rows[0];
    if (!reset) throw new Error('RESET_TOKEN_INVALID');

    const passwordHash = await bcrypt.hash(password, 12);
    await client.query('UPDATE auth_users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, reset.user_id]);
    await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [reset.id]);
    await client.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [reset.user_id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

app.get('/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'troiareuke-auth' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/signup', authLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').trim();
    if (!isEmail(email) || !name || !isStrongPassword(password)) {
      return res.status(400).json({ error: '이메일, 이름, 8자 이상의 비밀번호를 확인해주세요.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();
    const trialEndsAt = new Date(Date.now() + 14 * 86400000);
    const { rows } = await pool.query(`
      INSERT INTO auth_users (id, email, password_hash, name, phone, trial_ends_at, role)
      VALUES ($1, $2, $3, $4, $5, $6, 'admin')
      RETURNING *
    `, [userId, email, passwordHash, name, phone || null, trialEndsAt]);
    const session = await createSession(userId);
    res.status(201).json({ user: publicUser(rows[0]), ...session });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
    next(error);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const { rows } = await pool.query('SELECT * FROM auth_users WHERE email = $1 LIMIT 1', [email]);
    const user = rows[0];
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });

    const session = await createSession(user.id);
    res.json({ user: publicUser(user), ...session });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireSession, (req, res) => {
  res.json({ user: publicUser(req.authUser) });
});

app.patch('/api/auth/profile', requireSession, async (req, res, next) => {
  try {
    const shopName = String(req.body.shopName || '').trim();
    const shopType = String(req.body.shopType || '').trim();
    if (!shopName || !shopType) return res.status(400).json({ error: '매장 이름과 유형을 입력해주세요.' });
    const branchId = req.authUser.branch_id || crypto.randomUUID();
    const { rows } = await pool.query(`
      UPDATE auth_users
      SET shop_name = $1, shop_type = $2, branch_name = $1, branch_id = $3,
          is_onboarded = true, updated_at = now()
      WHERE id = $4
      RETURNING *
    `, [shopName, shopType, branchId, req.authUser.id]);
    res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', requireSession, async (req, res, next) => {
  try {
    await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [req.authSessionId]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/forgot-password', resetLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isEmail(email)) return res.status(400).json({ error: '이메일 형식을 확인해주세요.' });

    const { rows } = await pool.query('SELECT id, email, name FROM auth_users WHERE email = $1 LIMIT 1', [email]);
    const user = rows[0];
    if (user) {
      const token = crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60000);
      await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      await pool.query(
        'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, requested_ip) VALUES ($1, $2, $3, $4, $5)',
        [crypto.randomUUID(), user.id, tokenHash(token), expiresAt, req.ip],
      );
      try {
        await sendPasswordResetMail(user.email, user.name, token);
      } catch (mailError) {
        console.error('password reset mail failed', mailError?.message || mailError);
      }
    }

    res.json({ message: '가입된 이메일이면 비밀번호 재설정 안내를 보내드렸습니다.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/reset-password', resetLimiter, async (req, res, next) => {
  try {
    const token = String(req.body.token || '');
    const password = req.body.password;
    if (!token || !isStrongPassword(password)) return res.status(400).json({ error: '재설정 링크와 8자 이상의 비밀번호를 확인해주세요.' });
    await consumeResetToken(token, password);
    res.json({ message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.' });
  } catch (error) {
    if (error?.message === 'RESET_TOKEN_INVALID') return res.status(400).json({ error: '재설정 링크가 만료되었거나 이미 사용되었습니다.' });
    next(error);
  }
});

app.get('/reset-password', (req, res) => {
  const token = String(req.query.token || '');
  res.type('html').send(renderResetPage(token, token ? '' : '재설정 링크가 올바르지 않습니다.'));
});

app.post('/reset-password', resetLimiter, async (req, res, next) => {
  const token = String(req.body.token || '');
  const password = req.body.password;
  const confirmPassword = req.body.confirmPassword;
  if (!isStrongPassword(password)) return res.status(400).type('html').send(renderResetPage(token, '비밀번호는 8자 이상이어야 합니다.'));
  if (password !== confirmPassword) return res.status(400).type('html').send(renderResetPage(token, '비밀번호 확인이 일치하지 않습니다.'));
  try {
    await consumeResetToken(token, password);
    res.type('html').send(renderResetPage('', '비밀번호가 안전하게 변경되었습니다.', true));
  } catch (error) {
    if (error?.message === 'RESET_TOKEN_INVALID') return res.status(400).type('html').send(renderResetPage('', '재설정 링크가 만료되었거나 이미 사용되었습니다.'));
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: '서버 처리 중 문제가 발생했습니다.' });
});

initializeDatabase()
  .then(async () => {
    if (process.env.SMTP_HOST) await smtp.verify();
    app.listen(PORT, '0.0.0.0', () => console.log(`Troiareuke auth server listening on ${PORT}`));
  })
  .catch(error => {
    console.error('auth server startup failed', error);
    process.exit(1);
  });
