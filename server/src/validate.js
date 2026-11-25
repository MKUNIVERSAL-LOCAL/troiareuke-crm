// 입력 검증·마스킹 순수 함수 (225, GAP Q-3 "서버 테스트 0건")
// server.js 안에 있던 정의를 그대로 옮겼다 — 동작 변경 없음. 순수 함수라 DB·네트워크 없이 테스트할 수 있다.
// 테스트: node --test server/src (server/src/validate.test.js), 릴리스 게이트 release:checks 에 포함.

export const MAX_TEXT_LENGTH = 10_000;
export const MAX_ID_LENGTH = 200;
/**
 * 이메일 최대 길이 (230, 리뷰 L-4) — RFC 5321 한도(local 64 + @ + domain 255 = 320)보다 보수적인 실무 값.
 * 한도가 없으면 3000자 이메일이 가입 검증을 통과해 Postgres 인덱스 한도(2704B)에서 터지고, 사용자는 400 대신 500 을 본다.
 */
export const MAX_EMAIL_LENGTH = 254;

/** 로그·어드민 화면용 이메일 가림 — 'abcd@x.com' → 'ab***@x.com' */
export function maskEmail(value) {
  if (!value || !value.includes('@')) return value || null;
  const [local, domain] = value.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isEmail(value) {
  if (typeof value !== 'string' || value.length > MAX_EMAIL_LENGTH) return false; // 230: 길이 먼저 (DB 인덱스 한도에서 500 이 나던 경로)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isStrongPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export function isValidId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_ID_LENGTH;
}

export function isValidBranchId(value) {
  return isValidId(value) && /^[a-z0-9._:-]+$/i.test(value);
}

export function isValidText(value, { required = false, max = MAX_TEXT_LENGTH } = {}) {
  if (value === undefined || value === null) return !required;
  if (typeof value !== 'string' || value.length > max) return false;
  // U+FFFD(치환 문자)는 인코딩이 깨진 입력의 흔적 — 저장하면 어드민 화면에 '�'로 보인다 (2026-09-22 실측: CP949 클라이언트)
  // 정상 클라이언트(브라우저 fetch)는 항상 UTF-8이라 이 문자를 만들지 않는다.
  if (value.includes('�')) return false;
  return !required || value.trim().length > 0;
}

// ── 기능 플래그 (본사 → 전 지점 원격 기능 제어, 219 의 PIN 초기화 라우트도 같은 스코프 규칙) (226) ──
export const FLAG_SCOPE_RE = /^[A-Za-z0-9_:-]{1,64}$/; // 'global' 또는 branch_id
export const FLAG_KEY_RE = /^[A-Za-z0-9_.-]{1,64}$/;
/**
 * 기능 id 로 쓸 수 없는 이름 (230, 리뷰 L-5) — 객체 키로 다루는 순간 값이 사라지거나 프로토타입을 건드린다.
 * 전에는 '__proto__' 가 FLAG_KEY_RE 를 통과해 out['__proto__'] = true 가 setter 로 흘러
 * 서버가 200 + flags:{} 로 응답했다(저장된 것이 없는데 성공 — 가짜 성공).
 */
export const RESERVED_FLAG_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * 어드민이 보낸 flags 입력 검증 — 통과하면 { value }, 아니면 { error }.
 * 값은 boolean 만 받는다(타임스탬프 같은 다른 값을 섞으면 어드민 화면·지점 병합 규칙이 깨진다 — 219 는 그래서 별도 컬럼을 썼다).
 */
export function validateFlagsInput(body) {
  const flags = body?.flags;
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) {
    return { error: 'flags 객체가 필요합니다.' };
  }
  const entries = Object.entries(flags);
  if (entries.length > 100) return { error: '기능 항목이 너무 많습니다. (100개 이하)' };
  const out = Object.create(null); // 예약어가 들어와도 프로토타입을 건드리지 않게
  for (const [key, value] of entries) {
    if (!FLAG_KEY_RE.test(key)) return { error: `기능 id 형식이 올바르지 않습니다: ${key.slice(0, 80)}` };
    if (RESERVED_FLAG_KEYS.has(key)) return { error: `기능 id 로 쓸 수 없는 이름입니다: ${key}` };
    if (typeof value !== 'boolean') return { error: `기능 값은 true/false여야 합니다: ${key}` };
    out[key] = value;
  }
  return { value: { ...out } }; // 평범한 객체로 돌려준다(JSON 응답·전개에 그대로 쓰인다)
}

// ── 프로그램 버전 헤더 (클라이언트가 매 요청에 X-App-Version 으로 보낸다 — 구버전 지점 추적) (227) ──
export const APP_VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}([-.][0-9A-Za-z.-]{0,20})?$/;
