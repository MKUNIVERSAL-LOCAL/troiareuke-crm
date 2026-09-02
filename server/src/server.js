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

const PORT = envInteger('PORT', 8787, 1, 65535);
const DATABASE_URL = process.env.DATABASE_URL || '';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const SESSION_DAYS = envInteger('SESSION_DAYS', 30, 1, 365);
const RESET_TOKEN_MINUTES = envInteger('RESET_TOKEN_MINUTES', 30, 5, 1440);
const MAX_TEXT_LENGTH = 10_000;
const MAX_ID_LENGTH = 200;
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

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: envInteger('PG_POOL_MAX', 10, 1, 50),
  connectionTimeoutMillis: envInteger('PG_CONNECT_TIMEOUT_MS', 5000, 1000, 60_000),
  idleTimeoutMillis: envInteger('PG_IDLE_TIMEOUT_MS', 30_000, 1000, 300_000),
  query_timeout: envInteger('PG_QUERY_TIMEOUT_MS', 60_000, 1000, 600_000),
});

function log(level, event, details = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  };
  const output = JSON.stringify(payload);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}

function envInteger(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      event: 'invalid_environment_value',
      name,
      fallback,
    }));
    return fallback;
  }
  return parsed;
}

function errorDetails(error) {
  return {
    errorName: error?.name || 'Error',
    errorMessage: error?.message || String(error),
    ...(error?.code ? { errorCode: error.code } : {}),
  };
}

const smtp = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
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
app.use((req, res, next) => {
  req.requestId = req.get('x-request-id')?.slice(0, 100) || crypto.randomUUID();
  res.set('x-request-id', req.requestId);
  if (req.body === undefined) req.body = {};
  next();
});

// 로그인·가입 남용 방어 2중 구조.
// 프록시가 X-Forwarded-For를 안 넘기면 전 클라이언트가 IP 버킷 하나로 합쳐져
// 한 매장의 실패가 전 지점 로그인을 잠근다(2026-07-30 실측). 그래서
//  - IP 버킷은 실패만 집계 + 한도 완화(플러드 방어 역할)
//  - 무차별 대입 방어는 계정(이메일) 단위 실패 버킷이 담당
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envInteger('AUTH_IP_FAIL_LIMIT', 100, 10, 10000),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    log('warn', 'rate_limit_ip', { path: req.path, ip: req.ip, xff: req.get('x-forwarded-for') || null });
    res.status(options.statusCode).json({ error: '요청이 너무 많습니다. 15분 후 다시 시도해주세요.' });
  },
});
const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envInteger('AUTH_EMAIL_FAIL_LIMIT', 10, 3, 1000),
  skipSuccessfulRequests: true,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: req => `email:${normalizeEmail(req.body?.email) || 'missing'}`,
  handler: (req, res, _next, options) => {
    log('warn', 'rate_limit_email', { path: req.path, email: maskEmail(normalizeEmail(req.body?.email)), ip: req.ip });
    res.status(options.statusCode).json({ error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.' });
  },
});
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

function maskEmail(value) {
  if (!value || !value.includes('@')) return value || null;
  const [local, domain] = value.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isStrongPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function isValidId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_ID_LENGTH;
}

function isValidBranchId(value) {
  return isValidId(value) && /^[a-z0-9._:-]+$/i.test(value);
}

function isValidText(value, { required = false, max = MAX_TEXT_LENGTH } = {}) {
  if (value === undefined || value === null) return !required;
  if (typeof value !== 'string' || value.length > max) return false;
  return !required || value.trim().length > 0;
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
    serviceEndsAt: row.service_ends_at ? new Date(row.service_ends_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * 사용기간 입력 파서 — undefined(미변경) / null·''(무제한 해제) / 'YYYY-MM-DD'(그날 KST 자정까지) / ISO.
 * 잘못된 값이면 { invalid: true } 반환.
 */
function parseServiceEndsAt(value) {
  if (value === null || value === '') return { value: null };
  const raw = String(value).trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59+09:00` : raw;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { invalid: true };
  return { value: date.toISOString() };
}

// 데이터 스코프: 온보딩 전에는 user.id, 온보딩 후에는 branch_id.
// 클라이언트 getShopId()의 `branchId || user.id` 규칙과 반드시 일치해야 한다.
function branchScopeOf(user) {
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
    CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS password_reset_expiry_idx ON password_reset_tokens(expires_at);

    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS shop_phone text;
    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS shop_address text;
    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS business_number text;
    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS business_license_image text;
    -- 사용기간(구독 만료일). NULL = 무제한(기간 미설정) — 기존 계정 동작 불변.
    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS service_ends_at timestamptz;

    CREATE TABLE IF NOT EXISTS crm_records (
      branch_id text NOT NULL,
      collection text NOT NULL,
      id text NOT NULL,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (branch_id, collection, id)
    );

    CREATE INDEX IF NOT EXISTS crm_records_collection_idx ON crm_records(collection, updated_at);
    CREATE INDEX IF NOT EXISTS crm_records_branch_collection_updated_idx
      ON crm_records(branch_id, collection, updated_at DESC);

    -- 본사 → 전 지점 공지사항 (Supabase announcements 대체)
    CREATE TABLE IF NOT EXISTS announcements (
      id uuid PRIMARY KEY,
      title text NOT NULL,
      content text NOT NULL,
      type text NOT NULL DEFAULT 'info',
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS announcements_active_idx ON announcements(is_active, created_at DESC);

    -- 본사 → 전 지점 원격 기능 제어. scope = 'global'(전역 기본값) 또는 branch_id(지점 오버라이드).
    -- flags = { 기능id: boolean } — 명시된 키만 오버라이드, 없는 키는 상속(전역 → 클라이언트 기본값).
    CREATE TABLE IF NOT EXISTS feature_flags (
      scope text PRIMARY KEY,
      flags jsonb NOT NULL DEFAULT '{}',
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- 지점 → 고객 결제 요청 링크 (토스페이먼츠 카드/가상계좌 수납)
    CREATE TABLE IF NOT EXISTS payment_requests (
      id uuid PRIMARY KEY,
      branch_id text NOT NULL,
      created_by uuid,
      customer_id text,
      customer_name text,
      order_name text NOT NULL,
      amount bigint NOT NULL,
      method text NOT NULL DEFAULT 'both',
      memo text,
      status text NOT NULL DEFAULT 'pending',
      payment_key text,
      paid_method text,
      vbank_info jsonb,
      vbank_secret text,
      paid_at timestamptz,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS payment_requests_branch_idx ON payment_requests(branch_id, created_at DESC);

    -- 어드민 손익(/api/admin/pnl)은 collection별 전수 스캔이므로 부분 인덱스로 스캔 범위를 줄인다
    CREATE INDEX IF NOT EXISTS crm_records_payments_date_idx
      ON crm_records (branch_id, (data->>'payment_date')) WHERE collection = 'payments';
    CREATE INDEX IF NOT EXISTS crm_records_expenses_date_idx
      ON crm_records (branch_id, (data->>'expense_date')) WHERE collection = 'expenses';

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
    CREATE INDEX IF NOT EXISTS message_send_log_reminder_idx
      ON message_send_log(branch_id, type, status, created_at DESC);

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
    CREATE INDEX IF NOT EXISTS scheduled_messages_branch_send_idx
      ON scheduled_messages(branch_id, send_at DESC);

    CREATE TABLE IF NOT EXISTS crm_photos (
      branch_id text NOT NULL,
      entity_key text NOT NULL,
      photos jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (branch_id, entity_key)
    );

    ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS locked_at timestamptz;
    ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
    ALTER TABLE message_send_log ADD COLUMN IF NOT EXISTS scheduled_message_id uuid;
    CREATE INDEX IF NOT EXISTS scheduled_messages_stale_idx
      ON scheduled_messages(locked_at) WHERE status = 'processing';
    CREATE INDEX IF NOT EXISTS crm_photos_branch_updated_idx
      ON crm_photos(branch_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS auth_users_branch_idx ON auth_users(branch_id);
    CREATE INDEX IF NOT EXISTS message_send_log_scheduled_idx
      ON message_send_log(scheduled_message_id) WHERE scheduled_message_id IS NOT NULL;
  `);
}

// 최초 기동 시 슈퍼어드민 1개 계정을 env로 생성한다 (이미 있으면 건너뜀).
async function bootstrapSuperadmin() {
  if (!BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) return;
  if (!isEmail(BOOTSTRAP_ADMIN_EMAIL) || !isStrongPassword(BOOTSTRAP_ADMIN_PASSWORD)) {
    log('warn', 'bootstrap_admin_skipped', { reason: 'invalid_credentials_format' });
    return;
  }
  const { rows } = await pool.query('SELECT id FROM auth_users WHERE email = $1 LIMIT 1', [BOOTSTRAP_ADMIN_EMAIL]);
  if (rows[0]) return;
  const passwordHash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
  await pool.query(`
    INSERT INTO auth_users (id, email, password_hash, name, trial_ends_at, role, plan, is_onboarded)
    VALUES ($1, $2, $3, '총괄 관리자', now() + interval '3650 days', 'superadmin', 'enterprise', true)
  `, [crypto.randomUUID(), BOOTSTRAP_ADMIN_EMAIL, passwordHash]);
  log('info', 'bootstrap_admin_created');
}

// 만료 세션·재설정 토큰 정리 (기동 시 + 매일)
async function cleanupExpired() {
  try {
    await pool.query("DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 day'");
    await pool.query("DELETE FROM auth_sessions WHERE expires_at < now() - interval '7 days'");
  } catch (error) {
    log('error', 'expired_cleanup_failed', errorDetails(error));
  }
}

async function createSession(userId, database = pool) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await database.query(
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
    // 사용기간 만료는 로그인뿐 아니라 기존 세션에도 적용해야 한다.
    // (세션 TTL이 30일이라 이 검사가 없으면 만료 후에도 한 달간 계속 사용된다)
    if (rows[0].role !== 'superadmin' && rows[0].service_ends_at
        && new Date(rows[0].service_ends_at).getTime() < Date.now()) {
      return res.status(403).json({ error: '사용 기간이 만료되었습니다. 본사에 연장을 문의해주세요.' });
    }

    req.authUser = rows[0];
    req.authSessionId = rows[0].session_id;
    pool.query('UPDATE auth_sessions SET last_used_at = now() WHERE id = $1', [req.authSessionId])
      .catch(error => log('warn', 'session_touch_failed', {
        requestId: req.requestId,
        sessionId: req.authSessionId,
        ...errorDetails(error),
      }));
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
    subject: '[더마솔루션] 비밀번호 재설정',
    text: `${name || '고객'}님, 아래 링크에서 비밀번호를 재설정해주세요.\n\n${resetUrl}\n\n이 링크는 ${RESET_TOKEN_MINUTES}분 동안 한 번만 사용할 수 있습니다. 본인이 요청하지 않았다면 이 메일을 무시해주세요.`,
    html: `
      <div style="font-family:Arial,'Noto Sans KR',sans-serif;max-width:560px;margin:auto;color:#172033">
        <h2 style="color:#1a3a8f">더마솔루션 비밀번호 재설정</h2>
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
  <title>더마솔루션 비밀번호 재설정</title><style>
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
    try { await client.query('ROLLBACK'); } catch (rollbackError) {
      log('error', 'password_reset_rollback_failed', errorDetails(rollbackError));
    }
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
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''; // 가입 화면에서는 샵명
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
    if (!isEmail(email) || !isValidText(name, { required: true, max: 200 }) ||
        !isValidText(phone, { max: 50 }) || !isStrongPassword(password)) {
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
    const client = await pool.connect();
    let rows;
    let session;
    try {
      await client.query('BEGIN');
      ({ rows } = await client.query(`
        INSERT INTO auth_users (id, email, password_hash, name, phone, shop_name, business_number, business_license_image, trial_ends_at, role)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'admin')
        RETURNING *
      `, [userId, email, passwordHash, name, phone || null, name, businessNumber, licenseImage || null, trialEndsAt]));
      session = await createSession(userId, client);
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        log('error', 'signup_rollback_failed', errorDetails(rollbackError));
      }
      throw error;
    } finally {
      client.release();
    }
    res.status(201).json({ user: publicUser(rows[0]), ...session });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
    next(error);
  }
});

app.post('/api/auth/login', authLimiter, loginEmailLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!isEmail(email) || !isStrongPassword(password)) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const { rows } = await pool.query('SELECT * FROM auth_users WHERE email = $1 LIMIT 1', [email]);
    const user = rows[0];
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    if (user.is_active === false) return res.status(403).json({ error: '비활성화된 계정입니다. 관리자에게 문의해주세요.' });
    // 사용기간 만료 차단 — service_ends_at 미설정(null) 계정은 기존과 동일하게 무제한
    if (user.role !== 'superadmin' && user.service_ends_at
        && new Date(user.service_ends_at).getTime() < Date.now()) {
      return res.status(403).json({ error: '사용 기간이 만료되었습니다. 본사에 연장을 문의해주세요.' });
    }

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
    const shopName = typeof req.body.shopName === 'string' ? req.body.shopName.trim() : '';
    const shopType = typeof req.body.shopType === 'string' ? req.body.shopType.trim() : '';
    const shopPhone = typeof req.body.shopPhone === 'string' ? req.body.shopPhone.trim() : '';
    const shopAddress = typeof req.body.shopAddress === 'string' ? req.body.shopAddress.trim() : '';
    if (!isValidText(shopName, { required: true, max: 200 }) ||
        !isValidText(shopType, { required: true, max: 100 }) ||
        !isValidText(shopPhone, { max: 50 }) || !isValidText(shopAddress, { max: 500 })) {
      return res.status(400).json({ error: '매장 이름과 유형을 입력해주세요.' });
    }
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
    const requestedName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const name = requestedName || email.split('@')[0];
    const role = ['admin', 'staff'].includes(req.body.role) ? req.body.role : 'admin';
    const plan = ['trial', 'starter', 'pro', 'enterprise'].includes(req.body.plan) ? req.body.plan : 'trial';
    const branchName = typeof req.body.branchName === 'string' ? req.body.branchName.trim() : '';
    const shopType = typeof req.body.shopType === 'string' ? req.body.shopType.trim() : '';
    const requestedBranchId = typeof req.body.branchId === 'string' ? req.body.branchId.trim() : '';
    if (!isEmail(email) || !isValidText(name, { required: true, max: 200 }) ||
        !isValidText(branchName, { max: 200 }) || !isValidText(shopType, { max: 100 }) ||
        (requestedBranchId && !isValidBranchId(requestedBranchId))) {
      return res.status(400).json({ error: '이메일 형식을 확인해주세요.' });
    }

    // 비밀번호를 직접 지정하지 않으면 임시 비밀번호를 발급해 1회 응답으로만 알려준다.
    const providedPassword = req.body.password;
    if (providedPassword !== undefined && !isStrongPassword(providedPassword)) {
      return res.status(400).json({ error: '비밀번호는 8자 이상 128자 이하여야 합니다.' });
    }
    const temporaryPassword = providedPassword || crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    // 사용기간(선택) — 미지정 시 무제한(null)
    let serviceEndsAt = null;
    if (req.body.serviceEndsAt !== undefined) {
      const parsed = parseServiceEndsAt(req.body.serviceEndsAt);
      if (parsed.invalid) return res.status(400).json({ error: '사용기간 날짜 형식을 확인해주세요. (YYYY-MM-DD)' });
      serviceEndsAt = parsed.value;
    }

    const userId = crypto.randomUUID();
    // 같은 지점에 직원 계정을 추가할 땐 branchId를 넘겨 기존 지점에 합류시킨다.
    const branchId = requestedBranchId || userId;
    const isOnboarded = Boolean(branchName);
    const { rows } = await pool.query(`
      INSERT INTO auth_users (id, email, password_hash, name, role, plan,
        shop_name, shop_type, branch_id, branch_name, is_onboarded, trial_ends_at, service_ends_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now() + interval '14 days', $12)
      RETURNING *
    `, [userId, email, passwordHash, name, role, plan,
        branchName, shopType, branchId, branchName || null, isOnboarded, serviceEndsAt]);

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
    const result = await runBackupOnce();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// 슈퍼어드민 전용 읽기 API — 모든 지점의 현황과 원본 데이터를 조회한다.
app.get('/api/admin/overview', requireSession, requireSuperadmin, async (_req, res, next) => {
  try {
    const { rows: branchRows } = await pool.query(`
      SELECT DISTINCT branch_id FROM crm_records
      UNION SELECT DISTINCT branch_id FROM crm_photos
      UNION SELECT DISTINCT branch_id FROM auth_users WHERE branch_id IS NOT NULL
    `);
    const { rows: userRows } = await pool.query(`
      SELECT branch_id,
        max(branch_name) FILTER (WHERE branch_name IS NOT NULL AND branch_name <> '') AS branch_name,
        count(*)::int AS user_count
      FROM auth_users WHERE branch_id IS NOT NULL GROUP BY branch_id
    `);
    const { rows: recordRows } = await pool.query(`
      SELECT branch_id, collection, count(*)::int AS record_count, max(updated_at) AS last_activity
      FROM crm_records GROUP BY branch_id, collection
    `);
    const { rows: photoRows } = await pool.query(`
      SELECT branch_id,
        coalesce(sum(CASE WHEN jsonb_typeof(photos) = 'array' THEN jsonb_array_length(photos) ELSE 0 END), 0)::int AS photo_count
      FROM crm_photos GROUP BY branch_id
    `);
    const { rows: messageRows } = await pool.query(`
      SELECT branch_id, count(*)::int AS message_count
      FROM message_send_log GROUP BY branch_id
    `);

    const usersByBranch = new Map(userRows.map(row => [row.branch_id, row]));
    const photosByBranch = new Map(photoRows.map(row => [row.branch_id, row.photo_count]));
    const messagesByBranch = new Map(messageRows.map(row => [row.branch_id, row.message_count]));
    const recordsByBranch = new Map();
    for (const row of recordRows) {
      if (!recordsByBranch.has(row.branch_id)) {
        recordsByBranch.set(row.branch_id, { counts: {}, lastActivity: null });
      }
      const summary = recordsByBranch.get(row.branch_id);
      if (DATA_COLLECTIONS.has(row.collection)) summary.counts[row.collection] = row.record_count;
      if (!summary.lastActivity || row.last_activity > summary.lastActivity) {
        summary.lastActivity = row.last_activity;
      }
    }

    const branches = branchRows.map(({ branch_id: branchId }) => {
      const user = usersByBranch.get(branchId);
      const record = recordsByBranch.get(branchId);
      const recordCounts = Object.fromEntries(
        [...DATA_COLLECTIONS].map(collection => [collection, record?.counts[collection] || 0]),
      );
      return {
        branchId,
        branchName: user?.branch_name || null,
        userCount: user?.user_count || 0,
        recordCounts,
        photoCount: photosByBranch.get(branchId) || 0,
        messageCount: messagesByBranch.get(branchId) || 0,
        lastActivity: record?.lastActivity || null,
      };
    });
    res.json({ branches });
  } catch (error) {
    next(error);
  }
});

// 지점별/전체 애널리틱스 — 고객·매출·예약·시술 집계 (어드민 통계 화면 전용)
// data(JSONB)의 amount/date 필드는 클라이언트 입력이므로 형식 가드 후 집계한다.
app.get('/api/admin/analytics', requireSession, requireSuperadmin, async (_req, res, next) => {
  try {
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const since30d = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const sinceMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1))
      .toISOString().slice(0, 7);
    // 결제 금액: 숫자 형식일 때만 합산 (비정상 입력이 전체 집계를 깨지 않게)
    const AMOUNT = `(CASE WHEN (data->>'amount') ~ '^-?\\d+(\\.\\d+)?$' THEN (data->>'amount')::numeric ELSE 0 END)`;
    // 클라이언트 toDb*는 snake_case로 저장(payment_date/registered_at) — 종전 camelCase 조회는
    // 항상 NULL이라 월별/일별/신규30일 집계가 0으로 나오던 결함. camelCase는 구형 행 폴백으로 유지.
    const PAYMENT_DATE = `coalesce(data->>'payment_date', data->>'paymentDate')`;
    const REGISTERED_AT = `coalesce(data->>'registered_at', data->>'registeredAt')`;

    const [customerRows, paymentTotalRows, monthlyRows, dailyRows, reservationRows, treatmentRows] =
      await Promise.all([
        pool.query(
          `SELECT branch_id,
             count(*)::int AS total,
             count(*) FILTER (WHERE left(${REGISTERED_AT}, 10) >= $1)::int AS new_30d
           FROM crm_records WHERE collection = 'customers' GROUP BY branch_id`,
          [since30d],
        ),
        pool.query(
          `SELECT branch_id,
             coalesce(sum(${AMOUNT}) FILTER (WHERE data->>'status' = 'completed'), 0)::bigint AS revenue_total,
             coalesce(sum(${AMOUNT}) FILTER (WHERE data->>'status' = 'refunded'), 0)::bigint AS refunded_total,
             count(*) FILTER (WHERE data->>'status' = 'completed')::int AS payment_count
           FROM crm_records WHERE collection = 'payments' GROUP BY branch_id`,
        ),
        pool.query(
          `SELECT branch_id, left(${PAYMENT_DATE}, 7) AS month,
             coalesce(sum(${AMOUNT}) FILTER (WHERE data->>'status' = 'completed'), 0)::bigint AS revenue,
             coalesce(sum(${AMOUNT}) FILTER (WHERE data->>'status' = 'refunded'), 0)::bigint AS refunded
           FROM crm_records
           WHERE collection = 'payments' AND left(${PAYMENT_DATE}, 7) >= $1
           GROUP BY branch_id, month ORDER BY month`,
          [sinceMonth],
        ),
        pool.query(
          `SELECT branch_id, left(${PAYMENT_DATE}, 10) AS day,
             coalesce(sum(${AMOUNT}) FILTER (WHERE data->>'status' = 'completed'), 0)::bigint AS revenue
           FROM crm_records
           WHERE collection = 'payments' AND left(${PAYMENT_DATE}, 10) >= $1
           GROUP BY branch_id, day ORDER BY day`,
          [since30d],
        ),
        pool.query(
          `SELECT branch_id,
             count(*)::int AS total,
             count(*) FILTER (WHERE data->>'status' = 'completed')::int AS completed,
             count(*) FILTER (WHERE left(data->>'date', 10) >= $1
               AND data->>'status' IN ('confirmed', 'pending'))::int AS upcoming
           FROM crm_records WHERE collection = 'reservations' GROUP BY branch_id`,
          [todayIso],
        ),
        pool.query(
          `SELECT branch_id, count(*)::int AS total
           FROM crm_records WHERE collection = 'treatment_logs' GROUP BY branch_id`,
        ),
      ]);

    const { rows: nameRows } = await pool.query(`
      SELECT branch_id,
        max(branch_name) FILTER (WHERE branch_name IS NOT NULL AND branch_name <> '') AS branch_name
      FROM auth_users WHERE branch_id IS NOT NULL GROUP BY branch_id
    `);
    const names = new Map(nameRows.map(row => [row.branch_id, row.branch_name]));

    const byBranch = new Map();
    const ensure = branchId => {
      if (!byBranch.has(branchId)) {
        byBranch.set(branchId, {
          branchId,
          branchName: names.get(branchId) || null,
          customers: { total: 0, new30d: 0 },
          revenue: { total: 0, refunded: 0, paymentCount: 0 },
          revenueMonthly: [],
          revenueDaily: [],
          reservations: { total: 0, completed: 0, upcoming: 0 },
          treatments: 0,
        });
      }
      return byBranch.get(branchId);
    };
    for (const row of customerRows.rows) {
      const b = ensure(row.branch_id);
      b.customers = { total: row.total, new30d: row.new_30d };
    }
    for (const row of paymentTotalRows.rows) {
      const b = ensure(row.branch_id);
      b.revenue = {
        total: Number(row.revenue_total),
        refunded: Number(row.refunded_total),
        paymentCount: row.payment_count,
      };
    }
    for (const row of monthlyRows.rows) {
      ensure(row.branch_id).revenueMonthly.push({
        month: row.month,
        revenue: Number(row.revenue),
        refunded: Number(row.refunded),
      });
    }
    for (const row of dailyRows.rows) {
      ensure(row.branch_id).revenueDaily.push({ day: row.day, revenue: Number(row.revenue) });
    }
    for (const row of reservationRows.rows) {
      const b = ensure(row.branch_id);
      b.reservations = { total: row.total, completed: row.completed, upcoming: row.upcoming };
    }
    for (const row of treatmentRows.rows) {
      ensure(row.branch_id).treatments = row.total;
    }

    res.json({ generatedAt: now.toISOString(), branches: [...byBranch.values()] });
  } catch (error) {
    next(error);
  }
});

// 지점별 손익계산서 원자료 — 연 단위로 월별 매출(구분별)·지출(분류별)을 반환.
// 월/분기/연 집계·매출원가 구분은 클라이언트(어드민 통계 화면)에서 조합한다.
app.get('/api/admin/pnl', requireSession, requireSuperadmin, async (req, res, next) => {
  try {
    const requestedYear = String(req.query.year || '');
    const year = /^\d{4}$/.test(requestedYear) ? requestedYear : String(new Date().getFullYear());
    const AMOUNT = `(CASE WHEN (data->>'amount') ~ '^-?\\d+(\\.\\d+)?$' THEN (data->>'amount')::numeric ELSE 0 END)`;

    // 클라이언트 toDbPayment는 snake_case(payment_date)로 저장 — camelCase는 혹시 모를 구형 행 폴백
    const PAYMENT_DATE = `coalesce(data->>'payment_date', data->>'paymentDate')`;
    const [revenueRows, expenseRows, nameRows] = await Promise.all([
      pool.query(
        `SELECT branch_id, left(${PAYMENT_DATE}, 7) AS month,
           CASE WHEN data->>'type' IN ('program', 'single_treatment') THEN 'treatment'
                WHEN data->>'type' = 'product' THEN 'product'
                ELSE 'other' END AS revenue_type,
           coalesce(sum(${AMOUNT}), 0)::bigint AS amount,
           count(*)::int AS count
         FROM crm_records
         WHERE collection = 'payments' AND data->>'status' = 'completed'
           AND left(${PAYMENT_DATE}, 4) = $1
         GROUP BY branch_id, month, revenue_type ORDER BY month`,
        [year],
      ),
      pool.query(
        `SELECT branch_id, left(data->>'expense_date', 7) AS month,
           coalesce(nullif(data->>'category', ''), '기타') AS category,
           coalesce(sum(${AMOUNT}), 0)::bigint AS amount,
           count(*)::int AS count
         FROM crm_records
         WHERE collection = 'expenses' AND left(data->>'expense_date', 4) = $1
         GROUP BY branch_id, month, category ORDER BY month`,
        [year],
      ),
      pool.query(`
        SELECT branch_id,
          max(branch_name) FILTER (WHERE branch_name IS NOT NULL AND branch_name <> '') AS branch_name
        FROM auth_users WHERE branch_id IS NOT NULL GROUP BY branch_id
      `),
    ]);

    res.json({
      year,
      generatedAt: new Date().toISOString(),
      branchNames: Object.fromEntries(nameRows.rows.map(row => [row.branch_id, row.branch_name])),
      revenue: revenueRows.rows.map(row => ({
        branchId: row.branch_id,
        month: row.month,
        type: row.revenue_type,
        amount: Number(row.amount),
        count: row.count,
      })),
      expenses: expenseRows.rows.map(row => ({
        branchId: row.branch_id,
        month: row.month,
        category: row.category,
        amount: Number(row.amount),
        count: row.count,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/data/:branchId/:collection', requireSession, requireSuperadmin, async (req, res, next) => {
  try {
    const branchId = String(req.params.branchId || '');
    const collection = String(req.params.collection || '');
    if (!isValidBranchId(branchId) || !DATA_COLLECTIONS.has(collection)) {
      return res.status(404).json({ error: '지원하지 않는 데이터 종류입니다.' });
    }
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const requestedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;
    const offset = Number.isFinite(requestedOffset) ? Math.min(Math.max(requestedOffset, 0), 1_000_000) : 0;
    const query = String(req.query.q || '').trim().slice(0, 200);
    const escapedQuery = query.replace(/[\\%_]/g, '\\$&');
    const values = query ? [branchId, collection, `%${escapedQuery}%`] : [branchId, collection];
    const where = query
      ? "branch_id = $1 AND collection = $2 AND data::text ILIKE $3 ESCAPE '\\'"
      : 'branch_id = $1 AND collection = $2';
    const { rows: countRows } = await pool.query(
      `SELECT count(*)::int AS total FROM crm_records WHERE ${where}`,
      values,
    );
    const { rows } = await pool.query(
      `SELECT id, updated_at, data FROM crm_records
       WHERE ${where} ORDER BY updated_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );
    res.json({
      total: countRows[0].total,
      rows: rows.map(row => ({ id: row.id, updatedAt: row.updated_at, data: row.data })),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/messages/:branchId', requireSession, requireSuperadmin, async (req, res, next) => {
  try {
    const branchId = String(req.params.branchId || '');
    if (!isValidBranchId(branchId)) return res.status(400).json({ error: '지점 식별자를 확인해주세요.' });
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 100;
    const { rows: sendLog } = await pool.query(
      `SELECT id, user_id, type, title, content, phone, status, reason, created_at
       FROM message_send_log WHERE branch_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [branchId, limit],
    );
    const { rows: scheduled } = await pool.query(
      `SELECT id, user_id, send_at, type, title, content, phones, status, result, created_at
       FROM scheduled_messages WHERE branch_id = $1 ORDER BY send_at DESC LIMIT $2`,
      [branchId, limit],
    );
    // 클라이언트(adminApi.ts) 계약은 camelCase — snake_case 원본을 매핑해 반환
    res.json({
      sendLog: sendLog.map(row => ({
        id: row.id,
        type: row.type,
        title: row.title,
        content: row.content,
        phone: row.phone,
        status: row.status,
        reason: row.reason,
        createdAt: row.created_at,
      })),
      scheduled: scheduled.map(row => ({
        id: row.id,
        sendAt: row.send_at,
        type: row.type,
        title: row.title,
        content: row.content,
        phones: Array.isArray(row.phones) ? row.phones : [],
        status: row.status,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/photos/:branchId', requireSession, requireSuperadmin, async (req, res, next) => {
  try {
    const branchId = String(req.params.branchId || '');
    if (!isValidBranchId(branchId)) return res.status(400).json({ error: '지점 식별자를 확인해주세요.' });
    const { rows } = await pool.query(`
      SELECT entity_key,
        CASE WHEN jsonb_typeof(photos) = 'array' THEN jsonb_array_length(photos) ELSE 0 END AS photo_count,
        updated_at
      FROM crm_photos WHERE branch_id = $1 ORDER BY updated_at DESC
    `, [branchId]);
    res.json({
      entities: rows.map(row => ({
        entityKey: row.entity_key,
        photoCount: row.photo_count,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/users/:id', requireSession, requireSuperadmin, async (req, res, next) => {
  try {
    const targetId = String(req.params.id);
    if (!isUuid(targetId)) return res.status(404).json({ error: '대상 계정을 찾을 수 없습니다.' });
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
      if (typeof req.body.isActive !== 'boolean') return res.status(400).json({ error: '활성화 여부 값을 확인해주세요.' });
      if (targetId === req.authUser.id) return res.status(400).json({ error: '본인 계정은 비활성화할 수 없습니다.' });
      push('is_active', req.body.isActive);
    }
    if (req.body.password !== undefined) {
      if (!isStrongPassword(req.body.password)) return res.status(400).json({ error: '비밀번호는 8자 이상 128자 이하여야 합니다.' });
      push('password_hash', await bcrypt.hash(req.body.password, 12));
    }
    let serviceEndsAtExpired = false;
    if (req.body.serviceEndsAt !== undefined) {
      const parsed = parseServiceEndsAt(req.body.serviceEndsAt);
      if (parsed.invalid) return res.status(400).json({ error: '사용기간 날짜 형식을 확인해주세요. (YYYY-MM-DD)' });
      serviceEndsAtExpired = Boolean(parsed.value) && new Date(parsed.value).getTime() < Date.now();
      push('service_ends_at', parsed.value);
    }
    if (fields.length === 0) return res.status(400).json({ error: '변경할 항목이 없습니다.' });

    values.push(targetId);
    const client = await pool.connect();
    let rows;
    try {
      await client.query('BEGIN');
      ({ rows } = await client.query(
        `UPDATE auth_users SET ${fields.join(', ')}, updated_at = now() WHERE id = $${values.length} AND role <> 'superadmin' RETURNING *`,
        values,
      ));
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '대상 계정을 찾을 수 없습니다.' });
      }

      // 비활성화·비밀번호 변경·사용기간을 과거로 단축 시 기존 세션 즉시 종료
      if (req.body.isActive === false || req.body.password !== undefined || serviceEndsAtExpired) {
        await client.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [targetId]);
      }
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        log('error', 'admin_user_update_rollback_failed', errorDetails(rollbackError));
      }
      throw error;
    } finally {
      client.release();
    }
    res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    next(error);
  }
});

// ── 공지사항 (본사 → 전 지점) ───────────────────────────────────
const ANNOUNCEMENT_TYPES = new Set(['info', 'update', 'warning', 'event']);

function publicAnnouncement(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// 지점: 게시 중 공지 조회 (로그인 필요)
app.get('/api/announcements', requireSession, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM announcements WHERE is_active = true ORDER BY created_at DESC LIMIT 20',
    );
    res.json({ announcements: rows.map(publicAnnouncement) });
  } catch (error) {
    next(error);
  }
});

// 어드민: 전체 목록
app.get('/api/admin/announcements', requireSession, requireSuperadmin, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 200');
    res.json({ announcements: rows.map(publicAnnouncement) });
  } catch (error) {
    next(error);
  }
});

function validateAnnouncementInput(body, { partial = false } = {}) {
  const out = {};
  if (body.title !== undefined || !partial) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!isValidText(title, { required: true, max: 200 })) return { error: '공지 제목을 입력해주세요. (200자 이하)' };
    out.title = title;
  }
  if (body.content !== undefined || !partial) {
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!isValidText(content, { required: true, max: 5000 })) return { error: '공지 내용을 입력해주세요. (5000자 이하)' };
    out.content = content;
  }
  if (body.type !== undefined) {
    if (!ANNOUNCEMENT_TYPES.has(body.type)) return { error: '공지 유형 값을 확인해주세요.' };
    out.type = body.type;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') return { error: '게시 여부 값을 확인해주세요.' };
    out.is_active = body.isActive;
  }
  return { value: out };
}

app.post('/api/admin/announcements', requireSession, requireSuperadmin, async (req, res, next) => {
  try {
    const parsed = validateAnnouncementInput(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { rows } = await pool.query(`
      INSERT INTO announcements (id, title, content, type, is_active)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [crypto.randomUUID(), parsed.value.title, parsed.value.content,
        parsed.value.type || 'info', parsed.value.is_active !== false]);
    res.status(201).json({ announcement: publicAnnouncement(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/announcements/:id', requireSession, requireSuperadmin, async (req, res, next) => {
  try {
    if (!isUuid(String(req.params.id))) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
    const parsed = validateAnnouncementInput(req.body, { partial: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const entries = Object.entries(parsed.value);
    if (entries.length === 0) return res.status(400).json({ error: '변경할 항목이 없습니다.' });
    const fields = entries.map(([column], i) => `${column} = $${i + 1}`);
    const values = entries.map(([, value]) => value);
    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE announcements SET ${fields.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (!rows[0]) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
    res.json({ announcement: publicAnnouncement(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/announcements/:id', requireSession, requireSuperadmin, async (req, res, next) => {
  try {
    if (!isUuid(String(req.params.id))) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
    const { rowCount } = await pool.query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ── 기능 플래그 (본사 → 전 지점 원격 기능 제어) ──────────────────
const FLAG_SCOPE_RE = /^[A-Za-z0-9_:-]{1,64}$/; // 'global' 또는 branch_id
const FLAG_KEY_RE = /^[A-Za-z0-9_.-]{1,64}$/;

function validateFlagsInput(body) {
  const flags = body?.flags;
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) {
    return { error: 'flags 객체가 필요합니다.' };
  }
  const entries = Object.entries(flags);
  if (entries.length > 100) return { error: '기능 항목이 너무 많습니다. (100개 이하)' };
  const out = {};
  for (const [key, value] of entries) {
    if (!FLAG_KEY_RE.test(key)) return { error: `기능 id 형식이 올바르지 않습니다: ${key.slice(0, 80)}` };
    if (typeof value !== 'boolean') return { error: `기능 값은 true/false여야 합니다: ${key}` };
    out[key] = value;
  }
  return { value: out };
}

// 지점: 자기 지점에 적용될 전역+지점 플래그 조회 (클라이언트가 기본값과 병합)
app.get('/api/feature-flags', requireSession, async (req, res, next) => {
  try {
    const branchId = req.authUser.branch_id || '';
    const { rows } = await pool.query(
      'SELECT scope, flags FROM feature_flags WHERE scope = $1 OR scope = $2',
      ['global', branchId || 'global'],
    );
    const byScope = Object.fromEntries(rows.map((r) => [r.scope, r.flags || {}]));
    res.json({
      global: byScope.global || {},
      branch: (branchId && byScope[branchId]) || {},
    });
  } catch (error) {
    next(error);
  }
});

// 어드민: 전체 스코프 조회
app.get('/api/admin/feature-flags', requireSession, requireSuperadmin, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT scope, flags FROM feature_flags ORDER BY scope');
    res.json({ scopes: Object.fromEntries(rows.map((r) => [r.scope, r.flags || {}])) });
  } catch (error) {
    next(error);
  }
});

// 어드민: 스코프 단위 전체 교체 저장 (빈 flags = 해당 스코프 오버라이드 전부 해제)
app.put('/api/admin/feature-flags/:scope', requireSession, requireSuperadmin, async (req, res, next) => {
  try {
    const scope = String(req.params.scope || '');
    if (!FLAG_SCOPE_RE.test(scope)) return res.status(400).json({ error: '스코프 형식이 올바르지 않습니다.' });
    const parsed = validateFlagsInput(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { rows } = await pool.query(`
      INSERT INTO feature_flags (scope, flags, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (scope) DO UPDATE SET flags = EXCLUDED.flags, updated_at = now()
      RETURNING scope, flags
    `, [scope, JSON.stringify(parsed.value)]);
    res.json({ scope: rows[0].scope, flags: rows[0].flags });
  } catch (error) {
    next(error);
  }
});

// ── 결제 요청 링크 (토스페이먼츠 카드/가상계좌 수납) ─────────────
// 활성 조건: TOSS_CLIENT_KEY + TOSS_SECRET_KEY 환경변수 설정 (docs/PAYMENT-INTEGRATION.md).
// 키 미설정 시 생성 API가 503으로 정직하게 안내한다 — 가짜 성공 없음.
const TOSS_CLIENT_KEY = String(process.env.TOSS_CLIENT_KEY || '').trim();
const TOSS_SECRET_KEY = String(process.env.TOSS_SECRET_KEY || '').trim();
const TOSS_API_BASE = (process.env.TOSS_API_BASE || 'https://api.tosspayments.com').replace(/\/$/, '');
const PAY_REQUEST_EXPIRE_HOURS = envInteger('PAY_REQUEST_EXPIRE_HOURS', 72, 1, 720);
const PG_ENABLED = Boolean(TOSS_CLIENT_KEY && TOSS_SECRET_KEY);
const PAY_METHODS = new Set(['card', 'vbank', 'both']);

const payPageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envInteger('PAY_PAGE_LIMIT', 120, 10, 10000),
  standardHeaders: false,
  legacyHeaders: false,
});
// 웹훅은 결제 페이지와 버킷을 분리 — 공유하면 페이지 트래픽에 밀려 입금 통지가 유실된다
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envInteger('PAY_WEBHOOK_LIMIT', 600, 10, 100000),
  standardHeaders: false,
  legacyHeaders: false,
});
// 결제 요청 생성 남용 방지 (계정 탈취 시 무제한 생성 차단)
const payCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: envInteger('PAY_CREATE_LIMIT', 200, 5, 10000),
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * 인라인 <script> 안에 값을 심을 때 쓰는 안전한 JSON 직렬화.
 * JSON.stringify만으로는 '<'가 그대로 남아 문자열 안의 </script>가 스크립트를 끊고
 * 임의 HTML 주입(저장형 XSS)이 되므로, 스크립트 파서가 반응하는 문자를 전부 escape 한다.
 */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}

function kstDateString(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

function publicPaymentRequest(row) {
  return {
    id: row.id,
    customerId: row.customer_id || undefined,
    customerName: row.customer_name || undefined,
    orderName: row.order_name,
    amount: Number(row.amount),
    method: row.method,
    memo: row.memo || undefined,
    status: row.status,
    paidMethod: row.paid_method || undefined,
    vbank: row.vbank_info || undefined,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    url: `${PUBLIC_BASE_URL}/pay/${row.id}`,
  };
}

/** 토스 결제수단 → 지점이 쓰는 결제수단 라벨 (매출 기록·표시에 공통 사용) */
function tossMethodLabel(method) {
  if (method === '카드' || method === 'card') return '카드';
  if (method === '가상계좌' || method === 'virtualAccount') return '계좌이체';
  return '계좌이체';
}

/** 결제 완료 시 지점 매출(crm_records payments)에 자동 기록 — 클라이언트 toDbPayment와 동일한 snake_case */
async function recordPaidPayment(client, request, paidMethodLabel) {
  const paymentRow = {
    id: `pg_${request.id}`,
    branch_id: request.branch_id,
    customer_id: request.customer_id || undefined,
    customer_name: request.customer_name || undefined,
    payment_date: kstDateString(),
    type: 'other',
    type_label: paidMethodLabel === '카드' ? '온라인 결제(카드)' : '온라인 결제(계좌)',
    reference_id: request.id,
    amount: Number(request.amount),
    payment_method: paidMethodLabel,
    discount_amount: 0,
    status: 'completed',
    memo: request.memo ? `${request.order_name} · ${request.memo}` : request.order_name,
    created_at: new Date().toISOString(),
  };
  await client.query(`
    INSERT INTO crm_records (branch_id, collection, id, data, updated_at)
    VALUES ($1, 'payments', $2, $3, now())
    ON CONFLICT (branch_id, collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `, [request.branch_id, paymentRow.id, paymentRow]);
}

/**
 * 토스 결제 승인/조회 API 호출 (시크릿 키는 서버에만 존재).
 * 타임아웃 필수 — PG가 응답하지 않으면 DB 커넥션·행 잠금을 무한 점유해
 * 서버 전체 API가 멈추는 경로가 된다.
 */
const TOSS_TIMEOUT_MS = envInteger('TOSS_TIMEOUT_MS', 15_000, 1000, 60_000);

async function tossApi(pathName, options = {}) {
  const auth = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOSS_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${TOSS_API_BASE}${pathName}`, {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || `토스 API 오류 (${response.status})`);
    error.tossCode = data?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

// PG 연결 상태 (지점 클라이언트가 버튼 노출 여부 판단)
app.get('/api/payments/pg-config', requireSession, (_req, res) => {
  res.json({ enabled: PG_ENABLED, methods: PG_ENABLED ? ['card', 'vbank'] : [] });
});

// 결제 요청 생성
app.post('/api/payments/requests', payCreateLimiter, requireSession, async (req, res, next) => {
  try {
    if (!PG_ENABLED) {
      return res.status(503).json({
        error: 'PG(토스페이먼츠) 연동 키가 아직 설정되지 않았습니다. 본사에서 가맹 계약 후 활성화됩니다.',
      });
    }
    const amount = Number(req.body.amount);
    if (!Number.isInteger(amount) || amount < 1000 || amount > 100_000_000) {
      return res.status(400).json({ error: '결제 금액은 1,000원 이상 1억원 이하여야 합니다.' });
    }
    const orderName = typeof req.body.orderName === 'string' ? req.body.orderName.trim() : '';
    if (!isValidText(orderName, { required: true, max: 100 })) {
      return res.status(400).json({ error: '결제 내용을 입력해주세요. (100자 이하)' });
    }
    const method = PAY_METHODS.has(req.body.method) ? req.body.method : 'both';
    const customerName = typeof req.body.customerName === 'string' ? req.body.customerName.trim().slice(0, 100) : '';
    const customerId = isValidId(req.body.customerId || '') ? String(req.body.customerId) : '';
    const memo = typeof req.body.memo === 'string' ? req.body.memo.trim().slice(0, 500) : '';

    const { rows } = await pool.query(`
      INSERT INTO payment_requests
        (id, branch_id, created_by, customer_id, customer_name, order_name, amount, method, memo, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + ($10 || ' hours')::interval)
      RETURNING *
    `, [crypto.randomUUID(), branchScopeOf(req.authUser), req.authUser.id,
        customerId || null, customerName || null, orderName, amount, method, memo || null,
        String(PAY_REQUEST_EXPIRE_HOURS)]);
    res.status(201).json({ request: publicPaymentRequest(rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 결제 요청 목록 (지점 스코프)
app.get('/api/payments/requests', requireSession, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM payment_requests WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 100
    `, [branchScopeOf(req.authUser)]);
    // 만료 반영 (표시용 — 실제 차단은 결제 페이지에서도 검사)
    res.json({
      enabled: PG_ENABLED,
      requests: rows.map(row => {
        const expired = row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now();
        return publicPaymentRequest(expired ? { ...row, status: 'expired' } : row);
      }),
    });
  } catch (error) {
    next(error);
  }
});

// 결제 요청 취소 (대기 상태만)
app.post('/api/payments/requests/:id/cancel', requireSession, async (req, res, next) => {
  try {
    if (!isUuid(String(req.params.id))) return res.status(404).json({ error: '결제 요청을 찾을 수 없습니다.' });
    const { rows: targetRows } = await pool.query(`
      SELECT * FROM payment_requests
      WHERE id = $1 AND branch_id = $2 AND status IN ('pending', 'vbank_wait')
    `, [req.params.id, branchScopeOf(req.authUser)]);
    const target = targetRows[0];
    if (!target) return res.status(404).json({ error: '취소할 수 있는 결제 요청이 없습니다.' });

    // 발급된 가상계좌는 DB만 닫으면 계좌가 살아 있어, 고객이 입금해도 기록되지 않고 돈만 들어온다.
    // 반드시 PG에도 취소를 전파하고, 실패하면 취소를 진행하지 않는다.
    if (target.status === 'vbank_wait' && target.payment_key) {
      try {
        await tossApi(`/v1/payments/${encodeURIComponent(target.payment_key)}/cancel`, {
          method: 'POST',
          body: { cancelReason: '매장 요청으로 결제 취소' },
        });
      } catch (error) {
        log('warn', 'pay_vbank_cancel_failed', { requestId: target.id, ...errorDetails(error) });
        return res.status(502).json({
          error: '가상계좌 취소가 결제사에 반영되지 않았습니다. 잠시 후 다시 시도해주세요.',
        });
      }
    }

    const { rows } = await pool.query(`
      UPDATE payment_requests SET status = 'canceled', updated_at = now()
      WHERE id = $1 AND branch_id = $2 AND status IN ('pending', 'vbank_wait')
      RETURNING *
    `, [req.params.id, branchScopeOf(req.authUser)]);
    if (!rows[0]) return res.status(404).json({ error: '취소할 수 있는 결제 요청이 없습니다.' });
    res.json({ request: publicPaymentRequest(rows[0]) });
  } catch (error) {
    next(error);
  }
});

// ── 고객용 결제 페이지 (공개, 링크 소지자만 접근) ────────────────
function payPageHtml(title, bodyHtml, extraHead = '') {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
${extraHead}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; background: #f4f6fb; color: #1e293b;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
  .card { background: #fff; border-radius: 20px; box-shadow: 0 8px 30px rgba(26,58,143,.08); width: 100%; max-width: 420px; padding: 28px; }
  .brand { font-size: 13px; font-weight: 800; color: #1a3a8f; letter-spacing: .5px; margin-bottom: 18px; }
  h1 { font-size: 18px; margin-bottom: 6px; }
  .sub { font-size: 13px; color: #64748b; margin-bottom: 20px; }
  .row { display: flex; justify-content: space-between; font-size: 14px; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
  .row .label { color: #64748b; }
  .amount { font-size: 24px; font-weight: 800; color: #1a3a8f; text-align: right; padding: 14px 0 20px; }
  button { width: 100%; padding: 14px; border: 0; border-radius: 14px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 10px; }
  .btn-card { background: #1a3a8f; color: #fff; }
  .btn-vbank { background: #eef2ff; color: #1a3a8f; }
  .note { font-size: 11px; color: #94a3b8; margin-top: 16px; line-height: 1.6; }
  .status { text-align: center; padding: 26px 0 8px; font-size: 15px; font-weight: 700; }
  .ok { color: #059669; } .bad { color: #dc2626; } .wait { color: #d97706; }
  .vbank-box { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 14px; padding: 14px; margin-top: 14px; font-size: 13px; line-height: 1.9; }
  .err { background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; color: #b91c1c; font-size: 12px; padding: 10px 12px; margin-top: 12px; display: none; }
  .legal { margin-top: 22px; padding-top: 14px; border-top: 1px solid #eef2f7; font-size: 10.5px; color: #94a3b8; line-height: 1.75; }
  .legal a { color: #64748b; text-decoration: none; margin-right: 10px; }
  .legal a:hover { text-decoration: underline; }
  .legal .biz { margin-top: 8px; }
  .prose { font-size: 13px; line-height: 1.85; color: #334155; }
  .prose h2 { font-size: 15px; margin: 18px 0 6px; color: #1e293b; }
  .prose p, .prose li { margin-bottom: 6px; }
  .prose ul { padding-left: 18px; }
  .back { display: inline-block; margin-top: 20px; font-size: 12px; color: #1a3a8f; text-decoration: none; }
</style>
</head>
<body><div class="card"><div class="brand">DERMASOLUTION 더마솔루션</div>${bodyHtml}${merchantFooterHtml()}</div></body>
</html>`;
}

// ── 전자상거래법 표시사항 (PG·카드사 심사 필수 항목) ──────────────
// 결제가 일어나는 화면에는 판매자 신원과 취소·환불 기준이 표시되어야 한다.
// 값은 .env로 주입 — 미설정 시 문구가 비어 심사에서 반려되므로 배포 전 반드시 채울 것.
const MERCHANT = {
  name: String(process.env.PAY_MERCHANT_NAME || '').trim(),
  ceo: String(process.env.PAY_MERCHANT_CEO || '').trim(),
  bizNo: String(process.env.PAY_MERCHANT_BIZ_NO || '').trim(),
  mailOrderNo: String(process.env.PAY_MERCHANT_MAIL_ORDER_NO || '').trim(),
  address: String(process.env.PAY_MERCHANT_ADDRESS || '').trim(),
  tel: String(process.env.PAY_MERCHANT_TEL || '').trim(),
  email: String(process.env.PAY_MERCHANT_EMAIL || '').trim(),
  privacyOfficer: String(process.env.PAY_MERCHANT_PRIVACY_OFFICER || '').trim(),
};

function merchantFooterHtml() {
  if (!MERCHANT.name) return '';
  const parts = [
    MERCHANT.ceo && `대표 ${escapeHtml(MERCHANT.ceo)}`,
    MERCHANT.bizNo && `사업자등록번호 ${escapeHtml(MERCHANT.bizNo)}`,
    MERCHANT.mailOrderNo && `통신판매업신고 ${escapeHtml(MERCHANT.mailOrderNo)}`,
  ].filter(Boolean).join(' · ');
  const contact = [
    MERCHANT.address && escapeHtml(MERCHANT.address),
    MERCHANT.tel && `대표전화 ${escapeHtml(MERCHANT.tel)}`,
    MERCHANT.email && escapeHtml(MERCHANT.email),
  ].filter(Boolean).join(' · ');
  return `<div class="legal">
    <a href="/pay-info/terms">이용약관</a><a href="/pay-info/privacy">개인정보처리방침</a><a href="/pay-info/refund">취소·환불 규정</a>
    <div class="biz"><strong>${escapeHtml(MERCHANT.name)}</strong>${parts ? ' · ' + parts : ''}</div>
    ${contact ? `<div>${contact}</div>` : ''}
    ${MERCHANT.privacyOfficer ? `<div>개인정보관리책임자 ${escapeHtml(MERCHANT.privacyOfficer)}</div>` : ''}
    <div>결제 처리는 토스페이먼츠(주)를 통해 이뤄지며, 카드정보는 당사에 저장되지 않습니다.</div>
  </div>`;
}

function payInfoRows(request, branchName = '') {
  return `
  ${branchName ? `<div class="row"><span class="label">이용 매장</span><span>${escapeHtml(branchName)}</span></div>` : ''}
  ${request.customer_name ? `<div class="row"><span class="label">고객명</span><span>${escapeHtml(request.customer_name)}</span></div>` : ''}
  <div class="row"><span class="label">결제 내용</span><span>${escapeHtml(request.order_name)}</span></div>
  <div class="row"><span class="label">요청일</span><span>${escapeHtml(kstDateString(new Date(request.created_at)))}</span></div>
  <div class="amount">${Number(request.amount).toLocaleString('ko-KR')}원</div>`;
}

/** 결제 페이지에 표시할 매장명 — 실제 용역 제공처를 고객이 알 수 있어야 한다 */
async function branchNameOf(branchId) {
  try {
    const { rows } = await pool.query(
      `SELECT max(branch_name) FILTER (WHERE branch_name IS NOT NULL AND branch_name <> '') AS name
       FROM auth_users WHERE branch_id = $1`, [branchId]);
    return rows[0]?.name || '';
  } catch {
    return '';
  }
}

// ── 결제 관련 고지 페이지 (PG·카드사 심사에서 확인하는 화면) ──────
const PAY_INFO_PAGES = {
  terms: {
    title: '이용약관',
    body: `
      <h2>제1조 (목적)</h2>
      <p>본 약관은 ${escapeHtml(MERCHANT.name || '회사')}(이하 "회사")가 제공하는 결제 서비스를 이용하는 고객("이용자")과 회사의 권리·의무를 정합니다.</p>
      <h2>제2조 (서비스 내용)</h2>
      <p>회사는 제휴 피부관리실·에스테틱샵이 이용자에게 제공하는 관리 서비스 및 제품에 대한 대금을 온라인으로 결제할 수 있는 수단을 제공합니다. 결제 대상 용역의 실제 제공 주체와 내용은 각 결제 요청 화면에 표시됩니다.</p>
      <h2>제3조 (결제 수단)</h2>
      <p>신용·체크카드 및 가상계좌(무통장입금)를 지원하며, 결제 처리는 전자지급결제대행사인 토스페이먼츠(주)를 통해 이뤄집니다. 이용자의 카드정보는 회사 서버에 저장되지 않습니다.</p>
      <h2>제4조 (결제 링크의 유효기간)</h2>
      <p>결제 링크는 발급 시점부터 회사가 정한 기간(기본 72시간) 동안 유효하며, 기간이 지나면 결제할 수 없습니다. 이 경우 이용자는 해당 매장에 재발급을 요청할 수 있습니다.</p>
      <h2>제5조 (취소 및 환불)</h2>
      <p>취소·환불은 별도로 게시된 「취소·환불 규정」에 따릅니다.</p>
      <h2>제6조 (문의)</h2>
      <p>결제 및 서비스 관련 문의는 결제 대상 매장 또는 회사 대표 연락처로 하실 수 있습니다.</p>`,
  },
  privacy: {
    title: '개인정보처리방침',
    body: `
      <h2>1. 수집하는 개인정보 항목</h2>
      <ul>
        <li>결제 시: 주문번호, 결제금액, 결제수단, 결제일시, (매장이 입력한 경우) 고객 성명</li>
        <li>가상계좌 이용 시: 발급 계좌정보, 입금자명</li>
      </ul>
      <p>카드번호·유효기간 등 결제수단 정보는 토스페이먼츠(주)가 처리하며 회사는 수집·보관하지 않습니다.</p>
      <h2>2. 이용 목적</h2>
      <p>결제 처리 및 결제 결과 확인, 매출 기록 생성, 환불·분쟁 처리, 관련 법령상 기록 보존</p>
      <h2>3. 보유 및 이용 기간</h2>
      <p>전자상거래 등에서의 소비자보호에 관한 법률에 따라 대금결제 및 재화 등의 공급에 관한 기록은 5년, 소비자 불만 또는 분쟁처리에 관한 기록은 3년간 보관 후 파기합니다.</p>
      <h2>4. 제3자 제공 및 처리위탁</h2>
      <p>결제 처리를 위해 토스페이먼츠(주)에 결제 정보를 제공합니다. 그 외 이용자의 동의 없이 제3자에게 제공하지 않습니다.</p>
      <h2>5. 이용자의 권리</h2>
      <p>이용자는 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있으며, 아래 책임자에게 연락하시면 지체 없이 조치합니다.</p>
      <p>${MERCHANT.privacyOfficer ? `개인정보관리책임자: ${escapeHtml(MERCHANT.privacyOfficer)}<br>` : ''}${MERCHANT.email ? `연락처: ${escapeHtml(MERCHANT.email)}` : ''}</p>`,
  },
  refund: {
    title: '취소·환불 규정',
    body: `
      <h2>1. 서비스 이용 전 취소</h2>
      <p>결제한 관리·시술을 받기 전이라면 해당 매장에 요청하여 전액 환불받으실 수 있습니다.</p>
      <h2>2. 서비스 이용 후</h2>
      <p>이미 제공된 관리·시술 회차분은 환불 대상에서 제외되며, 잔여 회차가 있는 정액권(회수권)은 잔여분에 대해 환불이 가능합니다. 구체적인 정산 기준은 매장의 안내에 따릅니다.</p>
      <h2>3. 제품 구매</h2>
      <p>미개봉·미사용 제품은 수령일로부터 7일 이내 환불이 가능합니다. 다만 개봉하여 사용하였거나 이용자의 책임 있는 사유로 제품이 훼손된 경우에는 제한될 수 있습니다.</p>
      <h2>4. 환불 방법</h2>
      <ul>
        <li>카드결제: 카드 승인 취소로 처리되며, 카드사 사정에 따라 통상 3~5영업일이 소요됩니다.</li>
        <li>가상계좌(무통장입금): 이용자가 지정한 계좌로 환급합니다.</li>
      </ul>
      <h2>5. 환불 요청 방법</h2>
      <p>결제하신 매장에 직접 요청하시거나${MERCHANT.tel ? `, 회사 대표전화(${escapeHtml(MERCHANT.tel)})로` : ''}${MERCHANT.email ? ` 또는 ${escapeHtml(MERCHANT.email)}으로` : ''} 문의해주시기 바랍니다.</p>`,
  },
};

app.get('/pay-info/:page', payPageLimiter, (req, res) => {
  const page = PAY_INFO_PAGES[String(req.params.page)];
  if (!page) return res.status(404).send(payPageHtml('페이지 없음', '<div class="status bad">요청하신 페이지를 찾을 수 없습니다</div>'));
  res.set('Cache-Control', 'public, max-age=300');
  res.send(payPageHtml(page.title, `<h1>${escapeHtml(page.title)}</h1><div class="prose">${page.body}</div>`));
});

app.get('/pay/:id', payPageLimiter, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    if (!isUuid(String(req.params.id))) {
      return res.status(404).send(payPageHtml('결제 요청 없음', '<div class="status bad">유효하지 않은 결제 링크입니다</div>'));
    }
    const { rows } = await pool.query('SELECT * FROM payment_requests WHERE id = $1', [req.params.id]);
    const request = rows[0];
    if (!request) {
      return res.status(404).send(payPageHtml('결제 요청 없음', '<div class="status bad">결제 요청을 찾을 수 없습니다</div>'));
    }
    const branchName = await branchNameOf(request.branch_id);
    if (request.status === 'paid') {
      return res.send(payPageHtml('결제 완료', `${payInfoRows(request, branchName)}<div class="status ok">✓ 결제가 완료되었습니다</div><p class="note" style="text-align:center">이용해주셔서 감사합니다.</p>`));
    }
    if (request.status === 'canceled') {
      return res.send(payPageHtml('결제 취소됨', `${payInfoRows(request, branchName)}<div class="status bad">이 결제 요청은 취소되었습니다</div><p class="note" style="text-align:center">매장에 문의해주세요.</p>`));
    }
    if (request.status === 'vbank_wait' && request.vbank_info) {
      const vb = request.vbank_info;
      return res.send(payPageHtml('입금 대기 중', `${payInfoRows(request, branchName)}
        <div class="status wait">가상계좌 입금 대기 중</div>
        <div class="vbank-box">
          <strong>${escapeHtml(vb.bankName || vb.bank || '')} ${escapeHtml(vb.accountNumber || '')}</strong><br>
          예금주: ${escapeHtml(vb.customerName || '토스페이먼츠')}<br>
          입금 금액: ${Number(request.amount).toLocaleString('ko-KR')}원<br>
          ${vb.dueDate ? `입금 기한: ${escapeHtml(String(vb.dueDate).replace('T', ' ').slice(0, 16))}` : ''}
        </div>
        <p class="note">입금이 확인되면 자동으로 결제 완료 처리됩니다.</p>`));
    }
    if (new Date(request.expires_at).getTime() < Date.now()) {
      return res.send(payPageHtml('결제 기한 만료', `${payInfoRows(request, branchName)}<div class="status bad">결제 가능 기한이 지났습니다</div><p class="note" style="text-align:center">매장에 새 결제 링크를 요청해주세요.</p>`));
    }
    if (!PG_ENABLED) {
      return res.send(payPageHtml('결제 준비 중', `${payInfoRows(request, branchName)}<div class="status wait">온라인 결제 준비 중입니다</div><p class="note" style="text-align:center">매장에 문의해주세요.</p>`));
    }

    const failReason = typeof req.query.fail === 'string' ? req.query.fail.slice(0, 200) : '';
    const showCard = request.method === 'card' || request.method === 'both';
    const showVbank = request.method === 'vbank' || request.method === 'both';
    const body = `${payInfoRows(request, branchName)}
      ${showCard ? '<button class="btn-card" onclick="pay(\'카드\')">💳 카드로 결제하기</button>' : ''}
      ${showVbank ? '<button class="btn-vbank" onclick="pay(\'가상계좌\')">🏦 무통장입금 (가상계좌)</button>' : ''}
      <div class="err" id="err">${escapeHtml(failReason)}</div>
      <p class="note">결제 버튼을 누르면 <a href="/pay-info/terms" style="color:#64748b">이용약관</a> 및 <a href="/pay-info/refund" style="color:#64748b">취소·환불 규정</a>에 동의하는 것으로 봅니다.<br>안전한 결제를 위해 토스페이먼츠 결제창으로 연결되며, 카드정보는 매장과 더마솔루션에 저장되지 않습니다.</p>
      <script>
        var errorBox = document.getElementById('err');
        var payConfig = ${jsonForScript({
          clientKey: TOSS_CLIENT_KEY,
          amount: Number(request.amount),
          orderId: String(request.id),
          orderName: String(request.order_name),
          customerName: String(request.customer_name || ''),
          successUrl: `${PUBLIC_BASE_URL}/pay/${request.id}/success`,
          failUrl: `${PUBLIC_BASE_URL}/pay/${request.id}/fail`,
          failReason: failReason,
        })};
        if (payConfig.failReason) errorBox.style.display = 'block';
        function showError(message) {
          errorBox.textContent = message;
          errorBox.style.display = 'block';
        }
        function pay(method) {
          // 결제 SDK 로드 실패(네트워크 차단 등) 시 버튼이 아무 반응 없이 죽지 않도록 안내한다
          if (typeof TossPayments !== 'function') {
            showError('결제 모듈을 불러오지 못했습니다. 네트워크 연결을 확인한 뒤 새로고침해주세요.');
            return;
          }
          var options = {
            amount: payConfig.amount,
            orderId: payConfig.orderId,
            orderName: payConfig.orderName,
            successUrl: payConfig.successUrl,
            failUrl: payConfig.failUrl,
          };
          if (payConfig.customerName) options.customerName = payConfig.customerName;
          if (method === '가상계좌') options.validHours = 48;
          TossPayments(payConfig.clientKey).requestPayment(method, options).catch(function (error) {
            if (error && error.code === 'USER_CANCEL') return;
            showError((error && error.message) || '결제창을 열지 못했습니다.');
          });
        }
      </script>`;
    res.send(payPageHtml('결제하기 — 더마솔루션', body,
      '<script src="https://js.tosspayments.com/v1/payment"></script>'));
  } catch (error) {
    next(error);
  }
});

// 결제창 실패 리다이렉트 → 사유를 붙여 결제 페이지로 복귀
app.get('/pay/:id/fail', payPageLimiter, (req, res) => {
  const message = typeof req.query.message === 'string' ? req.query.message.slice(0, 200) : '결제가 완료되지 않았습니다.';
  res.redirect(`/pay/${encodeURIComponent(req.params.id)}?fail=${encodeURIComponent(message)}`);
});

// 결제창 성공 리다이렉트 → 서버 승인(confirm) 후 결과 표시
app.get('/pay/:id/success', payPageLimiter, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const requestId = String(req.params.id);
    const paymentKey = String(req.query.paymentKey || '');
    const orderId = String(req.query.orderId || '');
    const amount = Number(req.query.amount);
    if (!isUuid(requestId) || !paymentKey || orderId !== requestId) {
      return res.status(400).send(payPageHtml('결제 확인 실패', '<div class="status bad">결제 확인 정보가 올바르지 않습니다</div>'));
    }

    // 1) 선행 검증은 트랜잭션 없이 — 외부 PG 호출을 DB 잠금 안에서 하지 않기 위해 분리
    const { rows: preRows } = await pool.query('SELECT * FROM payment_requests WHERE id = $1', [requestId]);
    const request = preRows[0];
    if (!request) {
      return res.status(404).send(payPageHtml('결제 요청 없음', '<div class="status bad">결제 요청을 찾을 수 없습니다</div>'));
    }
    if (request.status === 'paid' || request.status === 'vbank_wait') {
      return res.redirect(`/pay/${requestId}`);
    }
    if (request.status === 'canceled') {
      return res.redirect(`/pay/${requestId}`);
    }
    if (Number(request.amount) !== amount) {
      log('warn', 'pay_amount_mismatch', { requestId, expected: Number(request.amount), got: amount });
      return res.status(400).send(payPageHtml('결제 확인 실패', '<div class="status bad">결제 금액이 일치하지 않습니다. 매장에 문의해주세요.</div>'));
    }

    // 2) 토스 승인 (DB 커넥션 점유 없이). 확정되기 전까지 어떤 상태도 바꾸지 않는다.
    let payment;
    try {
      payment = await tossApi('/v1/payments/confirm', {
        method: 'POST',
        body: { paymentKey, orderId, amount },
      });
    } catch (error) {
      if (error?.tossCode) {
        log('warn', 'pay_confirm_rejected', { requestId, tossCode: error.tossCode, message: error.message });
        return res.status(400).send(payPageHtml('결제 승인 실패',
          `<div class="status bad">결제 승인에 실패했습니다</div><p class="note" style="text-align:center">${escapeHtml(error.message)}</p>`));
      }
      if (error?.name === 'AbortError') {
        log('error', 'pay_confirm_timeout', { requestId });
        return res.status(504).send(payPageHtml('결제 확인 지연',
          '<div class="status wait">결제 확인이 지연되고 있습니다</div><p class="note" style="text-align:center">잠시 후 이 페이지를 새로고침하거나 매장에 문의해주세요. 중복 결제는 발생하지 않습니다.</p>'));
      }
      throw error;
    }

    // 3) 승인 결과를 짧은 트랜잭션으로 반영 (동시 요청은 status 조건으로 1회만 통과)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM payment_requests WHERE id = $1 FOR UPDATE', [requestId]);
      const locked = rows[0];
      if (!locked || locked.status === 'paid') {
        await client.query('ROLLBACK');
        return res.redirect(`/pay/${requestId}`);
      }

      if (payment.status === 'WAITING_FOR_DEPOSIT' && payment.virtualAccount) {
        await client.query(`
          UPDATE payment_requests
          SET status = 'vbank_wait', payment_key = $2, vbank_info = $3, vbank_secret = $4, updated_at = now()
          WHERE id = $1
        `, [requestId, paymentKey, JSON.stringify({
          bankName: payment.virtualAccount.bankCode || '',
          bank: payment.virtualAccount.bank || '',
          accountNumber: payment.virtualAccount.accountNumber || '',
          customerName: payment.virtualAccount.customerName || '',
          dueDate: payment.virtualAccount.dueDate || '',
        }), payment.secret || null]);
        await client.query('COMMIT');
        return res.redirect(`/pay/${requestId}`);
      }

      if (payment.status === 'DONE') {
        const paidMethodLabel = tossMethodLabel(payment.method);
        await client.query(`
          UPDATE payment_requests
          SET status = 'paid', payment_key = $2, paid_method = $3, paid_at = now(), updated_at = now()
          WHERE id = $1
        `, [requestId, paymentKey, paidMethodLabel]);
        await recordPaidPayment(client, locked, paidMethodLabel);
        await client.query('COMMIT');
        log('info', 'pay_completed', { requestId, branchId: locked.branch_id, amount, method: paidMethodLabel });
        return res.redirect(`/pay/${requestId}`);
      }

      await client.query('ROLLBACK');
      log('warn', 'pay_unexpected_status', { requestId, tossStatus: payment.status });
      return res.status(400).send(payPageHtml('결제 확인 필요', '<div class="status wait">결제 상태를 확인 중입니다. 매장에 문의해주세요.</div>'));
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

// 가상계좌 입금 통지 웹훅 (토스 → 서버). 본문을 신뢰하지 않고 secret 대조 + API 재조회로 검증.
// 레이트리밋은 결제 페이지와 분리한다 — 공유하면 페이지 트래픽 때문에 정상 입금 통지가 429로 유실된다.
app.post('/api/payments/webhook', webhookLimiter, async (req, res) => {
  try {
    if (!PG_ENABLED) return res.status(200).end();
    const orderId = String(req.body?.orderId || '');
    if (!isUuid(orderId)) return res.status(200).end();

    // 상태 확인·PG 재조회는 트랜잭션 밖에서 (외부 호출을 행 잠금 안에서 하지 않는다)
    const { rows: preRows } = await pool.query('SELECT * FROM payment_requests WHERE id = $1', [orderId]);
    const request = preRows[0];
    if (!request) return res.status(200).end();
    if (request.status !== 'vbank_wait') {
      // 취소된 요청에 입금이 들어오면 돈만 들어오고 기록이 없다 — 운영자가 찾을 수 있게 경보를 남긴다
      if (request.status === 'canceled') {
        log('error', 'pay_webhook_on_canceled', {
          orderId, branchId: request.branch_id, amount: Number(request.amount),
        });
      }
      return res.status(200).end();
    }
    // 1차: 웹훅 secret 대조 (가상계좌 웹훅에 포함)
    if (request.vbank_secret && req.body?.secret !== request.vbank_secret) {
      log('warn', 'pay_webhook_secret_mismatch', { orderId });
      return res.status(200).end();
    }
    // 2차: 토스 API 재조회로 상태·금액 확정 (본문 값은 신뢰하지 않는다)
    if (!request.payment_key) return res.status(200).end();
    const payment = await tossApi(`/v1/payments/${encodeURIComponent(request.payment_key)}`);
    if (payment.status !== 'DONE' || Number(payment.totalAmount) !== Number(request.amount)) {
      return res.status(200).end();
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        "SELECT * FROM payment_requests WHERE id = $1 AND status = 'vbank_wait' FOR UPDATE", [orderId]);
      const locked = rows[0];
      if (!locked) {
        await client.query('ROLLBACK');
        return res.status(200).end();
      }
      await client.query(`
        UPDATE payment_requests
        SET status = 'paid', paid_method = '계좌이체', paid_at = now(), updated_at = now()
        WHERE id = $1
      `, [orderId]);
      await recordPaidPayment(client, locked, '계좌이체');
      await client.query('COMMIT');
      log('info', 'pay_vbank_deposit', { orderId, branchId: locked.branch_id, amount: Number(locked.amount) });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      log('error', 'pay_webhook_failed', { orderId, ...errorDetails(error) });
    } finally {
      client.release();
    }
    res.status(200).end();
  } catch (error) {
    log('error', 'pay_webhook_error', errorDetails(error));
    res.status(200).end();
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
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
        await client.query(
          'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, requested_ip) VALUES ($1, $2, $3, $4, $5)',
          [crypto.randomUUID(), user.id, tokenHash(token), expiresAt, req.ip],
        );
        await client.query('COMMIT');
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {
          log('error', 'password_reset_request_rollback_failed', errorDetails(rollbackError));
        }
        throw error;
      } finally {
        client.release();
      }
      await sendPasswordResetMail(user.email, user.name, token).catch(mailError => {
        log('error', 'password_reset_mail_failed', { userId: user.id, ...errorDetails(mailError) });
      });
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
const MESSAGE_HOURLY_LIMIT = envInteger('MESSAGE_HOURLY_LIMIT', 500, 1, 100_000);
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
      signal: AbortSignal.timeout(15_000),
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
async function processSend({ authUser, type, title, content, phones, scheduledMessageId = null }) {
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

  const logRows = outcome.results.map(result => ({
    id: crypto.randomUUID(),
    phone: result.phone,
    status: result.status,
    reason: result.reason || null,
  }));
  await pool.query(`
    INSERT INTO message_send_log
      (id, branch_id, user_id, type, title, content, phone, status, reason, scheduled_message_id)
    SELECT item.id::uuid, $2::text, $3::uuid, $4::text, $5::text, $6::text,
      item.phone, item.status, item.reason, $7::uuid
    FROM jsonb_to_recordset($1::jsonb)
      AS item(id text, phone text, status text, reason text)
  `, [JSON.stringify(logRows), scope, authUser.id, type, title || null, content, scheduledMessageId]);

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
    if (!isValidText(type, { required: true, max: 50 }) ||
        !isValidText(title, { max: 200 }) || !isValidText(content, { required: true })) {
      return res.status(400).json({ error: '메시지 내용을 입력해주세요.' });
    }
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
    const phones = [...new Set(
      (Array.isArray(req.body.phones) ? req.body.phones : []).map(normalizePhone).filter(Boolean),
    )];
    if (Number.isNaN(sendAt.getTime())) return res.status(400).json({ error: '발송 시각을 확인해주세요.' });
    if (sendAt.getTime() < Date.now() + 60000) return res.status(400).json({ error: '발송 시각은 최소 1분 뒤여야 합니다.' });
    if (sendAt.getTime() > Date.now() + 30 * 86400000) return res.status(400).json({ error: '발송 예약은 30일 이내만 가능합니다.' });
    if (!isValidText(type, { required: true, max: 50 }) ||
        !isValidText(title, { max: 200 }) || !isValidText(content, { required: true })) {
      return res.status(400).json({ error: '메시지 내용을 입력해주세요.' });
    }
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
    if (!isUuid(req.params.id)) return res.status(404).json({ error: '취소할 수 있는 예약을 찾을 수 없습니다.' });
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
  // 크래시 복구: processing으로 잠긴 채 10분 넘게 방치된 잡 처리
  // (재배포·정전으로 결과 UPDATE 전에 프로세스가 죽은 경우 — 영구 고착 방지)
  // 단, 잠금 이후 발송 로그가 이미 남아 있으면(발송 완료 후 결과 기록 직전 사망)
  // pending으로 되돌리는 순간 전체 수신자에게 이중 발송된다 → 수동 확인용 실패로 종결.
  const { rowCount: finalizedStale } = await pool.query(`
    UPDATE scheduled_messages sm
    SET status = 'failed', locked_at = NULL,
        result = jsonb_build_object('error', '발송 도중 프로세스 중단 — 일부 발송됐을 수 있어 재발송하지 않음. 발송 로그를 확인하세요.')
    WHERE sm.status = 'processing' AND sm.locked_at < now() - interval '10 minutes'
      AND EXISTS (
        SELECT 1 FROM message_send_log l
        WHERE l.status = 'sent' AND (
          l.scheduled_message_id = sm.id OR (
            l.scheduled_message_id IS NULL AND l.branch_id = sm.branch_id
            AND l.content = sm.content AND l.created_at >= sm.locked_at
          )
        )
      )
  `);
  const { rowCount: recoveredStale } = await pool.query(`
    UPDATE scheduled_messages SET status = 'pending', locked_at = NULL
    WHERE status = 'processing' AND locked_at < now() - interval '10 minutes'
  `);
  if (finalizedStale || recoveredStale) {
    log('warn', 'scheduled_dispatch_stale_recovered', {
      finalized: finalizedStale,
      requeued: recoveredStale,
    });
  }

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
    try { await client.query('ROLLBACK'); } catch (rollbackError) {
      log('error', 'scheduled_dispatch_rollback_failed', errorDetails(rollbackError));
    }
    throw error;
  } finally {
    client.release();
  }

  for (const job of due) {
    try {
      const { rows: userRows } = await pool.query(
        'SELECT * FROM auth_users WHERE id = $1 AND branch_id = $2 AND is_active',
        [job.user_id, job.branch_id],
      );
      const authUser = userRows[0];
      if (!authUser) throw new Error('예약을 등록한 계정이 없거나 비활성화되었습니다.');
      const { httpStatus, body } = await processSend({
        authUser,
        type: job.type,
        title: job.title || undefined,
        content: job.content,
        phones: Array.isArray(job.phones) ? job.phones : [],
        scheduledMessageId: job.id,
      });
      if (httpStatus === 429) {
        // 시간당 한도와 겹침 — 실패 처리하지 않고 5분 뒤 재시도
        await pool.query(
          `UPDATE scheduled_messages
           SET status = 'pending', locked_at = NULL, send_at = now() + interval '5 minutes'
           WHERE id = $1`,
          [job.id]);
        continue;
      }
      if (body.sent === 0 && body.failed > 0 && job.attempt_count < 2) {
        await pool.query(
          `UPDATE scheduled_messages
           SET status = 'pending', locked_at = NULL, attempt_count = attempt_count + 1,
               result = $1, send_at = now() + ((attempt_count + 1) * interval '5 minutes')
           WHERE id = $2`,
          [JSON.stringify(body), job.id],
        );
        log('warn', 'scheduled_dispatch_requeued', { jobId: job.id, attempt: job.attempt_count + 1 });
        continue;
      }
      const status = body.error ? 'failed' : body.pending ? 'failed' : body.failed === 0 ? 'sent' : 'partial';
      await pool.query('UPDATE scheduled_messages SET result = $1, status = $2, locked_at = NULL WHERE id = $3',
        [JSON.stringify(body), status, job.id]);
    } catch (error) {
      await pool.query('UPDATE scheduled_messages SET status = $1, result = $2, locked_at = NULL WHERE id = $3',
        ['failed', JSON.stringify({ error: error?.message || '발송 처리 실패' }), job.id]);
      log('error', 'scheduled_dispatch_job_failed', { jobId: job.id, ...errorDetails(error) });
    }
  }
}

// ── 지점(계정)별 파일 백업 → NAS CRM-BACKUP ─────────────────────
// 라이브 데이터는 PostgreSQL에 있고, 매일 BACKUP_HOUR시에 지점별 폴더로
// JSON + 시술사진(jpg)을 내보낸다. File Station에서 바로 열람 가능.
// 경로: BACKUP_DIR/<지점명_지점ID8자리>/<날짜>/<컬렉션>.json, photos/...
const BACKUP_DIR = String(process.env.BACKUP_DIR || '').trim();
const BACKUP_HOUR = envInteger('BACKUP_HOUR', 4, 0, 23);
const BACKUP_KEEP_DAYS = envInteger('BACKUP_KEEP_DAYS', 14, 1, 3650);
let backupLastRunDate = '';
let backupRunPromise = null;

function sanitizeFolderName(value) {
  return String(value || '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || 'branch';
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function publishBackupDirectory(stagedDir, finalDir) {
  const previousDir = `${finalDir}.previous-${crypto.randomUUID()}`;
  const hadPrevious = await pathExists(finalDir);
  if (hadPrevious) await fs.rename(finalDir, previousDir);
  try {
    await fs.rename(stagedDir, finalDir);
  } catch (error) {
    if (hadPrevious && !(await pathExists(finalDir))) {
      await fs.rename(previousDir, finalDir).catch(restoreError => {
        log('error', 'backup_restore_failed', { finalDir, ...errorDetails(restoreError) });
      });
    }
    throw error;
  }
  if (hadPrevious) {
    await fs.rm(previousDir, { recursive: true, force: true }).catch(error => {
      log('warn', 'backup_previous_cleanup_failed', { previousDir, ...errorDetails(error) });
    });
  }
}

async function runBackup() {
  if (!BACKUP_DIR) throw new Error('BACKUP_DIR가 설정되지 않았습니다.');
  const date = isoDate(new Date());

  const { rows: branchRows } = await pool.query(`
    SELECT DISTINCT branch_id FROM crm_records
    UNION SELECT DISTINCT branch_id FROM crm_photos
    UNION SELECT DISTINCT branch_id FROM auth_users WHERE branch_id IS NOT NULL
  `);
  const { rows: userRows } = await pool.query(`
    SELECT branch_id,
      max(branch_name) FILTER (WHERE branch_name IS NOT NULL AND branch_name <> '') AS branch_name
    FROM auth_users WHERE branch_id IS NOT NULL GROUP BY branch_id
  `);
  const nameByBranch = new Map(userRows.map(u => [u.branch_id, u.branch_name]));

  let fileCount = 0;
  for (const { branch_id: branchId } of branchRows) {
    const folder = `${sanitizeFolderName(nameByBranch.get(branchId) || '')}_${sanitizeFolderName(branchId).slice(0, 8)}`;
    const branchDir = path.join(BACKUP_DIR, folder);
    const finalDateDir = path.join(branchDir, date);
    const dateDir = path.join(branchDir, `.${date}.partial-${crypto.randomUUID()}`);
    await fs.mkdir(dateDir, { recursive: true });
    try {
      // 지점당 한 번만 읽고 컬렉션별로 묶어 불필요한 반복 조회를 피한다.
      const { rows: recordRows } = await pool.query(
        'SELECT collection, data FROM crm_records WHERE branch_id = $1 ORDER BY collection, updated_at',
        [branchId],
      );
      const recordsByCollection = new Map();
      for (const row of recordRows) {
        if (!recordsByCollection.has(row.collection)) recordsByCollection.set(row.collection, []);
        recordsByCollection.get(row.collection).push(row.data);
      }
      for (const [collection, records] of recordsByCollection) {
        if (!DATA_COLLECTIONS.has(collection)) continue;
        await fs.writeFile(
          path.join(dateDir, `${collection}.json`),
          JSON.stringify(records, null, 2), 'utf8');
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

      // 시술 사진 → 이미지 파일
      const { rows: photoRows } = await pool.query(
        'SELECT entity_key, photos FROM crm_photos WHERE branch_id = $1', [branchId]);
      for (const { entity_key: entityKey, photos } of photoRows) {
        if (!Array.isArray(photos) || photos.length === 0) continue;
        const photoDir = path.join(dateDir, 'photos', sanitizeFolderName(entityKey.replace(/:/g, '_')));
        await fs.mkdir(photoDir, { recursive: true });
        for (const photo of photos) {
          const match = /^data:image\/(jpeg|png|webp|gif);base64,([a-z0-9+/=]+)$/i.exec(photo?.dataUrl || '');
          if (!match || !isValidId(photo?.id)) continue;
          const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
          await fs.writeFile(
            path.join(photoDir, `${sanitizeFolderName(photo.id)}.${ext}`),
            Buffer.from(match[2], 'base64'));
          fileCount += 1;
        }
      }

      await fs.writeFile(path.join(dateDir, '_SUCCESS.json'), JSON.stringify({ date, branchId }), 'utf8');
      await publishBackupDirectory(dateDir, finalDateDir);

      // 보존 기간 지난 날짜 폴더 정리
      try {
        const cutoff = new Date(Date.now() - BACKUP_KEEP_DAYS * 86400000).toISOString().slice(0, 10);
        const entries = await fs.readdir(branchDir);
        for (const entry of entries) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(entry) && entry < cutoff) {
            await fs.rm(path.join(branchDir, entry), { recursive: true, force: true });
          }
        }
      } catch (error) {
        log('warn', 'backup_retention_cleanup_failed', { branchId, ...errorDetails(error) });
      }
    } catch (error) {
      await fs.rm(dateDir, { recursive: true, force: true }).catch(cleanupError => {
        log('warn', 'backup_staging_cleanup_failed', { branchId, ...errorDetails(cleanupError) });
      });
      log('error', 'backup_branch_failed', { branchId, ...errorDetails(error) });
      throw error;
    }
  }

  return { branches: branchRows.length, files: fileCount, date };
}

async function runBackupOnce() {
  if (backupRunPromise) return backupRunPromise;
  backupRunPromise = runBackup().finally(() => { backupRunPromise = null; });
  return backupRunPromise;
}

async function runDailyBackup() {
  if (!BACKUP_DIR) return;
  const now = new Date();
  const today = isoDate(now);
  if (now.getHours() < BACKUP_HOUR || backupLastRunDate === today) return;
  try {
    const result = await runBackupOnce();
    backupLastRunDate = today;
    log('info', 'daily_backup_completed', { branches: result.branches, files: result.files, date: result.date });
  } catch (error) {
    log('error', 'daily_backup_failed', errorDetails(error));
  }
}

// ── 재방문 자동 리마인더 (클라이언트 reminderEngine.ts의 서버 포트) ──
// 앱이 꺼져 있어도 매일 REMINDER_HOUR시에 재방문 권장일이 지난 고객에게
// 자동 발송한다. REMINDER_ENABLED=true + 발송사 설정 시에만 실동작.
const REMINDER_ENABLED = String(process.env.REMINDER_ENABLED || 'false').toLowerCase() === 'true';
const REMINDER_HOUR = envInteger('REMINDER_HOUR', 10, 0, 23);
const REMINDER_CYCLE_DAYS = envInteger('REMINDER_CYCLE_DAYS', 28, 1, 3650);
const REMINDER_MIN_OVERDUE = envInteger('REMINDER_MIN_OVERDUE', 0, 0, 3650);
const REMINDER_COOLDOWN_DAYS = envInteger('REMINDER_COOLDOWN_DAYS', 7, 1, 3650);
let reminderLastRunDate = '';

function isoDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const upcomingCustomerIds = new Set();
  for (const reservation of reservations) {
    if (reservation?.customer_id && reservation.date >= today && reservation.status !== 'cancelled') {
      upcomingCustomerIds.add(reservation.customer_id);
    }
  }
  const latestLogByCustomer = new Map();
  for (const treatment of treatmentLogs) {
    if (!treatment?.customer_id) continue;
    const current = latestLogByCustomer.get(treatment.customer_id);
    if (!current || String(treatment.treatment_date || '') > String(current.treatment_date || '')) {
      latestLogByCustomer.set(treatment.customer_id, treatment);
    }
  }
  for (const customer of customers) {
    if (!customer?.id || String(customer.id).startsWith('sample_') || !customer.phone) continue;
    if (upcomingCustomerIds.has(customer.id)) continue;

    const lastLog = latestLogByCustomer.get(customer.id);
    const lastVisit = lastLog?.treatment_date || customer.last_visit_date || null;

    let dueDate;
    if (lastLog?.next_appointment) {
      dueDate = lastLog.next_appointment;
    } else if (lastVisit) {
      const d = new Date(`${lastVisit}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) continue;
      d.setUTCDate(d.getUTCDate() + REMINDER_CYCLE_DAYS);
      dueDate = d.toISOString().slice(0, 10);
    } else {
      continue;
    }

    const dueTime = /^\d{4}-\d{2}-\d{2}$/.test(String(dueDate))
      ? new Date(`${dueDate}T00:00:00Z`).getTime()
      : Number.NaN;
    if (!Number.isFinite(dueTime)) continue;
    const overdueDays = Math.floor((new Date(`${today}T00:00:00Z`).getTime() - dueTime) / 86400000);
    if (overdueDays < REMINDER_MIN_OVERDUE) continue;
    due.push({ customer, overdueDays });
  }
  return due.sort((a, b) => b.overdueDays - a.overdueDays);
}

async function runRevisitReminders() {
  if (!REMINDER_ENABLED) return;
  const now = new Date();
  const today = isoDate(now);
  if (now.getHours() < REMINDER_HOUR || reminderLastRunDate === today) return;

  const { rows: branchRows } = await pool.query(
    "SELECT DISTINCT branch_id FROM crm_records WHERE collection = 'customers'",
  );

  let failedBranches = 0;
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
        const result = await processSend({
          authUser: { id: null, role: 'admin', branch_id: branchId },
          type: 'revisit-reminder',
          content,
          phones: [customer.phone],
        });
        if (result.httpStatus !== 200 || result.body.error) {
          throw new Error(result.body.error || `리마인더 발송 응답 오류: ${result.httpStatus}`);
        }
      }
      log('info', 'revisit_reminder_branch_completed', { branchId, targets: targets.length });
    } catch (error) {
      failedBranches += 1;
      log('error', 'revisit_reminder_branch_failed', { branchId, ...errorDetails(error) });
    }
  }
  if (failedBranches > 0) throw new Error(`재방문 리마인더 ${failedBranches}개 지점 처리 실패`);
  reminderLastRunDate = today;
}

// ── CRM 데이터 저장 API (사용 데이터가 NAS에 쌓이는 지점) ────────
// 클라이언트 store.ts가 Supabase 대신 이 API로 동기화한다. 행 형식은
// 클라이언트 toDb*()가 만드는 snake_case 행 그대로를 JSONB로 저장한다.
const DATA_COLLECTIONS = new Set([
  'customers', 'programs', 'customer_programs', 'treatment_logs',
  'products', 'product_sales', 'payments', 'staff', 'services',
  'reservations', 'shop_settings', 'message_templates', 'message_history',
  'consultations', 'expenses',
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
    const { rows } = await pool.query(
      'SELECT data FROM crm_records WHERE branch_id = $1 AND collection = $2 ORDER BY updated_at',
      [scope, req.params.collection],
    );
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
    if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row) || !isValidId(row.id))) {
      return res.status(400).json({ error: '각 행의 식별자를 확인해주세요.' });
    }
    const scope = branchScopeOf(req.authUser);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        const id = row.id.trim();
        // 세션 스코프를 강제해 다른 지점 데이터를 덮어쓰지 못하게 한다.
        await client.query(`
          INSERT INTO crm_records (branch_id, collection, id, data, updated_at)
          VALUES ($1, $2, $3, $4, now())
          ON CONFLICT (branch_id, collection, id)
          DO UPDATE SET data = EXCLUDED.data, updated_at = now()
        `, [scope, req.params.collection, id, row]);
      }
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        log('error', 'crm_bulk_upsert_rollback_failed', errorDetails(rollbackError));
      }
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
    if (Object.keys(updates).length === 0 ||
        (updates.id !== undefined && String(updates.id) !== String(req.params.id))) {
      return res.status(400).json({ error: '변경 내용을 확인해주세요.' });
    }
    const scope = branchScopeOf(req.authUser);
    const { rowCount } = await pool.query(
      'UPDATE crm_records SET data = data || $1::jsonb, updated_at = now() WHERE branch_id = $2 AND collection = $3 AND id = $4',
      [updates, scope, req.params.collection, req.params.id],
    );
    if (rowCount === 0) return res.status(404).json({ error: '대상 데이터를 찾을 수 없습니다.' });
    res.json({ updated: rowCount });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/data/:collection/:id', requireSession, requireCollection, async (req, res, next) => {
  try {
    const scope = branchScopeOf(req.authUser);
    await pool.query(
      'DELETE FROM crm_records WHERE branch_id = $1 AND collection = $2 AND id = $3',
      [scope, req.params.collection, req.params.id],
    );
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
    if (!isValidId(req.params.entityKey)) return res.status(400).json({ error: '사진 식별자를 확인해주세요.' });
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
    const inputKeys = Array.isArray(req.body.keys) ? req.body.keys : [];
    if (inputKeys.length > 500 || inputKeys.some(key => !isValidId(key))) {
      return res.status(400).json({ error: '조회할 키가 없습니다.' });
    }
    const keys = [...new Set(inputKeys.map(key => key.trim()))];
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
    if (!isValidId(req.params.entityKey)) return res.status(400).json({ error: '사진 식별자를 확인해주세요.' });
    if (photos.length > 100) return res.status(400).json({ error: '엔티티당 사진은 100장까지만 저장할 수 있습니다.' });
    if (photos.some(photo => !photo || typeof photo !== 'object' || Array.isArray(photo) ||
        !isValidId(photo.id) || typeof photo.dataUrl !== 'string' ||
        !/^data:image\/(jpeg|png|webp|gif);base64,/i.test(photo.dataUrl) ||
        photo.dataUrl.length > 7 * 1024 * 1024)) {
      return res.status(400).json({ error: '사진 데이터 형식을 확인해주세요.' });
    }
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

app.use('/api', (_req, res) => {
  res.status(404).json({ error: '요청한 API를 찾을 수 없습니다.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error?.type === 'entity.parse.failed' ? 400
    : error?.type === 'entity.too.large' ? 413
      : error?.message === '허용되지 않은 요청입니다.' ? 403
        : 500;
  log(status >= 500 ? 'error' : 'warn', 'http_request_failed', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status,
    ...errorDetails(error),
  });
  const message = status === 400 ? '요청 본문 형식을 확인해주세요.'
    : status === 413 ? '요청 데이터가 너무 큽니다.'
      : status === 403 ? '허용되지 않은 요청입니다.'
        : '서버 처리 중 문제가 발생했습니다.';
  res.status(status).json({ error: message });
});

const runningTasks = new Set();

function runExclusive(taskName, task) {
  if (runningTasks.has(taskName)) {
    log('warn', 'scheduled_task_overlap_skipped', { task: taskName });
    return;
  }
  runningTasks.add(taskName);
  Promise.resolve()
    .then(task)
    .catch(error => log('error', 'scheduled_task_failed', { task: taskName, ...errorDetails(error) }))
    .finally(() => runningTasks.delete(taskName));
}

pool.on('error', error => log('error', 'postgres_pool_error', errorDetails(error)));

initializeDatabase()
  .then(async () => {
    await bootstrapSuperadmin();
    await cleanupExpired();
    setInterval(() => runExclusive('cleanup', cleanupExpired), 24 * 60 * 60 * 1000).unref();
    setInterval(() => runExclusive('dispatch', dispatchScheduledMessages), 60 * 1000).unref();
    setInterval(() => runExclusive('reminder', runRevisitReminders), 10 * 60 * 1000).unref();
    setInterval(() => runExclusive('backup', runDailyBackup), 10 * 60 * 1000).unref();
    if (process.env.SMTP_HOST) {
      await smtp.verify().catch(error => log('error', 'smtp_verify_failed', errorDetails(error)));
    }
    app.listen(PORT, '0.0.0.0', () => {
      log('info', 'server_listening', { port: PORT });
      runExclusive('dispatch', dispatchScheduledMessages);
      runExclusive('reminder', runRevisitReminders);
      runExclusive('backup', runDailyBackup);
    });
  })
  .catch(error => {
    log('error', 'server_startup_failed', errorDetails(error));
    process.exit(1);
  });
