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
