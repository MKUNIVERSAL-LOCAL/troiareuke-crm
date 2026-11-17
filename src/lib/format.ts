// 공통 포맷 유틸 (비코어) — 페이지 전반의 중복 포맷 함수를 한 곳으로.
// 코어(store/supabase 등) 아님. 자유롭게 추가·수정 가능.

/** 숫자를 한국 원화 표기로. 예: 12000 → "12,000원" */
export function formatPrice(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

/** ISO 날짜 문자열을 "YYYY.MM.DD" 로. 없으면 "-" */
export function formatDate(d?: string): string {
  if (!d) return '-';
  return d.replace(/-/g, '.').substring(0, 10);
}

/** 오늘 날짜 "YYYY-MM-DD" (date input 기본값 등) — 로컬(KST) 기준.
 *  toISOString()은 UTC라 자정~오전 9시(KST)에 전날로 어긋나는 버그가 있어 로컬 계산 사용. */
/**
 * 전화번호 입력 자동 하이픈 — 숫자만 받아 010-1234-5678 / 02-123-4567 형태로. 국제번호(+)는 손대지 않는다.
 * 고객·직원·가입·샵 전화 입력에 공통 적용 (2026-11-17).
 */
export function formatPhoneInput(value: string): string {
  if (!value || value.trim().startsWith('+')) return value;
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.startsWith('02')) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return d.slice(0, 2) + '-' + d.slice(2);
    if (d.length <= 9) return d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5);
    return d.slice(0, 2) + '-' + d.slice(2, 6) + '-' + d.slice(6, 10);
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return d.slice(0, 3) + '-' + d.slice(3);
  if (d.length <= 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
}

const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
/** 한글 음절 → 초성 (그 외 문자는 그대로) */
function toChosung(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out += code >= 0xac00 && code <= 0xd7a3 ? CHOSUNG[Math.floor((code - 0xac00) / 588)] : ch;
  }
  return out;
}

/**
 * 고객·시술 검색 공통 매칭 (2026-11-17)
 *  - 일반: 대소문자 무시 부분 일치
 *  - 숫자만 입력: 전화번호의 하이픈을 무시하고 일치 (뒷자리 4자리 검색)
 *  - 초성만 입력(ㅌㅅㅌ): 이름 초성 일치
 */
export function matchesSearch(query: string, fields: Array<string | undefined | null>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digitsOnly = /^[\d-]+$/.test(q);
  const chosungOnly = /^[ㄱ-ㅎ]+$/.test(q);
  const qDigits = q.replace(/\D/g, '');
  for (const raw of fields) {
    if (!raw) continue;
    const f = String(raw).toLowerCase();
    if (f.includes(q)) return true;
    if (digitsOnly && qDigits && f.replace(/\D/g, '').includes(qDigits)) return true;
    if (chosungOnly && toChosung(f).includes(q)) return true;
  }
  return false;
}

/** Date → "YYYY-MM-DD" 로컬 기준. toISOString()은 UTC라 한국 새벽 0~9시에 전날로 잡힌다 — 날짜 기본값·기간 계산은 이것을 쓴다 (2026-11-18) */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** 이번 달 "YYYY-MM" — 로컬 기준 (월 필터 기본값 등) */
export function thisYearMonthISO(): string {
  return todayISO().substring(0, 7);
}
