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
  const d = value.replace(/D/g, '').slice(0, 11);
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

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 이번 달 "YYYY-MM" — 로컬 기준 (월 필터 기본값 등) */
export function thisYearMonthISO(): string {
  return todayISO().substring(0, 7);
}
