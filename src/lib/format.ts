// 공통 포맷 유틸 (비코어) — 페이지 전반의 중복 포맷 함수를 한 곳으로.
// 코어(store/supabase 등) 아님. 자유롭게 추가·수정 가능.

/**
 * 지난달(YYYY-MM) — 못 읽으면 그대로 돌려준다(없는 달을 만들지 않는다).
 * 319: 같은 규칙이 `cancelReasonRule` 과 새 `ai/usageSummaryRule` 두 곳에 생길 자리였다.
 * 판정·계산을 두 벌로 두지 않는다(286 이 되읽기 판정 네 벌을 한 곳으로 모은 뜻과 같다).
 */
export function previousMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return yearMonth;
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** 숫자를 한국 원화 표기로. 예: 12000 → "12,000원" */
export function formatPrice(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

/** ISO 날짜 문자열을 "YYYY.MM.DD" 로. 없으면 "-" */
/** 카드용 짧은 금액 — 10만원 미만은 "48,000원", 이상은 "12.3만원"(반올림으로 "0만원"이 되던 것 방지, 3차 UX 점검 2026-11-19) */
/** 차트용 만원 환산 — 소수 1자리. Math.round(/10000) 은 4만 8천 원을 5, 4천 원을 0으로 보였다(작은 매장 하루 1건이 사라짐) (10차 숫자 점검 #L2) */
export function toManwon(n: number, digits = 1): number {
  const k = 10 ** digits;
  return Math.round((n / 10000) * k) / k;
}

export function formatWon(n: number): string {
  if (Math.abs(n) < 100000) return `${n.toLocaleString('ko-KR')}원`;
  return `${(n / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만원`;
}

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
/** 날짜+시각 — "2026.11.20 15:00". ISO·Date 문자열을 받고, 못 읽으면 원문 (6차 UX 감사 2026-11-20: 화면마다 toLocaleString 꼴이 달랐음) */
export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** ISO 시각(UTC)을 이 기기의 날짜로 — "2026-11-19T18:00:00Z"는 KST에서 11-20. slice(0,10)은 UTC 날짜라 저녁 시각에 하루 어긋난다 (리뷰 2026-11-20) */
export function formatLocalDate(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return isNaN(d.getTime()) ? formatDate(value) : formatDate(toISODate(d));
}

/** ISO 시각(UTC)을 이 기기 날짜의 "YYYY-MM-DD"로 — 내보내기 시트는 날짜 열을 ISO 꼴로 쓰므로 등록일도 같은 표기(단, UTC 날짜가 아닌 로컬 날짜) (리뷰 2026-11-20) */
export function localISODate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : toISODate(d);
}

export function formatPhoneInput(value: string): string {
  if (!value || value.trim().startsWith('+')) return value;
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.startsWith('02')) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return d.slice(0, 2) + '-' + d.slice(2);
    if (d.length <= 9) return d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5);
    return d.slice(0, 2) + '-' + d.slice(2, 6) + '-' + d.slice(6, 10);
  }
  // 대표번호(1588·1544·1600·1800 등 8자리) — 1588-1234. 일반 분기로는 158-812-34 가 됐다 (리뷰 2026-11-20)
  if (/^1[5-9]\d{2}/.test(d) && d.length <= 8) return d.length <= 4 ? d : d.slice(0, 4) + '-' + d.slice(4);
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
  const digitsOnly = /^[\d\s-]+$/.test(q); // '010 1234' 붙여넣기도 숫자 검색으로 (14차 #L3)
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
  if (Number.isNaN(d.getTime())) return ''; // Invalid Date 가 "NaN-NaN-NaN" 으로 저장되지 않게 (14차 #H2)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** "YYYY-MM-DD" → 로컬 자정 Date. new Date('YYYY-MM-DD')는 UTC 자정으로 해석돼 시간대에 따라 하루 어긋난다 */
export function parseISODate(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}/.test(s || '')) return new Date(NaN); // '' 는 1900-01-01, '2026/11/23' 은 NaN 연도가 되던 것 — 호출자가 isNaN 으로 판별 (14차 #H2)
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** 이번 달 "YYYY-MM" — 로컬 기준 (월 필터 기본값 등) */
export function thisYearMonthISO(): string {
  return todayISO().substring(0, 7);
}
