// 입력 검증·마스킹 순수 함수 (225, GAP Q-3 "서버 테스트 0건")
// server.js 안에 있던 정의를 그대로 옮겼다 — 동작 변경 없음. 순수 함수라 DB·네트워크 없이 테스트할 수 있다.
// 테스트: node --test server/src (server/src/validate.test.js), 릴리스 게이트 release:checks 에 포함.

export const MAX_TEXT_LENGTH = 10_000;
export const MAX_ID_LENGTH = 200;

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
