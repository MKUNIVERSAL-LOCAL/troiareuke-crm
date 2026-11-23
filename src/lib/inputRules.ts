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
