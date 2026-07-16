import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
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
// 역방향 프록시(DSM) 뒤에서만 1로 둔다. 8787 포트를 직접 노출하는 구성이면
// TRUST_PROXY=0으로 꺼야 X-Forwarded-For 위조로 rate limit이 우회되지 않는다.
const TRUST_PROXY = String(process.env.TRUST_PROXY ?? '1');
if (TRUST_PROXY !== '0' && TRUST_PROXY.toLowerCase() !== 'false') {
  app.set('trust proxy', Number.isNaN(Number(TRUST_PROXY)) ? TRUST_PROXY : Number(TRUST_PROXY));
}
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    // Electron 데스크톱 앱(file://)은 Chromium 버전에 따라 Origin을 'null' 또는 'file://'로 보낸다.
    // 거부 시 CORS 헤더가 빠져 앱에서 "서버에 연결할 수 없습니다"(fetch TypeError)로 보이는 함정 주의.
    if (!origin || origin === 'null' || origin === 'file://' || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('허용되지 않은 요청입니다.'));
  },
}));
// 데이터 동기화(고객 엑셀 대량 업로드)와 시술 사진(base64)은 커질 수 있다
app.use(express.json({ limit: '15mb' }));
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
    businessNumber: row.business_number || undefined,
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
    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS business_number text;
    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS business_license_image text;

    CREATE TABLE IF NOT EXISTS crm_records (
      branch_id text NOT NULL,
      collection text NOT NULL,
      id text NOT NULL,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (branch_id, collection, id)
    );

    CREATE INDEX IF NOT EXISTS crm_records_collection_idx ON crm_records(collection, updated_at);

    CREATE TABLE IF NOT EXISTS message_send_log (
      id uuid PRIMARY KEY,
      branch_id text NOT NULL,
      user_id uuid,
      type text NOT NULL,
      title text,
      content text NOT NULL,
      phone text NOT NULL,
      status text NOT NULL,
      reason text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS message_send_log_branch_idx ON message_send_log(branch_id, created_at);

    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id uuid PRIMARY KEY,
      branch_id text NOT NULL,
      user_id uuid,
      send_at timestamptz NOT NULL,
      type text NOT NULL,
      title text,
      content text NOT NULL,
      phones jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      result jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx ON scheduled_messages(status, send_at);

    CREATE TABLE IF NOT EXISTS crm_photos (
      branch_id text NOT NULL,
      entity_key text NOT NULL,
      photos jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (branch_id, entity_key)
    );

    ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS locked_at timestamptz;
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
    const name = String(req.body.name || '').trim(); // 가입 화면에서는 샵명
    const phone = String(req.body.phone || '').trim();
    if (!isEmail(email) || !name || !isStrongPassword(password)) {
      return res.status(400).json({ error: '이메일, 샵명, 8자 이상의 비밀번호를 확인해주세요.' });
    }

    // 사업자등록번호: 하이픈 유무 무관하게 받아 000-00-00000 로 정규화 (선택 필드 — 구 클라이언트 호환)
    const businessDigits = String(req.body.businessNumber || '').replace(/\D/g, '');
    if (businessDigits && businessDigits.length !== 10) {
      return res.status(400).json({ error: '사업자등록번호 10자리를 확인해주세요.' });
    }
    const businessNumber = businessDigits
      ? `${businessDigits.slice(0, 3)}-${businessDigits.slice(3, 5)}-${businessDigits.slice(5)}`
      : null;

    // 사업자등록증 사진: 이미지 data URL만, ~5MB(base64 7MB) 초과 거부
    const licenseImage = typeof req.body.businessLicenseImage === 'string' ? req.body.businessLicenseImage : '';
    if (licenseImage && (!licenseImage.startsWith('data:image/') || licenseImage.length > 7 * 1024 * 1024)) {
      return res.status(400).json({ error: '사업자등록증은 5MB 이하의 이미지 파일만 첨부할 수 있습니다.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();
    const trialEndsAt = new Date(Date.now() + 14 * 86400000);
    const { rows } = await pool.query(`
      INSERT INTO auth_users (id, email, password_hash, name, phone, shop_name, business_number, business_license_image, trial_ends_at, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'admin')
      RETURNING *
    `, [userId, email, passwordHash, name, phone || null, name, businessNumber, licenseImage || null, trialEndsAt]);
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

// 즉시 백업 (슈퍼어드민 전용) — File Station의 CRM-BACKUP에서 바로 확인 가능
app.post('/api/admin/backup', requireSession, requireSuperadmin, async (_req, res, next) => {
  try {
    if (!BACKUP_DIR) return res.status(400).json({ error: '서버에 BACKUP_DIR가 설정되지 않았습니다.' });
    const result = await runBackup();
    res.json(result);
  } catch (error) {
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

// ── 메시지 발송 파이프라인 (SMS·카카오) ──────────────────────────
// 발송사 API 키는 이 서버의 env에만 둔다. SMS_PROVIDER 미설정 시
// 어떤 메시지도 나가지 않고 pending으로 정직하게 기록·응답한다.
const MESSAGE_HOURLY_LIMIT = Number(process.env.MESSAGE_HOURLY_LIMIT || 500);
const MESSAGE_MAX_RECIPIENTS = 500;

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

// 발송사 어댑터. 'none' = 미설정(발송 안 함), 'http' = 범용 HTTP 중계
// (엔포 등 발송사 스펙이 확정되면 여기에 어댑터 하나를 추가하면 된다).
async function sendViaProvider({ type, title, content, phones }) {
  const provider = String(process.env.SMS_PROVIDER || 'none').toLowerCase();

  if (provider === 'none') {
    return {
      pending: true,
      reason: '발송사 미설정 — NAS 서버 .env의 SMS_PROVIDER를 설정하세요',
      results: phones.map(phone => ({ phone, status: 'pending', reason: '발송사 미설정' })),
    };
  }

  if (provider === 'http') {
    if (!process.env.SMS_HTTP_URL) throw new Error('SMS_HTTP_URL이 설정되지 않았습니다.');
    const response = await fetch(process.env.SMS_HTTP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SMS_HTTP_KEY ? { Authorization: `Bearer ${process.env.SMS_HTTP_KEY}` } : {}),
      },
      body: JSON.stringify({ type, title, content, phones, sender: process.env.SMS_SENDER_ID || '' }),
    });
    if (!response.ok) throw new Error(`발송사 응답 오류: ${response.status}`);
    const data = await response.json().catch(() => ({}));
    if (Array.isArray(data.results)) {
      return {
        pending: false,
        results: phones.map(phone => {
          const match = data.results.find(r => normalizePhone(r.phone) === phone);
          return { phone, status: match?.status === 'sent' ? 'sent' : 'failed', reason: match?.reason };
        }),
      };
    }
    // {sent, failed} 요약만 주는 발송사: 앞에서부터 sent건은 성공 처리
    const sentCount = Number(data.sent || 0);
    return {
      pending: false,
      results: phones.map((phone, index) => ({ phone, status: index < sentCount ? 'sent' : 'failed' })),
    };
  }

  throw new Error(`알 수 없는 SMS_PROVIDER: ${provider}`);
}

// 검증 → 시간당 한도 → 발송 → 건별 로그. HTTP 라우트와 스케줄러가 공용.
async function processSend({ authUser, type, title, content, phones }) {
  const scope = branchScopeOf(authUser);
  const normalized = [...new Set(phones.map(normalizePhone).filter(Boolean))];
  if (normalized.length === 0) {
    return { httpStatus: 400, body: { error: '유효한 수신자 전화번호가 없습니다.' } };
  }
  if (normalized.length > MESSAGE_MAX_RECIPIENTS) {
    return { httpStatus: 400, body: { error: `한 번에 ${MESSAGE_MAX_RECIPIENTS}명까지만 발송할 수 있습니다.` } };
  }

  // 시간당 발송량 상한 (오발송·재시도 폭주 방지)
  const { rows: [{ count }] } = await pool.query(
    "SELECT count(*)::int AS count FROM message_send_log WHERE branch_id = $1 AND created_at > now() - interval '1 hour'",
    [scope],
  );
  if (count + normalized.length > MESSAGE_HOURLY_LIMIT) {
    return { httpStatus: 429, body: { error: `시간당 발송 한도(${MESSAGE_HOURLY_LIMIT}건)를 초과합니다. 잠시 후 다시 시도해주세요.` } };
  }

  let outcome;
  try {
    outcome = await sendViaProvider({ type, title, content, phones: normalized });
  } catch (error) {
    outcome = {
      pending: false,
      reason: error?.message || '발송사 호출 실패',
      results: normalized.map(phone => ({ phone, status: 'failed', reason: error?.message || '발송사 호출 실패' })),
    };
  }

  for (const result of outcome.results) {
    await pool.query(
      'INSERT INTO message_send_log (id, branch_id, user_id, type, title, content, phone, status, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [crypto.randomUUID(), scope, authUser.id, type, title || null, content, result.phone, result.status, result.reason || null],
    );
  }

  const sent = outcome.results.filter(r => r.status === 'sent').length;
  const failed = outcome.results.filter(r => r.status === 'failed').length;
  return {
    httpStatus: 200,
    body: { sent, failed, pending: Boolean(outcome.pending), reason: outcome.reason, results: outcome.results },
  };
}

const messageLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

app.post('/api/messages/send', requireSession, messageLimiter, async (req, res, next) => {
  try {
    const type = String(req.body.type || 'sms');
    const title = req.body.title ? String(req.body.title) : undefined;
    const content = String(req.body.content || '').trim();
    const phones = Array.isArray(req.body.phones) ? req.body.phones : [];
    if (!content) return res.status(400).json({ error: '메시지 내용을 입력해주세요.' });
    const { httpStatus, body } = await processSend({ authUser: req.authUser, type, title, content, phones });
    res.status(httpStatus).json(body);
  } catch (error) {
    next(error);
  }
});

// ── 예약 발송 큐 ────────────────────────────────────────────────
app.post('/api/messages/schedule', requireSession, messageLimiter, async (req, res, next) => {
  try {
    const sendAt = new Date(String(req.body.sendAt || ''));
    const type = String(req.body.type || 'sms');
    const title = req.body.title ? String(req.body.title) : null;
    const content = String(req.body.content || '').trim();
    const phones = (Array.isArray(req.body.phones) ? req.body.phones : []).map(normalizePhone).filter(Boolean);
    if (Number.isNaN(sendAt.getTime())) return res.status(400).json({ error: '발송 시각을 확인해주세요.' });
    if (sendAt.getTime() < Date.now() + 60000) return res.status(400).json({ error: '발송 시각은 최소 1분 뒤여야 합니다.' });
    if (sendAt.getTime() > Date.now() + 30 * 86400000) return res.status(400).json({ error: '발송 예약은 30일 이내만 가능합니다.' });
    if (!content) return res.status(400).json({ error: '메시지 내용을 입력해주세요.' });
    if (phones.length === 0) return res.status(400).json({ error: '유효한 수신자 전화번호가 없습니다.' });
    if (phones.length > MESSAGE_MAX_RECIPIENTS) return res.status(400).json({ error: `한 번에 ${MESSAGE_MAX_RECIPIENTS}명까지만 예약할 수 있습니다.` });

    const { rows } = await pool.query(
      `INSERT INTO scheduled_messages (id, branch_id, user_id, send_at, type, title, content, phones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, send_at, status`,
      [crypto.randomUUID(), branchScopeOf(req.authUser), req.authUser.id, sendAt, type, title, content, JSON.stringify(phones)],
    );
    res.status(201).json({ scheduled: rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get('/api/messages/scheduled', requireSession, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, send_at, type, title, content, phones, status, result, created_at
       FROM scheduled_messages WHERE branch_id = $1 ORDER BY send_at DESC LIMIT 100`,
      [branchScopeOf(req.authUser)],
    );
    res.json({ scheduled: rows });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/messages/scheduled/:id', requireSession, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE scheduled_messages SET status = 'canceled' WHERE id = $1 AND branch_id = $2 AND status = 'pending'`,
      [req.params.id, branchScopeOf(req.authUser)],
    );
    if (rowCount === 0) return res.status(404).json({ error: '취소할 수 있는 예약을 찾을 수 없습니다.' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// 분 단위 디스패처: 시각이 지난 예약을 잠그고 발송한다 (다중 인스턴스 안전)
async function dispatchScheduledMessages() {
  // 크래시 복구: processing으로 잠긴 채 10분 넘게 방치된 잡은 pending으로 되돌린다
  // (재배포·정전으로 결과 UPDATE 전에 프로세스가 죽은 경우 — 영구 고착 방지)
  await pool.query(`
    UPDATE scheduled_messages SET status = 'pending', locked_at = NULL
    WHERE status = 'processing' AND locked_at < now() - interval '10 minutes'
  `).catch(e => console.error('stale processing recovery failed', e?.message || e));

  const client = await pool.connect();
  let due = [];
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      UPDATE scheduled_messages SET status = 'processing', locked_at = now()
      WHERE id IN (
        SELECT id FROM scheduled_messages
        WHERE status = 'pending' AND send_at <= now()
        ORDER BY send_at LIMIT 20
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    await client.query('COMMIT');
    due = rows;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('scheduled dispatch lock failed', error?.message || error);
  } finally {
    client.release();
  }

  for (const job of due) {
    try {
      const { rows: userRows } = await pool.query('SELECT * FROM auth_users WHERE id = $1', [job.user_id]);
      const authUser = userRows[0] || { id: job.user_id, role: 'admin', branch_id: job.branch_id };
      const { httpStatus, body } = await processSend({
        authUser: { ...authUser, branch_id: job.branch_id },
        type: job.type,
        title: job.title || undefined,
        content: job.content,
        phones: Array.isArray(job.phones) ? job.phones : [],
      });
      if (httpStatus === 429) {
        // 시간당 한도와 겹침 — 실패 처리하지 않고 5분 뒤 재시도
        await pool.query(
          `UPDATE scheduled_messages SET status = 'pending', locked_at = NULL, send_at = now() + interval '5 minutes' WHERE id = $1`,
          [job.id]);
        continue;
      }
      const status = body.error ? 'failed' : body.pending ? 'failed' : body.failed === 0 ? 'sent' : 'partial';
      await pool.query('UPDATE scheduled_messages SET result = $1, status = $2 WHERE id = $3',
        [JSON.stringify(body), status, job.id]);
    } catch (error) {
      await pool.query('UPDATE scheduled_messages SET status = $1, result = $2 WHERE id = $3',
        ['failed', JSON.stringify({ error: error?.message || '발송 처리 실패' }), job.id]);
    }
  }
}

// ── 지점(계정)별 파일 백업 → NAS CRM-BACKUP ─────────────────────
// 라이브 데이터는 PostgreSQL에 있고, 매일 BACKUP_HOUR시에 지점별 폴더로
// JSON + 시술사진(jpg)을 내보낸다. File Station에서 바로 열람 가능.
// 경로: BACKUP_DIR/<지점명_지점ID8자리>/<날짜>/<컬렉션>.json, photos/...
const BACKUP_DIR = String(process.env.BACKUP_DIR || '').trim();
const BACKUP_HOUR = Number(process.env.BACKUP_HOUR || 4);
const BACKUP_KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 14);
let backupLastRunDate = '';

function sanitizeFolderName(value) {
  return String(value || '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || 'branch';
}

async function runBackup() {
  if (!BACKUP_DIR) throw new Error('BACKUP_DIR가 설정되지 않았습니다.');
  const date = isoDate(new Date());

  const { rows: branchRows } = await pool.query(`
    SELECT DISTINCT branch_id FROM crm_records
    UNION SELECT DISTINCT branch_id FROM crm_photos
  `);
  const { rows: userRows } = await pool.query(
    'SELECT branch_id, branch_name FROM auth_users WHERE branch_id IS NOT NULL');
  const nameByBranch = new Map(userRows.map(u => [u.branch_id, u.branch_name]));

  let fileCount = 0;
  for (const { branch_id: branchId } of branchRows) {
    const folder = `${sanitizeFolderName(nameByBranch.get(branchId) || '')}_${String(branchId).slice(0, 8)}`;
    const dateDir = path.join(BACKUP_DIR, folder, date);
    await fs.mkdir(dateDir, { recursive: true });

    // 컬렉션별 JSON
    for (const collection of DATA_COLLECTIONS) {
      const { rows } = await pool.query(
        'SELECT data FROM crm_records WHERE branch_id = $1 AND collection = $2 ORDER BY updated_at',
        [branchId, collection]);
      if (rows.length === 0) continue;
      await fs.writeFile(
        path.join(dateDir, `${collection}.json`),
        JSON.stringify(rows.map(r => r.data), null, 2), 'utf8');
      fileCount += 1;
    }

    // 이 지점의 계정 목록 (비밀번호 해시 제외)
    const { rows: accounts } = await pool.query(
      'SELECT * FROM auth_users WHERE branch_id = $1', [branchId]);
    if (accounts.length > 0) {
      await fs.writeFile(path.join(dateDir, 'accounts.json'),
        JSON.stringify(accounts.map(publicUser), null, 2), 'utf8');
      fileCount += 1;
    }

    // 발송 로그 (최근 90일)
    const { rows: sendLogs } = await pool.query(
      `SELECT type, title, content, phone, status, reason, created_at FROM message_send_log
       WHERE branch_id = $1 AND created_at > now() - interval '90 days' ORDER BY created_at`, [branchId]);
    if (sendLogs.length > 0) {
      await fs.writeFile(path.join(dateDir, 'message_send_log.json'),
        JSON.stringify(sendLogs, null, 2), 'utf8');
      fileCount += 1;
    }

    // 시술 사진 → jpg 파일
    const { rows: photoRows } = await pool.query(
      'SELECT entity_key, photos FROM crm_photos WHERE branch_id = $1', [branchId]);
    for (const { entity_key: entityKey, photos } of photoRows) {
      if (!Array.isArray(photos) || photos.length === 0) continue;
      const photoDir = path.join(dateDir, 'photos', sanitizeFolderName(entityKey.replace(/:/g, '_')));
      await fs.mkdir(photoDir, { recursive: true });
      for (const photo of photos) {
        const match = /^data:image\/(\w+);base64,(.+)$/.exec(photo?.dataUrl || '');
        if (!match) continue;
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        await fs.writeFile(
          path.join(photoDir, `${sanitizeFolderName(photo.id)}.${ext}`),
          Buffer.from(match[2], 'base64'));
        fileCount += 1;
      }
    }

    // 보존 기간 지난 날짜 폴더 정리
    try {
      const cutoff = new Date(Date.now() - BACKUP_KEEP_DAYS * 86400000).toISOString().slice(0, 10);
      const entries = await fs.readdir(path.join(BACKUP_DIR, folder));
      for (const entry of entries) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(entry) && entry < cutoff) {
          await fs.rm(path.join(BACKUP_DIR, folder, entry), { recursive: true, force: true });
        }
      }
    } catch { /* 정리 실패는 백업 자체를 막지 않음 */ }
  }

  return { branches: branchRows.length, files: fileCount, date };
}

async function runDailyBackup() {
  if (!BACKUP_DIR) return;
  const now = new Date();
  const today = isoDate(now);
  if (now.getHours() !== BACKUP_HOUR || backupLastRunDate === today) return;
  backupLastRunDate = today;
  try {
    const result = await runBackup();
    console.log(`일일 백업 완료: 지점 ${result.branches}곳, 파일 ${result.files}개`);
  } catch (error) {
    console.error('일일 백업 실패:', error?.message || error);
  }
}

// ── 재방문 자동 리마인더 (클라이언트 reminderEngine.ts의 서버 포트) ──
// 앱이 꺼져 있어도 매일 REMINDER_HOUR시에 재방문 권장일이 지난 고객에게
// 자동 발송한다. REMINDER_ENABLED=true + 발송사 설정 시에만 실동작.
const REMINDER_ENABLED = String(process.env.REMINDER_ENABLED || 'false').toLowerCase() === 'true';
const REMINDER_HOUR = Number(process.env.REMINDER_HOUR || 10);
const REMINDER_CYCLE_DAYS = Number(process.env.REMINDER_CYCLE_DAYS || 28);
const REMINDER_MIN_OVERDUE = Number(process.env.REMINDER_MIN_OVERDUE || 0);
const REMINDER_COOLDOWN_DAYS = Number(process.env.REMINDER_COOLDOWN_DAYS || 7);
let reminderLastRunDate = '';

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function loadCollection(branchId, collection) {
  const { rows } = await pool.query(
    'SELECT data FROM crm_records WHERE branch_id = $1 AND collection = $2',
    [branchId, collection],
  );
  return rows.map(r => r.data);
}

// 권장 재방문일이 지난 고객 산출 (행 형식 = 클라이언트 toDb*의 snake_case)
function computeRevisitDue({ customers, treatmentLogs, reservations }) {
  const today = isoDate(new Date());
  const due = [];
  for (const customer of customers) {
    if (!customer?.id || String(customer.id).startsWith('sample_') || !customer.phone) continue;
    const hasUpcoming = reservations.some(r =>
      r.customer_id === customer.id && r.date >= today && r.status !== 'cancelled');
    if (hasUpcoming) continue;

    const logs = treatmentLogs
      .filter(t => t.customer_id === customer.id)
      .sort((a, b) => String(b.treatment_date || '').localeCompare(String(a.treatment_date || '')));
    const lastLog = logs[0];
    const lastVisit = lastLog?.treatment_date || customer.last_visit_date || null;

    let dueDate;
    if (lastLog?.next_appointment) {
      dueDate = lastLog.next_appointment;
    } else if (lastVisit) {
      const d = new Date(`${lastVisit}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + REMINDER_CYCLE_DAYS);
      dueDate = isoDate(d);
    } else {
      continue;
    }

    const overdueDays = Math.floor((new Date(today).getTime() - new Date(dueDate).getTime()) / 86400000);
    if (overdueDays < REMINDER_MIN_OVERDUE) continue;
    due.push({ customer, overdueDays });
  }
  return due.sort((a, b) => b.overdueDays - a.overdueDays);
}

async function runRevisitReminders() {
  if (!REMINDER_ENABLED) return;
  const now = new Date();
  const today = isoDate(now);
  if (now.getHours() !== REMINDER_HOUR || reminderLastRunDate === today) return;
  reminderLastRunDate = today;

  const { rows: branchRows } = await pool.query(
    "SELECT DISTINCT branch_id FROM crm_records WHERE collection = 'customers'",
  );

  for (const { branch_id: branchId } of branchRows) {
    try {
      const [customers, treatmentLogs, reservations, settingsRows] = await Promise.all([
        loadCollection(branchId, 'customers'),
        loadCollection(branchId, 'treatment_logs'),
        loadCollection(branchId, 'reservations'),
        loadCollection(branchId, 'shop_settings'),
      ]);
      const due = computeRevisitDue({ customers, treatmentLogs, reservations });
      if (due.length === 0) continue;

      // 쿨다운: 최근 N일 내 리마인더를 받은 번호는 제외 (매일 재발송 금지)
      // 쿨다운은 실제 발송(sent)만 소모한다 — 발송사 미설정(pending) 기록이
      // 쿨다운을 잡아먹으면 발송사 연동 직후 7일간 리마인더가 안 나간다
      const { rows: recent } = await pool.query(
        `SELECT DISTINCT phone FROM message_send_log
         WHERE branch_id = $1 AND type = 'revisit-reminder' AND status = 'sent'
           AND created_at > now() - ($2 || ' days')::interval`,
        [branchId, REMINDER_COOLDOWN_DAYS],
      );
      const cooled = new Set(recent.map(r => r.phone));
      const shopName = settingsRows[0]?.name || '저희 샵';

      const targets = due.filter(d => {
        const normalized = normalizePhone(d.customer.phone);
        return normalized && !cooled.has(normalized);
      }).slice(0, MESSAGE_MAX_RECIPIENTS);
      if (targets.length === 0) continue;

      // 고객명이 들어가므로 개별 발송
      for (const { customer } of targets) {
        const content =
          `[${shopName}] ${customer.name || '고객'}님, 안녕하세요 😊\n` +
          `피부 관리 주기가 다가왔어요. 그동안 관리하신 피부 컨디션을 이어가시려면 ` +
          `이번 주 방문을 추천드려요!\n예약 문의는 편하게 답장 주세요. 감사합니다.`;
        await processSend({
          authUser: { id: null, role: 'admin', branch_id: branchId },
          type: 'revisit-reminder',
          content,
          phones: [customer.phone],
        });
      }
      console.log(`재방문 리마인더: ${branchId} 지점 ${targets.length}명 처리`);
    } catch (error) {
      console.error(`재방문 리마인더 실패 (${branchId}):`, error?.message || error);
    }
  }
}

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

// ── 시술 사진 저장 (기기 간 공유 — 고객 얼굴 사진 = 민감 PII, 세션 인증 필수) ──
// 빈 배열도 행으로 저장한다(tombstone). "삭제됨"과 "원래 없음"을 구분해야
// 다른 기기의 옛 캐시가 삭제된 고객 사진을 서버에 되살리지 못한다.
app.get('/api/photos/:entityKey', requireSession, async (req, res, next) => {
  try {
    const scope = branchScopeOf(req.authUser);
    const { rows } = await pool.query(
      'SELECT photos FROM crm_photos WHERE branch_id = $1 AND entity_key = $2',
      [scope, req.params.entityKey],
    );
    res.json({ exists: rows.length > 0, photos: rows[0]?.photos || [] });
  } catch (error) {
    next(error);
  }
});

// 배치 조회: 시술기록이 수백 건일 때 왕복 1회로 (keys 최대 500)
app.post('/api/photos/batch', requireSession, async (req, res, next) => {
  try {
    const keys = Array.isArray(req.body.keys) ? req.body.keys.map(String).slice(0, 500) : [];
    if (keys.length === 0) return res.status(400).json({ error: '조회할 키가 없습니다.' });
    const scope = branchScopeOf(req.authUser);
    const { rows } = await pool.query(
      'SELECT entity_key, photos FROM crm_photos WHERE branch_id = $1 AND entity_key = ANY($2)',
      [scope, keys],
    );
    const entries = {};
    for (const row of rows) entries[row.entity_key] = row.photos;
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

app.put('/api/photos/:entityKey', requireSession, async (req, res, next) => {
  try {
    const photos = Array.isArray(req.body.photos) ? req.body.photos : [];
    if (photos.length > 100) return res.status(400).json({ error: '엔티티당 사진은 100장까지만 저장할 수 있습니다.' });
    const scope = branchScopeOf(req.authUser);
    await pool.query(`
      INSERT INTO crm_photos (branch_id, entity_key, photos, updated_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (branch_id, entity_key)
      DO UPDATE SET photos = EXCLUDED.photos, updated_at = now()
    `, [scope, req.params.entityKey, JSON.stringify(photos)]);
    res.json({ saved: photos.length });
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
    setInterval(() => dispatchScheduledMessages().catch(e => console.error('dispatch error', e)), 60 * 1000).unref();
    setInterval(() => runRevisitReminders().catch(e => console.error('reminder error', e)), 10 * 60 * 1000).unref();
    setInterval(() => runDailyBackup().catch(e => console.error('backup error', e)), 10 * 60 * 1000).unref();
    if (process.env.SMTP_HOST) await smtp.verify();
    app.listen(PORT, '0.0.0.0', () => console.log(`Troiareuke auth server listening on ${PORT}`));
  })
  .catch(error => {
    console.error('auth server startup failed', error);
    process.exit(1);
  });
