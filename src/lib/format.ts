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
