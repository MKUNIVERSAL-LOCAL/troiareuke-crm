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
// 상용 배포 기본값: 관리자 발급 계정만 허용 (공개 가입 차단)
const ALLOW_PUBLIC_SIGNUP = String(process.env.ALLOW_PUBLIC_SIGNUP || 'false').toLowerCase() === 'true';
const BOOTSTRAP_ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const BOOTSTRAP_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
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
// 데이터 동기화(고객 엑셀 대량 업로드 등)는 32kb를 초과할 수 있다
app.use(express.json({ limit: '2mb' }));
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
    shopPhone: row.shop_phone || undefined,
    shopAddress: row.shop_address || undefined,
    isActive: row.is_active !== false,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// 데이터 스코프: 온보딩 전에는 user.id, 온보딩 후에는 branch_id.
// 클라이언트 getShopId()의 `branchId || user.id` 규칙과 반드시 일치해야 한다.
function branchScopeOf(user) {
  if (user.role === 'superadmin') return 'superadmin';
  return user.branch_id || user.id;
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

    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS shop_phone text;
    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS shop_address text;
    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

    CREATE TABLE IF NOT EXISTS crm_records (
      branch_id text NOT NULL,
      collection text NOT NULL,
      id text NOT NULL,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (branch_id, collection, id)
    );

    CREATE INDEX IF NOT EXISTS crm_records_collection_idx ON crm_records(collection, updated_at);
  `);
}

// 최초 기동 시 슈퍼어드민 1개 계정을 env로 생성한다 (이미 있으면 건너뜀).
async function bootstrapSuperadmin() {
  if (!BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) return;
  if (!isEmail(BOOTSTRAP_ADMIN_EMAIL) || !isStrongPassword(BOOTSTRAP_ADMIN_PASSWORD)) {
    console.warn('ADMIN_EMAIL/ADMIN_PASSWORD 형식이 올바르지 않아 슈퍼어드민 생성을 건너뜁니다.');
    return;
  }
  const { rows } = await pool.query('SELECT id FROM auth_users WHERE email = $1 LIMIT 1', [BOOTSTRAP_ADMIN_EMAIL]);
  if (rows[0]) return;
  const passwordHash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
  await pool.query(`
    INSERT INTO auth_users (id, email, password_hash, name, trial_ends_at, role, plan, is_onboarded)
    VALUES ($1, $2, $3, '총괄 관리자', now() + interval '3650 days', 'superadmin', 'enterprise', true)
  `, [crypto.randomUUID(), BOOTSTRAP_ADMIN_EMAIL, passwordHash]);
  console.log(`슈퍼어드민 계정 생성됨: ${BOOTSTRAP_ADMIN_EMAIL}`);
}

// 만료 세션·재설정 토큰 정리 (기동 시 + 매일)
async function cleanupExpired() {
  try {
    await pool.query("DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 day'");
    await pool.query("DELETE FROM auth_sessions WHERE expires_at < now() - interval '7 days'");
  } catch (error) {
    console.error('expired cleanup failed', error?.message || error);
  }
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
        AND u.is_active
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
    if (!ALLOW_PUBLIC_SIGNUP) {
      return res.status(403).json({ error: '이 서비스는 관리자가 발급한 계정으로만 이용할 수 있습니다. 관리자에게 계정 발급을 요청해주세요.' });
    }
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
    if (user.is_active === false) return res.status(403).json({ error: '비활성화된 계정입니다. 관리자에게 문의해주세요.' });

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
    const shopPhone = String(req.body.shopPhone || '').trim();
    const shopAddress = String(req.body.shopAddress || '').trim();
    if (!shopName || !shopType) return res.status(400).json({ error: '매장 이름과 유형을 입력해주세요.' });
    // 온보딩 전 user.id 스코프로 쌓인 데이터가 유실되지 않도록 branch_id는 user.id로 고정
    const branchId = req.authUser.branch_id || req.authUser.id;
    const { rows } = await pool.query(`
      UPDATE auth_users
      SET shop_name = $1, shop_type = $2, shop_phone = $3, shop_address = $4,
          branch_name = $1, branch_id = $5, is_onboarded = true, updated_at = now()
      WHERE id = $6
      RETURNING *
    `, [shopName, shopType, shopPhone || null, shopAddress || null, branchId, req.authUser.id]);
    res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    next(error);
  }
});

// ── 관리자 전용: 계정 발급·관리 ─────────────────────────────────
function requireSuperadmin(req, res, next) {
  if (req.authUser?.role !== 'superadmin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
  next();
}

app.get('/api/admin/users', requireSession, requireSuperadmin, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM auth_users ORDER BY created_at DESC');
    res.json({ users: rows.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/users', requireSession, requireSuperadmin, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const name = String(req.body.name || '').trim() || email.split('@')[0];
    const role = ['admin', 'staff'].includes(req.body.role) ? req.body.role : 'admin';
    const plan = ['trial', 'starter', 'pro', 'enterprise'].includes(req.body.plan) ? req.body.plan : 'trial';
    const branchName = String(req.body.branchName || '').trim();
    const shopType = String(req.body.shopType || '').trim();
    const requestedBranchId = String(req.body.branchId || '').trim();
    if (!isEmail(email)) return res.status(400).json({ error: '이메일 형식을 확인해주세요.' });

    // 비밀번호를 직접 지정하지 않으면 임시 비밀번호를 발급해 1회 응답으로만 알려준다.
    const providedPassword = req.body.password;
    if (providedPassword !== undefined && !isStrongPassword(providedPassword)) {
      return res.status(400).json({ error: '비밀번호는 8자 이상 128자 이하여야 합니다.' });
    }
    const temporaryPassword = providedPassword || crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const userId = crypto.randomUUID();
    // 같은 지점에 직원 계정을 추가할 땐 branchId를 넘겨 기존 지점에 합류시킨다.
    const branchId = requestedBranchId || userId;
    const isOnboarded = Boolean(branchName);
    const { rows } = await pool.query(`
      INSERT INTO auth_users (id, email, password_hash, name, role, plan,
        shop_name, shop_type, branch_id, branch_name, is_onboarded, trial_ends_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now() + interval '14 days')
      RETURNING *
    `, [userId, email, passwordHash, name, role, plan,
        branchName, shopType, branchId, branchName || null, isOnboarded]);

    res.status(201).json({
      user: publicUser(rows[0]),
      ...(providedPassword ? {} : { temporaryPassword }),
    });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: '이미 등록된 이메일입니다.' });
    next(error);
  }
});

app.patch('/api/admin/users/:id', requireSession, requireSuperadmin, async (req, res, next) => {
  try {
    const targetId = String(req.params.id);
    const fields = [];
    const values = [];
    const push = (column, value) => { values.push(value); fields.push(`${column} = $${values.length}`); };

    if (req.body.role !== undefined) {
      if (!['admin', 'staff'].includes(req.body.role)) return res.status(400).json({ error: '역할은 admin 또는 staff만 지정할 수 있습니다.' });
      push('role', req.body.role);
    }
    if (req.body.plan !== undefined) {
      if (!['trial', 'starter', 'pro', 'enterprise'].includes(req.body.plan)) return res.status(400).json({ error: '요금제 값을 확인해주세요.' });
      push('plan', req.body.plan);
    }
    if (req.body.isActive !== undefined) {
      if (targetId === req.authUser.id) return res.status(400).json({ error: '본인 계정은 비활성화할 수 없습니다.' });
      push('is_active', Boolean(req.body.isActive));
    }
    if (req.body.password !== undefined) {
      if (!isStrongPassword(req.body.password)) return res.status(400).json({ error: '비밀번호는 8자 이상 128자 이하여야 합니다.' });
      push('password_hash', await bcrypt.hash(req.body.password, 12));
    }
    if (fields.length === 0) return res.status(400).json({ error: '변경할 항목이 없습니다.' });

    values.push(targetId);
    const { rows } = await pool.query(
      `UPDATE auth_users SET ${fields.join(', ')}, updated_at = now() WHERE id = $${values.length} AND role <> 'superadmin' RETURNING *`,
      values,
    );
    if (!rows[0]) return res.status(404).json({ error: '대상 계정을 찾을 수 없습니다.' });

    // 비활성화 또는 비밀번호 변경 시 기존 세션 즉시 종료
    if (req.body.isActive === false || req.body.password !== undefined) {
      await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [targetId]);
    }
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

// ── CRM 데이터 저장 API (사용 데이터가 NAS에 쌓이는 지점) ────────
// 클라이언트 store.ts가 Supabase 대신 이 API로 동기화한다. 행 형식은
// 클라이언트 toDb*()가 만드는 snake_case 행 그대로를 JSONB로 저장한다.
const DATA_COLLECTIONS = new Set([
  'customers', 'programs', 'customer_programs', 'treatment_logs',
  'products', 'product_sales', 'payments', 'staff', 'services',
  'reservations', 'shop_settings', 'message_templates', 'message_history',
]);

function requireCollection(req, res, next) {
  if (!DATA_COLLECTIONS.has(req.params.collection)) {
    return res.status(404).json({ error: '지원하지 않는 데이터 종류입니다.' });
  }
  next();
}

app.get('/api/data/:collection', requireSession, requireCollection, async (req, res, next) => {
  try {
    const scope = branchScopeOf(req.authUser);
    const { rows } = scope === 'superadmin'
      ? await pool.query('SELECT data FROM crm_records WHERE collection = $1 ORDER BY updated_at', [req.params.collection])
      : await pool.query('SELECT data FROM crm_records WHERE branch_id = $1 AND collection = $2 ORDER BY updated_at', [scope, req.params.collection]);
    res.json({ rows: rows.map(r => r.data) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/data/:collection', requireSession, requireCollection, async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ error: '저장할 행이 없습니다.' });
    if (rows.length > 2000) return res.status(400).json({ error: '한 번에 2,000행까지만 저장할 수 있습니다.' });
    const scope = branchScopeOf(req.authUser);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        const id = String(row?.id || '').trim();
        if (!id) continue;
        // 세션 스코프를 강제해 다른 지점 데이터를 덮어쓰지 못하게 한다.
        // (슈퍼어드민은 행에 담긴 branch_id를 존중해 지점 대신 저장 가능)
        const branchId = scope === 'superadmin' ? String(row.branch_id || 'superadmin') : scope;
        await client.query(`
          INSERT INTO crm_records (branch_id, collection, id, data, updated_at)
          VALUES ($1, $2, $3, $4, now())
          ON CONFLICT (branch_id, collection, id)
          DO UPDATE SET data = EXCLUDED.data, updated_at = now()
        `, [branchId, req.params.collection, id, row]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    res.json({ saved: rows.length });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/data/:collection/:id', requireSession, requireCollection, async (req, res, next) => {
  try {
    const updates = req.body.updates;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ error: '변경 내용을 확인해주세요.' });
    }
    const scope = branchScopeOf(req.authUser);
    const { rowCount } = scope === 'superadmin'
      ? await pool.query(
          'UPDATE crm_records SET data = data || $1::jsonb, updated_at = now() WHERE collection = $2 AND id = $3',
          [updates, req.params.collection, req.params.id])
      : await pool.query(
          'UPDATE crm_records SET data = data || $1::jsonb, updated_at = now() WHERE branch_id = $2 AND collection = $3 AND id = $4',
          [updates, scope, req.params.collection, req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: '대상 데이터를 찾을 수 없습니다.' });
    res.json({ updated: rowCount });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/data/:collection/:id', requireSession, requireCollection, async (req, res, next) => {
  try {
    const scope = branchScopeOf(req.authUser);
    scope === 'superadmin'
      ? await pool.query('DELETE FROM crm_records WHERE collection = $1 AND id = $2', [req.params.collection, req.params.id])
      : await pool.query('DELETE FROM crm_records WHERE branch_id = $1 AND collection = $2 AND id = $3', [scope, req.params.collection, req.params.id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: '서버 처리 중 문제가 발생했습니다.' });
});

initializeDatabase()
  .then(async () => {
    await bootstrapSuperadmin();
    await cleanupExpired();
    setInterval(cleanupExpired, 24 * 60 * 60 * 1000).unref();
    if (process.env.SMTP_HOST) await smtp.verify();
    app.listen(PORT, '0.0.0.0', () => console.log(`Troiareuke auth server listening on ${PORT}`));
  })
  .catch(error => {
    console.error('auth server startup failed', error);
    process.exit(1);
  });
