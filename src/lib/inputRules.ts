// inputRules — 폼·엑셀 입력의 공용 해석 규칙 (비코어, 14차 점검 2026-11-23)
// 금액은 결제·지출·제품·판매·회차권 다섯 폼이 각자 parseInt 로 읽어 "50 000"→50원, "1e5"→1원 같은 조용한 자릿수 손실이 났고,
// 전화는 추가·수정·업로드·병합이 각자 숫자만 뽑아 +82 번호가 중복 검사를 통과했다. 날짜는 비워도 저장돼 1900년 만료일·매출 누락이 생겼다.
import { parseISODate } from './format';

/** "50,000" · "50 000" · "₩50,000" · "50000원" → 50000. 소수·음수·지수·문자가 섞이면 null(조용히 자르지 않는다) */
export function parseAmount(raw: string | number | null | undefined): number | null {
  const s = String(raw ?? '').replace(/[\s,₩원]/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** 수량·회차·일수 — 양의 정수만 */
export function parseCount(raw: string | number | null | undefined): number | null {
  const n = parseAmount(raw);
  return n !== null && n >= 1 ? n : null;
}

/** 전화번호 비교 키 — +82 10-… → 01012345678, 그 외 숫자만. 추가·수정·업로드·병합·발송이 같은 키로 중복을 본다 */
export function normalizePhone(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  const digits = t.replace(/\D/g, '');
  if (t.startsWith('+82') || digits.startsWith('82') && t.startsWith('+')) return '0' + digits.slice(2);
  return digits;
}

/** 'YYYY-MM-DD' 이고 실제 존재하는 날짜인가 — 비움·'2026/11/23'·'NaN-NaN-NaN' 은 false */
export function isISODate(s: string | null | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return !Number.isNaN(d.getTime()) && d.getMonth() + 1 === Number(s.slice(5, 7)) && d.getDate() === Number(s.slice(8, 10));
}

export const DATE_REQUIRED_MESSAGE = '날짜를 YYYY-MM-DD 형식으로 선택해주세요.';

/** 엑셀 셀의 날짜를 'YYYY-MM-DD' 로 — 'YYYY-MM-DD'·'YYYY/MM/DD'·'YYYY.MM.DD'·'YYYY년 M월 D일'·엑셀 시리얼(1~2958465 = 1900~9999년). 못 읽으면 '' (조용히 원문을 저장하면 생일 알림에서 영구 제외됐다, 14차 #M3) */
export function coerceISODate(raw: string | number | null | undefined): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= 2958465) { // 엑셀 1900 체계 시리얼 — 1900-01-01 = 1 (UTC 산술은 시리얼 변환에 맞다)
      const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
      return d.toISOString().slice(0, 10);
    }
    if (/^\d{8}$/.test(t)) { const iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`; return isISODate(iso) ? iso : ''; }
    return '';
  }
  const m = t.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/);
  if (!m) return '';
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isISODate(iso) ? iso : '';
}

/** 소요시간 셀 → 분. '60'·'90분'·'1.5시간'·'1h' 모두 받고, 못 읽으면 null (단위를 떼고 숫자만 남기면 '1.5시간'이 15분이 됐다, 14차 #M12) */
export function parseDurationMinutes(raw: string | number | null | undefined): number | null {
  const t = String(raw ?? '').trim().toLowerCase();
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(시간|h|hr|분|m|min)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const minutes = /^(시간|h|hr)$/.test(m[2] || '') ? n * 60 : n;
  const r = Math.round(minutes);
  return r >= 1 ? r : null;
}
