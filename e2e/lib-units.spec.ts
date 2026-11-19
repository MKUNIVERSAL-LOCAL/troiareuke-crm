import { test, expect } from '@playwright/test';
import { formatPrice, formatWon, formatPhoneInput, matchesSearch, parseISODate, formatDateTime, formatLocalDate, localISODate, formatDate } from '../src/lib/format';
import { countPaymentUnits } from '../src/lib/paymentCount';
import { parseTags } from '../src/lib/customerTags';
import { readableTextOn } from '../src/lib/color';
import { smsBytes, SMS_BYTE_LIMIT } from '../src/lib/smsBytes';
import { sanitizeStorageSnapshot } from '../src/lib/backupSanitize';
import { computeRevisitDue, daysBetween, addDays } from '../src/lib/revisitRule';
import { nextBirthday } from '../src/lib/birthdayRule';
import { summarizeDailyClose, formatDailyCloseMessage } from '../src/lib/dailyCloseSummary';
import { statsFor } from '../src/lib/customerStatsRule';
import { isLowStock } from '../src/lib/stockRule';
import { isCountableCustomer } from '../src/lib/customerScope';
import { growthPct } from '../src/lib/growth';

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
    ({ id, amount, paymentMethod: method, type, status, referenceId, paymentDate });
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
  expect(c.expenses).toBe(15000);
  expect(c.treatments).toBe(1);
  expect(c.newCustomers).toBe(1);                                   // 새벽 1:30 등록은 오늘(로컬), 샘플 제외
  expect(c.reservations).toEqual({ total: 6, completed: 2, noshow: 1, cancelled: 1, pending: 2 });

  const msg = formatDailyCloseMessage(c, '테스트샵');
  expect(msg.split('\n')).toEqual([
    '[테스트샵] 11/20(금) 마감 보고',
    '· 매출 330,000원 (2건)',
    '  카드 230,000원 / 현금 100,000원',
    '  시술 300,000원 / 제품 30,000원',
    '· 환불(오늘 결제분) 50,000원',
    '· 지출 15,000원',
    '· 시술 1건 · 신규 고객 1명',
    '· 예약 6건 (완료 2 / 노쇼 1 / 취소 1 / 미처리 2)',
  ]);
  // 아무것도 없는 날: 0원 (0건), 수단·구분·환불·지출 줄은 생략, 미처리 0은 표시하지 않음, 매장 이름이 비면 '매장'
  const empty = summarizeDailyClose(date, { payments: [], expenses: [], treatmentLogs: [], customers: [], reservations: [] });
  expect(formatDailyCloseMessage(empty, '').split('\n')).toEqual(['[매장] 11/20(금) 마감 보고', '· 매출 0원 (0건)', '· 시술 0건 · 신규 고객 0명', '· 예약 0건 (완료 0 / 노쇼 0 / 취소 0)']);
});

test('공용 집계 규칙 — 재고 부족·집계 대상 고객·성장률·고객 표시값 가드 (10차 숫자 점검)', () => {
  expect(isLowStock({ isActive: true, stock: 2, minStock: 3 })).toBe(true);
  expect(isLowStock({ isActive: true, stock: 3, minStock: 3 })).toBe(true);   // 최소 재고와 같아도 부족
  expect(isLowStock({ isActive: false, stock: 0, minStock: 3 })).toBe(false); // 단종 제품은 입고 권유 대상이 아니다
  expect(isLowStock({ isActive: true, stock: 5, minStock: 3 })).toBe(false);
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
