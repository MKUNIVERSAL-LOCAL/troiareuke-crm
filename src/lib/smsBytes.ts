/**
 * 문자 길이 규격 — SMS 90바이트, LMS 2,000바이트. 한글·전각(비ASCII)은 2바이트, 영문·숫자·기호는 1바이트(EUC-KR 기준).
 * 발송 화면의 카운터·자동 LMS 전환·비용 추정이 전부 이 함수를 쓴다 (UX 점검 2026-11-19, 96에서 순수 모듈로 분리·단위 검증).
 */
export const SMS_BYTE_LIMIT = 90;
export const LMS_BYTE_LIMIT = 2000;
export function smsBytes(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return n;
}
