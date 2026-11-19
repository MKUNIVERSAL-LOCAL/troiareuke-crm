import { test, expect } from '@playwright/test';
import { formatPrice, formatWon, formatPhoneInput, matchesSearch, parseISODate, formatDateTime, formatLocalDate, localISODate, formatDate } from '../src/lib/format';
import { countPaymentUnits } from '../src/lib/paymentCount';
import { parseTags } from '../src/lib/customerTags';
import { readableTextOn } from '../src/lib/color';
import { smsBytes, SMS_BYTE_LIMIT } from '../src/lib/smsBytes';

// 저장소·DOM 의존이 없는 순수 helper를 브라우저 없이 직접 검증 (95, 2026-11-20 — 커버리지 감사 B).
// 날짜 입력은 로컬 Date로 만들어 러너 시간대와 무관하게 같은 답이 나오게 한다.

test('금액·전화·날짜 표기 helper', () => {
  expect(formatPrice(12000)).toBe('12,000원');
  expect(formatPrice(-5000)).toBe('-5,000원'); // 환불 행도 깨지지 않는다
  expect(formatWon(99999)).toBe('99,999원');
  expect(formatWon(100000)).toBe('10만원');
  expect(formatWon(123456)).toBe('12.3만원');
  expect(formatPhoneInput('01012345678')).toBe('010-1234-5678');
  expect(formatPhoneInput('0212345678')).toBe('02-1234-5678'); // 서울 02는 2-4-4
  expect(formatPhoneInput('+821012345678')).toBe('+821012345678'); // 국제번호는 손대지 않는다
  expect(formatDate('2026-11-20')).toBe('2026.11.20');
  expect(formatDate(undefined)).toBe('-');
  expect(parseISODate('2026-11-20').getDate()).toBe(20); // 로컬 자정 — UTC로 읽어 전날이 되지 않는다
  const local = new Date(2026, 10, 19, 18, 5);
  expect(formatDateTime(local.toISOString())).toBe('2026.11.19 18:05');
  expect(formatLocalDate(local.toISOString())).toBe('2026.11.19');
  expect(localISODate(local.toISOString())).toBe('2026-11-19');
  expect(formatDateTime(null)).toBe('-');
  expect(formatDateTime('garbage')).toBe('garbage'); // 못 읽으면 원문
  expect(localISODate('')).toBe('');
});

test('검색 매칭 — 초성·전화 뒷자리·빈 검색', () => {
  expect(matchesSearch('ㅌㅅㅌ', ['테스트'])).toBe(true);
  expect(matchesSearch('1234', ['010-9999-1234'])).toBe(true);
  expect(matchesSearch('', [])).toBe(true);
  expect(matchesSearch('없음', ['테스트', undefined, null])).toBe(false);
});

test('결제 건수 — 분할 결제는 1건, 빈 referenceId는 각각', () => {
  expect(countPaymentUnits([{ id: 'a', referenceId: 'r' }, { id: 'b', referenceId: 'r' }])).toBe(1);
  expect(countPaymentUnits([{ id: 'a', referenceId: '' }, { id: 'b', referenceId: '' }])).toBe(2);
  expect(countPaymentUnits([{ id: 'a' }, { id: 'b', referenceId: undefined }])).toBe(2);
  expect(countPaymentUnits([])).toBe(0);
});

test('고객 태그 파싱 — #·공백·중복·상한', () => {
  expect(parseTags(' #vip, 민감성,민감성\n#vip ')).toEqual(['vip', '민감성']);
  expect(parseTags(Array.from({ length: 12 }, (_, i) => `t${i}`).join(','))).toHaveLength(10);
  expect(parseTags('가'.repeat(25))[0]).toHaveLength(20);
  expect(parseTags(null)).toEqual([]);
});

test('배경색 위 글자색 — 대비 높은 쪽', () => {
  expect(readableTextOn('#8B5CF6')).toBe('#000000');
  expect(readableTextOn('#1e293b')).toBe('#ffffff');
  expect(readableTextOn('nope')).toBe('#ffffff'); // 형식이 틀리면 대비가 둘 다 1 → 동률은 흰색
});

test('문자 바이트 — 한글 2바이트, 영문 1바이트, 90바이트 넘으면 LMS', () => {
  expect(smsBytes('abc 123')).toBe(7);
  expect(smsBytes('가'.repeat(45))).toBe(90);
  expect(smsBytes('가'.repeat(45)) > SMS_BYTE_LIMIT).toBe(false);
  expect(smsBytes('가'.repeat(46))).toBe(92);
  expect(smsBytes('가'.repeat(46)) > SMS_BYTE_LIMIT).toBe(true);
  expect(smsBytes('[샵] 홍길동님, 11/20 10:00 예약입니다.')).toBe(38); // 한글 10자(20) + 영숫자·기호 18자
  expect(smsBytes('')).toBe(0);
});
