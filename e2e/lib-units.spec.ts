import { test, expect } from '@playwright/test';
import { formatPrice, formatWon, formatPhoneInput, matchesSearch, parseISODate, formatDateTime, formatLocalDate, localISODate, formatDate, toManwon, toISODate } from '../src/lib/format';
import { splitPercent } from '../src/lib/percent';
import { countPaymentUnits } from '../src/lib/paymentCount';
import { parseTags } from '../src/lib/customerTags';
import { readableTextOn } from '../src/lib/color';
import { smsBytes, SMS_BYTE_LIMIT } from '../src/lib/smsBytes';
import { sanitizeStorageSnapshot } from '../src/lib/backupSanitize';
import { computeRevisitDue, daysBetween, addDays } from '../src/lib/revisitRule';
import { nextBirthday } from '../src/lib/birthdayRule';
import { summarizeDailyClose, formatDailyCloseMessage } from '../src/lib/dailyCloseSummary';
import { tagRefund, refundedOn, memoWithoutRefundTag } from '../src/lib/refundDate';
import { statsFor } from '../src/lib/customerStatsRule';
import { isLowStock } from '../src/lib/stockRule';
import { isCountableCustomer } from '../src/lib/customerScope';
import { growthPct } from '../src/lib/growth';
import { canceledSaleIds } from '../src/lib/saleCancel';
import { parseAmount, parseCount, normalizePhone, isISODate, coerceISODate, parseDurationMinutes } from '../src/lib/inputRules';
import { josa } from '../src/lib/josa';
import { personalCycleDays, resolveVisitCycle } from '../src/lib/visitCycleRule';
import { buildStatsIndex } from '../src/lib/customerStatsRule';
import { buildUsedSessionsIndex, derivedUsedSessions, remainingSessions, sessionsDrift } from '../src/lib/programSessionsRule';

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
  expect(formatPhoneInput('15881234')).toBe('1588-1234'); // 대표번호 8자리 (리뷰 2026-11-20)
  expect(formatPhoneInput('1588')).toBe('1588');
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

test('Electron 백업 스냅샷 — AI 키·토큰·게이트웨이 키·앱 잠금·로컬 계정은 빼고 settings.smsApiKey만 지운다', () => {
  // 96의 smoke 검증은 백업 파일(crm_<shop>_* 만 모음) 경로였고, 이쪽은 localStorage 전체를 그대로 내보내는 Electron '지금 백업' 경로 (리뷰 97)
  const out = sanitizeStorageSnapshot({
    ai_key_openai: 'sk-SECRET1', ai_key_gemini: 'g-SECRET2',
    troiareuke_local_users: '[{"password":"SECRET3"}]', troiareuke_auth_token: 'SECRET4', troiareuke_auth_user: '{"id":"SECRET5"}',
    google_calendar_token: 'ya29.SECRET6', google_calendar_token_expiry: '1', crm_sms_gateway_key: 'gw-SECRET7', crm_app_lock: '{"pin":"SECRET8"}',
    crm_shop1_settings: JSON.stringify({ shopName: '샵', smsApiKey: 'sms-SECRET9', smsSenderNumber: '0212345678' }),
    crm_shop1_customers: '[{"name":"홍길동"}]',
    crm_shop1_broken_settings: 'not-json',
  });
  expect(Object.keys(out).sort()).toEqual(['crm_shop1_broken_settings', 'crm_shop1_customers', 'crm_shop1_settings']);
  expect(JSON.parse(out.crm_shop1_settings)).toEqual({ shopName: '샵', smsSenderNumber: '0212345678' }); // 발신번호 등 나머지는 남는다
  expect(out.crm_shop1_customers).toBe('[{"name":"홍길동"}]');
  expect(out.crm_shop1_broken_settings).toBe('not-json'); // JSON이 아니면 원문 유지
  expect(JSON.stringify(out)).not.toContain('SECRET'); // 비밀값 9개 어느 것도 남지 않는다
});

test('재방문 기준일 — 권장일 우선, 권장일 뒤 방문은 소화, 시술일·방문일 중 나중 + 주기, 이력 없으면 없음', () => {
  // 권장일이 있고 그 뒤에 다녀가지 않았으면 권장일
  expect(computeRevisitDue({ lastTreatmentDate: '2026-11-01', nextAppointment: '2026-11-29', cycleDays: 28 })).toEqual({ lastVisit: '2026-11-01', dueDate: '2026-11-29', basis: 'recommended' });
  // 권장일 당일 또는 그 뒤에 예약 완료로 다녀갔으면(시술 기록 없음) 권장일은 소화됨 → 마지막 방문 + 주기
  expect(computeRevisitDue({ lastTreatmentDate: '2026-11-01', nextAppointment: '2026-11-29', lastVisitDate: '2026-11-29', cycleDays: 28 })).toEqual({ lastVisit: '2026-11-29', dueDate: '2026-12-27', basis: 'cycle' });
  // 권장일 전에 다녀간 방문은 권장일을 바꾸지 않는다
  expect(computeRevisitDue({ lastTreatmentDate: '2026-11-01', nextAppointment: '2026-11-29', lastVisitDate: '2026-11-15', cycleDays: 28 })?.dueDate).toBe('2026-11-29');
  // 권장일 없음 → 시술일·방문일 중 나중 날짜 + 주기(설정값)
  expect(computeRevisitDue({ lastTreatmentDate: '2026-10-05', lastVisitDate: '2026-10-20', cycleDays: 14 })).toEqual({ lastVisit: '2026-10-20', dueDate: '2026-11-03', basis: 'cycle' });
  expect(computeRevisitDue({ lastVisitDate: '2026-12-20', cycleDays: 28 })?.dueDate).toBe('2027-01-17'); // 연말을 넘어도 날짜가 맞다
  // 방문 이력이 전혀 없으면 대상 아님
  expect(computeRevisitDue({ cycleDays: 28 })).toBeNull();
  expect(computeRevisitDue({ nextAppointment: '2026-12-01', cycleDays: 28 })?.basis).toBe('recommended'); // 시술 기록의 권장일만 있어도 잡힌다
  // 날짜 산술은 로컬 자정 기준 — 지난 날이면 양수(지남), 남았으면 음수
  expect(daysBetween('2026-11-10', '2026-11-20')).toBe(10);
  expect(daysBetween('2026-11-20', '2026-11-10')).toBe(-10);
  expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // 윤년
});

test('생일 임박 — 연말·연초 경계, 2/29 평년 처리, 오늘, 형식 불량·없는 날짜', () => {
  const dec30 = new Date(2026, 11, 30);
  expect(nextBirthday('1990-12-30', dec30)).toEqual({ daysUntil: 0, dateLabel: '12/30' });  // 오늘
  expect(nextBirthday('1990-01-03', dec30)).toEqual({ daysUntil: 4, dateLabel: '1/3' });    // 해를 넘어 4일 뒤
  expect(nextBirthday('1990-12-29', dec30)?.daysUntil).toBe(364);                           // 어제 지났으면 내년
  expect(nextBirthday('1988-02-29', new Date(2027, 1, 1))).toEqual({ daysUntil: 27, dateLabel: '2/29' }); // 평년 → 2/28에 축하, 표시는 2/29
  expect(nextBirthday('1988-02-29', new Date(2028, 1, 1))?.daysUntil).toBe(28);             // 윤년은 2/29 그대로
  expect(nextBirthday('1988-02-29', new Date(2027, 2, 1))?.daysUntil).toBe(365);            // 평년 3/1: 2/28이 지났으니 내년(윤년) 2/29까지
  expect(nextBirthday('1990-04-31', dec30)).toBeNull();                                      // 없는 날짜
  expect(nextBirthday('1990-13-01', dec30)).toBeNull();
  expect(nextBirthday('19901230', dec30)).toBeNull();                                        // 형식 불량
  expect(nextBirthday('', dec30)).toBeNull();
  expect(nextBirthday(undefined, dec30)).toBeNull();
  expect(nextBirthday('1990-12-30', new Date(2026, 11, 30, 23, 59))?.daysUntil).toBe(0);    // 늦은 밤에도 오늘은 오늘
});

test('마감 요약 분해 — 완료만 매출, 분할 결제 1건, 수단별 큰 순, 구분별, 환불·지출은 당일분만, 예약 결과', () => {
  const date = '2026-11-20';
  const pay = (id: string, amount: number, method: string, type: 'program' | 'product' | 'single_treatment' | 'other', status: 'completed' | 'refunded' | 'pending' = 'completed', referenceId?: string, paymentDate = date) =>
    ({ id, amount, paymentMethod: method, type, status, referenceId, paymentDate, memo: status === 'refunded' ? '[환불 2026-11-20] 고객 요청' : undefined });
  const c = summarizeDailyClose(date, {
    payments: [
      pay('p1', 200000, '카드', 'program', 'completed', 'cp1'),
      pay('p2', 100000, '현금', 'program', 'completed', 'cp1'),        // p1과 분할(같은 회차권) → 합쳐 1건
      pay('p3', 30000, '카드', 'product'),
      pay('p4', 50000, '계좌이체', 'single_treatment', 'refunded'),   // 오늘 결제분 환불 — 매출 제외, 환불에 집계
      pay('p5', 10000, '카드', 'other', 'pending'),                    // 미완료 — 어디에도 안 들어감
      pay('p6', 999999, '카드', 'program', 'completed', undefined, '2026-11-19'), // 다른 날
    ],
    expenses: [{ expenseDate: date, amount: 15000 }, { expenseDate: '2026-11-19', amount: 70000 }],
    treatmentLogs: [{ id: 't1', treatmentDate: date }, { id: 'sample_t', treatmentDate: date }, { id: 't2', treatmentDate: '2026-11-19' }],
    customers: [{ id: 'c1', registeredAt: new Date(2026, 10, 20, 1, 30).toISOString() }, { id: 'c2', registeredAt: new Date(2026, 10, 19, 23, 0).toISOString() }, { id: 'sample_c', registeredAt: new Date(2026, 10, 20).toISOString() }],
    reservations: [
      { date, status: 'completed' }, { date, status: 'completed' }, { date, status: 'noshow' }, { date, status: 'cancelled' }, { date, status: 'confirmed' }, { date, status: 'pending' },
      { date: '2026-11-21', status: 'confirmed' },
    ],
  });
  expect(c.revenue).toBe(330000);
  expect(c.paymentCount).toBe(2);                                   // p1+p2 = 1건, p3 = 1건
  expect(c.byMethod).toEqual([{ method: '카드', amount: 230000 }, { method: '현금', amount: 100000 }]); // 환불·미완료 수단은 빠진다
  expect(c.byType).toEqual({ treatment: 300000, product: 30000, other: 0 });
  expect(c.refunds).toBe(50000);
  expect(c.refundedToday).toBe(0); // 오늘 결제분(p4)은 refunds 에만 — 같은 건이 두 줄에 나오지 않는다 (114)
  expect(c.expenses).toBe(15000);
  expect(c.treatments).toBe(1);
  expect(c.newCustomers).toBe(1);                                   // 새벽 1:30 등록은 오늘(로컬), 샘플 제외
  expect(c.reservations).toEqual({ total: 6, active: 4, completed: 2, noshow: 1, cancelled: 1, pending: 2 }); // active = 취소·노쇼 제외 (대시보드 "오늘 예약"과 같은 수)

  const msg = formatDailyCloseMessage(c, '테스트샵');
  expect(msg.split('\n')).toEqual([
    '[테스트샵] 11/20(금) 마감 보고',
    '· 매출 330,000원 (2건)',
    '  카드 230,000원 / 현금 100,000원',
    '  시술 300,000원 / 제품 30,000원',
    '· 환불(오늘 결제분) 50,000원',
    '· 지출 15,000원',
    '· 시술 1건 · 신규 고객 1명',
    '· 예약 4건 (완료 2 / 노쇼 1 / 미처리 2) · 취소 1건',
  ]);
  const prior = summarizeDailyClose(date, { payments: [pay('old', 70000, '카드', 'program', 'refunded', undefined, '2026-11-01')], expenses: [], treatmentLogs: [], customers: [], reservations: [] });
  expect(prior.refunds).toBe(0); // 오늘 결제분이 아니다
  expect(prior.refundedToday).toBe(70000); // 11-01 결제를 오늘 환불 처리
  expect(formatDailyCloseMessage(prior, '샵')).toContain('· 환불 처리(오늘, 이전 결제분) 70,000원');
  // 아무것도 없는 날: 0원 (0건), 수단·구분·환불·지출 줄은 생략, 미처리 0은 표시하지 않음, 매장 이름이 비면 '매장'
  const empty = summarizeDailyClose(date, { payments: [], expenses: [], treatmentLogs: [], customers: [], reservations: [] });
  expect(formatDailyCloseMessage(empty, '').split('\n')).toEqual(['[매장] 11/20(금) 마감 보고', '· 매출 0원 (0건)', '· 시술 0건 · 신규 고객 0명', '· 예약 0건 (완료 0 / 노쇼 0)']);
});

test('공용 집계 규칙 — 재고 부족·집계 대상 고객·성장률·고객 표시값 가드 (10차 숫자 점검)', () => {
  expect(isLowStock({ isActive: true, stock: 2, minStock: 3 })).toBe(true);
  expect(isLowStock({ isActive: true, stock: 3, minStock: 3 })).toBe(true);   // 최소 재고와 같아도 부족
  expect(isLowStock({ isActive: false, stock: 0, minStock: 3 })).toBe(false); // 단종 제품은 입고 권유 대상이 아니다
  expect(isLowStock({ isActive: true, stock: 5, minStock: 3 })).toBe(false);
  // 취소(환불)된 제품 판매 = 환불 상태이면서 판매 행을 가리키는 결제 — 제품 화면·직원 실적·엑셀이 같은 집합을 쓴다 (114)
  expect([...canceledSaleIds([{ type: 'product', status: 'refunded', referenceId: 's1' }, { type: 'product', status: 'completed', referenceId: 's2' }, { type: 'product', status: 'refunded' }, { type: 'product', status: 'refunded', referenceId: 's1' }, { type: 'program', status: 'refunded', referenceId: 'cp9' }])]).toEqual(['s1']); // 환불된 회차권 결제(cp9)는 판매 취소가 아니다 (115)
  expect(isCountableCustomer({ id: 'c1', isActive: true })).toBe(true);
  expect(isCountableCustomer({ id: 'sample_1', isActive: true })).toBe(false);
  expect(isCountableCustomer({ id: 'c2', isActive: false })).toBe(false);     // 익명화(탈퇴)
  expect(growthPct(120000, 100000)).toBe(20);
  expect(growthPct(80000, 100000)).toBe(-20);
  expect(growthPct(100000, 100000)).toBe(0);
  expect(growthPct(50000, 0)).toBeNull();                                      // 전월 0 → 계산 불가(배지 없음)
  // 고객 표시값: 기록이 있으면 기록, 기록이 없으면 저장값(손으로 적은 방문일), 컬렉션이 통째로 비면 저장값 유지
  const stored = { id: 'c1', totalSpent: 150000, totalVisits: 9, lastVisitDate: '2026-11-20' };
  const idx = { byId: new Map([['c1', { totalSpent: 200000, totalVisits: 3, lastVisitDate: '2026-11-10' }]]), noPayments: false, noVisitRecords: false };
  expect(statsFor(stored, idx)).toEqual({ totalSpent: 200000, totalVisits: 3, lastVisitDate: '2026-11-10' }); // 저장값 "오늘"보다 기록이 우선
  expect(statsFor({ id: 'c2', totalSpent: 0, totalVisits: 0, lastVisitDate: '2026-05-01' }, idx)).toEqual({ totalSpent: 0, totalVisits: 0, lastVisitDate: '2026-05-01' }); // 기록 없음 → 손으로 적은 방문일 유지
  expect(statsFor(stored, { byId: new Map(), noPayments: true, noVisitRecords: true })).toEqual({ totalSpent: 150000, totalVisits: 9, lastVisitDate: '2026-11-20' }); // 로드 전엔 저장값
  expect(statsFor(stored, { ...idx, noPayments: true }).totalSpent).toBe(150000); // 결제 컬렉션만 비면 결제액은 저장값, 방문은 기록
  expect(statsFor(stored, { ...idx, noPayments: true }).totalVisits).toBe(3);
});

test('환불 처리일 태그 — memo 앞 [환불 YYYY-MM-DD], 읽기·벗기기', () => {
  expect(tagRefund(undefined, '2026-11-20')).toBe('[환불 2026-11-20]');
  expect(tagRefund('고객 요청', '2026-11-20')).toBe('[환불 2026-11-20] 고객 요청');
  expect(tagRefund('[환불 2026-11-01] 이미', '2026-11-20')).toBe('[환불 2026-11-01] 이미'); // 두 번 붙이지 않는다
  expect(refundedOn({ status: 'refunded', memo: '[환불 2026-11-20] 고객 요청' })).toBe('2026-11-20');
  expect(refundedOn({ status: 'refunded', memo: '옛 환불(태그 없음)' })).toBeNull();
  expect(refundedOn({ status: 'completed', memo: '[환불 2026-11-20]' })).toBeNull(); // 완료 결제면 태그가 있어도 환불이 아니다
  expect(memoWithoutRefundTag('[환불 2026-11-20] 고객 요청')).toBe('고객 요청');
  expect(memoWithoutRefundTag(undefined)).toBe('');
});

test('차트 만원 환산·비중 분배 — 작은 금액이 0 이 되지 않고 비중 합은 100', () => {
  expect(toManwon(48000)).toBe(4.8);   // 하루 1건 4만 8천 — Math.round(/10000) 이면 5
  expect(toManwon(4000)).toBe(0.4);    // 0 이 아니다
  expect(toManwon(1234567)).toBe(123.5);
  expect(toManwon(0)).toBe(0);
  expect(toManwon(123456, 0)).toBe(12);
  expect(splitPercent([1, 1, 1])).toEqual([34, 33, 33]); // 각자 반올림하면 33+33+33=99
  expect(splitPercent([300000, 48000, 0])).toEqual([86, 14, 0]);
  expect(splitPercent([0, 0, 0])).toEqual([0, 0, 0]);
  expect(splitPercent([2, 1]).reduce((a, b) => a + b, 0)).toBe(100);
});

test('입력 규칙 — 금액·수량·전화 키·날짜 (14차 점검)', () => {
  expect(parseAmount('50,000')).toBe(50000);
  expect(parseAmount('50 000')).toBe(50000);     // 은행 앱 복사값 — parseInt 는 50 이었다
  expect(parseAmount('₩50,000원')).toBe(50000);
  expect(parseAmount('1e5')).toBeNull();         // parseInt 는 1
  expect(parseAmount('1500.9')).toBeNull();      // 원 단위 절삭을 조용히 하지 않는다
  expect(parseAmount('-100')).toBeNull();
  expect(parseAmount('')).toBeNull();
  expect(parseCount('0')).toBeNull();
  expect(parseCount('2.9')).toBeNull();
  expect(parseCount('3')).toBe(3);
  expect(normalizePhone('+82 10-1234-5678')).toBe('01012345678'); // 국제형도 같은 키
  expect(normalizePhone('+82 010-1234-5678')).toBe('01012345678'); // 국가코드 뒤 국내 선행 0 (가장 흔한 표기, 123)
  expect(normalizePhone('+82(0)10-1234-5678')).toBe('01012345678');
  expect(normalizePhone('010-1234-5678')).toBe('01012345678');
  expect(normalizePhone(' 02 123 4567 ')).toBe('021234567');
  expect(isISODate('2026-11-23')).toBe(true);
  expect(isISODate('')).toBe(false);             // parseISODate('') 가 1900-01-01 이 되던 것
  expect(isISODate('2026/11/23')).toBe(false);
  expect(isISODate('2026-02-30')).toBe(false);   // 존재하지 않는 날짜
  expect(isISODate('NaN-NaN-NaN')).toBe(false);
  expect(toISODate(new Date(NaN))).toBe('');     // "NaN-NaN-NaN" 저장 방지
  expect(Number.isNaN(parseISODate('').getTime())).toBe(true);
  // 엑셀 날짜 coerce (14차 #M3) — 시리얼·구분자·한글, 못 읽으면 ''
  expect(coerceISODate(32874)).toBe('1990-01-01');       // 엑셀 시리얼
  expect(coerceISODate('1990/01/15')).toBe('1990-01-15');
  expect(coerceISODate('1990.1.5')).toBe('1990-01-05');
  expect(coerceISODate('1990년 1월 15일')).toBe('1990-01-15');
  expect(coerceISODate('19900115')).toBe('1990-01-15');
  expect(coerceISODate('15000')).toBe('1941-01-24');      // 1950년 이전도 시리얼로
  expect(coerceISODate('생일 모름')).toBe('');
  expect(coerceISODate('1990')).toBe('');            // 연도만 — 시리얼로 읽으면 1905-06-12 가 됐다 (123)
  expect(coerceISODate('900115')).toBe('');          // YYMMDD 는 세기가 모호해 거부
  expect(coerceISODate('2099-01-01')).toBe('');      // 미래 생년월일
  expect(coerceISODate('1990-02-30')).toBe('');
  // 소요시간 (14차 #M12)
  expect(parseDurationMinutes('60')).toBe(60);
  expect(parseDurationMinutes('90분')).toBe(90);
  expect(parseDurationMinutes('1.5시간')).toBe(90);        // 단위를 떼면 15분이 됐다
  expect(parseDurationMinutes('-30')).toBeNull();
  expect(parseDurationMinutes('')).toBeNull();
  // 이모지 SMS 바이트 (14차 #M9)
  expect(smsBytes('😀')).toBe(4);
});

test('조사 자동 선택 — 받침·숫자·영문·닫는 인용부호 (15차 #L1)', () => {
  expect(josa('회차권', '을/를')).toBe('회차권을');
  expect(josa('프로그램', '을/를')).toBe('프로그램을');
  expect(josa('김수아', '이/가')).toBe('김수아가');
  expect(josa('홍길동', '이/가')).toBe('홍길동이');
  expect(josa("'김수아'", '을/를')).toBe("'김수아'를");       // 닫는 인용부호는 건너뛰고 본 글자로
  expect(josa('"수아B"', '은/는')).toBe('"수아B"는');          // 영문 B → 받침 없음
  expect(josa('서울', '으로/로')).toBe('서울로');              // ㄹ 받침은 '로'
  expect(josa('부산', '으로/로')).toBe('부산으로');
  expect(josa('2026-11-24', '은/는')).toBe('2026-11-24는');    // 4(사) 받침 없음
  expect(josa('2026-11-23', '은/는')).toBe('2026-11-23은');    // 3(삼)
  expect(josa('2026-11-20', '은/는')).toBe('2026-11-20은');    // 0(영)
  expect(josa('mkclub21', '을/를')).toBe('mkclub21을');        // 1(일)
  expect(josa('', '을/를')).toBe('를');                         // 빈 값도 플레이스홀더를 남기지 않는다
  expect(josa('mkclub.net', '을/를')).toBe('mkclub.net을');     // 영문 t/k/p/b 받침 (123~126 리뷰 #L6)
  expect(josa('Facebook', '을/를')).toBe('Facebook을');
  expect(josa("'홍길동'", '으로/로')).toBe("'홍길동'으로");       // 개명 토스트 (#M4)
  expect(josa('재고 1병', '을/를')).toBe('재고 1병을');            // 판매 취소 토스트 (#M3)
  expect(josa('재고 2개', '을/를')).toBe('재고 2개를');
});

test('회차권 사용 회차 파생 — 기록 합이 정본, 근거 없으면 저장값 유지 (16차 #H2)', () => {
  const logs = [
    { customerProgramId: 'cp1', sessionsUsed: 1 }, { customerProgramId: 'cp1', sessionsUsed: 1 }, { customerProgramId: 'cp1', sessionsUsed: 1 }, // 다른 기기 2대가 각각 기록
    { customerProgramId: 'cp2', sessionsUsed: 2 }, { customerProgramId: undefined, sessionsUsed: 1 }, { customerProgramId: 'cp2', sessionsUsed: -5 }, // 연결 없음·음수는 무시
  ];
  const idx = buildUsedSessionsIndex(logs);
  expect(idx.get('cp1')).toBe(3);
  expect(idx.get('cp2')).toBe(2);
  const cp1 = { id: 'cp1', usedSessions: 2, totalSessions: 10 };   // 두 기기가 "1→2" 를 각각 보내 서버는 2, 기록은 3
  expect(derivedUsedSessions(cp1, idx)).toBe(3);
  expect(remainingSessions(cp1, derivedUsedSessions(cp1, idx))).toBe(7);
  expect(sessionsDrift(cp1, idx)).toBe(3);
  const legacy = { id: 'cp9', usedSessions: 4, totalSessions: 10 };  // 기록이 하나도 없는 옛 회차권 — 내리지 않는다
  expect(derivedUsedSessions(legacy, idx)).toBe(4);
  expect(sessionsDrift(legacy, idx)).toBeNull();
  expect(sessionsDrift({ id: 'cp2', usedSessions: 2, totalSessions: 5 }, idx)).toBeNull(); // 일치하면 손대지 않음
  expect(remainingSessions({ totalSessions: null }, 7)).toBeNull();     // 기간제
  expect(remainingSessions({ totalSessions: 3 }, 5)).toBe(0);          // 초과 차감도 0 아래로는 안 내려간다
});

test('방문 주기 — 간격 중앙값, 방문 3회 미만이면 매장 기본, 같은 날 중복·이상치·범위 (135, ANALYTICS-DEFINITIONS)', () => {
  expect(personalCycleDays(['2026-01-01', '2026-01-29'])).toBeNull();                           // 간격 1개 → 개인 주기 없음
  expect(personalCycleDays(['2026-01-01', '2026-01-29', '2026-02-28'])).toEqual({ days: 29, intervals: 2 }); // 28·30 → 중앙값 29
  expect(personalCycleDays(['2026-03-01', '2026-01-01', '2026-01-29', '2026-01-29'])).toEqual({ days: 30, intervals: 2 }); // 순서·같은 날 중복 무관(28·31)
  expect(personalCycleDays(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22', '2026-07-20'])).toEqual({ days: 7, intervals: 4 }); // 한 번 오래 쉰 것(179일)에 안 흔들림
  expect(personalCycleDays(['2026-01-01', '2026-01-03', '2026-01-05'])).toEqual({ days: 7, intervals: 2 });  // 7일 아래는 7로
  expect(personalCycleDays(['2024-01-01', '2025-06-01', '2026-11-01'])).toEqual({ days: 365, intervals: 2 }); // 365 위는 365로
  expect(personalCycleDays(['2026-01-01', 'bad', '2026-01-29', '2026-02-26'])).toEqual({ days: 28, intervals: 2 }); // 형식 불량은 무시
  expect(resolveVisitCycle(['2026-01-01'], 28)).toEqual({ days: 28, basis: 'shop', intervals: 0 });
  expect(resolveVisitCycle(['2026-01-01', '2026-01-15', '2026-01-29'], 28)).toEqual({ days: 14, basis: 'personal', intervals: 2 });
  // 통계 인덱스가 방문일을 그대로 넘긴다(완료 예약 ∪ 시술일, 서로 다른 날)
  const idx = buildStatsIndex({ payments: [], reservations: [{ customerId: 'c1', status: 'completed', date: '2026-01-01' }, { customerId: 'c1', status: 'cancelled', date: '2026-01-05' }], treatmentLogs: [{ customerId: 'c1', treatmentDate: '2026-01-01' }, { customerId: 'c1', treatmentDate: '2026-01-15' }] });
  expect(idx.visitDays?.get('c1')).toEqual(['2026-01-01', '2026-01-15']);
});
