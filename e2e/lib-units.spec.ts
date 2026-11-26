import { test, expect } from '@playwright/test';
import { formatPrice, formatWon, formatPhoneInput, matchesSearch, parseISODate, formatDateTime, formatLocalDate, localISODate, formatDate, toManwon, toISODate } from '../src/lib/format';
import { splitPercent } from '../src/lib/percent';
import { renameTagInSegments } from '../src/lib/segmentFilterRule';
import { summarizeRebook, describeRebookSummary, entriesInMonth, sanitizeRebookLog, trimRebookLog, rebookKey, MAX_REBOOK_LOG, type RebookLogEntry, entryDay } from '../src/lib/rebookStatsRule';
import { reasonOptions, labelFor, isPresetReason, normalizeReasonText, summarizeReasons, describeReasonSummary, compareReasonMonths, describeReasonTrend, previousMonth, MAX_REASON_TEXT } from '../src/lib/cancelReasonRule';
import { parseCountedQty, buildCountRows, countSummary, rowsToSave, describeCountSummary, countNote, zeroingRows } from '../src/lib/stockCountRule';
import { diffReservation, statusChange, describeChange, describeEntryHead, sanitizeHistory, trimHistory, historyFor, statusLabel, MAX_PER_RESERVATION, type HistoryEntry } from '../src/lib/reservationHistoryRule';
import { reorderSuggestions, reorderListText, describeReorderRow, REORDER_EMPTY } from '../src/lib/reorderRule';
import { resultLabel, defaultSnoozeDays, addDays as addDaysFollowUp, isSnoozed, sanitizeFollowUps, pruneFollowUps, snoozedIdSet, describeFollowUp, describeHidden } from '../src/lib/followUpRule';
import { normalizePreset, sanitizePresets, addPreset, removePreset, appendPreset, removePresetLine, presetInMemo, splitOneLine, oneLineHas, toggleOneLine, MAX_PRESET_LEN, MAX_PRESETS } from '../src/lib/memoPresetRule';
import { diffCustomer, gradeChange, describeCustomerChange, describeCustomerEntryHead, sanitizeCustomerHistory, trimCustomerHistory, customerHistoryFor, maskPhone, maskEmail, MAX_PER_CUSTOMER } from '../src/lib/customerHistoryRule';
import { countPaymentUnits } from '../src/lib/paymentCount';
import { parseTags } from '../src/lib/customerTags';
import { readableTextOn } from '../src/lib/color';
import { smsBytes, SMS_BYTE_LIMIT } from '../src/lib/smsBytes';
import { sanitizeStorageSnapshot, backupTableShape } from '../src/lib/backupSanitize';
import { computeRevisitDue, daysBetween, addDays, toISO } from '../src/lib/revisitRule';
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
import { quintileScores, scoreRfm, segmentOf } from '../src/lib/rfmRule';
import { churnRisk, atRiskRevenue90 } from '../src/lib/churnRule';
import { realizedProgramRevenue, computeCustomerValue } from '../src/lib/customerValueRule';
import { monthlyKpis, noRebookIds } from '../src/lib/kpiRule';
import { waitlistFor, describeWaitlist } from '../src/lib/waitlistRule';
import { utilization, formatHours } from '../src/lib/utilizationRule';
import { isUpcomingReservation } from '../src/lib/upcomingRule';
import { toMinutes as schedToMinutes, toInterval, overlaps, findConflicts, fromMinutes as schedFromMinutes, toMinutes, fromMinutes } from '../src/lib/schedulingRule';
import { availableStarts, nextAvailable } from '../src/lib/availabilityRule';
import { dayWindow, checkStaffWindow, offRanges, describeWindow, defaultSchedule, defaultShift, dayKeyOf, sameSchedule, DAY_KEYS } from '../src/lib/staffScheduleRule';
import { resourceConflicts, freeResources } from '../src/lib/resourceRule';
import { publicSlots } from '../src/lib/publicSlotsRule';
import { ledgerStock, reconcile, summarize, entriesOf } from '../src/lib/stockLedgerRule';
import { buildProgramLedger, ledgerRemaining, parseNoteLine } from '../src/lib/programLedgerRule';
import { monthMetrics, openHoursInMonth, localMonthOf } from '../src/lib/revenueMetricsRule';
import { newCustomerRows, discountRows, unusedBalanceRows, DRILL_MAX_ROWS } from '../src/lib/revenueDrilldownRule';
import { performanceRows } from '../src/lib/campaignPerformanceRule';
import { findDuplicateSuspects, describeDuplicateWarning, DUP_WINDOW_MINUTES } from '../src/lib/duplicatePaymentRule';
import { foldOldest } from '../src/lib/stockLedgerRule';
import { buildRefundRow, validateRefund, refundedSoFar, isRefundRow, refundOriginalId, suggestedProgramRefund, netRevenue, refundMemo } from '../src/lib/refundRule';
import { DEFAULT_CATALOG, catalog, defaultModel, findModel, modelsOf, setCatalogOverride, isAiModel } from '../src/lib/ai/catalog';
import { estimateTokens, estimateUsage, estimateCostUsd } from '../src/lib/ai/usage';
import { planPhotoChunks, mergePhotoEntries, parsePhotoBackup, photoBytes, sumInventory, formatBytes, PHOTO_BACKUP_FORMAT } from '../src/lib/photoBackupRule';
import { suggestRebook, describeRebook } from '../src/lib/rebookRule';
import { buildCustomerAlert, memoCautionLines, hasCustomerAlert, isNegatedCaution, sanitizeCautionKeywords, CAUTION_KEYWORDS, MAX_ALERT_LINES, MAX_ALERT_LINE_LENGTH, NOSHOW_ALERT_MIN } from '../src/lib/customerAlertRule';
import { parseRate, isBlankRate, hasOwnRates, clampRate, ratesFor, computeCommission, commissionConfigured, describeCommissionBasis, MAX_COMMISSION_RATE } from '../src/lib/commissionRule';
import { buildReceipt, receiptFileName, splitPaymentNote , normalizeGreeting, MAX_GREETING } from '../src/lib/receiptRule';
import { suggestGrade, VIP_VISITS, VIP_SPENT, GOLD_VISITS, GOLD_SPENT, VIP_RFM_MIN_VISITS, VIP_RFM_MIN_SPENT, GOLD_RFM_MIN_VISITS } from '../src/lib/gradeSuggestRule';
import { normalizeTagName, addMasterTag, removeMasterTag, sanitizeMaster, tagChoices, appendTagToInput, countInputTags, renameTagOnCustomer, renameTagInList, previewRename, MAX_TAG_NAME, MAX_MASTER_TAGS, MAX_TAGS_PER_CUSTOMER, CHIP_LIMIT } from '../src/lib/tagMasterRule';
import { selectProvider, fallbackOrder } from '../src/lib/ai/chat';
import { maskAiKey, looksLikeKey } from '../src/lib/ai/keys';
import { containsKeyLike, scrubKeyLike, findKeyLikeEntries } from '../src/lib/ai/keyLeak';
import { formatBriefing, pseudonymizeStaff, BRIEFING_SYSTEM, targetPace, describeCause } from '../src/lib/ai/briefingRule';
import { DEFAULT_CATALOG as GW_CATALOG } from '../src/lib/ai/catalog';
import type { AiProvider as GwProvider } from '../src/lib/ai/types';
import { routeModel, tierFor } from '../src/lib/ai/modelRouterRule';
import { applyEntry, ledgerState, creditsForCost, expireEntry, MONTHLY_GRANT, type LedgerEntry } from '../src/lib/ai/creditLedgerRule';
import { costPerCall, simulatePlan, simulate, priceForMargin, budgetCapKrw, allocateShops, DEFAULT_USAGE, DEFAULT_TOKENS, DEFAULT_PLAN_PRICE_KRW, DEFAULT_PLAN_MIX, type SimAssumptions } from '../src/lib/ai/costSimulatorRule';
import { setupChecks, setupCompletionPct, utilizationPct, activityLevel, pilotSummary, type BranchCounts } from '../src/lib/pilotMetricsRule';
import { matchesSegment, validateSegment, describeSegment, isEmptyCondition, type CustomerFacts } from '../src/lib/segmentFilterRule';
import { requestOtp, verifyOtp, isValidOtpCode, portalSummaryOf, EMPTY_OTP, OTP_TTL_MS, OTP_RESEND_GAP_MS, OTP_LOCK_MS, PORTAL_SESSION_MS, type OtpState } from '../src/lib/portalRule';
import { duplicateCandidates, normalizeName, type DupInput } from '../src/lib/duplicateRule';
import { decideOverlap } from '../src/lib/reservationPolicyRule';
import { isQuietHours, nextAllowedTime, isValidOptOutNumber, decorateAdMessage, canReceiveAd, checkAdSend, type ConsentState } from '../src/lib/adComplianceRule';
import { consentFromTags, tagsWithConsent, isConsentTag, mergeGeneralTags, isConsentDateTag } from '../src/lib/consentRule';
import { idempotencyKey, renderCampaignContent, selectCandidates, validateCampaign, describeTrigger, TRIGGER_LABELS } from '../src/lib/campaignRule';
import { CAMPAIGN_PRESETS, missingPresets } from '../src/lib/campaignPresets';
import { CAMPAIGN_SAMPLE_VARS } from '../src/lib/campaignRule';
import { isGatewayPendingHistory, countResendable } from '../src/lib/messageHistoryRule';
import { looksLikeAdMessage, undecorateAdMessage } from '../src/lib/adComplianceRule';
import { anonymizeResidue, describeAnonymizeResidue } from '../src/lib/anonymizeResidue';
import { shouldResetAppLock } from '../src/lib/appLockResetRule';
import { createSubmitLock } from '../src/lib/submitLock';
import { estimatePerformance, describePerformance } from '../src/lib/campaignPerformanceRule';
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
  // 고객 메모에 붙여넣은 키 꼴 문자열도 백업으로 새지 않는다 (152)
  const leaked = sanitizeStorageSnapshot({ crm_shop1_customers: '[{"name":"홍길동","memo":"키 sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX 메모"}]' });
  expect(leaked.crm_shop1_customers).toContain('sk-a••••(가려진 키)');
  expect(leaked.crm_shop1_customers).not.toContain('ABCDEFGHIJKLMNOP');
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

test('RFM 5분위·고객 구분 — 상대 순위, 동점, 소수 인원, 구분 규칙 (136, ANALYTICS-DEFINITIONS)', () => {
  expect(quintileScores([10, 20, 30, 40, 50])).toEqual([1, 2, 3, 4, 5]);          // 클수록 높은 점수
  expect(quintileScores([10, 20, 30, 40, 50], false)).toEqual([5, 4, 3, 2, 1]);   // 최근성: 작을수록 높은 점수
  expect(quintileScores([7, 7, 7])).toEqual([3, 3, 3]);                           // 동점은 같은 점수(가운데)
  expect(quintileScores([1, 2])).toEqual([2, 4]);                                 // 2명이어도 동작
  expect(quintileScores([])).toEqual([]);
  expect(quintileScores([42])).toEqual([3]);                                       // 1명 → 가운데 (139 #L9)
  expect(segmentOf({ r: 5, f: 5, m: 5 }, true, 12)).toBe('충성');
  expect(segmentOf({ r: 5, f: 1, m: 2 }, true, 1)).toBe('신규');                 // 최근 1회 방문
  expect(segmentOf({ r: 3, f: 2, m: 5 }, true, 3)).toBe('우수');
  expect(segmentOf({ r: 1, f: 4, m: 3 }, true, 8)).toBe('이탈 우려');             // 자주 오던 고객이 오래 안 옴 (RFM 상대 순위 — churnRule 의 '이탈 위험'과 다른 정의, 139 #M5)
  expect(segmentOf({ r: 1, f: 1, m: 1 }, true, 2)).toBe('휴면');
  expect(segmentOf({ r: 3, f: 3, m: 3 }, true, 4)).toBe('일반');
  expect(segmentOf({ r: 1, f: 1, m: 1 }, false, 0)).toBe('미방문');
  const idx = scoreRfm([
    { id: 'a', recencyDays: 3, frequency: 12, monetary: 2_000_000 },
    { id: 'b', recencyDays: 40, frequency: 4, monetary: 600_000 },
    { id: 'c', recencyDays: 120, frequency: 6, monetary: 900_000 },
    { id: 'd', recencyDays: 200, frequency: 1, monetary: 50_000 },
    { id: 'e', recencyDays: 10, frequency: 1, monetary: 100_000 },
    { id: 'z', recencyDays: null, frequency: 0, monetary: 0 },
  ]);
  expect(idx.get('a')).toEqual({ r: 5, f: 5, m: 5, segment: '충성' });
  expect(idx.get('d')?.segment).toBe('휴면');
  expect(idx.get('c')?.segment).toBe('이탈 우려');
  expect(idx.get('e')?.segment).toBe('신규');
  expect(idx.get('z')).toEqual({ r: 1, f: 1, m: 1, segment: '미방문' }); // 미방문은 백분위 계산에서 빠진다
});

test('이탈 위험 — 개인 주기 대비 비율, 미래 예약 완화, 기록 없음 null, 90일 위험 매출(예측) (136)', () => {
  expect(churnRisk({ daysSinceLastVisit: 20, cycleDays: 14, hasUpcomingReservation: false })).toEqual({ level: 'medium', ratio: 1.43 });
  expect(churnRisk({ daysSinceLastVisit: 42, cycleDays: 14, hasUpcomingReservation: false })).toEqual({ level: 'high', ratio: 3 });
  expect(churnRisk({ daysSinceLastVisit: 42, cycleDays: 90, hasUpcomingReservation: false })).toEqual({ level: 'low', ratio: 0.47 }); // 3개월 주기 고객은 아직 정상
  expect(churnRisk({ daysSinceLastVisit: 42, cycleDays: 14, hasUpcomingReservation: true })).toEqual({ level: 'low', ratio: 3 });      // 다음 예약이 있으면 위험 아님
  expect(churnRisk({ daysSinceLastVisit: 26, cycleDays: 20, hasUpcomingReservation: false })?.level).toBe('medium');   // 정확히 1.3
  expect(churnRisk({ daysSinceLastVisit: 40, cycleDays: 20, hasUpcomingReservation: false })?.level).toBe('high');     // 정확히 2.0
  expect(churnRisk({ daysSinceLastVisit: 25, cycleDays: 20, hasUpcomingReservation: false })?.level).toBe('low');      // 1.25
  // 미래 예약의 단일 정의 — 오늘 완료된 예약은 "다음 예약"이 아니다, 취소·노쇼 제외 (139 #H3·#M3)
  expect(isUpcomingReservation({ date: '2026-11-24', status: 'completed' }, '2026-11-24')).toBe(false);
  expect(isUpcomingReservation({ date: '2026-11-24', status: 'confirmed' }, '2026-11-24')).toBe(true);
  expect(isUpcomingReservation({ date: '2026-11-25', status: 'completed' }, '2026-11-24')).toBe(true); // 미래 날짜 기록은 날짜로만
  expect(isUpcomingReservation({ date: '2026-11-25', status: 'noshow' }, '2026-11-24')).toBe(false);
  expect(isUpcomingReservation({ date: '2026-11-23', status: 'confirmed' }, '2026-11-24')).toBe(false);
  expect(churnRisk({ daysSinceLastVisit: null, cycleDays: 28, hasUpcomingReservation: false })).toBeNull();
  expect(churnRisk({ daysSinceLastVisit: 10, cycleDays: 0, hasUpcomingReservation: false })).toBeNull();
  expect(atRiskRevenue90(365_000)).toBe(90_000);
  expect(atRiskRevenue90(-5)).toBe(0);
});

test('고객 가치 — 현금 유입 vs 실현 매출(회차권은 사용 비율), 객단가, 연간 기대(예측) (137, ANALYTICS-DEFINITIONS)', () => {
  expect(realizedProgramRevenue({ pricePaid: 300_000, totalSessions: 10, usedSessions: 3 })).toBe(90_000);
  expect(realizedProgramRevenue({ pricePaid: 300_000, totalSessions: 10, usedSessions: 12 })).toBe(300_000); // 초과 차감은 전액까지만
  expect(realizedProgramRevenue({ pricePaid: 500_000, totalSessions: null, usedSessions: 4 })).toBe(500_000); // 기간제는 판매 시 전액
  expect(realizedProgramRevenue({ pricePaid: 500_000, totalSessions: null, usedSessions: 4, refunded: true })).toBe(0); // 환불된 회차권은 실현 0 (139 #H1)
  expect(realizedProgramRevenue({ pricePaid: 300_000, totalSessions: 10, usedSessions: 3, refunded: true })).toBe(0);
  expect(realizedProgramRevenue({ pricePaid: 0, totalSessions: 10, usedSessions: 3 })).toBe(0);
  expect(realizedProgramRevenue({ pricePaid: 300_000, totalSessions: 0, usedSessions: 0 })).toBe(300_000); // 총 회차 0 은 기간제처럼
  const v = computeCustomerValue({
    payments: [
      { type: 'program', status: 'completed', amount: 300_000 },   // 회차권 판매 — 현금 유입에만
      { type: 'single_treatment', status: 'completed', amount: 50_000 },
      { type: 'product', status: 'completed', amount: 30_000 },
      { type: 'other', status: 'refunded', amount: 20_000 },       // 환불 제외
      { type: 'single_treatment', status: 'pending', amount: 10_000 }, // 대기 제외
    ],
    programs: [{ pricePaid: 300_000, totalSessions: 10, usedSessions: 3 }],
    visits: 4, cycleDays: 28,
  });
  expect(v.cashCollected).toBe(380_000);
  expect(v.realizedRevenue).toBe(170_000);     // 50,000 + 30,000 + 90,000 — 회차권 판매액 300,000 을 또 세지 않는다
  expect(v.avgTicket).toBe(42_500);            // 170,000 / 4
  expect(v.annualForecast).toBe(554_018);      // 42,500 × 365/28
  expect(computeCustomerValue({ payments: [], programs: [], visits: 0, cycleDays: 28 })).toEqual({ cashCollected: 0, realizedRevenue: 0, avgTicket: null, annualForecast: null }); // 방문 0 → 없음
  expect(computeCustomerValue({ payments: [{ type: 'other', status: 'completed', amount: 1000 }], programs: [], visits: 1, cycleDays: null }).annualForecast).toBeNull(); // 주기 없음 → 예측 없음
});

test('이달 운영 지표 — 방문 고객·재방문율·재예약률·객단가(현금), 분모 0 은 없음 (138, ANALYTICS-DEFINITIONS)', () => {
  const visitDays = new Map<string, string[]>([
    ['a', ['2026-09-10', '2026-11-03']],            // 기존 고객, 이달 방문
    ['b', ['2026-11-12']],                          // 이달 첫 방문(신규)
    ['c', ['2026-10-01']],                          // 이달 방문 없음
    ['d', ['2026-11-20', '2026-11-22']],            // 이달 2회 방문해도 1명
  ]);
  const k = monthlyKpis({ month: '2026-11', visitDays, payments: [
    { customerId: 'a', status: 'completed', amount: 100_000, paymentDate: '2026-11-03' },
    { customerId: 'b', status: 'completed', amount: 50_000, paymentDate: '2026-11-12' },
    { customerId: 'b', status: 'refunded', amount: 50_000, paymentDate: '2026-11-13' },  // 환불 제외
    { customerId: 'c', status: 'completed', amount: 999_999, paymentDate: '2026-10-01' }, // 지난달 제외
  ], upcomingByCustomer: new Set(['a', 'c']) });
  expect(k.visitors).toBe(3);
  expect(k.returning).toBe(1);
  expect(k.revisitRate).toBe(33);
  expect(k.rebooked).toBe(1);        // c 는 이달 방문이 아니라 분자에 안 들어간다
  expect(k.rebookRate).toBe(33);
  expect(k.monthRevenue).toBe(150_000);
  expect(k.avgTicket).toBe(50_000);
  const empty = monthlyKpis({ month: '2026-11', visitDays: new Map(), payments: [], upcomingByCustomer: new Set() });
  expect(empty).toEqual({ visitors: 0, returning: 0, rebooked: 0, revisitRate: null, rebookRate: null, avgTicket: null, monthRevenue: 0 });
  expect(noRebookIds({ month: '2026-11', visitDays, upcomingByCustomer: new Set(['a', 'c']) })).toEqual(['b', 'd']); // 분모(3) − 분자(1) = 2명, c 는 이달 방문 아님 (184)
});

test('가동률 — 근무 창 − 휴게 대비 확정·완료 예약 분, 휴일은 가용 0, 대기·취소·기간 밖 제외, 종료 없으면 60분, 가용 0 은 없음 (180, ANALYTICS-DEFINITIONS)', () => {
  const w = (s: number, e: number, br?: [number, number]) => ({ work: { startMin: s, endMin: e }, breaks: br ? [{ startMin: br[0], endMin: br[1] }] : [] });
  const u = utilization({
    days: [
      { date: '2026-11-02', windows: [w(540, 1080, [720, 780]), { work: null, breaks: [] }] }, // 09~18 휴게 1h = 480, 휴무 직원 0
      { date: '2026-11-03', windows: [] },                                                      // 매장 휴일
      { date: '2026-11-04', windows: [w(600, 1140)] },                                          // 10~19 = 540
    ],
    reservations: [
      { date: '2026-11-02', status: 'confirmed', startTime: '10:00', endTime: '11:30' },  // 90
      { date: '2026-11-02', status: 'completed', startTime: '14:00', endTime: '15:00' },  // 60
      { date: '2026-11-02', status: 'cancelled', startTime: '15:00', endTime: '16:00' },  // 제외
      { date: '2026-11-03', status: 'confirmed', startTime: '11:00', endTime: '12:00' },  // 휴일 예약도 예약 분엔 들어간다(60)
      { date: '2026-11-04', status: 'pending', startTime: '11:00', endTime: '12:00' },    // 대기 제외
      { date: '2026-11-04', status: 'completed', startTime: '16:00', endTime: '' },       // 종료 없음 → 60
      { date: '2026-11-05', status: 'completed', startTime: '10:00', endTime: '12:00' },  // 기간 밖
    ],
  });
  expect(u).toEqual({ bookedMin: 270, availableMin: 1020, rate: 26 });
  expect([formatHours(270), formatHours(1020), formatHours(30), formatHours(20), formatHours(0)]).toEqual(['4.5', '17', '0.5', '0.3', '0']); // 타일·브리핑 공용 시간 표기 (182 리뷰 L-1)
  expect(utilization({ days: [{ date: '2026-11-02', windows: [] }], reservations: [{ date: '2026-11-02', status: 'confirmed', startTime: '10:00', endTime: '11:00' }] })).toEqual({ bookedMin: 60, availableMin: 0, rate: null });
  expect(utilization({ days: [{ date: '2026-11-02', windows: [w(540, 600)] }], reservations: [{ date: '2026-11-02', status: 'confirmed', startTime: '09:00', endTime: '11:00' }] }).rate).toBe(200); // 근무 외 예약 → 100% 초과 그대로
});

test('예약 겹침 규칙 — 반개구간, 맞닿음은 겹침 아님, 자정 넘김, 깨진 시간은 겹침 (140)', () => {
  expect(schedToMinutes('09:30')).toBe(570);
  expect(schedToMinutes('9:05')).toBe(545);
  expect(schedToMinutes('25:00')).toBeNull();
  expect(schedToMinutes('')).toBeNull();
  expect(schedFromMinutes(1500)).toBe('01:00');
  expect(toInterval('23:30', '00:30')).toEqual({ startMin: 1410, endMin: 1470 });   // 자정 넘김
  expect(toInterval('10:00', undefined, 60)).toEqual({ startMin: 600, endMin: 660 }); // 끝 없으면 기본 소요
  expect(overlaps({ startMin: 600, endMin: 660 }, { startMin: 660, endMin: 720 })).toBe(false); // 맞닿음
  expect(overlaps({ startMin: 600, endMin: 661 }, { startMin: 660, endMin: 720 })).toBe(true);
  const items = [
    { id: 'a', startTime: '10:00', endTime: '11:00' },
    { id: 'b', startTime: '11:00', endTime: '12:00' },
    { id: 'c', startTime: '??', endTime: '' },                 // 깨진 시간 → 겹침으로 보고 확인
  ];
  expect(findConflicts({ startMin: 630, endMin: 690 }, items).map(i => i.id)).toEqual(['a', 'b', 'c']);
  expect(findConflicts({ startMin: 720, endMin: 780 }, items).map(i => i.id)).toEqual(['c']);
});

test('가용 시작 시각 — 영업시간·기존 예약·간격·소요·버퍼·지금 이후 (140)', () => {
  const base = { openMin: 600, closeMin: 780, durationMin: 60, busy: [{ startMin: 660, endMin: 720 }] }; // 10:00~13:00, 11~12 예약
  expect(availableStarts(base)).toEqual([600, 720]);                                         // 10:00, 12:00 (10:30 은 11:00 과 겹침)
  expect(availableStarts({ ...base, stepMin: 15 })).toEqual([600, 720]);
  expect(availableStarts({ ...base, durationMin: 30 })).toEqual([600, 630, 720, 750]);
  expect(availableStarts({ ...base, bufferAfterMin: 15 })).toEqual([720]);                   // 10:00 은 정리 11:15 가 예약과 겹침, 12:00 의 정리 13:15 는 마감 뒤라도 허용 (144 M-6)
  expect(availableStarts({ ...base, bufferAfterMin: 15, busy: [{ startMin: 660, endMin: 720 }, { startMin: 780, endMin: 800 }] })).toEqual([]); // 마감 뒤 다른 예약(13:00~)과 정리가 겹치면 제외
  expect(availableStarts({ ...base, bufferBeforeMin: 15 })).toEqual([600]);                  // 10:00 의 준비 09:45 는 영업 전이라도 허용, 12:00 은 11:45 준비가 예약과 겹침
  expect(availableStarts({ ...base, bufferBeforeMin: 15, busy: [{ startMin: 585, endMin: 600 }, { startMin: 660, endMin: 720 }] })).toEqual([]); // 영업 전 다른 일정(09:45~10:00)과 준비가 겹치면 제외
  expect(availableStarts({ ...base, notBeforeMin: 650 })).toEqual([720]);                    // 지금 10:50 이후
  expect(availableStarts({ ...base, durationMin: 0 })).toEqual([]);
  expect(availableStarts({ ...base, closeMin: 600 })).toEqual([]);
  expect(nextAvailable({ openMin: 540, closeMin: 1440, durationMin: 90, busy: [] }, 3)).toEqual(['09:00', '09:30', '10:00']);
});

test('직원 근무표 — 매장 영업시간 대체·휴무·자정 넘김·근무 밖 휴게 무시·경고·음영·버퍼 결합 (141)', () => {
  const shop = { open: '10:00', close: '20:00', isOff: false };
  const w0 = dayWindow(null, '월', shop);
  expect(w0.work).toEqual({ startMin: 600, endMin: 1200 });
  expect(w0.fromShopHours).toBe(true);
  expect(checkStaffWindow(w0, '김', '월', 540, 60)).toEqual([]);                 // 매장 창은 businessHours 가 따로 경고
  expect(dayWindow(null, '월', { ...shop, isOff: true }).work).toBeNull();
  expect(dayWindow(null, '월', { ...shop, close: '00:00' }).work).toEqual({ startMin: 600, endMin: 1440 });
  const s = defaultSchedule('s1');
  s.useShopHours = false; s.bufferAfterMin = 15;
  s.weekly['월'] = { off: false, start: '11:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00' };
  s.weekly['화'] = { off: true, start: '11:00', end: '18:00' };
  s.weekly['수'] = { off: false, start: '20:00', end: '02:00' };
  s.weekly['목'] = { off: false, start: '11:00', end: '18:00', breakStart: '19:00', breakEnd: '20:00' }; // 근무 밖 휴게는 무시
  const mon = dayWindow(s, '월', shop);
  expect(mon.work).toEqual({ startMin: 660, endMin: 1080 });
  expect(mon.breaks).toEqual([{ startMin: 780, endMin: 840 }]);
  expect(mon.bufferAfterMin).toBe(15);
  expect(describeWindow(mon)).toBe('11:00~18:00 · 휴게 13:00~14:00');
  expect(dayWindow(s, '화', shop).work).toBeNull();
  expect(describeWindow(dayWindow(s, '화', shop))).toBe('휴무');
  expect(dayWindow(s, '수', shop).work).toEqual({ startMin: 1200, endMin: 1560 });
  expect(dayWindow(s, '목', shop).breaks).toEqual([]);
  expect(checkStaffWindow(mon, '김', '월', 600, 60).map(w => w.kind)).toEqual(['outside']);
  expect(checkStaffWindow(mon, '김', '월', 750, 60).map(w => w.kind)).toEqual(['break']);    // 12:30~13:30
  expect(checkStaffWindow(mon, '김', '월', 1050, 60).map(w => w.kind)).toEqual(['outside']); // 17:30~18:30
  expect(checkStaffWindow(mon, '김', '월', 840, 60)).toEqual([]);                             // 14:00 — 휴게와 맞닿음은 겹침 아님
  expect(checkStaffWindow(dayWindow(s, '화', shop), '김', '화', 720, 60).map(w => w.kind)).toEqual(['off']);
  expect(offRanges(mon, { startMin: 540, endMin: 1260 })).toEqual([{ startMin: 540, endMin: 660 }, { startMin: 1080, endMin: 1260 }]);
  expect(offRanges(dayWindow(s, '화', shop), { startMin: 540, endMin: 1260 })).toEqual([{ startMin: 540, endMin: 1260 }]);
  // 가용 계산과 결합: 휴게 busy + 정리 15 → 12:00·12:30·13:30 은 휴게에 걸려 빠진다
  expect(nextAvailable({ openMin: mon.work!.startMin, closeMin: mon.work!.endMin, durationMin: 60, busy: mon.breaks, bufferAfterMin: mon.bufferAfterMin }, 3)).toEqual(['11:00', '11:30', '14:00']);
  // 기존 예약 15:00~16:00 에 정리 15 를 붙이면 16:00 은 막히고 16:30 부터
  expect(nextAvailable({ openMin: 660, closeMin: 1080, durationMin: 60, busy: [...mon.breaks, { startMin: 900, endMin: 975 }], bufferAfterMin: 15 }, 3)).toEqual(['11:00', '11:30', '16:30']);
});

test('베드·룸 자원 — 충돌·빈 자원·취소 제외·미사용 제외·깨진 시간·맞닿음 (142)', () => {
  const resources = [
    { id: 'b1', name: '베드1', kind: 'bed' as const, isActive: true },
    { id: 'b2', name: '베드2', kind: 'bed' as const, isActive: true },
    { id: 'r1', name: '룸', kind: 'room' as const, isActive: false },
  ];
  const assignments = { x1: 'b1', x2: 'b2', x3: 'b1', x4: 'b1' };
  const rs = [
    { id: 'x1', date: '2026-11-24', startTime: '10:00', endTime: '11:00', status: 'confirmed' },
    { id: 'x2', date: '2026-11-24', startTime: '10:30', endTime: '11:30', status: 'cancelled' },
    { id: 'x3', date: '2026-11-25', startTime: '10:00', endTime: '11:00', status: 'confirmed' },
    { id: 'x4', date: '2026-11-24', startTime: '??', endTime: '', status: 'confirmed' },
  ];
  const c = { date: '2026-11-24', startMin: 630, endMin: 690 };
  expect(resourceConflicts('b1', assignments, rs, c).map(r => r.id)).toEqual(['x1', 'x4']);      // 깨진 시간은 충돌로 보고 확인, 다른 날은 제외
  expect(resourceConflicts('b2', assignments, rs, c)).toEqual([]);                              // 취소는 제외
  expect(freeResources(resources, assignments, rs, c).map(r => r.id)).toEqual(['b2']);          // 미사용 룸 제외
  expect(freeResources(resources, assignments, rs, { ...c, excludeId: 'x1' }).map(r => r.id)).toEqual(['b2']); // x4 가 여전히 b1
  expect(freeResources(resources, { x1: 'b1' }, rs, { ...c, excludeId: 'x1' }).map(r => r.id)).toEqual(['b1', 'b2']); // 본인 제외
  expect(resourceConflicts('b1', assignments, rs, { date: '2026-11-24', startMin: 660, endMin: 720 }).map(r => r.id)).toEqual(['x4']); // 11:00 맞닿음은 겹침 아님
});

test('공개 예약 슬롯 — 직원 가용 합집합 ∩ 베드 상한 (143)', () => {
  const a = [600, 630, 720], b = [630, 660, 720, 750];
  expect(publicSlots([a, b], 60, null)).toEqual([600, 630, 660, 720, 750]);                 // 자원 없으면 합집합
  const cap = { total: 1, busy: [{ startMin: 600, endMin: 660 }] };                        // 베드 1개, 10:00~11:00 사용 중
  expect(publicSlots([a, b], 60, cap)).toEqual([660, 720, 750]);                           // 10:00·10:30 은 베드 없음
  expect(publicSlots([a, b], 60, { total: 2, busy: [{ startMin: 600, endMin: 660 }] })).toEqual([600, 630, 660, 720, 750]);
  expect(publicSlots([a, b], 60, { total: 0, busy: [] })).toEqual([]);                      // 사용 중 자원 0 이면 받을 수 없음
  expect(publicSlots([[], []], 60, null)).toEqual([]);
});

test('재고 원장 — Σ 행 = 재고, 대조 차이, 기간 합계, 최신순 (145)', () => {
  const es = [
    { id: '1', productId: 'p', kind: 'open' as const, qty: 10, resultStock: 10, at: '2026-11-01T09:00:00.000Z', date: '2026-11-01' },
    { id: '2', productId: 'p', kind: 'in' as const, qty: 5, resultStock: 15, at: '2026-11-02T09:00:00.000Z', date: '2026-11-02', unitCost: 5000 },
    { id: '3', productId: 'p', kind: 'sale' as const, qty: -1, resultStock: 14, at: '2026-11-03T09:00:00.000Z', date: '2026-11-03' },
    { id: '4', productId: 'p', kind: 'count' as const, qty: -2, resultStock: 12, at: '2026-11-04T09:00:00.000Z', date: '2026-11-04' },
    { id: '5', productId: 'p', kind: 'cancel' as const, qty: 1, resultStock: 13, at: '2026-11-05T09:00:00.000Z', date: '2026-11-05' },
    { id: '6', productId: 'q', kind: 'open' as const, qty: 3, resultStock: 3, at: '2026-11-01T09:00:00.000Z', date: '2026-11-01' },
  ];
  expect(ledgerStock(es, 'p')).toBe(13);
  expect(ledgerStock(es, 'q')).toBe(3);
  expect(ledgerStock(es, 'none')).toBe(0);
  expect(reconcile(es, 'p', 13)).toEqual({ ledger: 13, current: 13, diff: 0 });
  expect(reconcile(es, 'p', 11)).toEqual({ ledger: 13, current: 11, diff: -2 }); // 기록 없는 이동(다른 기기 판매) → 원장에 -2 조정을 남긴다
  expect(summarize(es, 'p')).toEqual({ received: 5, sold: 1, canceled: 1, adjusted: -2, receivedCost: 25000 });
  expect(summarize(es, 'p', '2026-11-03', '2026-11-04')).toEqual({ received: 0, sold: 1, canceled: 0, adjusted: -2, receivedCost: 0 });
  expect(entriesOf(es, 'p').map(e => e.id)).toEqual(['5', '4', '3', '2', '1']);
});

test('회차권 원장 — 등록·시술·보정 순서와 잔여, 복원 줄은 잔여를 바꾸지 않음, 기간제 (146)', () => {
  const won = (n: number) => n.toLocaleString('ko-KR') + '원';
  const cp = { id: 'cp1', programName: '수분 10회', totalSessions: 12, pricePaid: 300000, purchaseDate: '2026-11-01', createdAt: '2026-11-01T01:00:00.000Z',
    notes: '[2026-11-05] 총 회차 10회 → 12회 — 서비스 2회\n[2026-11-06] 만료일 없음 → 2027-01-01\n[2026-11-07] 시술 기록 삭제 → 1회 복원 (2026-11-03 시술)\n메모 줄은 무시' };
  const logs = [
    { id: 't1', treatmentDate: '2026-11-02', treatmentTime: '10:00', createdAt: '2026-11-02T01:00:00.000Z', sessionsUsed: 1, staffName: '김' },
    { id: 't2', treatmentDate: '2026-11-04', treatmentTime: '11:00', createdAt: '2026-11-04T02:00:00.000Z', sessionsUsed: 2 },
  ];
  const rows = buildProgramLedger(cp, logs, won);
  expect(rows.map(r => r.kind)).toEqual(['purchase', 'use', 'use', 'total', 'expiry', 'restore']);
  expect(rows.map(r => r.remaining)).toEqual([10, 9, 7, 9, 9, 9]);           // 등록은 보정 전 10 에서 출발, 만료·복원 줄은 잔여 유지
  expect(rows[0].text).toBe('수분 10회 등록 · 총 10회 · 300,000원');
  expect(rows[3].delta).toBe(2);
  expect(ledgerRemaining(rows)).toBe(9);                                      // = 총 12 − 기록 3
  expect(parseNoteLine('[2026-11-08] 완료 처리 (잔여 9회 소멸)', 0)?.kind).toBe('complete');
  expect(parseNoteLine('[2026-11-09] 완료 → 진행중으로 되돌림', 1)?.kind).toBe('reopen');
  expect(parseNoteLine('그냥 메모', 2)).toBeNull();
  expect(parseNoteLine('[2026-11-10] 완료 처리 (잔여 3회 소멸) — 만료일 지나서 복원 요청 거절', 3)?.kind).toBe('complete'); // 사유의 단어로 종류를 바꾸지 않는다 (149 M-4)
  const timed = buildProgramLedger({ ...cp, totalSessions: null, notes: '' }, logs, won);
  expect(timed.map(r => r.remaining)).toEqual([null, null, null]);
  expect(ledgerRemaining(timed)).toBeNull();
});

test('월 매출 지표 — 전월/전년 대비·목표·신규 비중·할인·회원권 판매 vs 실현·미사용 잔액·BEP·영업시간·월말 예상 (147)', () => {
  const payments = [
    { paymentDate: '2026-11-03', type: 'program' as const, status: 'completed' as const, amount: 300000, discountAmount: 20000, customerId: 'c-new' },
    { paymentDate: '2026-11-10', type: 'single_treatment' as const, status: 'completed' as const, amount: 100000, customerId: 'c-old' },
    { paymentDate: '2026-11-12', type: 'product' as const, status: 'refunded' as const, amount: 50000, customerId: 'c-old' },   // 환불 제외
    { paymentDate: '2026-10-20', type: 'single_treatment' as const, status: 'completed' as const, amount: 200000 },
    { paymentDate: '2025-11-05', type: 'single_treatment' as const, status: 'completed' as const, amount: 800000 },
  ];
  const expenses = [
    { expenseDate: '2026-11-05', category: '제품 매입', amount: 80000 },
    { expenseDate: '2026-11-06', category: '임대료', amount: 150000 },
    { expenseDate: '2026-10-06', category: '임대료', amount: 150000 },
  ];
  const programs = [
    { id: 'p1', pricePaid: 300000, totalSessions: 10, usedSessions: 2 },
    { id: 'p2', pricePaid: 100000, totalSessions: 4, usedSessions: 4, isCompleted: true },
    { id: 'p3', pricePaid: 90000, totalSessions: null, usedSessions: 0 },
  ];
  const logs = [
    { treatmentDate: '2026-11-04', customerProgramId: 'p1', sessionsUsed: 1 },
    { treatmentDate: '2026-11-18', customerProgramId: 'p1', sessionsUsed: 1 },
    { treatmentDate: '2026-10-30', customerProgramId: 'p1', sessionsUsed: 1 },
  ];
  const customers = [{ id: 'c-new', registeredAt: '2026-11-02T00:00:00.000Z' }, { id: 'c-old', registeredAt: '2026-05-01T00:00:00.000Z' }];
  // 등록 일시는 UTC 로 저장된다 — 로컬(KST) 달로 판정해야 1일 새벽 등록이 전월로 밀리지 않는다 (149 M-2)
  const edge = new Date('2026-11-30T23:30:00.000Z');
  expect(localMonthOf('2026-11-30T23:30:00.000Z')).toBe(`${edge.getFullYear()}-${String(edge.getMonth() + 1).padStart(2, '0')}`);
  expect(localMonthOf('이상한값')).toBe('이상한값'.slice(0, 7));
  const hours = { '월': { open: '10:00', close: '19:00', isOff: false }, '화': { open: '10:00', close: '19:00', isOff: false }, '수': { open: '10:00', close: '19:00', isOff: false }, '목': { open: '10:00', close: '19:00', isOff: false }, '금': { open: '10:00', close: '19:00', isOff: false }, '토': { open: '10:00', close: '15:00', isOff: false }, '일': { open: '10:00', close: '19:00', isOff: true } };
  const m = monthMetrics({ month: '2026-11', today: '2026-11-20', payments, expenses, programs, logs, customers, target: 800000, businessHours: hours, holidays: ['2026-11-03'] });
  expect(m.total).toBe(400000);
  expect(m.prevMonth).toBe(200000); expect(m.momPct).toBe(100);
  expect(m.lastYear).toBe(800000); expect(m.yoyPct).toBe(-50);
  expect(m.achievementPct).toBe(50);
  expect(m.newCustomerRevenue).toBe(300000); expect(m.existingCustomerRevenue).toBe(100000); expect(m.newSharePct).toBe(75);
  expect(m.discount).toBe(20000);
  expect(m.programSold).toBe(300000);
  expect(m.programRealized).toBe(60000);     // 11월 차감 2회 × 30,000
  expect(m.unusedBalance).toBe(240000);      // p1 잔여 8회 × 30,000 (완료·기간제 제외)
  expect(m.cogs).toBe(80000); expect(m.sga).toBe(150000);
  expect(m.breakEven).toBe(187500);          // 150,000 ÷ (1 − 0.2)
  // 11-01~11-20: 일요일(1·8·15) 휴무, 토요일(7·14) 5h, 11-03 지정 휴일 → 평일 14일 × 9h + 토 2일 × 5h = 126 + 10 = 136h
  expect(m.openHours).toBe(136);
  expect(m.perHour).toBe(Math.round(400000 / 136));
  expect(m.isCurrentMonth).toBe(true); expect(m.daysElapsed).toBe(20); expect(m.daysInMonth).toBe(30);
  expect(m.projected).toBe(600000);          // 400,000 ÷ 20 × 30
  const past = monthMetrics({ month: '2026-10', today: '2026-11-20', payments, expenses, programs, logs, customers, target: null });
  expect(past.total).toBe(200000); expect(past.momPct).toBeNull(); expect(past.achievementPct).toBeNull(); expect(past.projected).toBeNull(); expect(past.openHours).toBeNull();
  expect(past.breakEven).toBe(150000);       // 원가 0 → 판관비 그대로
  expect(openHoursInMonth('2026-11', '2026-12-01', hours, [])).toBe(9 * 21 + 5 * 4); // 꽉 찬 달: 평일 21·토 4·일 5 휴무
  expect(monthMetrics({ month: '2026-11', today: '2026-11-20', payments: [], expenses: [], programs: [], logs: [], customers: [], target: null }).breakEven).toBe(0);
});

test('환불 규칙(결정 #9 대기, B 모델 준비) — 환불 행·검증·부분 환불 한도·회차권 제안액·월 순매출 (148)', () => {
  const orig = { id: 'pay1', paymentDate: '2026-10-05', type: 'program' as const, typeLabel: '회차권', amount: 500000, status: 'completed' as const, customerId: 'c1', customerName: '김고객', referenceId: 'cp1', paymentMethod: '카드' };
  const r1 = buildRefundRow(orig, { amount: 300000, date: '2026-11-15', reason: '잔여 6회 환불', actor: '원장' });
  expect(r1.amount).toBe(-300000);
  expect(r1.paymentDate).toBe('2026-11-15');
  expect(r1.status).toBe('completed');
  expect(r1.referenceId).toBe('cp1');
  expect(r1.typeLabel).toBe('회차권 환불');
  expect(r1.memo).toBe('[환불 2026-11-15 ← 2026-10-05 pay1] 잔여 6회 환불 · 처리 원장');
  const row1 = { ...r1, id: 'ref1' };
  expect(isRefundRow(row1)).toBe(true);
  expect(isRefundRow(orig)).toBe(false);
  expect(refundOriginalId(row1)).toBe('pay1');
  const all = [orig, row1];
  expect(refundedSoFar(orig, all)).toBe(300000);
  expect(validateRefund(orig, all, { amount: 200000, date: '2026-11-20' })).toBeNull();
  expect(validateRefund(orig, all, { amount: 200001, date: '2026-11-20' })).toContain('200,000원까지');
  expect(validateRefund(orig, all, { amount: 0, date: '2026-11-20' })).toContain('1원 이상');
  expect(validateRefund(orig, all, { amount: 1000, date: '2026-09-01' })).toContain('원 결제일보다');
  expect(validateRefund({ ...orig, status: 'refunded' }, all, { amount: 1000, date: '2026-11-20' })).toContain('완료된 결제만');
  expect(validateRefund(row1, all, { amount: 1000, date: '2026-11-20' })).toContain('환불 행은');
  // 10월 매출은 그대로, 11월은 −300,000 (B 모델의 핵심)
  expect(netRevenue(all, '2026-10')).toBe(500000);
  expect(netRevenue(all, '2026-11')).toBe(-300000);
  // 회차권 제안액: 10회 500,000 중 4회 사용 → 잔여 6회 × 50,000 = 300,000, 위약금 10% → 270,000
  expect(suggestedProgramRefund({ pricePaid: 500000, totalSessions: 10, usedSessions: 4 })).toBe(300000);
  expect(suggestedProgramRefund({ pricePaid: 500000, totalSessions: 10, usedSessions: 4 }, 10)).toBe(270000);
  expect(suggestedProgramRefund({ pricePaid: 500000, totalSessions: 10, usedSessions: 12 })).toBe(0);
  expect(suggestedProgramRefund({ pricePaid: 90000, totalSessions: null, usedSessions: 0 })).toBeNull();
});

test('재고 원장 상한 잘림 — 잘린 행의 Σ 를 제품별 시작 재고 행으로 접어 Σ 불변 (149 M-1)', () => {
  const e = (id: string, productId: string, kind: 'open' | 'in' | 'sale', qty: number, day: number) => ({ id, productId, kind, qty, resultStock: 0, at: `2026-11-${String(day).padStart(2, '0')}T09:00:00.000Z`, date: `2026-11-${String(day).padStart(2, '0')}` });
  const list = [e('1', 'p', 'open', 10, 1), e('2', 'p', 'in', 5, 2), e('3', 'q', 'open', 3, 2), e('4', 'p', 'sale', -1, 3), e('5', 'q', 'sale', -1, 4)];
  const folded = foldOldest(list, 3);
  expect(folded.map(x => x.id).slice(2)).toEqual(['4', '5']);
  const carried = folded.slice(0, 2);
  expect(carried.every(x => x.kind === 'open')).toBe(true);
  expect(carried.find(x => x.productId === 'p')?.qty).toBe(15);
  expect(carried.find(x => x.productId === 'q')?.qty).toBe(3);
  expect(folded.filter(x => x.productId === 'p').reduce((s2, x) => s2 + x.qty, 0)).toBe(14); // 10 + 5 − 1
});

test('AI 어댑터 계층 — 카탈로그·원격 갱신 검증·토큰/비용 추정·제공사 선택과 폴백·키 마스킹 (150)', () => {
  expect(defaultModel('claude').id).toBe('claude-sonnet-4-20250514');   // AiChat 이 쓰던 모델 그대로(코어 IPC 고정)
  expect(defaultModel('openai').id).toBe('gpt-4o-mini');
  expect(defaultModel('gemini').id).toBe('gemini-1.5-flash');
  expect(findModel('openai', 'gpt-4o').id).toBe('gpt-4o');
  expect(findModel('openai', '없는모델').id).toBe('gpt-4o-mini');          // 모르는 id 는 기본값
  expect(modelsOf('gemini').length).toBeGreaterThanOrEqual(2);
  expect(isAiModel({ provider: 'openai', id: 'x', label: 'X', inputPer1M: 1, outputPer1M: 2, contextK: 8, vision: false })).toBe(true);
  expect(isAiModel({ provider: 'meta', id: 'x', label: 'X', inputPer1M: 1, outputPer1M: 2, contextK: 8, vision: false })).toBe(false);
  expect(setCatalogOverride('잘못된 값')).toBe(false);
  expect(setCatalogOverride([{ provider: 'openai', id: 'gpt-5-mini', label: 'GPT-5 mini', inputPer1M: 0.2, outputPer1M: 0.8, contextK: 256, vision: true, default: true }, { bad: true }])).toBe(true);
  expect(catalog().length).toBe(1);
  expect(defaultModel('openai').id).toBe('gpt-5-mini');
  expect(defaultModel('claude').id).toBe('claude-sonnet-4-20250514');   // 원격 카탈로그에 없는 제공사는 기본 카탈로그로
  expect(setCatalogOverride(null)).toBe(true);
  expect(catalog()).toBe(DEFAULT_CATALOG);
  // 토큰·비용: 한글 1.5자/토큰, 기타 4자/토큰(보수적), 비용 = 단가 × 토큰 / 100만
  expect(estimateTokens('')).toBe(0);
  expect(estimateTokens('가나다')).toBe(2);
  expect(estimateTokens('abcdefgh')).toBe(2);
  expect(estimateUsage('가나다', 'abcd')).toEqual({ input: 2, output: 1, estimated: true });
  expect(estimateCostUsd('openai', 'gpt-4o-mini', { input: 1_000_000, output: 1_000_000, estimated: false })).toBe(0.75);
  expect(estimateCostUsd('gemini', 'gemini-1.5-flash', { input: 0, output: 0, estimated: true })).toBe(0);
  // 선택·폴백: Claude 우선, 키 있는 것만
  expect(selectProvider({ claude: '', openai: 'k', gemini: 'k' })).toBe('openai');
  expect(selectProvider({ claude: 'k', openai: 'k', gemini: '' })).toBe('claude');
  expect(selectProvider({ claude: '', openai: '', gemini: '' })).toBeNull();
  expect(fallbackOrder('claude', { claude: 'k', openai: '', gemini: 'k' })).toEqual(['gemini']);
  expect(fallbackOrder('openai', { claude: 'k', openai: 'k', gemini: 'k' })).toEqual(['claude', 'gemini']);
  // 키 마스킹·형식
  expect(maskAiKey('')).toBe('');
  expect(maskAiKey('sk-short')).toBe('sk••••');
  expect(maskAiKey('sk-ant-api03-ABCDEFGHIJKLMNOP')).toBe('sk-a••••MNOP');
  expect(looksLikeKey('claude', 'sk-ant-api03-ABCDEFGHIJKLMNOP')).toBe(true);
  expect(looksLikeKey('claude', 'sk-proj-ABCDEFGHIJKLMNOPQRS')).toBe(false);
  expect(looksLikeKey('openai', 'sk-proj-ABCDEFGHIJKLMNOPQRS')).toBe(true);
  expect(looksLikeKey('openai', 'sk-ant-api03-ABCDEFGHIJKLMNOP')).toBe(false); // Claude 키를 OpenAI 칸에 (154 L-3)
  expect(looksLikeKey('gemini', 'AIzaSyABCDEFGHIJKLMNOPQRSTUV')).toBe(true);
  expect(looksLikeKey('gemini', 'has space here')).toBe(false);
});

test('키 꼴 탐지·스크럽 — 제공사 키·토큰은 가리고 일반 문자열은 건드리지 않는다 (152)', () => {
  expect(containsKeyLike('sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX')).toBe(true);
  expect(containsKeyLike('키: sk-proj-ABCDEFGHIJKLMNOPQRSTUV 입니다')).toBe(true);
  expect(containsKeyLike('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345')).toBe(true);
  expect(containsKeyLike('ya29.a0AfH6SMBabcdefghijklmnopqrstuv')).toBe(true);
  expect(containsKeyLike('주문번호 ORD-20261124-000123 / 예약 10:00')).toBe(false);
  expect(containsKeyLike('skin care sk-10 라인')).toBe(false);                     // 짧은 sk- 는 키가 아니다
  expect(containsKeyLike('주문 sk-live-order-20261124-01')).toBe(false);            // 24자 미만 코드는 키가 아니다 (154 L-6)
  expect(containsKeyLike('sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123')).toBe(true);
  expect(containsKeyLike('')).toBe(false);
  expect(scrubKeyLike('메모: sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX 끝')).toBe('메모: sk-a••••(가려진 키) 끝');
  expect(scrubKeyLike('두 개 AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345 그리고 sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123')).toBe('두 개 AIza••••(가려진 키) 그리고 sk-p••••(가려진 키)');
  expect(scrubKeyLike('평범한 문장')).toBe('평범한 문장');
  expect(findKeyLikeEntries({ a: '안전', crm_x_customers: '[{"memo":"sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123"}]', ai_key_openai: 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123' })).toEqual(['crm_x_customers', 'ai_key_openai']);
});

test('AI 경영 브리핑 컨텍스트 — 엔진 숫자에 [확정]/[예측] 라벨·근거 모듈, 직원 실명은 가명, 매출 권한 없으면 매출 줄 없음 (153)', () => {
  const metrics = { month: '2026-11', total: 400000, prevMonth: 200000, lastYear: 800000, momPct: 100, yoyPct: -50, target: 800000, achievementPct: 50, newCustomerRevenue: 300000, existingCustomerRevenue: 100000, newSharePct: 75, discount: 20000, programSold: 300000, programRealized: 60000, unusedBalance: 240000, cogs: 80000, sga: 150000, breakEven: 187500, openHours: 136, perHour: 2941, daysElapsed: 20, daysInMonth: 30, isCurrentMonth: true, projected: 600000 };
  const kpi = { visitors: 12, returning: 8, rebooked: 5, revisitRate: 67, rebookRate: 42, avgTicket: 33333, monthRevenue: 400000 };
  const text = formatBriefing({ shopLabel: '우리 매장', today: '2026-11-20', month: '2026-11', metrics, kpi, utilization: { bookedMin: 270, availableMin: 1020, rate: 26 },
    tasks: [{ label: '이탈 위험 고객 연락', count: 3, detail: '90일 위험 매출 약 120,000원' }],
    segments: { total: 40, churnHigh: 3, churnMedium: 5, loyal: 10, dormant: 4, newThisMonth: 6, atRiskRevenue90: 120000 },
    lowStock: [{ name: '앰플', stock: 2, minStock: 5, unit: '개' }],
    staff: [{ name: '김수아', completed: 7, revenue: 350000 }, { name: '박지민', completed: 3, revenue: 90000 }] });
  expect(text).toContain('[확정] 이달 매출 400,000원');
  expect(text).toContain('전월 대비 +100%');
  expect(text).toContain('[예측] 월말 예상 매출 600,000원');
  expect(text).toContain('[확정] 이달 방문 고객 12명 · 재방문율 67%');
  expect(text).toContain('이탈 위험 높음 3명(90일 위험 매출 [추정] 120,000원)');
  expect(text).toContain('이탈 위험 고객 연락 3건');
  expect(text).toContain('앰플 2개(안전 5)');
  expect(text).toContain('직원A 7건 350,000원 / 직원B 3건 90,000원');
  expect(text).not.toContain('김수아'); expect(text).not.toContain('박지민');     // 직원 실명 없음
  expect(text).toContain('revenueMetricsRule'); expect(text).toContain('kpiRule'); // 근거 모듈
  expect(text).toContain('[확정] 이달 가동률 26% (오늘까지 확정·완료 예약 4.5시간 ÷ 직원 근무 가용 17시간'); expect(text).toContain('(utilizationRule)'); // 181
  expect(formatBriefing({ shopLabel: '우리 매장', today: '2026-11-20', month: '2026-11', metrics: null, kpi: null, tasks: [], segments: null, lowStock: [], staff: [], utilization: { bookedMin: 60, availableMin: 0, rate: null } })).not.toContain('가동률'); // 가용 0 이면 줄 없음
  // 직원 계정: 객단가(매출 파생) 줄 생략, 위험 매출 null 이면 괄호 생략 (154 H-2·L-4)
  const staffView = formatBriefing({ shopLabel: '우리 매장', today: '2026-11-20', month: '2026-11', metrics: null, kpi: { ...kpi, avgTicket: null, monthRevenue: 0 }, tasks: [], segments: { total: 40, churnHigh: 3, churnMedium: 5, loyal: 10, dormant: 4, newThisMonth: 6, atRiskRevenue90: null }, lowStock: [], staff: [] });
  expect(staffView).toContain('재예약률 42% (5명) (kpiRule)');
  expect(staffView).not.toContain('객단가');
  expect(staffView).toContain('이탈 위험 높음 3명 · 주의 5명');
  expect(staffView).not.toContain('위험 매출');
  const noSales = formatBriefing({ shopLabel: '우리 매장', today: '2026-11-20', month: '2026-11', metrics: null, kpi: null, tasks: [], segments: null, lowStock: [], staff: [] });
  expect(noSales).toContain('[권한] 매출 자료는 이 계정에 제공되지 않습니다.');
  expect(noSales).toContain('오늘 할 일: 없음');
  expect(noSales).not.toContain('이달 매출');
  expect(pseudonymizeStaff(['a', 'b', 'a', 'c']).get('a')).toBe('직원A');
  expect(pseudonymizeStaff(['a', 'b', 'a', 'c']).get('c')).toBe('직원C');
  expect(BRIEFING_SYSTEM).toContain('숫자를 새로 계산하거나 추정하지 말고');
});

test('광고 메시지 규칙 — (광고)·080 표기, 21~08시 차단과 다음 허용 시각, 동의·채널 거부, 태그 왕복 (155)', () => {
  expect(isQuietHours(new Date(2026, 10, 24, 21, 0))).toBe(true);
  expect(isQuietHours(new Date(2026, 10, 24, 7, 59))).toBe(true);
  expect(isQuietHours(new Date(2026, 10, 24, 8, 0))).toBe(false);
  expect(isQuietHours(new Date(2026, 10, 24, 20, 59))).toBe(false);
  expect(nextAllowedTime(new Date(2026, 10, 24, 22, 30)).toISOString()).toBe(new Date(2026, 10, 25, 8, 0).toISOString()); // 밤 → 다음 날 08:00
  expect(nextAllowedTime(new Date(2026, 10, 24, 3, 0)).toISOString()).toBe(new Date(2026, 10, 24, 8, 0).toISOString());   // 새벽 → 같은 날 08:00
  expect(nextAllowedTime(new Date(2026, 10, 24, 14, 0)).toISOString()).toBe(new Date(2026, 10, 24, 14, 0).toISOString()); // 낮은 그대로
  expect(isValidOptOutNumber('080-123-4567')).toBe(true);
  expect(isValidOptOutNumber('080-1234-5678')).toBe(true);
  expect(isValidOptOutNumber('02-123-4567')).toBe(false);
  expect(decorateAdMessage('11월 이벤트', '080-123-4567')).toBe('(광고) 11월 이벤트\n무료수신거부 080-123-4567');
  expect(decorateAdMessage('(광고) 이미 붙음\n무료수신거부 080-123-4567', '080-123-4567')).toBe('(광고) 이미 붙음\n무료수신거부 080-123-4567'); // 중복 없음
  const consented = { ad: 'consented' as const, sms: true, kakao: false };
  expect(canReceiveAd(consented, 'sms')).toBe(true);
  expect(canReceiveAd(consented, 'kakao')).toBe(false);
  expect(canReceiveAd({ ad: 'unknown', sms: true, kakao: true }, 'sms')).toBe(false);   // 동의 없음 = 광고 불가
  expect(canReceiveAd({ ad: 'optout', sms: true, kakao: true }, 'sms')).toBe(false);
  expect(checkAdSend({ isAd: false, channel: 'sms', now: new Date(2026, 10, 24, 23, 0), optOutNumber: '' }).ok).toBe(true); // 거래 안내는 규칙 밖
  const night = checkAdSend({ isAd: true, channel: 'sms', now: new Date(2026, 10, 24, 23, 0), optOutNumber: '' });
  expect(night.ok).toBe(false);
  expect(night.reasons.length).toBe(2);
  expect(night.reasons[1]).toContain('08:00 이후로 예약 발송');
  expect(checkAdSend({ isAd: true, channel: 'sms', now: new Date(2026, 10, 24, 23, 0), optOutNumber: '080-123-4567', scheduledAt: new Date(2026, 10, 25, 9, 0) }).ok).toBe(true); // 예약 시각이 허용 시간이면 OK
  // 태그 왕복
  expect(consentFromTags(['VIP'])).toEqual({ ad: 'unknown', sms: true, kakao: true, consentAt: undefined });
  expect(consentFromTags(['광고수신동의', '광고동의:2026-11-24', '카카오수신거부'])).toEqual({ ad: 'consented', sms: true, kakao: false, consentAt: '2026-11-24' });
  expect(consentFromTags(['광고수신거부'])).toEqual({ ad: 'optout', sms: true, kakao: true, consentAt: undefined });
  expect(tagsWithConsent(['VIP', '광고수신거부'], { ad: 'consented', sms: false, kakao: true }, '2026-11-24')).toEqual(['VIP', '광고수신동의', '광고동의:2026-11-24', '문자수신거부']);
  expect(tagsWithConsent(['광고수신동의', '광고동의:2026-11-01'], { ad: 'optout', sms: true, kakao: true }, '2026-11-24')).toEqual(['광고수신거부']);
});

test('캠페인 규칙 — 멱등키 버킷, 변수 치환, 후보 선별(중복·동의·채널·번호·변수), 검증 (156)', () => {
  expect(idempotencyKey('c1', 'u1', 'once', { year: '2026', eventId: 'r9' })).toBe('c1|u1|once');
  expect(idempotencyKey('c1', 'u1', 'yearly', { year: '2026', eventId: 'r9' })).toBe('c1|u1|2026');
  expect(idempotencyKey('c1', 'u1', 'per_event', { year: '2026', eventId: 'r9' })).toBe('c1|u1|r9');
  expect(renderCampaignContent('{고객명}님 {예약일시} — {매장명}', { '{고객명}': '김', '{예약일시}': '11.25 14:00', '{매장명}': '샵' })).toBe('김님 11.25 14:00 — 샵');
  expect(renderCampaignContent('{고객명} {잔여회차}회', { '{고객명}': '김' })).toBe('김 {잔여회차}회'); // 값 없는 변수는 그대로 → 선별에서 제외
  const consented: ConsentState = { ad: 'consented', sms: true, kakao: true };
  const raw = (id: string, over: Partial<{ phone: string; consent: ConsentState; eventId: string; vars: Record<string, string> }> = {}) => ({ customerId: id, customerName: id, phone: '01012345678', consent: consented, reason: 'r', eventId: 'e1', vars: {}, ...over });
  const camp = { id: 'c1', repeat: 'per_event' as const, isAd: true, channel: 'sms' as const, content: '{고객명}님 이벤트' };
  const sel = selectCandidates(camp, [
    raw('a'),
    raw('b', { consent: { ad: 'unknown', sms: true, kakao: true } }),
    raw('c', { consent: { ad: 'consented', sms: false, kakao: true } }),
    raw('d', { phone: '02-123' }),
    raw('e', { eventId: 'sent-already' }),
    raw('a', { eventId: 'e2' }), // 같은 고객 다른 사건 → per_event 라 별도 후보
  ], new Set(['c1|e|sent-already']), '2026');
  expect(sel.ready.map(r => r.customerId)).toEqual(['a', 'a']);
  expect(sel.ready[0].key).toBe('c1|a|e1');
  expect(sel.ready[0].message).toBe('a님 이벤트');
  expect(sel.skipped.map(s => s.why)).toEqual(['no_consent', 'channel_optout', 'no_phone', 'already_sent']);
  // 거래 안내(광고 아님)는 동의 없이도 가고, 채널 거부만 본다; once 는 같은 고객 두 사건을 하나로
  const tx = selectCandidates({ ...camp, isAd: false, repeat: 'once', content: '{고객명} {잔여회차}' }, [raw('b', { consent: { ad: 'unknown', sms: true, kakao: true }, vars: { '{잔여회차}': '1' } }), raw('b', { eventId: 'e2', vars: { '{잔여회차}': '1' } }), raw('f', { vars: {} })], new Set(), '2026');
  expect(tx.ready.map(r => r.key)).toEqual(['c1|b|once']);
  expect(tx.skipped.map(s => s.why)).toEqual(['unresolved_vars']);
  // 같은 고객이 사건 둘로 빠지면 제외 목록엔 사람 1명 (178 리뷰 M-4)
  const dup = selectCandidates(camp, [raw('b', { consent: { ad: 'unknown', sms: true, kakao: true } }), raw('b', { consent: { ad: 'unknown', sms: true, kakao: true }, eventId: 'e2' })], new Set(), '2026');
  expect(dup.skipped).toEqual([{ customerId: 'b', customerName: 'b', why: 'no_consent' }]);
  expect(validateCampaign({ name: '', content: '{고객명} {없는변수}', trigger: 'novisit', days: 3 })).toEqual(['캠페인 이름을 입력해주세요.', '마지막 방문 뒤 며칠 이상: 7~365 사이 정수로 입력해주세요.', '쓸 수 없는 변수: {없는변수}']);
  expect(validateCampaign({ name: 'x', content: 'y', trigger: 'reservation_tomorrow', days: 0 })).toEqual([]);
  expect(describeTrigger({ trigger: 'birthday', days: 3 })).toBe('생일 3일 전부터 생일까지');
});

test('기본 시나리오 16개는 모두 유효하고 트리거 11종을 덮으며, 성과 추정은 발송 뒤 14일 창의 예약·결제만 센다 (157)', () => {
  expect(CAMPAIGN_PRESETS.length).toBe(16);
  expect(new Set(CAMPAIGN_PRESETS.map(p => p.name)).size).toBe(16);
  for (const p of CAMPAIGN_PRESETS) expect(validateCampaign(p), p.name).toEqual([]);
  for (const p of CAMPAIGN_PRESETS) expect(renderCampaignContent(p.content, CAMPAIGN_SAMPLE_VARS), p.name).not.toMatch(/\{[^}]+\}/); // 샘플 값이 변수 9종을 전부 덮어 미리보기에 {변수} 가 남지 않는다 (201)
  expect(new Set(CAMPAIGN_PRESETS.map(p => p.trigger)).size).toBe(Object.keys(TRIGGER_LABELS).length); // 트리거 전부에 시나리오 하나 이상
  expect(CAMPAIGN_PRESETS.filter(p => p.isAd).map(p => p.name)).toEqual(['미방문 90일 복귀 혜택', '생일 주간 혜택']); // 혜택만 광고, 거래 안내는 비광고
  expect(missingPresets(['예약 전날 안내', '생일 축하']).length).toBe(14);
  const sends = [{ customerId: 'a', at: '2026-11-01T10:00:00.000Z' }, { customerId: 'a', at: '2026-11-05T10:00:00.000Z' }, { customerId: 'b', at: '2026-11-10T10:00:00.000Z' }, { customerId: 'c', at: '2026-11-10T10:00:00.000Z' }];
  const resv = [
    { customerId: 'a', date: '2026-11-03', status: 'completed' },
    { customerId: 'b', date: '2026-11-30', status: 'confirmed' },   // 창(14일) 밖
    { customerId: 'c', date: '2026-11-12', status: 'cancelled' },   // 취소는 제외
    { customerId: 'a', date: '2026-10-30', status: 'completed' },   // 발송 전
  ];
  const pays = [
    { customerId: 'a', paymentDate: '2026-11-03', amount: 50000, status: 'completed' },
    { customerId: 'a', paymentDate: '2026-11-14', amount: 30000, status: 'completed' },
    { customerId: 'a', paymentDate: '2026-11-16', amount: 99999, status: 'completed' }, // 첫 발송 11-01 + 14 = 11-15 → 밖
    { customerId: 'b', paymentDate: '2026-11-12', amount: 10000, status: 'refunded' },  // 환불 제외
  ];
  const p = estimatePerformance(sends, resv, pays);
  expect(p).toEqual({ sent: 3, reserved: 1, paid: 1, revenue: 80000, windowDays: 14 });
  expect(describePerformance(p, n => n.toLocaleString() + '원')).toBe('[추정] 발송 3명 → 14일 내 예약 1명 · 결제 1명 80,000원');
  expect(describePerformance(estimatePerformance([], [], []), String)).toBeNull(); // 발송 없으면 값을 만들지 않는다
});

test('경영비서 2차 — 목표 페이스·원인 후보 증감률·연락할 고객·빈 시간 가명·캠페인 추천 라벨 (158)', () => {
  expect(targetPace({ target: 1000000, revenue: 400000, daysElapsed: 10, daysInMonth: 30 })).toEqual({ target: 1000000, revenue: 400000, pct: 40, daysLeft: 20, neededPerDay: 30000, paceProjected: 1200000 });
  expect(targetPace({ target: 1000000, revenue: 1200000, daysElapsed: 30, daysInMonth: 30 })).toEqual({ target: 1000000, revenue: 1200000, pct: 120, daysLeft: 0, neededPerDay: null, paceProjected: 1200000 }); // 월말·초과 달성
  expect(describeCause({ label: '방문 고객', current: 25, previous: 30, unit: '명' })).toBe('방문 고객 30명 → 25명 (-17%)');
  expect(describeCause({ label: '객단가', current: 55000, previous: 50000, unit: '원' })).toBe('객단가 50,000원 → 55,000원 (+10%)');
  expect(describeCause({ label: '재예약률', current: 40, previous: null, unit: '%' })).toBe('재예약률 산출 불가 → 40%');
  expect(describeCause({ label: '신규 등록', current: 3, previous: 0, unit: '명' })).toBe('신규 등록 0명 → 3명'); // 지난달 0 이면 증감률 생략
  const base = { shopLabel: '우리 매장', today: '2026-11-24', month: '2026-11', metrics: null, kpi: null, tasks: [], segments: null, lowStock: [], staff: [] };
  const t = formatBriefing({ ...base,
    contacts: [{ campaign: '예약 전날 안내', ready: 3, skipped: 1 }],
    freeSlots: [{ staff: '김수아', slots: ['14:00', '15:30'], total: 5 }, { staff: '박지민', slots: [], total: 0 }],
    target: { target: 1000000, revenue: 400000, pct: 40, daysLeft: 20, neededPerDay: 30000, paceProjected: 1200000 },
    causes: [{ label: '방문 고객', current: 25, previous: 30, unit: '명' }],
    recommendations: [{ campaign: '미방문 60일 케어 안내', ready: 12, exists: false }, { campaign: '예약 전날 안내', ready: 3, exists: true }] });
  expect(t).toContain('[확정] 오늘 연락할 고객(캠페인별 대상 수, 직원 승인 뒤 발송): 예약 전날 안내 3명(제외 1)');
  expect(t).toContain('[확정] 오늘 빈 시간(60분 시술 기준 시작 가능 시각, 지금 이후): 직원A 14:00·15:30 외 3칸');
  expect(t).not.toContain('김수아'); expect(t).not.toContain('박지민'); // 빈 시간도 가명
  expect(t).toContain('[확정] 목표 대비: 400,000원 / 1,000,000원 (40%) · 남은 20일 · [예측] 목표 도달에 하루 30,000원 필요 · [예측] 지금 속도면 월말 1,200,000원');
  expect(t).toContain('[확정] 전월 대비 변화(원인 후보, 지난달 → 이달): 방문 고객 30명 → 25명 (-17%)');
  expect(t).toContain('[추정] 이번 주 캠페인 추천(지금 대상 수 많은 순): 미방문 60일 케어 안내 12명(기본 시나리오, 아직 미등록) / 예약 전날 안내 3명');
  const empty = formatBriefing({ ...base, contacts: [], freeSlots: [{ staff: 'x', slots: [], total: 0 }], target: null, causes: [], recommendations: [] });
  expect(empty).toContain('오늘 연락할 고객(캠페인): 대상 없음');
  expect(empty).toContain('오늘 빈 시간: 없음');
  expect(empty).not.toContain('목표 대비'); expect(empty).not.toContain('전월 대비 변화');
  expect(empty).toContain('캠페인 추천: 지금 대상이 있는 시나리오 없음');
  expect(BRIEFING_SYSTEM).toContain('6) 캠페인 추천은');
});

test('리뷰 반영 — 동의 태그 보존·판별, 080 번호 기준 꼬리말, 생일 연도 버킷, 성과 추정 로컬 날짜 (159)', () => {
  // H-1: 편집 폼 저장은 일반 태그만 바꾸고 동의 태그는 그대로 — 타이핑한 동의 예약어는 버린다
  expect(isConsentTag('광고수신거부')).toBe(true); expect(isConsentTag('광고동의:2026-11-24')).toBe(true); expect(isConsentTag('VIP')).toBe(false);
  expect(mergeGeneralTags(['VIP', '광고수신동의', '민감성'], ['재구매', '광고수신거부', '문자수신거부'])).toEqual(['VIP', '민감성', '광고수신거부', '문자수신거부']);
  // M-4: 문구가 있어도 번호가 없으면 꼬리말을 붙인다
  expect(decorateAdMessage('무료수신거부는 매장으로 연락주세요', '080-123-4567')).toBe('(광고) 무료수신거부는 매장으로 연락주세요\n무료수신거부 080-123-4567');
  // M-2: yearly 는 후보의 연도 버킷(생일 연도) 우선 — 12월 말 실행과 1월 초 실행이 같은 키
  const consented = { ad: 'consented' as const, sms: true, kakao: true };
  const r = { customerId: 'u', customerName: 'u', phone: '01012345678', consent: consented, reason: 'r', vars: {}, eventId: '2027-01-03', yearBucket: '2027' };
  const dec = selectCandidates({ id: 'c', repeat: 'yearly', isAd: false, channel: 'sms', content: 'x' }, [r], new Set(), '2026');
  expect(dec.ready[0].key).toBe('c|u|2027');
  expect(selectCandidates({ id: 'c', repeat: 'yearly', isAd: false, channel: 'sms', content: 'x' }, [r], new Set(['c|u|2027']), '2027').ready.length).toBe(0);
  // M-1: 발송 시각은 로컬 날짜로 — 로컬 08:30 발송(UTC 전날)에 전날 예약이 "발송 뒤"로 잡히지 않는다
  const at = new Date(2026, 10, 25, 8, 30).toISOString();
  const p = estimatePerformance([{ customerId: 'a', at }], [{ customerId: 'a', date: '2026-11-24', status: 'completed' }, { customerId: 'a', date: '2026-11-25', status: 'confirmed' }], []);
  expect(p.reserved).toBe(1);
  expect(estimatePerformance([{ customerId: 'a', at }], [{ customerId: 'a', date: '2026-11-24', status: 'completed' }], []).reserved).toBe(0);
});

test('AI 게이트웨이 규칙 — 모델 라우터(티어·비전·크레딧 보호·폴백 순서)와 크레딧 원장(불변식·멱등·만료) (160)', () => {
  const cat = GW_CATALOG; const all: GwProvider[] = ['claude', 'openai', 'gemini'];
  expect(tierFor('chat', 'trial')).toBe('economy'); expect(tierFor('briefing', 'starter')).toBe('standard'); expect(tierFor('campaign-copy', 'enterprise')).toBe('premium'); expect(tierFor('chat', 'pro')).toBe('standard');
  const eco = routeModel({ kind: 'chat', plan: 'trial', needsVision: false, available: all, catalog: cat, creditsAvailable: 1000 });
  expect(eco.tier).toBe('economy'); expect(eco.primary?.id).toBe('gpt-4o-mini'); // economy 밴드(≤1 USD/1M) 중 가장 비싼 것(품질 우선)
  expect(eco.fallbacks.map(m => m.id)).toEqual(['gemini-1.5-flash']);
  const std = routeModel({ kind: 'chat', plan: 'pro', needsVision: false, available: all, catalog: cat, creditsAvailable: 1000 });
  expect(std.primary?.id).toBe('claude-sonnet-4-20250514'); // standard ≤20: claude 18 > gpt-4o 12.5 > gemini pro 6.25 > …
  expect(std.fallbacks.map(m => m.id)).toEqual(['gpt-4o', 'gemini-1.5-pro', 'gpt-4o-mini', 'gemini-1.5-flash']);
  const vis = routeModel({ kind: 'skin-analysis', plan: 'pro', needsVision: true, available: ['openai', 'gemini'], catalog: cat, creditsAvailable: 1000 });
  expect(vis.primary?.id).toBe('gpt-4o'); expect(vis.fallbacks.map(m => m.id)).toEqual(['gemini-1.5-pro', 'gpt-4o-mini', 'gemini-1.5-flash']); // 키 없는 claude 제외
  const low = routeModel({ kind: 'briefing', plan: 'enterprise', needsVision: false, available: all, catalog: cat, creditsAvailable: 150 });
  expect(low.tier).toBe('economy'); expect(low.reason).toBe('low-credits'); expect(low.primary?.id).toBe('gpt-4o-mini'); // 크레딧 보호
  expect(routeModel({ kind: 'chat', plan: 'pro', needsVision: false, available: all, catalog: cat, creditsAvailable: 0 }).reason).toBe('no-credits');
  expect(routeModel({ kind: 'chat', plan: 'pro', needsVision: false, available: [], catalog: cat, creditsAvailable: 10 }).reason).toBe('no-model');
  const pricey = cat.filter(m => m.id === 'claude-sonnet-4-20250514' || m.id === 'gpt-4o');
  const forced = routeModel({ kind: 'chat', plan: 'trial', needsVision: false, available: all, catalog: cat.length ? pricey : cat, creditsAvailable: 1000 });
  expect(forced.primary?.id).toBe('gpt-4o'); expect(forced.fallbacks).toEqual([]); // 밴드 안 후보가 없으면 가장 싼 것 하나
  // 크레딧 원장
  expect(creditsForCost(0.0123)).toBe(35); // 0.0123 × 1,400 × 2.0 = 34.44 → 35
  expect(creditsForCost(0)).toBe(0);
  let led: LedgerEntry[] = [];
  const add = (e: LedgerEntry) => { const r = applyEntry(led, e); expect(r.ok, JSON.stringify(e)).toBe(true); if (r.ok) led = r.entries; };
  add({ id: 'g1', kind: 'grant', amount: 1000, at: '2026-11-01T00:00:00Z', note: '월 지급' });
  add({ id: 'h1', kind: 'hold', amount: 300, at: '2026-11-02T00:00:00Z', requestId: 'r1' });
  expect(ledgerState(led)).toEqual({ balance: 1000, holds: 300, available: 700 });
  expect(applyEntry(led, { id: 'h2', kind: 'hold', amount: 701, at: '', requestId: 'r2' }).ok).toBe(false); // 가용 초과
  add({ id: 'c1', kind: 'consume', amount: 250, at: '2026-11-02T00:01:00Z', requestId: 'r1' }); // 홀드 300 → 실제 250
  expect(ledgerState(led)).toEqual({ balance: 750, holds: 0, available: 750 });
  const dup = applyEntry(led, { id: 'c1b', kind: 'consume', amount: 250, at: '', requestId: 'r1' });
  expect(dup.ok && dup.entries.length).toBe(led.length); // 멱등 — 같은 requestId 는 무시
  expect(applyEntry(led, { id: 'x', kind: 'consume', amount: 0, at: '', requestId: 'r9' }).ok).toBe(false);
  expect(applyEntry(led, { id: 'x', kind: 'hold', amount: 10, at: '' }).ok).toBe(false); // requestId 없음
  add({ id: 'h3', kind: 'hold', amount: 100, at: '', requestId: 'r3' }); add({ id: 'rl3', kind: 'release', amount: 100, at: '', requestId: 'r3' });
  expect(ledgerState(led).holds).toBe(0);
  add({ id: 'rf1', kind: 'refund', amount: 50, at: '' });
  expect(ledgerState(led).balance).toBe(800);
  const ex = expireEntry(led, 'e1', '2026-11-30T23:59:59Z'); expect(ex?.amount).toBe(800);
  add(ex!); expect(ledgerState(led).balance).toBe(0); expect(expireEntry(led, 'e2', '')).toBeNull();
  expect(MONTHLY_GRANT.pro).toBe(4500);
  // 165 리뷰 M-3·L-5·L-4: 월말 소멸은 활성 홀드를 남긴다, 같은 requestId 홀드 중복·열린 홀드 없는 release 거절, NaN 크레딧은 거절
  let l2: LedgerEntry[] = [];
  const add2 = (e: LedgerEntry) => { const r = applyEntry(l2, e); expect(r.ok, JSON.stringify(e)).toBe(true); if (r.ok) l2 = r.entries; };
  add2({ id: 'g', kind: 'grant', amount: 1000, at: '' }); add2({ id: 'h', kind: 'hold', amount: 300, at: '', requestId: 'q1' });
  expect(applyEntry(l2, { id: 'h2', kind: 'hold', amount: 10, at: '', requestId: 'q1' }).ok).toBe(false);
  expect(applyEntry(l2, { id: 'r9', kind: 'release', amount: 10, at: '', requestId: 'q9' }).ok).toBe(false);
  const ex2 = expireEntry(l2, 'x', ''); expect(ex2?.amount).toBe(700); add2(ex2!);
  expect(ledgerState(l2)).toEqual({ balance: 300, holds: 300, available: 0 });
  add2({ id: 'c', kind: 'consume', amount: 300, at: '', requestId: 'q1' }); // 진행 중 호출은 월말 뒤에도 차감된다
  expect(ledgerState(l2)).toEqual({ balance: 0, holds: 0, available: 0 });
  expect(applyEntry(l2, { id: 'x2', kind: 'expire', amount: 1, at: '' }).ok).toBe(false);
  expect(routeModel({ kind: 'chat', plan: 'pro', needsVision: false, available: all, catalog: cat, creditsAvailable: Number.NaN }).reason).toBe('no-credits');
  expect(forced.tier).toBe('standard'); // 전부 밴드 밖이면 고른 모델의 실제 밴드로 보고(gpt-4o 12.5 → standard)
});

test('AI 원가·가격 시뮬레이터 — 호출 원가·플랜 원가·시나리오·목표 마진 요금·예산 상한(문서 AI-PRICING-AND-COST-ANALYSIS 표와 일치) (163)', () => {
  const a: SimAssumptions = { usagePerShop: DEFAULT_USAGE, tokens: DEFAULT_TOKENS, fxKrwPerUsd: 1400, planPriceKrw: DEFAULT_PLAN_PRICE_KRW, catalog: GW_CATALOG, available: ['claude', 'openai', 'gemini'] };
  const c = costPerCall('chat', 'trial', a);
  expect(c.model).toBe('gpt-4o-mini'); expect(c.usd).toBeCloseTo(1500 / 1e6 * 0.15 + 400 / 1e6 * 0.6, 9); // 0.000465
  expect(costPerCall('briefing', 'trial', a).model).toBe('claude-sonnet-4-20250514'); // 브리핑은 한 단계 위 티어
  expect(costPerCall('skin-analysis', 'trial', a).model).toBe('gpt-4o-mini');          // economy 비전
  const starter = simulatePlan('starter', a);
  expect(starter.callsPerShop).toBe(60); expect(starter.costUsdPerShop).toBeCloseTo(0.214, 3); expect(Math.round(starter.costKrwPerShop)).toBe(300); expect(starter.marginPct).toBe(94);
  const pro = simulatePlan('pro', a);
  expect(pro.costUsdPerShop).toBeCloseTo(1.457, 3); expect(pro.marginPct).toBe(79);
  expect(simulatePlan('trial', a).marginPct).toBeNull(); // 무료 플랜은 마진율 없음(값을 만들지 않는다)
  const sc = simulate(100, DEFAULT_PLAN_MIX, a);
  expect(sc.rows.map(r => r.shops)).toEqual([20, 40, 30, 10]);
  expect(sc.totalCalls).toBe(9260); expect(Math.round(sc.totalCostKrw)).toBe(112599); expect(sc.totalRevenueKrw).toBe(692000); expect(sc.marginPct).toBe(84);
  expect(budgetCapKrw(sc)).toBe(170000);
  expect(priceForMargin('pro', 50, a)).toBe(4100); expect(priceForMargin('enterprise', 85, a)).toBe(24500); expect(priceForMargin('pro', 100, a)).toBe(Number.POSITIVE_INFINITY);
  expect(simulate(1000, DEFAULT_PLAN_MIX, { ...a, available: ['openai'] }).marginPct).toBe(88); // Claude 없이 OpenAI 만 — 원가 ↓
  // 165 리뷰 M-2: 플랜별 월 지급 크레딧이 가정 사용량의 크레딧 환산을 덮어야 한다(평균 매장이 매달 상한에 걸리지 않게)
  for (const p of ['trial', 'starter', 'pro', 'enterprise'] as const) expect(creditsForCost(simulatePlan(p, a).costUsdPerShop), p).toBeLessThanOrEqual(MONTHLY_GRANT[p]);
  // 165 리뷰 L-6: 매장 배분 합 = 매장 수
  expect(Object.values(allocateShops(5, DEFAULT_PLAN_MIX)).reduce((x, y) => x + y, 0)).toBe(5);
  expect(allocateShops(5, DEFAULT_PLAN_MIX)).toEqual({ trial: 1, starter: 2, pro: 2, enterprise: 0 }); // 1.0/2.0/1.5/0.5 → 바닥 1/2/1/0, 잔여 1 은 소수 큰 pro(동률 enterprise 보다 앞 순서)
});

test('파일럿 지표 — 초기 설정 6단계·활용 7영역·활동 상태·요약 정렬 (164)', () => {
  const full: BranchCounts = { recordCounts: { shop_settings: 1, staff: 2, services: 5, customers: 40, reservations: 30, payments: 20, treatment_logs: 10, customer_programs: 3 }, photoCount: 4, messageCount: 2, lastActivity: '2026-11-23T10:00:00.000Z' };
  const half: BranchCounts = { recordCounts: { shop_settings: 1, programs: 1, customers: 3 }, photoCount: 0, messageCount: 0, lastActivity: '2026-11-01T10:00:00.000Z' };
  const empty: BranchCounts = { recordCounts: {}, photoCount: 0, messageCount: 0, lastActivity: null };
  expect(setupCompletionPct(full)).toBe(100); expect(utilizationPct(full)).toBe(100);
  expect(setupChecks(half).filter(x => !x.done).map(x => x.label)).toEqual(['직원 1명 이상', '고객 5명 이상', '첫 예약', '첫 결제']); // 프로그램 1개는 메뉴 단계 충족
  expect(setupCompletionPct(half)).toBe(33); expect(utilizationPct(half)).toBe(14); // 고객만 사용(1/7)
  expect(setupCompletionPct(empty)).toBe(0);
  const now = new Date('2026-11-24T12:00:00.000Z');
  expect(activityLevel(full.lastActivity, now)).toBe('active'); expect(activityLevel(half.lastActivity, now)).toBe('idle');
  expect(activityLevel('2026-09-01T00:00:00.000Z', now)).toBe('dormant'); expect(activityLevel(null, now)).toBe('none'); expect(activityLevel('bad', now)).toBe('none');
  const s = pilotSummary([{ branchId: 'a', name: '강남점', counts: full }, { branchId: 'b', name: '판교점', counts: half }, { branchId: 'c', name: '신규점', counts: empty }], now);
  expect(s.branches).toBe(3); expect(s.avgSetupPct).toBe(44); expect(s.avgUtilizationPct).toBe(38);
  expect(s.byActivity).toEqual({ active: 1, idle: 1, dormant: 0, none: 1 });
  expect(s.rows.map(r => r.name)).toEqual(['신규점', '판교점', '강남점']); // 덜 된 지점이 위
  expect(pilotSummary([], now).avgSetupPct).toBeNull(); // 지점 없으면 값을 만들지 않는다
});

test('저장 세그먼트 규칙 — AND 조건 평가·빈 조건 거절·설명 (166)', () => {
  const f: CustomerFacts = { id: 'a', grade: 'VIP', tags: ['민감성', '재구매'], lastVisitDate: '2026-10-01', totalVisits: 7, totalSpent: 850000, recentPayments: [{ date: '2026-11-10', amount: 200000 }, { date: '2026-08-01', amount: 300000 }, { date: '2026-11-24', amount: 50000 }], activePrograms: 1, rfmSegment: '충성', churnLevel: 'medium', birthMonth: 11, hasUpcoming: false, adConsent: 'consented' };
  const today = '2026-11-24'; // 마지막 방문 54일 전
  expect(matchesSegment(f, {}, today)).toBe(true);
  expect(matchesSegment(f, { grades: ['VIP', '골드'], tagsAny: ['재구매'], lastVisitDaysMin: 30, lastVisitDaysMax: 60, visitsMin: 5, spentMin: 500000, rfmSegments: ['충성'], churnLevels: ['medium'], birthdayThisMonth: true, hasUpcoming: false, adConsent: 'consented' }, today)).toBe(true);
  expect(matchesSegment(f, { grades: ['일반'] }, today)).toBe(false);
  expect(matchesSegment(f, { tagsAny: ['신규'] }, today)).toBe(false);
  expect(matchesSegment(f, { lastVisitDaysMin: 60 }, today)).toBe(false);   // 54 < 60
  expect(matchesSegment(f, { lastVisitDaysMax: 30 }, today)).toBe(false);
  expect(matchesSegment({ ...f, lastVisitDate: null }, { lastVisitDaysMin: 0 }, today)).toBe(false); // 미방문은 일수 조건에 안 걸린다
  expect(matchesSegment(f, { visitsMax: 6 }, today)).toBe(false);
  expect(matchesSegment(f, { hasUpcoming: true }, today)).toBe(false);
  expect(matchesSegment(f, { birthdayThisMonth: true }, '2026-12-01')).toBe(false);
  expect(matchesSegment(f, { adConsent: 'optout' }, today)).toBe(false);
  // 175: 최근 N일 결제 합(양끝 포함)·진행 중 회차권
  expect(matchesSegment(f, { recentSpendMin: 250000 }, today)).toBe(true);                       // 기본 90일(08-26~): 200,000 + 50,000 = 250,000 (08-01 은 밖)
  expect(matchesSegment(f, { recentSpendMin: 250001 }, today)).toBe(false);
  expect(matchesSegment(f, { recentSpendDays: 30, recentSpendMin: 250000 }, today)).toBe(true);   // 10-25~: 250,000
  expect(matchesSegment(f, { recentSpendDays: 7, recentSpendMin: 100000 }, today)).toBe(false);   // 11-17~: 50,000
  expect(matchesSegment(f, { recentSpendDays: 120, recentSpendMin: 550000 }, today)).toBe(true);  // 07-27~: 전부
  const fr = { ...f, recentPayments: [...f.recentPayments, { date: '2026-11-15', amount: -200000 }] }; // 11-10 결제를 11-15 에 전액 환불 (178 리뷰 M-1)
  expect(matchesSegment(fr, { recentSpendMin: 250000 }, today)).toBe(false); expect(matchesSegment(fr, { recentSpendMin: 50000 }, today)).toBe(true); // 90일 합 50,000
  expect(matchesSegment(fr, { recentSpendDays: 7, recentSpendMin: 50000 }, today)).toBe(true); // 환불일이 창 밖이면 차감도 없다
  expect(matchesSegment(f, { hasActiveProgram: true }, today)).toBe(true); expect(matchesSegment({ ...f, activePrograms: 0 }, { hasActiveProgram: true }, today)).toBe(false);
  expect(isEmptyCondition({ hasActiveProgram: false })).toBe(false); expect(isEmptyCondition({ recentSpendDays: 30 })).toBe(true); // 기간만으론 조건이 아니다
  expect(validateSegment('x', { recentSpendDays: 30 })).toEqual(['조건을 하나 이상 넣어주세요(비어 있으면 전체 고객).', '최근 결제 기간을 쓰려면 최소 금액도 입력해주세요.']);
  expect(validateSegment('x', { recentSpendDays: 400, recentSpendMin: 1 })).toEqual(['최근 결제 기간: 1~365일로 입력해주세요.']);
  expect(describeSegment({ recentSpendMin: 100000, hasActiveProgram: true })).toBe('최근 90일 결제 100,000원 이상 · 진행 중 회차권 있음');
  expect(isEmptyCondition({})).toBe(true); expect(isEmptyCondition({ grades: [] })).toBe(true); expect(isEmptyCondition({ hasUpcoming: false })).toBe(false);
  expect(validateSegment('', {})).toEqual(['세그먼트 이름을 입력해주세요.', '조건을 하나 이상 넣어주세요(비어 있으면 전체 고객).']);
  expect(validateSegment('x', { lastVisitDaysMin: 90, lastVisitDaysMax: 30 })).toEqual(['마지막 방문 일수의 최소가 최대보다 큽니다.']);
  expect(validateSegment('x', { visitsMin: -1 })).toEqual(['최소 방문 횟수: 1 이상 정수로 입력해주세요.']);
  expect(validateSegment('x', { spentMin: 0 })).toEqual(['최소 누적 결제: 1 이상 정수로 입력해주세요.']); // 0 원 이상은 조건이 아니다 (178 리뷰 L-1)
  expect(validateSegment('x', { lastVisitDaysMin: 0 })).toEqual([]); // 방문 뒤 0일 이상은 "방문 기록 있음" 이라 조건
  expect(describeSegment({ grades: ['VIP'], lastVisitDaysMin: 60, hasUpcoming: false, adConsent: 'consented' })).toBe('등급 VIP · 마지막 방문 60일 이상 전 · 다음 예약 없음 · 광고 동의');
  expect(describeSegment({})).toBe('전체');
});

test('캠페인 대상을 저장 세그먼트로 좁힌다 — 세그먼트 밖은 제외 사유, 없으면 제한 없음 (167)', () => {
  const consented = { ad: 'consented' as const, sms: true, kakao: true };
  const raw = (id: string) => ({ customerId: id, customerName: id, phone: '01012345678', consent: consented, reason: 'r', eventId: 'e', vars: {} });
  const camp = { id: 'c', repeat: 'per_event' as const, isAd: false, channel: 'sms' as const, content: '{고객명}' };
  const sel = selectCandidates(camp, [raw('a'), raw('b')], new Set(), '2026', new Set(['b']));
  expect(sel.ready.map(r => r.customerId)).toEqual(['b']); expect(sel.skipped).toEqual([{ customerId: 'a', customerName: 'a', why: 'not_in_segment' }]);
  expect(selectCandidates(camp, [raw('a'), raw('b')], new Set(), '2026', null).ready.length).toBe(2);
  expect(selectCandidates(camp, [raw('a')], new Set(), '2026', new Set()).ready.length).toBe(0); // 삭제된 세그먼트 → 아무에게도
});

test('고객 포털 규칙 — OTP 재요청 간격·만료·5회 잠금·세션, 노출 항목은 내 예약·회차권·동의만 (169)', () => {
  const t0 = 1_700_000_000_000;
  const r1 = requestOtp(EMPTY_OTP, t0, 'h1'); expect(r1.ok).toBe(true);
  let st: OtpState = r1.ok ? r1.state : EMPTY_OTP;
  expect(requestOtp(st, t0 + 30_000, 'h2')).toEqual({ ok: false, reason: 'too-soon', retryAfterMs: OTP_RESEND_GAP_MS - 30_000 });
  expect(requestOtp(st, t0 + OTP_RESEND_GAP_MS, 'h2').ok).toBe(true);
  expect(verifyOtp(st, t0 + OTP_TTL_MS + 1, h => h === 'h1').ok).toBe(false); // 만료
  expect((verifyOtp(st, t0 + OTP_TTL_MS + 1, h => h === 'h1') as { reason: string }).reason).toBe('expired');
  for (let i = 1; i <= 4; i++) { const v = verifyOtp(st, t0 + 1000 * i, () => false); expect(v.ok).toBe(false); st = v.state; expect(st.fails).toBe(i); expect(st.lockedUntil).toBeNull(); }
  const fifth = verifyOtp(st, t0 + 5000, () => false); expect(fifth.ok).toBe(false); st = fifth.state;
  expect(st.lockedUntil).toBe(t0 + 5000 + OTP_LOCK_MS); expect(st.codeHash).toBeNull(); // 5회 → 15분 잠금, 코드 폐기
  expect(requestOtp(st, t0 + 6000, 'h3')).toEqual({ ok: false, reason: 'locked', retryAfterMs: OTP_LOCK_MS - 1000 });
  const again = requestOtp(st, t0 + 5000 + OTP_LOCK_MS, 'h3'); expect(again.ok).toBe(true); if (again.ok) { expect(again.state.fails).toBe(0); st = again.state; } // 잠금 해제 뒤 실패 수 초기화
  const okv = verifyOtp(st, t0 + 5000 + OTP_LOCK_MS + 10, h => h === 'h3');
  expect(okv.ok).toBe(true); if (okv.ok) { expect(okv.sessionExpiresAt).toBe(t0 + 5000 + OTP_LOCK_MS + 10 + PORTAL_SESSION_MS); expect(okv.state).toEqual(EMPTY_OTP); }
  expect(verifyOtp(EMPTY_OTP, t0, () => true)).toEqual({ ok: false, reason: 'none', state: EMPTY_OTP });
  expect(isValidOtpCode('123456')).toBe(true); expect(isValidOtpCode('12345')).toBe(false); expect(isValidOtpCode('12345a')).toBe(false);
  const sum = portalSummaryOf({
    name: '김고객',
    reservations: [
      { date: '2026-11-30', startTime: '14:00', serviceNames: ['수분 관리'], status: 'confirmed' },
      { date: '2026-11-25', startTime: '10:00', serviceNames: ['진정'], status: 'pending' },
      { date: '2026-11-26', startTime: '11:00', serviceNames: ['x'], status: 'cancelled' },
      { date: '2026-11-20', startTime: '11:00', serviceNames: ['지난'], status: 'completed' },
      { date: '2027-01-10', startTime: '11:00', serviceNames: ['먼 미래'], status: 'confirmed' },
    ],
    programs: [{ programName: '수분 10회', remaining: 3, expiryDate: '2027-01-31', isCompleted: false }, { programName: '끝난 것', remaining: 0, isCompleted: true }],
    consent: { ad: 'consented', sms: true, kakao: false },
  }, '2026-11-24');
  expect(sum.upcoming).toEqual([{ date: '2026-11-25', startTime: '10:00', services: '진정' }, { date: '2026-11-30', startTime: '14:00', services: '수분 관리' }]); // 30일 안·취소/완료 제외·시간순
  expect(sum.programs).toEqual([{ programName: '수분 10회', remaining: 3, expiryDate: '2027-01-31' }]);
  expect(Object.keys(sum).sort()).toEqual(['consent', 'name', 'programs', 'upcoming']); // 주소·메모·결제·직원 없음
});

test('중복 고객 후보 — 전화·이메일·이름+생년월일·이름+전화 뒷 4자리, 점수 정렬, 샘플 입력 정규화 (171)', () => {
  const t: DupInput = { id: 't', name: '김 민수', phone: '010-1234-5678', birthDate: '1990-05-05', email: 'Kim@Example.com' };
  const others: DupInput[] = [
    { id: 'a', name: '박영희', phone: '01012345678' },                         // 전화 같음
    { id: 'b', name: '김민수', phone: '010-9999-5678' },                       // 이름 + 뒷 4자리
    { id: 'c', name: '김민수', phone: '010-0000-0000', birthDate: '1990-05-05' }, // 이름 + 생년월일
    { id: 'd', name: '이지은', phone: '010-0000-1111', email: 'kim@example.com' }, // 이메일(대소문자 무시)
    { id: 'e', name: '김민수', phone: '010-1234-5678', birthDate: '1990-05-05' }, // 전화+이름+생일 → 최고점(뒷 4자리는 번호가 같아 생략)
    { id: 'f', name: '최수', phone: '010-5555-5678' },                         // 뒷 4자리만 같고 이름 다름 → 후보 아님
    { id: 't', name: '김 민수', phone: '010-1234-5678' },                      // 자기 자신 제외
  ];
  const r = duplicateCandidates(t, others);
  expect(r.map(x => x.customer.id)).toEqual(['e', 'a', 'd', 'c', 'b']);
  expect(r[0].reasons).toEqual(['phone', 'name+birth']); expect(r[0].score).toBe(170);
  expect(r.find(x => x.customer.id === 'b')?.reasons).toEqual(['name+phone4']);
  expect(duplicateCandidates({ id: 'x', name: '홍길동', phone: '12' }, [{ id: 'y', name: '홍길동', phone: '12' }])).toEqual([]); // 8자리 미만 번호·생일 없음 → 사유 없음
  expect(normalizeName(' Kim, Min-Su ')).toBe('kimminsu');
});

test('예약 정책 — 겹침 판정: 정책 켬이면 막고, 꺼짐이면 확인, 겹침 없으면 허용 (173)', () => {
  expect(decideOverlap({ blockOverlap: true }, true)).toBe('block');
  expect(decideOverlap({ blockOverlap: false }, true)).toBe('confirm');
  expect(decideOverlap({ blockOverlap: true }, false)).toBe('allow');
});

test('대기 요청 안내 — 같은 날 처리 전 요청만, 취소된 시각과 가까운 순, 문장은 건수·시각만 (185)', () => {
  const rq = (id: string, date: string, startTime: string, status = 'new') => ({ id, date, startTime, status });
  const list = [rq('a', '2026-11-26', '10:00'), rq('b', '2026-11-26', '15:30'), rq('c', '2026-11-26', '14:00', 'rejected'), rq('d', '2026-11-27', '14:00'), rq('e', '2026-11-26', '14:00'), rq('f', '2026-11-26', '13:00')];
  expect(waitlistFor(list, '2026-11-26', '14:00').map(r => r.id)).toEqual(['e', 'f', 'b', 'a']); // 0·60·90·240분 차이
  expect(waitlistFor(list, '2026-11-26').map(r => r.id)).toEqual(['a', 'f', 'e', 'b']);           // 기준 시각 없으면 시각순
  expect(waitlistFor(list, '2026-11-28')).toEqual([]);
  expect(describeWaitlist(waitlistFor(list, '2026-11-26', '14:00'), '11월 26일')).toBe('11월 26일에 들어오고 싶어 한 대기 요청 4건(14:00·13:00·15:30 외)이 있습니다 — 예약 요청함에서 연락해 보세요.');
  expect(describeWaitlist([], '11월 26일')).toBeNull();
});

test('백업 테이블 모양 — 설정은 객체, 나머지는 배열, RAW 포장 허용, 스칼라 플래그는 제외, 객체 오류는 손상 (195 H-1·196)', () => {
  expect(backupTableShape('customers', [])).toBe('ok');
  expect(backupTableShape('customers', [{ id: 'a' }])).toBe('ok');
  expect(backupTableShape('settings', { name: '매장' })).toBe('ok');
  expect(backupTableShape('settings', { __raw: 'not-json' })).toBe('ok');
  expect(backupTableShape('customers', { __raw: 'not-json' })).toBe('ok');
  expect(backupTableShape('setup_hidden', 1)).toBe('scalar');          // 체크리스트 숨김 플래그 '1' — 백업 제외·복원 무시
  expect(backupTableShape('setup_hidden', '1')).toBe('scalar');
  expect(backupTableShape('flag', true)).toBe('scalar');
  expect(backupTableShape('flag', null)).toBe('scalar');
  expect(backupTableShape('customers', {})).toBe('invalid');           // 배열이어야 할 테이블이 객체 — 손상
  expect(backupTableShape('customers', { __raw: 'x', extra: 1 })).toBe('invalid');
  expect(backupTableShape('settings', [])).toBe('invalid');            // 설정이 배열 — 손상
});

test('발송 이력 미연동 판정 — 실패·성공 0·비용 0/없음/null 이면 미연동, 비용이 있거나 성공이 있으면 아님 (206)', () => {
  expect(isGatewayPendingHistory({ status: 'failed', successCount: 0, cost: 0 })).toBe(true);
  expect(isGatewayPendingHistory({ status: 'failed', successCount: 0 })).toBe(true);
  expect(isGatewayPendingHistory({ status: 'failed', successCount: 0, cost: null })).toBe(true); // 서버 JSONB 옛 행 — 화면·타임라인이 같은 답
  expect(isGatewayPendingHistory({ status: 'failed', successCount: 0, cost: 11 })).toBe(false);
  expect(isGatewayPendingHistory({ status: 'failed', successCount: 1, cost: 0 })).toBe(false);
  expect(isGatewayPendingHistory({ status: 'sent', successCount: 0, cost: 0 })).toBe(false);
});

test('다시 보낼 미연동 건 — 그 뒤 성공 건이 있을 때만, 수신 고객 기록·30일 안의 것만 (208)', () => {
  const now = new Date('2026-11-25T12:00:00');
  const pend = (id: string, day: string) => ({ id, status: 'failed', successCount: 0, cost: 0, sentAt: `2026-11-${day}T10:00:00` });
  const ok = (id: string, day: string) => ({ id, status: 'sent', successCount: 1, cost: 11, sentAt: `2026-11-${day}T10:00:00` });
  const all = () => true;
  expect(countResendable([pend('a', '20'), pend('b', '21')], all, now)).toBe(0); // 성공 건이 없으면 발송사가 살아난 증거가 없다 — 권하지 않음
  expect(countResendable([pend('a', '20'), ok('s', '22'), pend('b', '23')], all, now)).toBe(1); // 성공(22일) 전의 미연동(20일)만, 그 뒤 미연동(23일)은 아직
  expect(countResendable([pend('a', '20'), ok('s', '22')], id => id !== 'a', now)).toBe(0); // 수신 고객 기록이 없는 건은 다시 보낼 대상을 모른다
  expect(countResendable([{ ...pend('old', '01'), sentAt: '2026-10-01T10:00:00' }, ok('s', '22')], all, now)).toBe(0); // 30일 밖
  expect(countResendable([{ ...pend('x', '20'), cost: 11 }, ok('s', '22')], all, now)).toBe(0); // 비용이 있는 실패는 미연동이 아니라 실제 실패
});

test('광고 본문 판정·꾸밈 벗기기 — 재발송이 광고를 광고로 알아보고, 옛 080 꼬리말을 남기지 않는다 (210)', () => {
  const decorated = decorateAdMessage('가을 이벤트 안내입니다.', '080-111-2222');
  expect(looksLikeAdMessage(decorated)).toBe(true);
  expect(looksLikeAdMessage('내일 예약 안내입니다.')).toBe(false);
  expect(undecorateAdMessage(decorated)).toBe('가을 이벤트 안내입니다.');
  // 번호가 바뀌어도 꼬리말이 두 줄로 늘지 않는다
  expect(decorateAdMessage(undecorateAdMessage(decorated), '080-333-4444')).toBe('(광고) 가을 이벤트 안내입니다.\n무료수신거부 080-333-4444');
  // 광고가 아닌 본문은 그대로
  expect(undecorateAdMessage('내일 예약 안내입니다.')).toBe('내일 예약 안내입니다.');
});

test('익명화 잔존 안내 — 남는 것만 세고, 없으면 문장을 만들지 않는다 (216)', () => {
  expect(anonymizeResidue({ messageHistory: 0, productSales: 0 })).toEqual([]);
  expect(describeAnonymizeResidue([])).toBeNull(); // 남는 것이 없으면 없는 걱정을 만들지 않는다
  const both = anonymizeResidue({ messageHistory: 2, productSales: 1 });
  expect(both.map(i => i.count)).toEqual([2, 1]);
  expect(describeAnonymizeResidue(both)).toBe('다만 문자·카카오 발송 이력의 본문·제목 2건, 제품 판매 기록의 이름 1건에 적힌 이름은 이번에 지워지지 않습니다(프로그램 보관 기록).');
  expect(describeAnonymizeResidue(anonymizeResidue({ messageHistory: 0, productSales: 3 }))).toBe('다만 제품 판매 기록의 이름 3건에 적힌 이름은 이번에 지워지지 않습니다(프로그램 보관 기록).');
});

test('화면 PIN 초기화 판정 — 처음 본 초기화는 적용, 이미 처리한 것은 무시, 깨진 값은 PIN 을 지우지 않는다 (219)', () => {
  const t1 = '2026-11-25T09:00:00.000Z';
  const t2 = '2026-11-25T10:00:00.000Z';
  expect(shouldResetAppLock(t1, null)).toBe(true);        // 처음 보는 초기화
  expect(shouldResetAppLock(t1, t1)).toBe(false);          // 같은 초기화를 두 번 처리하지 않는다
  expect(shouldResetAppLock(t2, t1)).toBe(true);           // 본사가 다시 눌렀다
  expect(shouldResetAppLock(t1, t2)).toBe(false);          // 서버 값이 더 오래됐으면 무시
  expect(shouldResetAppLock(null, t1)).toBe(false);        // 초기화한 적 없음
  expect(shouldResetAppLock(undefined, null)).toBe(false);
  expect(shouldResetAppLock('어제', null)).toBe(false);     // 깨진 값으로 PIN 을 지우지 않는다
  expect(shouldResetAppLock(t1, '깨짐')).toBe(true);        // 기기 기록이 깨졌으면 서버를 따른다
});

test('이중 제출 잠금 — 한 번만 통과하고, 풀면 다시 통과한다 (221, GAP P-4)', () => {
  const lock = createSubmitLock();
  expect(lock.locked).toBe(false);
  expect(lock.acquire()).toBe(true);   // 첫 저장
  expect(lock.locked).toBe(true);
  expect(lock.acquire()).toBe(false);  // 두 번째 클릭은 막힌다
  expect(lock.acquire()).toBe(false);
  lock.release();                       // 폼을 닫으면
  expect(lock.acquire()).toBe(true);    // 다시 저장할 수 있다
  const other = createSubmitLock();     // 잠금은 폼마다 따로
  expect(other.acquire()).toBe(true);
});

// ── 사진 백업 순수 규칙 (228, GAP C-3) ───────────────────────────
// 사진은 전체 백업에 들어가지 않아 로컬 모드 매장에서는 이 파일이 유일한 보관본이 된다 — 분할·병합이 틀리면 사진이 사라진다.

test('사진 파일 분할 — 기록 하나는 쪼개지 않고, 상한을 넘는 기록은 혼자 한 파일로 (228)', () => {
  const inv = [
    { entityKey: 'treatment:a', count: 2, bytes: 60 },
    { entityKey: 'treatment:b', count: 1, bytes: 50 },
    { entityKey: 'treatment:c', count: 1, bytes: 30 },
  ];
  expect(planPhotoChunks(inv, 100)).toEqual([['treatment:a'], ['treatment:b', 'treatment:c']]);
  expect(planPhotoChunks(inv, 1000)).toEqual([['treatment:a', 'treatment:b', 'treatment:c']]); // 넉넉하면 한 파일
  // 상한보다 큰 기록도 빠뜨리지 않는다(혼자 한 파일)
  expect(planPhotoChunks([{ entityKey: 'treatment:big', count: 1, bytes: 500 }], 100)).toEqual([['treatment:big']]);
  expect(planPhotoChunks([], 100)).toEqual([]);
  // 묶음 수가 달라져도 모든 기록이 정확히 한 번 들어간다
  const keys = planPhotoChunks(inv, 90).flat();
  expect(keys.slice().sort()).toEqual(['treatment:a', 'treatment:b', 'treatment:c']);
});

test('사진 용량·합계·표기 — 글자 수 합, 빈 목록 0, 사람이 읽는 단위 (228)', () => {
  expect(photoBytes([{ id: 'p1', dataUrl: 'data:' + 'x'.repeat(95), takenAt: '2026-11-25' }])).toBe(100);
  expect(photoBytes([])).toBe(0);
  expect(sumInventory([{ entityKey: 'a:1', count: 2, bytes: 10 }, { entityKey: 'b:1', count: 3, bytes: 20 }]))
    .toEqual({ entities: 2, photos: 5, bytes: 30 });
  expect(formatBytes(500)).toBe('500B');
  expect(formatBytes(2048)).toBe('2KB');
  expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5MB');
  expect(formatBytes(42 * 1024 * 1024)).toBe('42MB');
});

test('사진 병합 — 같은 id 는 이 기기 값 유지, 없는 것만 더하고 촬영 순으로 (228)', () => {
  const mine = [{ id: 'p1', dataUrl: 'data:image/jpeg;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', takenAt: '2026-11-01' }];
  const incoming = [{ id: 'p1', dataUrl: 'data:image/jpeg;base64,DIFFERENT', takenAt: '2026-11-01' }, { id: 'p2', dataUrl: 'data:image/jpeg;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', takenAt: '2026-10-01' }];
  const r = mergePhotoEntries(mine, incoming);
  expect(r.added).toBe(1);
  expect(r.duplicates).toBe(1);
  expect(r.merged.map(p => p.id)).toEqual(['p2', 'p1']);          // 촬영 시각 순
  expect(r.merged.find(p => p.id === 'p1')!.dataUrl).toBe(mine[0].dataUrl); // 내 사진을 덮지 않는다
  // 깨진 항목(dataUrl 없음·data: 아님)은 조용히 버린다 — 복원 뒤 빈 썸네일이 생기지 않게
  const bad = mergePhotoEntries([], [{ id: 'x', dataUrl: 'http://evil/x.png', takenAt: '2026-11-01' }, { id: 'y' } as never]);
  expect(bad.added).toBe(0);
  expect(bad.merged).toEqual([]);
});

test('사진 백업 파일 파싱 — 형식·버전·기록 키를 검사하고 사유를 돌려준다 (228)', () => {
  const good = JSON.stringify({
    format: PHOTO_BACKUP_FORMAT, version: 1, appVersion: '1.0.64', shopId: 's1', createdAt: '2026-11-25T10:00:00.000Z',
    part: 1, parts: 2,
    items: [
      { entityKey: 'treatment:t1', photos: [{ id: 'p1', dataUrl: 'data:image/jpeg;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', takenAt: '2026-11-01' }] },
      { entityKey: '엉뚱한키', photos: [{ id: 'p2', dataUrl: 'data:image/jpeg;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', takenAt: '2026-11-01' }] },   // 기록 키 규칙 위반 → 건너뜀
      { entityKey: 'customer:c1', photos: [] },                            // 빈 묶음 → 건너뜀
    ],
  });
  const f = parsePhotoBackup(good);
  expect(f.items.map(i => i.entityKey)).toEqual(['treatment:t1']);
  expect(f.parts).toBe(2);
  expect(() => parsePhotoBackup('{')).toThrow(/JSON 형식/);
  expect(() => parsePhotoBackup('{}')).toThrow(/사진 백업 파일이 아닙니다/);
  expect(() => parsePhotoBackup(JSON.stringify({ format: PHOTO_BACKUP_FORMAT, version: 99, items: [] }))).toThrow(/더 새 버전/);
  expect(() => parsePhotoBackup(JSON.stringify({ format: PHOTO_BACKUP_FORMAT, version: 1 }))).toThrow(/사진 목록이 없는/);
  expect(() => parsePhotoBackup(JSON.stringify({ format: PHOTO_BACKUP_FORMAT, version: 1, items: [{ entityKey: 'treatment:t1', photos: [] }] }))).toThrow(/복원할 사진이 없습니다/);
  // 전체 백업 파일을 잘못 고르면 분명히 말한다
  expect(() => parsePhotoBackup(JSON.stringify({ format: 'troiareuke-crm-backup', version: 1, tables: {} }))).toThrow(/이 프로그램의 사진 백업 파일이 아닙니다/);
});

// ── 체크아웃 재예약 추천 (231, GAP R-11) ─────────────────────────
// 결제한 자리에서 다음 예약을 잡게 하는 흐름. 틀리면 이미 예약이 있는 고객을 또 부르거나 과거 날짜를 권한다.

test('재예약 추천 — 다가오는 예약이 있으면 추천하지 않는다(취소·노쇼는 예약으로 보지 않는다) (231)', () => {
  const base = { paymentDate: '2026-11-25', today: '2026-11-25', shopCycleDays: 28, visitDays: ['2026-11-25'] };
  expect(suggestRebook({ ...base, reservations: [{ date: '2026-12-10', status: 'confirmed' }] })).toBeNull();
  expect(suggestRebook({ ...base, reservations: [{ date: '2026-11-25', status: 'confirmed' }] })).toBeNull(); // 오늘 아직 안 끝난 예약
  // 취소·노쇼·지난 예약·오늘 완료분은 "다음 예약" 이 아니다 → 추천한다
  expect(suggestRebook({ ...base, reservations: [{ date: '2026-12-10', status: 'cancelled' }] })?.date).toBe('2026-12-23');
  expect(suggestRebook({ ...base, reservations: [{ date: '2026-12-10', status: 'noshow' }] })?.date).toBe('2026-12-23');
  expect(suggestRebook({ ...base, reservations: [{ date: '2026-11-25', status: 'completed' }] })?.date).toBe('2026-12-23');
  expect(suggestRebook({ ...base, reservations: [{ date: '2026-11-01', status: 'confirmed' }] })?.date).toBe('2026-12-23');
});

test('재예약 추천 — 시술 기록의 다음 방문 권장일이 앞에 있으면 그 날짜 (231)', () => {
  const r = suggestRebook({ paymentDate: '2026-11-25', today: '2026-11-25', nextAppointment: '2026-12-09', shopCycleDays: 28, visitDays: ['2026-11-25'] });
  expect(r).toEqual({ date: '2026-12-09', basis: 'recommended', days: 14, reason: '시술 기록의 다음 방문 권장일' });
  // 지난 권장일은 쓰지 않는다(과거 날짜로 예약을 권하지 않게) → 주기로
  const past = suggestRebook({ paymentDate: '2026-11-25', today: '2026-11-25', nextAppointment: '2026-10-01', shopCycleDays: 28, visitDays: ['2026-11-25'] });
  expect(past?.basis).toBe('shop');
  expect(past?.date).toBe('2026-12-23');
});

test('재예약 추천 — 방문이 쌓이면 그 고객 평균 주기, 아니면 매장 기본 주기 (231)', () => {
  // 3주 간격으로 네 번 다녀간 고객 → 개인 주기 21일
  const personal = suggestRebook({ paymentDate: '2026-11-25', today: '2026-11-25', shopCycleDays: 28, visitDays: ['2026-09-30', '2026-10-21', '2026-11-11', '2026-11-25'] });
  expect(personal?.basis).toBe('personal');
  expect(personal?.days).toBe(21);          // 간격 21·21·14 의 중앙값
  expect(personal?.date).toBe(addDaysISO('2026-11-25', personal!.days));
  expect(personal?.reason).toMatch(/이 고객 방문 주기 21일\(방문 4회의 중간값\)/); // 평균이 아니라 중간값 (234, 리뷰 L-2)
  // 첫 방문이라 간격이 모자라면 매장 기본
  const shop = suggestRebook({ paymentDate: '2026-11-25', today: '2026-11-25', shopCycleDays: 28, visitDays: ['2026-11-25'] });
  expect(shop).toEqual({ date: '2026-12-23', basis: 'shop', days: 28, reason: '매장 기본 주기 28일' });
  // 주기를 모르면(0) 추천하지 않는다 — 아무 날짜나 권하지 않는다
  expect(suggestRebook({ paymentDate: '2026-11-25', today: '2026-11-25', shopCycleDays: 0, visitDays: [] })).toBeNull();
  expect(suggestRebook({ paymentDate: '어제', today: '2026-11-25', shopCycleDays: 28, visitDays: [] })).toBeNull();
});

test('재예약 추천 — 마지막 방문이 결제일보다 뒤면(선결제) 그 방문일 기준 (231)', () => {
  const r = suggestRebook({ paymentDate: '2026-11-01', today: '2026-11-01', lastVisitDate: '2026-11-20', shopCycleDays: 28, visitDays: ['2026-11-20'] });
  expect(r?.date).toBe('2026-12-18'); // 11-20 + 28일
  expect(describeRebook(r!, iso => iso)).toBe('2026-12-18 · 매장 기본 주기 28일');
});

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── 현장 주의사항 경고 (232, GAP C-11) ───────────────────────────
// 예약·시술 자리에서 금기를 못 보면 사람이 다친다. 반대로 메모 전문을 띄우면 아무도 읽지 않는다.

test('메모 주의 줄 — 키워드가 든 줄만, 중복 제거, 80자에서 자른다 (232)', () => {
  expect(memoCautionLines('레티놀 주의\n커피 좋아함\n임신 중')).toEqual(['임신 중', '레티놀 주의']); // 234: 위험한 줄 먼저
  expect(memoCautionLines('커피 좋아함\n친구 소개')).toEqual([]);      // 경고가 없으면 만들지 않는다
  expect(memoCautionLines('')).toEqual([]);
  expect(memoCautionLines(null)).toEqual([]);
  expect(memoCautionLines('주의 사항\n주의 사항')).toEqual(['주의 사항']); // 중복
  const long = memoCautionLines('주의 ' + '가'.repeat(200))[0];
  expect(long.length).toBe(MAX_ALERT_LINE_LENGTH);
  expect(long.endsWith('…')).toBe(true);
  // 여러 줄 공백·탭은 한 칸으로
  expect(memoCautionLines('  켈로이드   체질  ')).toEqual(['켈로이드 체질']);
});

test('현장 경고 — 알레르기 먼저, 메모 주의 줄, 노쇼는 2회부터 (232)', () => {
  const a = buildCustomerAlert({ allergies: '레티놀 자극', memo: '임신 중\n커피 좋아함', noshowCount: 3 });
  expect(a.lines).toEqual(['알레르기·주의: 레티놀 자극', '임신 중', '노쇼 3회 — 예약 확인 전화를 권합니다']);
  expect(a.hiddenCount).toBe(0);
  expect(a.allergies).toBe('레티놀 자극');
  expect(a.noshow).toBe(3);
  expect(hasCustomerAlert(a)).toBe(true);
  // 노쇼 1회는 흔하다 → 올리지 않는다
  expect(buildCustomerAlert({ noshowCount: NOSHOW_ALERT_MIN - 1 }).lines).toEqual([]);
  expect(buildCustomerAlert({ noshowCount: NOSHOW_ALERT_MIN }).lines).toEqual(['노쇼 2회 — 예약 확인 전화를 권합니다']);
});

test('현장 경고 — 올릴 것이 없으면 아무 줄도 만들지 않는다 (232)', () => {
  expect(buildCustomerAlert({}).lines).toEqual([]);
  expect(buildCustomerAlert({ allergies: '   ', memo: '커피 좋아함' }).lines).toEqual([]);
  expect(hasCustomerAlert(buildCustomerAlert({}))).toBe(false);
  expect(hasCustomerAlert(null)).toBe(false);
});

test('현장 경고 — 한 번에 3줄, 넘친 줄은 수를 알려 주고 사라지지 않는다 (232·234 리뷰 H-1)', () => {
  const many = buildCustomerAlert({ allergies: '견과류', memo: '주의1\n주의2\n주의3\n주의4', noshowCount: 5 });
  expect(many.lines.length).toBe(MAX_ALERT_LINES);
  expect(many.lines[0]).toBe('알레르기·주의: 견과류');
  expect(many.hiddenCount).toBe(many.allLines.length - MAX_ALERT_LINES);
  expect(many.allLines.length).toBe(6); // 알레르기 + 메모 4 + 노쇼 — 하나도 버리지 않는다
  const dup = buildCustomerAlert({ allergies: '견과류 알레르기', memo: '견과류 알레르기' });
  expect(dup.lines).toEqual(['알레르기·주의: 견과류 알레르기']);
});

// ── 직원 인센티브(수당) (233, GAP S-1) ──────────────────────────
// 급여에 쓰는 숫자라 경계와 반올림을 못으로 박는다. 틀리면 사람에게 돈이 덜 간다.

test('수당 비율 입력 — 0~50%, 소수점 한 자리, 잘못된 값은 null (233)', () => {
  expect(parseRate('10')).toBe(10);
  expect(parseRate('12.5')).toBe(12.5);
  expect(parseRate('12.5%')).toBe(12.5);
  expect(parseRate(' 7 ')).toBe(7);
  expect(parseRate('')).toBeNull();  // 234: 빈 칸은 "예외 해제" 라 값이 아니다
  expect(parseRate('0')).toBe(0);
  expect(parseRate(String(MAX_COMMISSION_RATE))).toBe(MAX_COMMISSION_RATE);
  expect(parseRate('50.1')).toBeNull();      // 상한 밖
  expect(parseRate('-5')).toBeNull();
  expect(parseRate('12.55')).toBeNull();     // 소수점 둘째 자리가 살아 있는 값
  expect(parseRate('12.50')).toBe(12.5);     // 끝의 0 은 사람이 흔히 쓴다 (234, 리뷰 L-8)
  expect(parseRate('열 퍼센트')).toBeNull();
  expect(parseRate('1e2')).toBeNull();
  expect(parseRate(null)).toBeNull();
  expect(parseRate(12.5)).toBe(12.5);
});

test('수당 비율 — 직원별 예외가 있으면 그것, 없으면 매장 기본 (233)', () => {
  const config = { serviceRate: 10, productRate: 5, perStaff: { s2: { serviceRate: 15 }, s3: { productRate: 0 } } };
  expect(ratesFor('s1', config)).toEqual({ serviceRate: 10, productRate: 5 });
  expect(ratesFor('s2', config)).toEqual({ serviceRate: 15, productRate: 5 }); // 시술만 예외
  expect(ratesFor('s3', config)).toEqual({ serviceRate: 10, productRate: 0 }); // 0 도 뜻이 있는 값
  expect(ratesFor('s1')).toEqual({ serviceRate: 0, productRate: 0 });          // 설정 없음
  // 범위를 벗어난 저장값은 읽을 때 막는다(옛 설정·수동 편집 방어)
  expect(ratesFor('s1', { serviceRate: 999, productRate: -5 })).toEqual({ serviceRate: MAX_COMMISSION_RATE, productRate: 0 });
});

test('수당 금액 — 실결제액·제품 판매액 기준, 원 단위 내림 (233)', () => {
  expect(computeCommission({ paidAmount: 1_000_000, productAmount: 200_000 }, { serviceRate: 10, productRate: 5 }))
    .toEqual({ service: 100_000, product: 10_000, total: 110_000 });
  // 내림 — 12.5% × 70,007 = 8,750.875 → 8,750
  expect(computeCommission({ paidAmount: 70_007 }, { serviceRate: 12.5, productRate: 0 }).service).toBe(8_750);
  expect(computeCommission({}, { serviceRate: 10, productRate: 10 })).toEqual({ service: 0, product: 0, total: 0 });
  expect(computeCommission({ paidAmount: -50_000 }, { serviceRate: 10, productRate: 0 }).service).toBe(0); // 음수(환불 과다)는 0
  expect(computeCommission({ paidAmount: 50_000 }, { serviceRate: 0, productRate: 0 }).total).toBe(0);
});

test('수당 표시 여부·기준 문구 — 전부 0이면 열을 띄우지 않는다 (233)', () => {
  expect(commissionConfigured()).toBe(false);
  expect(commissionConfigured({ serviceRate: 0, productRate: 0 })).toBe(false);
  expect(commissionConfigured({ serviceRate: 0, productRate: 0, perStaff: { s1: { serviceRate: 3 } } })).toBe(true);
  expect(commissionConfigured({ serviceRate: 10, productRate: 0 })).toBe(true);
  expect(describeCommissionBasis({ serviceRate: 10, productRate: 5 }))
    .toBe('시술 10% × 실결제액 + 제품 5% × 제품 판매액 (원 단위 내림)');
});

// ── 234 리뷰 반영: 경고 위험도·부정 표현, 추천일 오늘 기준, 수당 비율 상속·검증 ──

test('현장 경고 — "시술 불가" 같은 금기가 상한 때문에 밀려나지 않는다 (234, 리뷰 H-1)', () => {
  const a = buildCustomerAlert({
    allergies: '레티놀',
    memo: '민감한 편\n켈로이드 체질\n항생제 복용 중\n시술 불가 부위: 눈가',
  });
  // 위험한 줄부터 3줄 — 전에는 메모 원문 순서라 '시술 불가' 가 아무 표시 없이 사라졌다
  expect(a.lines).toEqual(['알레르기·주의: 레티놀', '시술 불가 부위: 눈가', '켈로이드 체질']);
  expect(a.allLines).toContain('항생제 복용 중');
  expect(a.allLines).toContain('민감한 편');
  expect(a.hiddenCount).toBe(2);
});

test('현장 경고 — "없음·아님" 이 붙은 줄은 경고로 올리지 않는다 (234, 리뷰 M-5)', () => {
  expect(isNegatedCaution('특별한 주의사항 없음')).toBe(true);
  expect(isNegatedCaution('임신 계획 없음')).toBe(true);
  expect(isNegatedCaution('민감하지 않은 편')).toBe(true);
  expect(isNegatedCaution('임신 중')).toBe(false);
  const a = buildCustomerAlert({ memo: '특별한 주의사항 없음\n임신 계획 없음\n민감하지 않은 편' });
  expect(a.allLines).toEqual([]);          // 늑대 소년 금지 — 전에는 3줄 전부 경고로 떴다
  expect(hasCustomerAlert(a)).toBe(false);
  // 부정 표현 줄이 상한을 차지해 진짜 금기를 밀어내지도 않는다
  const b = buildCustomerAlert({ memo: '주의사항 없음\n임신 중' });
  expect(b.lines).toEqual(['임신 중']);
});

test('재예약 추천 — 지난 결제를 뒤늦게 입력해도 추천일은 오늘 뒤 (234, 리뷰 H-2)', () => {
  const today = '2026-11-25';
  // 9월 결제를 지금 입력 → 9월 29일을 권하면 과거 예약이 생긴다
  const late = suggestRebook({ paymentDate: '2026-09-01', today, shopCycleDays: 28, visitDays: ['2026-09-01'] });
  expect(late?.date).toBe('2026-12-23'); // 오늘 + 28일
  expect(late!.date > today).toBe(true);
  // 지난 권장일도 쓰지 않는다
  const pastRecommended = suggestRebook({ paymentDate: '2026-09-01', today, nextAppointment: '2026-09-20', shopCycleDays: 28, visitDays: ['2026-09-01'] });
  expect(pastRecommended?.basis).toBe('shop');
  expect(pastRecommended!.date > today).toBe(true);
  // 앞으로 남은 권장일은 그대로 쓴다
  expect(suggestRebook({ paymentDate: '2026-11-25', today, nextAppointment: '2026-12-09', shopCycleDays: 28, visitDays: ['2026-11-25'] })?.date).toBe('2026-12-09');
  // 오늘 이후 예약이 이미 있으면(결제일 기준이 아니라 오늘 기준) 추천하지 않는다
  expect(suggestRebook({ paymentDate: '2026-09-01', today, shopCycleDays: 28, visitDays: ['2026-09-01'], reservations: [{ date: '2026-12-01', status: 'confirmed' }] })).toBeNull();
});

test('수당 비율 — 빈 칸은 "기본값 상속", 0은 "그 직원만 0%" (234, 리뷰 M-3)', () => {
  expect(parseRate('')).toBeNull();      // 빈 칸은 값이 아니다
  expect(isBlankRate('')).toBe(true);
  expect(isBlankRate('  %  ')).toBe(true);
  expect(isBlankRate('0')).toBe(false);
  expect(parseRate('0')).toBe(0);
  expect(parseRate('12.50')).toBe(12.5); // 사람이 쓰는 표기 (리뷰 L-8)
  expect(parseRate('12.5 %')).toBe(12.5);
  expect(parseRate('12.55')).toBeNull();
  // 예외가 걸렸는지 화면이 구분할 수 있다
  const config = { serviceRate: 10, productRate: 5, perStaff: { s2: { serviceRate: 20 } } };
  expect(hasOwnRates('s2', config)).toBe(true);
  expect(hasOwnRates('s1', config)).toBe(false);
});

test('수당 비율 — 숫자가 아닌 예외 값은 기본값으로 돌아간다(조용한 0원 금지) (234, 리뷰 M-1)', () => {
  const broken = { serviceRate: 10, productRate: 5, perStaff: { s9: { serviceRate: '15' as unknown as number } } };
  expect(ratesFor('s9', broken)).toEqual({ serviceRate: 10, productRate: 5 });
  expect(clampRate('15')).toBe(0);        // 문자열은 비율로 쓰지 않는다
  expect(clampRate(999)).toBe(MAX_COMMISSION_RATE);
  // 금액과 근거가 같은 값을 말한다 (리뷰 M-2)
  expect(describeCommissionBasis({ serviceRate: 999, productRate: -5 }))
    .toBe('시술 50% × 실결제액 + 제품 0% × 제품 판매액 (원 단위 내림)');
  expect(computeCommission({ paidAmount: 1_000_000 }, { serviceRate: 999, productRate: 0 }).service).toBe(500_000);
});

// ── 결제 영수증 (235, GAP P-9) ───────────────────────────────────
// 고객 손에 가는 돈 문서라 과장·누락이 바로 문제가 된다. 세금계산서가 아니라는 사실을 숨기면 안 된다.

const SHOP = { name: '아르케스파', phone: '02-123-4567', address: '서울 강남구 1', businessNumber: '123-45-67890', ownerName: '홍길동' };

test('영수증 — 머리말·내역·합계, 세금계산서가 아니라고 분명히 적는다 (235)', () => {
  const r = buildReceipt({
    payment: { paymentDate: '2026-11-25', amount: 90_000, paymentMethod: '카드', typeLabel: '단건 시술', status: 'completed' },
    customerName: '김고객',
    shop: SHOP,
    issuedOn: '2026-11-25',
  });
  expect(r.title).toBe('영수증');
  expect(r.isRefund).toBe(false);
  expect(r.shopLines).toEqual(['아르케스파', '사업자등록번호 123-45-67890 · 대표 홍길동', '02-123-4567 · 서울 강남구 1']);
  expect(r.customerLine).toBe('김고객 고객님');
  expect(r.totalLabel).toBe('결제 금액');
  expect(r.totalValue).toBe('90,000원');
  expect(r.rows.map(x => x.label)).toEqual(['결제일', '구분', '결제 수단']);
  expect(r.rows.find(x => x.label === '결제 수단')!.value).toBe('카드');
  expect(r.notes[0]).toMatch(/세금계산서·현금영수증은 포함되지 않으며/);
  expect(r.notes).toHaveLength(1); // 사업자 정보가 있으면 보완 안내를 띄우지 않는다
});

test('영수증 — 할인은 정가·할인 줄로 나누고, 발행일이 다르면 함께 적는다 (235)', () => {
  const r = buildReceipt({
    payment: { paymentDate: '2026-11-20', amount: 80_000, discountAmount: 20_000, paymentMethod: '현금', typeLabel: '프로그램', status: 'completed', memo: '원장 지인 할인(내부 메모)' },
    customerName: '김고객', shop: SHOP, issuedOn: '2026-11-25',
  });
  const by = (label: string) => r.rows.find(x => x.label === label)?.value;
  expect(by('정가')).toBe('100,000원');   // 할인 전 금액을 되살려 적는다
  expect(by('할인')).toBe('-20,000원');
  expect(by('발행일')).toBeTruthy();       // 결제일과 다른 날 뽑으면 발행일을 밝힌다
  expect(r.totalValue).toBe('80,000원');
  // 직원용 메모는 고객 영수증에 인쇄하지 않는다 (238, 리뷰 M-2)
  expect(by('메모')).toBeUndefined();
  expect(JSON.stringify(r)).not.toContain('내부 메모');
});

test('영수증 — 환불 건은 환불 영수증, 대기 건은 예정 내역서 (235)', () => {
  const refund = buildReceipt({ payment: { paymentDate: '2026-11-25', amount: 50_000, status: 'refunded', paymentMethod: '카드', typeLabel: '단건 시술' }, customerName: '김고객', shop: SHOP });
  expect(refund.title).toBe('환불 영수증');
  expect(refund.isRefund).toBe(true);
  expect(refund.totalLabel).toBe('환불 처리된 원 결제 금액'); // 부분 환불 금액을 기록할 자리가 없다 (238, 리뷰 M-3)
  expect(refund.totalValue).toBe('-50,000원');   // 결제 영수증처럼 보이지 않게
  expect(refund.notes.some(n => n.includes('부분 환불이라면 실제 환불액은 매장 기록'))).toBe(true);

  const pending = buildReceipt({ payment: { paymentDate: '2026-11-25', amount: 50_000, status: 'pending' }, customerName: '김고객', shop: SHOP });
  expect(pending.title).toBe('결제 예정 내역서');
  expect(pending.isPending).toBe(true);
  expect(pending.totalLabel).toBe('결제 예정 금액');
  expect(pending.notes.some(n => n.includes('아직 입금이 확인되지 않은'))).toBe(true);
});

test('영수증 — 빈 매장 정보는 줄을 빼고 설정 안내를 붙인다, 고객 미지정도 말한다 (235)', () => {
  const r = buildReceipt({
    payment: { paymentDate: '2026-11-25', amount: 30_000, status: 'completed' },
    shop: { name: '아르케스파' }, // 전화·주소·사업자번호 없음
  });
  expect(r.shopLines).toEqual(['아르케스파']);          // 빈 줄을 인쇄하지 않는다
  expect(r.customerLine).toBe('고객 미지정');
  expect(r.rows.find(x => x.label === '결제 수단')!.value).toBe('미지정');
  expect(r.rows.find(x => x.label === '구분')!.value).toBe('기타');
  expect(r.notes.some(n => n.includes('사업자등록번호가 설정되어 있지 않아'))).toBe(true);
});

test('영수증 파일 이름 — 매장·고객·날짜, 경로 금지 문자 제거 (235)', () => {
  expect(receiptFileName('아르케스파', '김고객', '2026-11-25')).toBe('아르케스파_김고객_영수증_2026-11-25.pdf');
  expect(receiptFileName('아르케 / 스파', '김 고객', '2026-11-25', true)).toBe('아르케  스파_김고객_환불영수증_2026-11-25.pdf');
  expect(receiptFileName(undefined, undefined, '2026-11-25')).toBe('CRM_고객_영수증_2026-11-25.pdf');
});

// ── 고객 등급 자동 제안 (236, GAP C-1) ───────────────────────────
// 등급은 매장이 고객에게 약속한 것이라 조용히 바뀌면 안 된다 → 올릴 후보만 제안하고 적용은 사람이 한다.

test('등급 제안 — VIP·골드 기준(방문·누적) 경계 (236)', () => {
  expect(suggestGrade({ current: '일반', visits: VIP_VISITS, spent: VIP_SPENT })).toEqual({ grade: 'VIP', reason: `방문 ${VIP_VISITS}회 · 누적 200만원` });
  expect(suggestGrade({ current: '일반', visits: VIP_VISITS - 1, spent: VIP_SPENT })?.grade).toBe('골드');   // 방문 한 번 모자라면 골드
  expect(suggestGrade({ current: '일반', visits: VIP_VISITS, spent: VIP_SPENT - 1 })?.grade).toBe('골드');   // 금액 1원 모자라면 골드
  expect(suggestGrade({ current: '신규', visits: GOLD_VISITS, spent: GOLD_SPENT })?.grade).toBe('골드');
  expect(suggestGrade({ current: '신규', visits: GOLD_VISITS - 1, spent: GOLD_SPENT })?.grade).toBe('일반');  // 방문 2회 이상이면 신규는 지났다
  expect(suggestGrade({ current: '신규', visits: 1, spent: 50_000 })).toBeNull();                             // 첫 방문은 그대로 신규
});

test('등급 제안 — RFM(매장 내 상대 순위)에도 절대 하한을 함께 본다 (236·238 리뷰 H-1)', () => {
  // RFM 은 매장 안 백분위라 전원이 방문 1~2회인 매장에서는 방문 2회도 '충성' 이 된다 → 하한을 못 넘으면 VIP 로 올리지 않는다
  expect(suggestGrade({ current: '신규', visits: 2, spent: 50_000, segment: '충성' })?.grade).toBe('일반');
  expect(suggestGrade({ current: '신규', visits: 1, spent: 300_000, segment: '우수' })).toBeNull();           // 방문 1회는 아직 신규
  expect(suggestGrade({ current: '일반', visits: VIP_RFM_MIN_VISITS, spent: VIP_RFM_MIN_SPENT, segment: '충성' })?.grade).toBe('VIP');
  expect(suggestGrade({ current: '일반', visits: VIP_RFM_MIN_VISITS, spent: VIP_RFM_MIN_SPENT, segment: '충성' })?.reason).toMatch(/매장 내 상위 고객\(RFM 충성\)/);
  expect(suggestGrade({ current: '일반', visits: VIP_RFM_MIN_VISITS - 1, spent: VIP_RFM_MIN_SPENT, segment: '충성' })).toBeNull(); // 방문 하한 미달 → 이미 '일반' 이라 올릴 것이 없다
  expect(suggestGrade({ current: '신규', visits: GOLD_RFM_MIN_VISITS, spent: 100_000, segment: '우수' })?.grade).toBe('골드');
  expect(suggestGrade({ current: '신규', visits: 2, spent: 10_000, segment: '휴면' })?.grade).toBe('일반');   // 구분이 낮아도 방문 2회는 일반
});

test('등급 제안 — 내리는 제안은 하지 않는다(휴면 VIP 를 강등하지 않는다) (236)', () => {
  expect(suggestGrade({ current: 'VIP', visits: 2, spent: 50_000 })).toBeNull();
  expect(suggestGrade({ current: '골드', visits: 2, spent: 50_000 })).toBeNull();
  expect(suggestGrade({ current: 'VIP', visits: VIP_VISITS, spent: VIP_SPENT })).toBeNull();                 // 이미 최고 등급이면 제안 없음
  expect(suggestGrade({ current: '골드', visits: VIP_VISITS, spent: VIP_SPENT })?.grade).toBe('VIP');        // 올리는 것만
});

test('등급 제안 — 방문 기록이 없거나 값이 깨지면 제안하지 않는다 (236)', () => {
  expect(suggestGrade({ current: '신규', visits: 0, spent: 5_000_000 })).toBeNull();   // 결제만 있고 방문 기록이 없으면 근거가 없다
  expect(suggestGrade({ current: '신규', visits: NaN as unknown as number, spent: 0 })).toBeNull();
  // 모르는 등급 값(옛 데이터)은 가장 낮게 보고 제안이 막히지 않게 한다
  expect(suggestGrade({ current: '브론즈', visits: GOLD_VISITS, spent: GOLD_SPENT })?.grade).toBe('골드');
});

// ── 태그 마스터 (237, GAP C-1) ───────────────────────────────────
// 같은 뜻의 태그가 갈라지면(민감성·민감·민감성피부) 태그 필터·발송 대상이 조용히 나뉜다.

test('태그 이름 정리 — #·공백·쉼표·길이, 동의 태그는 거부 (237)', () => {
  expect(normalizeTagName(' #민감성 ')).toBe('민감성');
  expect(normalizeTagName('재구매  고객')).toBe('재구매 고객');   // 연속 공백은 한 칸
  expect(normalizeTagName('a'.repeat(MAX_TAG_NAME + 5))).toHaveLength(MAX_TAG_NAME);
  expect(normalizeTagName('민감성, 재구매')).toBeNull();          // 쉼표는 구분자
  expect(normalizeTagName('광고동의:2026-11-25')).toBeNull();     // 동의 태그는 동의 컨트롤이 관리한다
  // 상태 태그 4종도 막는다 — 전에는 접두만 봐서 통과했고, 칩으로 넣어도 저장 때 조용히 버려졌다 (238, 리뷰 H-2)
  for (const t of ['광고수신동의', '광고수신거부', '문자수신거부', '카카오수신거부']) expect(normalizeTagName(t)).toBeNull();
  expect(normalizeTagName('  ')).toBeNull();
  expect(normalizeTagName(42)).toBeNull();
});

test('태그 목록 추가·삭제 — 중복·한도는 사유를 돌려준다 (237)', () => {
  const one = addMasterTag([], '민감성');
  expect(one.list).toEqual(['민감성']);
  expect(one.error).toBeUndefined();
  expect(addMasterTag(['민감성'], ' #민감성 ').error).toMatch(/이미 있는 태그/);
  expect(addMasterTag(['민감성'], '광고동의').error).toMatch(/동의 설정에서만/);
  const full = Array.from({ length: MAX_MASTER_TAGS }, (_, i) => 't' + i);
  expect(addMasterTag(full, '하나더').error).toMatch(new RegExp(String(MAX_MASTER_TAGS)));
  expect(removeMasterTag(['민감성', '재구매'], '민감성')).toEqual(['재구매']);
  expect(removeMasterTag(['민감성'], '없는태그')).toEqual(['민감성']);   // 없는 것을 지워도 조용히 통과
});

test('태그 목록 저장값 정리 — 배열이 아니거나 깨진 값 방어 (237)', () => {
  expect(sanitizeMaster(['민감성', ' #민감성 ', '', 7, '광고동의:x', '재구매'])).toEqual(['민감성', '재구매']);
  expect(sanitizeMaster('민감성')).toEqual([]);
  expect(sanitizeMaster(undefined)).toEqual([]);
  expect(sanitizeMaster(Array.from({ length: MAX_MASTER_TAGS + 10 }, (_, i) => 't' + i))).toHaveLength(MAX_MASTER_TAGS);
});

test('태그 칩 — 등록 태그 먼저(등록 순서), 쓰고 있지만 미등록인 태그도 보여 준다 (237·238 리뷰 M-7)', () => {
  const choices = tagChoices(['민감성', '재구매'], [{ tag: '단골', count: 5 }, { tag: '재구매', count: 3 }, { tag: '민감성', count: 1 }]);
  expect(choices.map(c => c.tag)).toEqual(['민감성', '재구매', '단골']); // 등록 순서 → 미등록은 뒤
  expect(choices.find(c => c.tag === '단골')!.registered).toBe(false); // 미등록이라고 밝힌다(숨기지 않는다)
  expect(choices.find(c => c.tag === '재구매')!.count).toBe(3);
  expect(tagChoices([], [])).toEqual([]);
  expect(tagChoices(['a', 'b', 'c'], [], 2)).toHaveLength(2);          // 상한
});

test('태그 입력칸에 칩 더하기 — 중복은 그대로, 쉼표로 이어 붙인다 (237)', () => {
  expect(appendTagToInput('', '민감성').value).toBe('민감성');
  expect(appendTagToInput('민감성', '재구매').value).toBe('민감성, 재구매');
  expect(appendTagToInput('민감성, 재구매', '민감성').value).toBe('민감성, 재구매'); // 두 번 넣지 않는다
  expect(appendTagToInput('민감성, 재구매', '민감성').error).toBeUndefined();
  expect(appendTagToInput(' #민감성 ,', '재구매').value).toBe('민감성, 재구매');     // 손으로 적은 표기도 정리
  const consent = appendTagToInput('민감성', '광고수신동의');
  expect(consent.value).toBe('민감성');
  expect(consent.error).toMatch(/동의 설정/);                                        // 왜 안 들어가는지 알려 준다
  // 고객당 10개 상한 — 전에는 11개째가 저장 때 조용히 잘렸다 (238, 리뷰 M-5)
  const ten = Array.from({ length: MAX_TAGS_PER_CUSTOMER }, (_, i) => 't' + i).join(', ');
  expect(countInputTags(ten)).toBe(MAX_TAGS_PER_CUSTOMER);
  const over = appendTagToInput(ten, '하나더');
  expect(over.value).toBe(ten);
  expect(over.error).toMatch(new RegExp(String(MAX_TAGS_PER_CUSTOMER)));
});

// ── 238 리뷰 반영: 칩 자리 배분, 분할 결제 요약 ──

test('태그 칩 — 등록 태그가 많아도 미등록 태그 자리가 남는다, 동의 태그는 칩에 없다 (238, 리뷰 H-2·M-7)', () => {
  const master = Array.from({ length: 30 }, (_, i) => '등록' + i);
  const usage = [{ tag: '쓰는태그', count: 9 }, { tag: '광고수신동의', count: 50 }, { tag: '광고동의:2026-11-26', count: 50 }];
  const choices = tagChoices(master, usage, 24);
  expect(choices).toHaveLength(24);
  expect(choices.some(c => c.tag === '쓰는태그' && !c.registered)).toBe(true);   // 미등록 몫이 남는다
  expect(choices.some(c => c.tag.startsWith('광고'))).toBe(false);               // 동의 태그는 칩에 올리지 않는다
  // 등록 순서를 지킨다 — 사용 0건인 새 태그가 꼬리로 밀려 안 보이던 문제 (리뷰 M-7)
  const fresh = tagChoices(['오래된', '방금추가'], [{ tag: '오래된', count: 7 }], 24);
  expect(fresh.map(c => c.tag)).toEqual(['오래된', '방금추가']);
});

test('분할 결제 요약 — 받은 돈만 합치고, 미입금은 따로 말한다 (238·242 리뷰 H-2)', () => {
  expect(splitPaymentNote([{ amount: 100_000, paymentMethod: '카드' }])).toBeNull(); // 1건이면 안내하지 않는다
  expect(splitPaymentNote([])).toBeNull();
  const note = splitPaymentNote([{ amount: 50_000, paymentMethod: '카드' }, { amount: 50_000, paymentMethod: '현금' }]);
  expect(note).toBe('이 건은 2건으로 나눠 결제했습니다: 카드 50,000원 + 현금 50,000원 · 합계 100,000원');
  // 환불된 행은 합계에서 뺀다(남은 1건이면 안내 자체를 안 한다)
  expect(splitPaymentNote([{ amount: 50_000, paymentMethod: '카드' }, { amount: 50_000, paymentMethod: '현금', status: 'refunded' }])).toBeNull();
  expect(splitPaymentNote([{ amount: 30_000 }, { amount: 20_000 }])).toContain('미지정 30,000원 + 미지정 20,000원');
  // 대기(미입금)는 합계에 넣지 않는다 — 전에는 고객 영수증이 받지 않은 돈을 받은 것처럼 적었다 (242, 리뷰 H-2)
  const withPending = splitPaymentNote([
    { amount: 500_000, paymentMethod: '카드', status: 'completed' },
    { amount: 500_000, paymentMethod: '현금', status: 'pending' },
  ]);
  expect(withPending).toBe('이 건에는 아직 받지 않은 금액 500,000원 이 남아 있습니다(이 영수증 금액에 포함되지 않습니다).');
  const twoPaidOnePending = splitPaymentNote([
    { amount: 300_000, paymentMethod: '카드', status: 'completed' },
    { amount: 200_000, paymentMethod: '현금', status: 'completed' },
    { amount: 500_000, paymentMethod: '계좌이체', status: 'pending' },
  ]);
  expect(twoPaidOnePending).toContain('합계 500,000원');
  expect(twoPaidOnePending).toContain('아직 받지 않은 500,000원 은 합계에서 뺐습니다');
  expect(twoPaidOnePending).not.toContain('1,000,000원');
});

// ── 태그 이름 일괄 변경 (239, GAP C-1) ───────────────────────────
// 목록을 정해도 이미 갈라진 태그는 남는다. 고객 수백 명의 태그를 바꾸는 일이라 틀리면 되돌리기 어렵다.

test('태그 이름 바꾸기 — 고객 태그를 바꾸고, 이미 있으면 합친다 (239)', () => {
  expect(renameTagOnCustomer(['민감', '재구매'], '민감', '민감성')).toEqual({ tags: ['민감성', '재구매'], changed: true, merged: false });
  // 바꾼 이름이 이미 있으면 두 번 넣지 않고 하나로
  expect(renameTagOnCustomer(['민감', '민감성'], '민감', '민감성')).toEqual({ tags: ['민감성'], changed: true, merged: true });
  // 대상 태그가 없으면 손대지 않는다
  expect(renameTagOnCustomer(['재구매'], '민감', '민감성')).toEqual({ tags: ['재구매'], changed: false, merged: false });
  expect(renameTagOnCustomer(null, '민감', '민감성')).toEqual({ tags: [], changed: false, merged: false });
  // 동의 태그는 그대로 남는다(일반 태그만 바꾼다)
  expect(renameTagOnCustomer(['민감', '광고수신동의'], '민감', '민감성').tags).toEqual(['민감성', '광고수신동의']);
  // 쓸 수 없는 이름·같은 이름이면 아무 일도 하지 않는다
  expect(renameTagOnCustomer(['민감'], '민감', '광고수신동의').changed).toBe(false);
  expect(renameTagOnCustomer(['민감'], '민감', '  ').changed).toBe(false);
  expect(renameTagOnCustomer(['민감'], '민감', '민감').changed).toBe(false);
});

test('태그 목록 이름 바꾸기 — 목록에서도 합쳐지고 순서는 유지된다 (239)', () => {
  expect(renameTagInList(['민감', '재구매'], '민감', '민감성')).toEqual(['민감성', '재구매']);
  expect(renameTagInList(['민감성', '민감'], '민감', '민감성')).toEqual(['민감성']); // 중복 제거
  expect(renameTagInList(['재구매'], '민감', '민감성')).toEqual(['재구매']);
  expect(renameTagInList(['민감'], '민감', '광고동의')).toEqual(['민감']);           // 거부된 이름이면 그대로
});

test('태그 이름 바꾸기 미리보기 — 바뀌는 수·합쳐지는 수·사유 (239)', () => {
  const customers = [
    { tags: ['민감', '재구매'] },
    { tags: ['민감', '민감성'] },
    { tags: ['단골'] },
    { tags: null },
  ];
  expect(previewRename(customers, '민감', '민감성')).toEqual({ affected: 2, merges: 1 });
  expect(previewRename(customers, '민감', '민감')).toEqual({ affected: 0, merges: 0, error: '같은 이름입니다.' });
  expect(previewRename(customers, '민감', '광고수신거부').error).toMatch(/동의 설정/);
  expect(previewRename(customers, '없는태그', '새이름')).toEqual({ affected: 0, merges: 0 }); // 대상 0명이면 조용히 0
});

// ── 매장이 추가한 주의 키워드 (240, GAP C-11) ────────────────────
// 기본 목록에 없는 말("레이저 금지")을 놓치면 경고가 있는데도 안 뜬다.

test('매장 주의 키워드 — 기본 목록에 없는 말도 경고로 올린다, 위험 순서는 금기 먼저 (240)', () => {
  const memo = '레이저 금지 부위 있음\n임신 중\n커피 좋아함';
  expect(memoCautionLines(memo)).toEqual(['임신 중']);                       // 매장 키워드를 안 주면 못 잡는다
  expect(memoCautionLines(memo, ['레이저 금지'])).toEqual(['임신 중', '레이저 금지 부위 있음']); // 금기가 먼저, 매장 키워드는 3순위
  const a = buildCustomerAlert({ memo, extraKeywords: ['레이저 금지'] });
  expect(a.allLines).toEqual(['임신 중', '레이저 금지 부위 있음']);
  // 부정 표현은 매장 키워드에도 그대로 적용된다
  expect(memoCautionLines('레이저 금지 아님', ['레이저 금지'])).toEqual([]);
});

test('매장 주의 키워드 정리 — 한 글자·중복·기본 키워드·개수 상한 (240)', () => {
  expect(sanitizeCautionKeywords(['레이저 금지', '필러 이력'])).toEqual(['레이저 금지', '필러 이력']);
  expect(sanitizeCautionKeywords(['  레이저  금지 '])).toEqual(['레이저 금지']);  // 공백 정리
  expect(sanitizeCautionKeywords(['약'])).toEqual([]);                            // 한 글자는 아무 문장에나 걸린다
  expect(sanitizeCautionKeywords(['레이저 금지', '레이저 금지'])).toEqual(['레이저 금지']);
  expect(sanitizeCautionKeywords([CAUTION_KEYWORDS[0]])).toEqual([]);             // 기본 키워드는 다시 넣지 않는다
  expect(sanitizeCautionKeywords(['필러 이력', 7, null, ''])).toEqual(['필러 이력']);
  expect(sanitizeCautionKeywords('레이저')).toEqual([]);                          // 배열이 아니면 빈 목록
  expect(sanitizeCautionKeywords(Array.from({ length: 30 }, (_, i) => 'k' + i))).toHaveLength(20);
});

// ── 242 리뷰 반영: 세그먼트 조건 치환, 매장 키워드 순위, 칩 자리 ──

test('태그 이름 바꾸기 — 저장 세그먼트의 태그 조건도 함께 바꾼다 (242, 리뷰 H-1)', () => {
  const segs = [
    { id: 's1', name: '민감 고객', condition: { tagsAny: ['민감'] }, createdAt: '', updatedAt: '' },
    { id: 's2', name: '민감·단골', condition: { tagsAny: ['민감', '민감성'] }, createdAt: '', updatedAt: '' },
    { id: 's3', name: '등급 VIP', condition: { grades: ['VIP' as const] }, createdAt: '', updatedAt: '' },
  ];
  const r = renameTagInSegments(segs, '민감', '민감성');
  expect(r.affected).toEqual(['민감 고객', '민감·단골']);
  expect(r.segments[0].condition.tagsAny).toEqual(['민감성']);
  expect(r.segments[1].condition.tagsAny).toEqual(['민감성']);        // 이미 있던 이름과 합친다
  expect(r.segments[2]).toBe(segs[2]);                                 // 관계없는 세그먼트는 그대로(같은 객체)
  // 쓰는 세그먼트가 없으면 아무것도 바꾸지 않는다
  expect(renameTagInSegments(segs, '없는태그', '새이름').affected).toEqual([]);
});

test('매장 주의 키워드 — 흔한 말을 넣어도 진짜 경고를 3줄 밖으로 밀지 않는다 (242, 리뷰 M-1)', () => {
  const memo = ['고객 요청으로 10분 늦게 시작', '고객이 주차 문의', '고객 동반 1인', '켈로이드 체질 — 레이저 강도 낮춤'].join('\n');
  const a = buildCustomerAlert({ memo, extraKeywords: ['고객'] });
  expect(a.lines[0]).toContain('켈로이드');   // 몸 상태(2순위)가 매장 키워드(3순위)보다 먼저
  expect(a.allLines).toHaveLength(4);
  expect(a.hiddenCount).toBe(1);
});

test('태그 칩 — 상한이 작아도 등록 태그가 사라지지 않는다 (242, 리뷰 L-1·M-6)', () => {
  expect(CHIP_LIMIT).toBeGreaterThanOrEqual(40); // 마스터 50개를 거의 다 눌러 넣을 수 있어야 한다
  const small = tagChoices(['a', 'b', 'c'], Array.from({ length: 10 }, (_, i) => ({ tag: 'u' + i, count: 10 - i })), 6);
  expect(small.filter(c => c.registered).map(c => c.tag)).toEqual(['a', 'b', 'c']); // 등록 태그가 먼저 자리를 받는다
  expect(small.filter(c => !c.registered)).toHaveLength(3);
  // 등록 태그가 많아도 기본 상한에서는 대부분 보인다(19번째부터 안 보이던 문제)
  const many = tagChoices(Array.from({ length: 30 }, (_, i) => 'r' + i), [{ tag: 'u1', count: 3 }], CHIP_LIMIT);
  expect(many.filter(c => c.registered)).toHaveLength(30);
  expect(many.some(c => c.tag === 'u1')).toBe(true);
});

// ── 243: 체크아웃 재예약 안내 성과 (GAP R-11 후속) ──

const shown = (id: string, customerId: string, suggestedDate: string, shownAt: string, clickedAt?: string): RebookLogEntry =>
  ({ id, customerId, suggestedDate, shownAt, ...(clickedAt ? { clickedAt } : {}) });

test('재예약 성과 — 추천·누름·추천일 예약을 따로 센다 (243)', () => {
  const entries = [
    shown('1', 'c1', '2026-12-10', '2026-11-12T10:00:00.000Z', '2026-11-12T10:00:30.000Z'),
    shown('2', 'c2', '2026-12-11', '2026-11-13T10:00:00.000Z', '2026-11-13T10:01:00.000Z'),
    shown('3', 'c3', '2026-12-12', '2026-11-14T10:00:00.000Z'), // 나중에 한 건
    shown('4', 'c4', '2026-12-13', '2026-11-15T10:00:00.000Z'),
  ];
  const r = summarizeRebook(entries, [
    { customerId: 'c1', date: '2026-12-10', status: 'scheduled' },  // 추천일에 잡혔다
    { customerId: 'c2', date: '2026-12-20', status: 'scheduled' },  // 잡긴 했지만 다른 날짜 → 세지 않는다
    { customerId: 'c3', date: '2026-12-12', status: 'cancelled' },  // 취소는 성과가 아니다
    { customerId: 'c4', date: '2026-12-13', status: 'noshow' },     // 노쇼도 아니다
  ]);
  expect(r).toEqual({ shown: 4, clicked: 2, booked: 1, clickRate: 50, bookRate: 25 });
  expect(describeRebookSummary(r)).toBe('다음 방문 추천 4건 · [예약 잡기] 2건(50%) · 추천일에 예약이 잡힌 건 1건(25%)');
});

test('재예약 성과 — 지난 날짜의 완료 예약은 성과로 센다(그날 실제로 왔다) (243)', () => {
  const r = summarizeRebook([shown('1', 'c1', '2026-11-20', '2026-11-01T01:00:00.000Z', '2026-11-01T01:00:10.000Z')],
    [{ customerId: 'c1', date: '2026-11-20', status: 'completed' }]);
  expect(r.booked).toBe(1);
  expect(r.bookRate).toBe(100);
});

test('재예약 성과 — 추천이 없었던 달에는 0%가 아니라 아무것도 말하지 않는다 (243)', () => {
  const r = summarizeRebook([], [{ customerId: 'c1', date: '2026-12-10', status: 'scheduled' }]);
  expect(r).toEqual({ shown: 0, clicked: 0, booked: 0, clickRate: null, bookRate: null });
  expect(describeRebookSummary(r)).toBeNull();
});

test('재예약 기록 — 달로 자르고, 모양이 깨진 기록은 버린다 (243)', () => {
  const entries = sanitizeRebookLog([
    shown('1', 'c1', '2026-11-10', '2026-11-10T00:00:00.000Z'),
    shown('2', 'c2', '2026-12-01', '2026-12-01T00:00:00.000Z'),
    { id: '3', customerId: 'c3', suggestedDate: '엉망', shownAt: '2026-11-11T00:00:00.000Z' }, // 날짜 모양이 아니다
    { id: '4', customerId: '', suggestedDate: '2026-11-12', shownAt: '2026-11-12T00:00:00.000Z' }, // 고객이 없다
    null,
  ]);
  expect(entries.map(e => e.id)).toEqual(['1', '2']);
  expect(entriesInMonth(entries, '2026-11').map(e => e.id)).toEqual(['1']);
  // 같은 고객·같은 추천일은 한 건으로 합치고 [예약 잡기] 기록을 살린다 (246 리뷰 L-3 — 전에는 눌림이 덮여 사라졌다)
  const merged = sanitizeRebookLog([
    shown('1', 'c1', '2026-11-10', '2026-11-10T00:00:00.000Z', '2026-11-10T00:01:00.000Z'),
    shown('2', 'c1', '2026-11-10', '2026-11-10T02:00:00.000Z'),
  ]);
  expect(merged).toHaveLength(1);
  expect(merged[0].id).toBe('1');             // 먼저 뜬 안내가 기준
  expect(merged[0].clickedAt).toBeTruthy();   // 눌림 기록은 살아남는다
  expect(rebookKey(merged[0])).toBe('c1|2026-11-10');
  expect(sanitizeRebookLog(undefined)).toEqual([]);
});

test('재예약 기록 — 무한정 쌓이지 않고, 잘린 달을 알려 준다 (243·246 리뷰 M-2)', () => {
  const many = Array.from({ length: MAX_REBOOK_LOG + 30 }, (_, i) => shown(String(i), 'c' + i, '2026-12-10', `2026-11-20T00:${String(i % 60).padStart(2, '0')}:00.000Z`));
  const trimmed = trimRebookLog(many, '2026-06-01');
  expect(trimmed.entries).toHaveLength(MAX_REBOOK_LOG);
  expect(trimmed.entries[trimmed.entries.length - 1].id).toBe(String(MAX_REBOOK_LOG + 29)); // 최근 것이 남는다
  expect(trimmed.droppedMonths).toEqual(['2026-11']); // 그 달 숫자가 실제보다 작다는 사실이 남는다
  // 보관 기간이 지난 기록은 건수와 무관하게 버린다
  const old = trimRebookLog([shown('old', 'c1', '2026-12-10', '2026-01-02T00:00:00.000Z')], '2026-06-01');
  expect(old.entries).toEqual([]);
  expect(old.droppedMonths).toEqual(['2026-01']);
  // 잘린 달에는 화면이 "실제보다 적게 나온다" 고 적는다
  const line = describeRebookSummary({ shown: 3, clicked: 1, booked: 1, clickRate: 33.3, bookRate: 33.3 }, true);
  expect(line).toContain('기록 보관 한도로 이 달 일부가 빠져 실제보다 적게 나옵니다');
});

// ── 244: 취소·노쇼 사유 (GAP R-10 후속) ──

test('취소 사유 — 목록 id 는 라벨로, 직접 입력은 정리해서 보여 준다 (244)', () => {
  expect(labelFor('cancelled', 'shop-schedule')).toBe('매장 사정(직원·설비)');
  expect(labelFor('noshow', 'no-contact')).toBe('연락 없이 오지 않음');
  expect(labelFor('cancelled', '  차가   고장났다 ')).toBe('차가 고장났다'); // 직접 입력
  expect(normalizeReasonText('  ')).toBe('');
  expect(normalizeReasonText(null)).toBe('');
  expect(normalizeReasonText('가'.repeat(50))).toHaveLength(MAX_REASON_TEXT);
  // 취소·노쇼 보기는 서로 다르다(같은 id 를 쓰지 않는다)
  const ids = new Set(reasonOptions('cancelled').map(o => o.id));
  expect(reasonOptions('noshow').some(o => ids.has(o.id))).toBe(false);
});

test('취소 사유 집계 — 사유를 적지 않은 건수를 숨기지 않는다 (244)', () => {
  const s = summarizeReasons({ cancelled: 5, noshow: 2 }, [
    { kind: 'cancelled', reason: 'customer-schedule' },
    { kind: 'cancelled', reason: 'customer-schedule' },
    { kind: 'cancelled', reason: 'shop-schedule' },
    { kind: 'noshow', reason: 'no-contact' },
    { kind: 'noshow', reason: '직접 쓴 사유' },
  ]);
  expect(s.cancelled).toBe(5);
  expect(s.noshow).toBe(2);
  expect(s.recorded).toBe(5);
  expect(s.missing).toBe(2);           // 7건 중 5건만 사유가 있다
  expect(s.shopSide).toBe(1);          // 매장 쪽 사유(직원·설비)
  expect(s.top[0]).toEqual({ label: '고객 일정 변경', count: 2, by: 'customer' });
  const line = describeReasonSummary(s);
  expect(line).toContain('이달 취소 5건 · 노쇼 2건');
  expect(line).toContain('고객 일정 변경 2건');
  expect(line).toContain('사유 미기록 2건');
});

test('취소 사유 집계 — 취소가 없으면 아무 말도 하지 않고, 기록이 예약보다 많으면 예약을 믿는다 (244)', () => {
  expect(describeReasonSummary(summarizeReasons({ cancelled: 0, noshow: 0 }, []))).toBeNull();
  // 지워진 예약의 사유가 남아 있어도 집계 건수는 예약 쪽을 따른다(미기록이 음수가 되지 않는다)
  const s = summarizeReasons({ cancelled: 1, noshow: 0 }, [
    { kind: 'cancelled', reason: 'duplicate' },
    { kind: 'cancelled', reason: 'duplicate' },
    { kind: 'cancelled', reason: 'duplicate' },
  ]);
  expect(s.recorded).toBe(1);
  expect(s.missing).toBe(0);
  // 사유가 하나도 안 적힌 달은 "사유 미기록" 만 말한다
  const none = summarizeReasons({ cancelled: 3, noshow: 1 }, []);
  expect(describeReasonSummary(none)).toBe('이달 취소 3건 · 노쇼 1건 — 사유 미기록 4건');
});

// ── 245: 전 제품 재고 실사 (GAP P-5 후속) ──

const countItems = [
  { id: 'p1', name: '앰플', unit: '개', stock: 10 },
  { id: 'p2', name: '마스크팩', unit: '장', stock: 40 },
  { id: 'p3', name: '토너', unit: '개', stock: 5 },
  { id: 'p4', name: '크림', unit: '개', stock: 7 },
];

test('재고 실사 — 빈칸은 세지 않은 제품으로 두고 건드리지 않는다 (245)', () => {
  expect(parseCountedQty('')).toBeNull();
  expect(parseCountedQty('  ')).toBeNull();
  expect(parseCountedQty('12')).toBe(12);
  expect(parseCountedQty('1,200')).toBe(1200);
  expect(parseCountedQty('0')).toBe(0);
  expect(parseCountedQty('-3')).toBeUndefined();   // 음수는 거절 — "0 으로 맞췄다" 가 되지 않게
  expect(parseCountedQty('3.5')).toBeUndefined();
  expect(parseCountedQty('열개')).toBeUndefined();

  const rows = buildCountRows(countItems, { p1: '8', p2: '40', p3: '세 개' });
  expect(rows[0]).toMatchObject({ counted: 8, diff: -2 });
  expect(rows[1]).toMatchObject({ counted: 40, diff: 0 });    // 일치
  expect(rows[2].error).toBeTruthy();                          // 잘못 적은 칸
  expect(rows[3]).toMatchObject({ counted: null, diff: 0 });   // 빈칸 — 세지 않음
  expect(rowsToSave(rows).map(r => r.id)).toEqual(['p1']);     // 차이 있고 올바른 것만 저장
});

test('재고 실사 요약 — 일치·미입력·오류·증감 합을 숨기지 않는다 (245)', () => {
  const rows = buildCountRows(countItems, { p1: '12', p2: '38', p3: '5', p4: '' });
  const s = countSummary(rows);
  expect(s).toEqual({ entered: 3, matched: 1, changed: 2, untouched: 1, invalid: 0, plus: 2, minus: -2 });
  const line = describeCountSummary(s);
  expect(line).toContain('맞출 제품 2종');
  expect(line).toContain('일치 1종');
  expect(line).toContain('아직 안 센 제품 1종');
  expect(line).toContain('+2');
  expect(line).toContain('-2');
  // 아무것도 적지 않은 상태
  const empty = countSummary(buildCountRows(countItems, {}));
  expect(empty).toMatchObject({ entered: 0, changed: 0, untouched: 4 });
  expect(rowsToSave(buildCountRows(countItems, {}))).toEqual([]);
  // 잘못 적은 칸은 따로 센다
  expect(countSummary(buildCountRows(countItems, { p1: 'x' })).invalid).toBe(1);
  expect(describeCountSummary(countSummary(buildCountRows(countItems, { p1: 'x' })))).toContain('잘못 적은 칸 1개');
});

test('재고 실사 원장 설명 — 실제 수량·날짜·메모가 남는다 (245)', () => {
  expect(countNote({ counted: 8, unit: '개' }, '2026-11-26')).toBe('실사 8개 (2026-11-26)');
  expect(countNote({ counted: 0, unit: '장' }, '2026-11-26', '  월말   실사 ')).toBe('실사 0장 (2026-11-26) · 월말 실사');
});

// ── 246: 243~245 리뷰 반영 ──

test('재예약 성과 — 같은 방문에 안내가 두 번 떠도 한 건으로 센다 (246 리뷰 M-1)', () => {
  // 시술 결제 + 제품 결제를 따로 등록하면 같은 고객·같은 추천일 안내가 두 번 뜬다
  const entries = [
    shown('a', 'c1', '2026-12-10', '2026-11-26T01:00:00.000Z'),
    shown('b', 'c1', '2026-12-10', '2026-11-26T01:05:00.000Z', '2026-11-26T01:06:00.000Z'),
    shown('c', 'c2', '2026-12-11', '2026-11-26T02:00:00.000Z'),
  ];
  const r = summarizeRebook(entries, [{ customerId: 'c1', date: '2026-12-10', status: 'confirmed' }]);
  expect(r.shown).toBe(2);        // 기록 3건이지만 고객·추천일 기준 2건
  expect(r.clicked).toBe(1);      // 둘 중 하나라도 눌렀으면 누른 것
  expect(r.booked).toBe(1);       // 예약 1건을 2건으로 세지 않는다
  expect(r.clickRate).toBe(50);
  expect(r.bookRate).toBe(50);
});

test('취소 사유 — 상태와 기록의 kind 가 어긋나도 내부 id 를 화면에 내보내지 않는다 (246 리뷰 M-3)', () => {
  expect(labelFor('cancelled', 'no-contact')).toBe('연락 없이 오지 않음');   // 노쇼 보기지만 라벨을 찾는다
  expect(labelFor('noshow', 'customer-schedule')).toBe('고객 일정 변경');
  expect(labelFor('cancelled', '직접 적은 사유')).toBe('직접 적은 사유');
  expect(isPresetReason('shop-schedule')).toBe(true);
  expect(isPresetReason('no-contact')).toBe(true);
  expect(isPresetReason('직접 적은 사유')).toBe(false);  // 개인 사정이 적힐 수 있는 쪽 — 익명화 때 지운다
});

test('취소 사유 집계 — 매장 쪽 건수를 화면에 적고 총건수를 넘기지 않는다 (246 리뷰 M-5)', () => {
  const s = summarizeReasons({ cancelled: 4, noshow: 1 }, [
    { kind: 'cancelled', reason: 'shop-schedule' },
    { kind: 'cancelled', reason: 'duplicate' },
    { kind: 'noshow', reason: 'reminder-missed' },
  ]);
  expect(s.shopSide).toBe(3);
  const line = describeReasonSummary(s, '11월');
  expect(line).toContain('11월 취소 4건 · 노쇼 1건');   // "이달" 대신 보고 있는 달
  expect(line).toContain('그중 매장 쪽 사유 3건');
  // 지워진 예약의 기록이 남아도 총건수를 넘기지 않는다
  const over = summarizeReasons({ cancelled: 1, noshow: 0 }, [
    { kind: 'cancelled', reason: 'shop-schedule' },
    { kind: 'cancelled', reason: 'duplicate' },
  ]);
  expect(over.shopSide).toBe(1);
  expect(over.missing).toBe(0);
});

test('재고 실사 — 0 으로 내려가는 제품을 따로 셀 수 있다 (246 리뷰 M-6)', () => {
  const rows = buildCountRows(countItems, { p1: '0', p2: '0', p3: '5', p4: '' });
  expect(zeroingRows(rows).map(r => r.id)).toEqual(['p1', 'p2']); // p3 는 현재고와 같아 저장 대상이 아니다
  expect(zeroingRows(buildCountRows(countItems, {}))).toEqual([]);
  expect(countNote({ counted: 0, unit: '개' }, '2026-11-26')).toBe('실사 0개 (2026-11-26)');
});

// ── 247: 예약 변경 이력 ──

const baseResv = { date: '2026-11-26', startTime: '14:00', staffName: '김실장', customerName: '홍길동', services: [{ serviceName: '아쿠아필' }], totalPrice: 90_000, memo: '', status: 'confirmed' };

test('예약 변경 이력 — 바뀐 항목만, 사람이 읽을 수 있는 줄로 (247)', () => {
  expect(diffReservation(baseResv, baseResv)).toEqual([]); // 바뀐 것이 없으면 이력을 만들지 않는다
  const moved = diffReservation(baseResv, { ...baseResv, date: '2026-11-27', startTime: '15:00' });
  expect(moved).toHaveLength(1); // 날짜와 시간은 함께 읽어야 뜻이 통한다
  expect(describeChange(moved[0])).toBe('날짜·시간 2026-11-26 14:00 → 2026-11-27 15:00');
  const many = diffReservation(baseResv, { ...baseResv, staffName: '박원장', services: [{ serviceName: '진정관리' }], totalPrice: 120_000 });
  expect(many.map(c => c.label)).toEqual(['담당 직원', '시술', '금액']);
  expect(describeChange(many[2])).toBe('금액 90,000원 → 120,000원');
  // 메모는 전문을 남기지 않는다 — 길고 개인 사정이 적힐 수 있다
  const memo = diffReservation(baseResv, { ...baseResv, memo: '임신 중이라 레이저 제외' });
  expect(memo).toEqual([{ label: '메모', from: '없음', to: '있음' }]);
});

test('예약 변경 이력 — 상태 변경은 한글 라벨로, 같은 상태면 남기지 않는다 (247)', () => {
  expect(statusLabel('noshow')).toBe('노쇼');
  expect(statusChange('confirmed', 'cancelled')).toEqual([{ label: '상태', from: '예약확정', to: '취소' }]);
  expect(statusChange('completed', 'completed')).toEqual([]);
  expect(describeChange(statusChange('confirmed', 'noshow')[0])).toBe('상태 예약확정 → 노쇼');
});

test('예약 변경 이력 — 모양이 깨진 기록은 버리고, 예약당·전체 상한을 지킨다 (247)', () => {
  const entry = (id: string, rid: string, at: string): HistoryEntry =>
    ({ id, reservationId: rid, at, kind: 'edit', changes: [{ label: '날짜·시간', from: 'a', to: 'b' }] });
  const clean = sanitizeHistory([
    entry('1', 'r1', '2026-11-26T01:00:00.000Z'),
    { id: '2', reservationId: '', at: '2026-11-26T02:00:00.000Z', kind: 'edit', changes: [] },   // 예약 id 가 없다
    { id: '3', reservationId: 'r1', at: '2026-11-26T03:00:00.000Z', kind: 'edit', changes: [] }, // 바뀐 것이 없다
    null,
  ]);
  expect(clean.map(e => e.id)).toEqual(['1']);
  // 한 예약에 상한을 넘겨 쌓이면 최근 것만 남는다
  const lots = Array.from({ length: MAX_PER_RESERVATION + 5 }, (_, i) => entry('e' + i, 'r1', `2026-11-26T${String(i % 24).padStart(2, '0')}:00:00.000Z`));
  const trimmed = trimHistory(lots, '2026-06-01');
  expect(trimmed.filter(e => e.reservationId === 'r1')).toHaveLength(MAX_PER_RESERVATION);
  // 보관 기간이 지난 기록은 버린다
  expect(trimHistory([entry('old', 'r1', '2026-01-02T00:00:00.000Z')], '2026-06-01')).toEqual([]);
  // 그 예약 것만, 최근 것이 위로
  const mixed = [entry('a', 'r1', '2026-11-26T01:00:00.000Z'), entry('b', 'r2', '2026-11-26T02:00:00.000Z'), entry('c', 'r1', '2026-11-26T03:00:00.000Z')];
  expect(historyFor(mixed, 'r1').map(e => e.id)).toEqual(['c', 'a']);
});

// ── 248: 발주 제안 (GAP P-5 계열) ──

const reorderProducts = [
  { id: 'r1', name: '앰플', unit: '개', stock: 2, minStock: 3 },
  { id: 'r2', name: '마스크팩', unit: '장', stock: 100, minStock: 10 },
  { id: 'r3', name: '신제품', unit: '개', stock: 1, minStock: 5 },   // 판매 기록 없음
  { id: 'r4', name: '넉넉한제품', unit: '개', stock: 50, minStock: 5 }, // 판매도 없고 재고도 넉넉
];

test('발주 제안 — 판매 속도로 수량·남은 일수를 내고, 급한 것부터 (248)', () => {
  const sales = [
    // 기간 밖 판매 1건 — 이 제품을 30일 전부터 팔고 있었다는 뜻(센 날수 = 30). 짧은 기록은 따로 테스트한다(250 M-8)
    { id: 'seed', productId: 'r1', quantity: 1, saleDate: '2026-10-01' },
    ...Array.from({ length: 18 }, (_, i) => ({ id: 's' + i, productId: 'r1', quantity: 1, saleDate: '2026-11-10' })),
    { id: 'm1', productId: 'r2', quantity: 10, saleDate: '2026-11-20' },
    { id: 'm0', productId: 'r2', quantity: 1, saleDate: '2026-10-01' },
  ];
  const rows = reorderSuggestions({ products: reorderProducts, sales, today: '2026-11-26' });
  const ampoule = rows.find(r => r.id === 'r1');
  expect(ampoule?.sold).toBe(18);
  expect(ampoule?.dailyRate).toBeCloseTo(0.6, 5); // 18 ÷ 30 — 계산은 원값(250 리뷰 M-1)
  expect(ampoule?.dailyRateText).toBe('0.6');     // 화면에만 소수 한 자리
  expect(ampoule?.daysLeft).toBe(3);              // 2 ÷ 0.6 = 3.33 → 3일분
  expect(ampoule?.suggestQty).toBe(19);           // 0.6×30 + 3 − 2 = 19
  expect(ampoule?.reason).toContain('최근 30일 18개 판매');
  // 재고가 넉넉하면 줄을 만들지 않는다(0건 줄 금지)
  expect(rows.some(r => r.id === 'r2')).toBe(false);
  expect(rows.some(r => r.id === 'r4')).toBe(false);
  // 판매 기록이 없으면 속도를 지어내지 않고 안전재고까지만
  const fresh = rows.find(r => r.id === 'r3');
  expect(fresh?.suggestQty).toBe(4);
  expect(fresh?.daysLeft).toBeNull();
  expect(fresh?.reason).toContain('판매 기록 없음');
  // 급한 것(남은 일수 적은 것)이 먼저, 모르는 것은 뒤로
  expect(rows.map(r => r.id)).toEqual(['r1', 'r3']);
});

test('발주 제안 — 취소된 판매·기간 밖·미래 날짜는 세지 않는다 (248)', () => {
  const sales = [
    { id: 'ok', productId: 'r1', quantity: 10, saleDate: '2026-11-20' },
    { id: 'cancelled', productId: 'r1', quantity: 10, saleDate: '2026-11-21' },
    { id: 'old', productId: 'r1', quantity: 50, saleDate: '2026-09-01' },   // 기간 밖
    { id: 'future', productId: 'r1', quantity: 50, saleDate: '2026-12-31' }, // 미래
    { id: 'noProduct', productName: '연결없음', quantity: 30, saleDate: '2026-11-22' },
  ];
  const rows = reorderSuggestions({
    products: [reorderProducts[0]], sales, canceledSaleIds: new Set(['cancelled']), today: '2026-11-26', coverDays: 30,
  });
  expect(rows[0].sold).toBe(10);
  expect(rows[0].dailyRate).toBeCloseTo(10 / 30, 5); // 원값 0.3333… (반올림 0.3 으로 계산하면 수량이 어긋난다)
  expect(rows[0].suggestQty).toBe(11); // ceil(0.3333×30) + 3 − 2 = 11
});

test('발주 제안 — 복사 글은 수량 중심이고 추정이라고 적는다 (248)', () => {
  const rows = reorderSuggestions({
    products: [reorderProducts[0], reorderProducts[2]],
    sales: [
      { id: 'seed', productId: 'r1', quantity: 1, saleDate: '2026-10-01' }, // 센 날수 30 (기간 밖은 수량에 안 들어간다)
      { id: 's', productId: 'r1', quantity: 30, saleDate: '2026-11-20' },
    ],
    today: '2026-11-26',
  });
  const text = reorderListText(rows, '2026-11-26');
  expect(text).toContain('[발주 요청] 2026-11-26');
  expect(text).toContain('- 앰플 31개 (현재고 2개, 약 2일분)');
  expect(text).toContain('- 신제품 4개 (현재고 1개)');
  expect(text).toContain('수량은 매장이 확인 후 확정합니다');
  expect(describeReorderRow(rows[0])).toContain('앰플 31개 주문 권장');
  expect(reorderListText([], '2026-11-26')).toBe(''); // 제안이 없으면 복사할 글도 없다
});

// ── 249: 고객 연락 기록·미루기 ──

test('연락 기록 — 결과마다 기본 미루기 기간이 다르고, 기한이 지나면 스스로 풀린다 (249)', () => {
  expect(resultLabel('no-answer')).toBe('부재·연결 안 됨');
  expect(defaultSnoozeDays('booked')).toBe(30);
  expect(defaultSnoozeDays('no-answer')).toBe(3);
  expect(defaultSnoozeDays('직접 입력한 결과')).toBe(0); // 모르는 결과는 미루지 않는다
  expect(addDaysFollowUp('2026-11-26', 7)).toBe('2026-12-03');
  // 기한 당일까지는 숨기고, 다음 날부터 다시 보인다
  // until 은 "다시 보이기 시작하는 날" — 7일을 고르면 그 날 다시 보인다 (250 리뷰 L-1)
  const rec = { at: '2026-11-26', result: 'later', until: '2026-12-03' };
  expect(isSnoozed(rec, '2026-12-02')).toBe(true);
  expect(isSnoozed(rec, '2026-12-03')).toBe(false);
  expect(isSnoozed({ at: '2026-11-26', result: 'later' }, '2026-11-26')).toBe(false); // 미루지 않은 기록
  expect(isSnoozed(undefined, '2026-11-26')).toBe(false);
});

test('연락 기록 — 저장값 정리·보관 상한·숨긴 고객 집합 (249)', () => {
  const clean = sanitizeFollowUps({
    c1: { at: '2026-11-26', result: 'booked', until: '2026-12-26', note: '  다음 달   초 ', actor: '김실장' },
    c2: { at: '엉망', result: 'booked' },                       // 날짜가 아니다
    c3: { at: '2026-11-26', result: '   ' },                    // 결과가 비었다
    c4: { at: '2026-11-26', result: 'later', until: '엉망' },    // 기한이 날짜가 아니다 → 미루기 없이 기록만
  });
  expect(Object.keys(clean)).toEqual(['c1', 'c4']);
  expect(clean.c1.note).toBe('다음 달 초');
  expect(clean.c4.until).toBeUndefined();
  // 숨긴 고객 집합 — 기한이 남은 것만
  const set = snoozedIdSet({ ...clean, c5: { at: '2026-01-01', result: 'later', until: '2026-01-08' } }, '2026-11-26');
  expect([...set]).toEqual(['c1']);
  // 오래된 기록은 버린다(기한도 지난 것)
  const pruned = pruneFollowUps({ old: { at: '2025-01-01', result: 'later', until: '2025-01-08' }, keep: clean.c1 }, '2026-06-01');
  expect(Object.keys(pruned)).toEqual(['keep']);
});

test('연락 기록 — 화면 문구는 결과·기한·메모를 그대로, 숨긴 인원은 숨기지 않는다 (249)', () => {
  expect(describeFollowUp({ at: '2026-11-26', result: 'no-answer', until: '2026-11-29', note: '오후에 다시', actor: '김실장' }))
    .toBe('2026-11-26 부재·연결 안 됨 · 2026-11-29 까지 미룸 · 오후에 다시 (김실장)');
  expect(describeFollowUp({ at: '2026-11-26', result: 'messaged' })).toBe('2026-11-26 문자·카톡 보냄');
  expect(describeHidden(3)).toBe('연락을 미룬 고객 3명은 목록에서 숨겼습니다(기한이 지나면 다시 나옵니다).');
  expect(describeHidden(0)).toBeNull();
});

// ── 250: 247~249 리뷰 반영 ──

test('발주 제안 — 재고부족(재고 = 안전재고)이면 반드시 줄을 만든다 (250 리뷰 H-1)', () => {
  // 매장 공용 규칙 isLowStock 은 stock <= minStock 인데, 전에는 stock < minStock 만 봐서
  // 헤더가 "재고부족" 이라는 제품을 발주 제안이 "주문할 것 없음" 이라고 말했다
  const same = reorderSuggestions({ products: [{ id: 'p', name: '앰플', unit: '개', stock: 5, minStock: 5 }], sales: [], today: '2026-11-26' });
  expect(same).toHaveLength(1);
  expect(same[0].suggestQty).toBeGreaterThanOrEqual(1);
  // 안전재고 0 + 재고 0 도 재고부족이다
  const zero = reorderSuggestions({ products: [{ id: 'p', name: '앰플', unit: '개', stock: 0, minStock: 0 }], sales: [], today: '2026-11-26' });
  expect(zero).toHaveLength(1);
  expect(zero[0].suggestQty).toBe(1);
  // 단종(비활성) 제품은 발주 대상이 아니다
  expect(reorderSuggestions({ products: [{ id: 'p', name: '단종', unit: '개', stock: 0, minStock: 5, isActive: false }], sales: [], today: '2026-11-26' })).toEqual([]);
  expect(REORDER_EMPTY).toContain('안전재고를 넘고');
});

test('발주 제안 — 한 달에 1개 팔린 제품을 "판매 기록 없음" 이라고 적지 않는다 (250 리뷰 H-2)', () => {
  const rows = reorderSuggestions({
    products: [{ id: 'p', name: '고가앰플', unit: '개', stock: 1, minStock: 5 }],
    sales: [{ id: 's', productId: 'p', quantity: 1, saleDate: '2026-11-10' }],
    today: '2026-11-26',
  });
  expect(rows[0].sold).toBe(1);
  expect(rows[0].reason).not.toContain('판매 기록 없음');
  expect(rows[0].reason).toContain('1개 판매');
  expect(rows[0].daysLeft).not.toBeNull();     // 속도를 알므로 남은 일수도 안다
  expect(rows[0].dailyRate).toBeGreaterThan(0);
  // 판매가 정말 0건일 때만 그 문구를 쓴다
  const none = reorderSuggestions({ products: [{ id: 'p', name: '신제품', unit: '개', stock: 1, minStock: 5 }], sales: [], today: '2026-11-26' });
  expect(none[0].reason).toContain('판매 기록 없음');
});

test('발주 제안 — 판매 기록이 짧으면 센 날수로 계산하고 그 사실을 적는다 (250 리뷰 M-8)', () => {
  // 영업 3일 된 매장: 3일에 3개 → 하루 1개(전에는 3÷30 = 0.1개로 깎여 "30일분 남음" 이라고 했다)
  const rows = reorderSuggestions({
    products: [{ id: 'p', name: '앰플', unit: '개', stock: 3, minStock: 2 }],
    sales: [
      { id: 'a', productId: 'p', quantity: 1, saleDate: '2026-11-24' },
      { id: 'b', productId: 'p', quantity: 1, saleDate: '2026-11-25' },
      { id: 'c', productId: 'p', quantity: 1, saleDate: '2026-11-26' },
    ],
    today: '2026-11-26',
  });
  expect(rows[0].countedDays).toBe(3);
  expect(rows[0].dailyRate).toBeCloseTo(1, 5);
  expect(rows[0].daysLeft).toBe(3);
  expect(rows[0].reason).toContain('판매 기록이 3일치뿐이라 추정이 거칠다');
});

test('발주 제안 — 음수 재고를 0 으로 꾸미지 않는다 (250 리뷰 L-9)', () => {
  const rows = reorderSuggestions({ products: [{ id: 'p', name: '앰플', unit: '개', stock: -5, minStock: 10 }], sales: [], today: '2026-11-26' });
  expect(rows[0].stock).toBe(-5);
  expect(rows[0].suggestQty).toBe(15); // 안전재고 10 − (−5) = 15
  expect(rows[0].reason).toContain('현재고 -5개');
});

test('연락 기록 — 진행 중인 미루기는 건수 상한보다 먼저 보호한다 (250 리뷰 M-6)', () => {
  const today = '2026-11-26';
  const map: Record<string, { at: string; result: string; until?: string }> = {};
  // 상한을 넘는 활성 미루기 + 오래된 기록
  for (let i = 0; i < 510; i += 1) map['act' + i] = { at: '2026-11-01', result: 'declined', until: '2027-02-01' };
  for (let i = 0; i < 50; i += 1) map['old' + i] = { at: '2026-11-20', result: 'messaged' };
  const pruned = pruneFollowUps(map, '2026-01-01', 500, today);
  const kept = Object.keys(pruned);
  expect(kept).toHaveLength(500);
  expect(kept.every(k => k.startsWith('act'))).toBe(true); // 활성 미루기가 자리를 먼저 받는다
  // 활성 미루기가 적으면 나머지 기록도 남는다
  const small = pruneFollowUps({ a: { at: '2026-11-01', result: 'declined', until: '2027-02-01' }, b: { at: '2026-11-20', result: 'messaged' } }, '2026-01-01', 500, today);
  expect(Object.keys(small).sort()).toEqual(['a', 'b']);
});

test('예약 변경 이력 — 삭제도 남고, 등록 줄은 "등록" 을 두 번 말하지 않는다 (250 리뷰 H-3·L-5)', () => {
  const del: HistoryEntry = { id: 'd', reservationId: 'r1', at: '2026-11-26T01:00:00.000Z', kind: 'delete', changes: [{ label: '삭제', from: '2026-11-26 14:00', to: '' }] };
  expect(sanitizeHistory([del])).toHaveLength(1);
  expect(describeEntryHead(del, () => '11-26 10:00')).toBe('11-26 10:00 · 삭제');
  expect(describeChange(del.changes[0])).toBe('삭제 2026-11-26 14:00 지움');
  // 등록 줄은 머리말이 "등록" 이므로 항목 이름은 날짜·시간
  const create: HistoryEntry = { id: 'c', reservationId: 'r1', at: '2026-11-26T00:00:00.000Z', kind: 'create', changes: [{ label: '날짜·시간', from: '', to: '2026-11-26 14:00' }] };
  expect(describeEntryHead(create, () => '11-26 09:00')).toBe('11-26 09:00 · 등록');
  expect(describeChange(create.changes[0])).toBe('날짜·시간 2026-11-26 14:00 로 입력');
});

// ── 251: 자주 쓰는 메모 문구 ──

test('메모 문구 — 정리·중복·상한과 거절 사유 (251)', () => {
  expect(normalizePreset('  자극   없음 · 홈케어 안내 ')).toBe('자극 없음 · 홈케어 안내');
  expect(normalizePreset('줄\n바꿈')).toBe('줄 바꿈');
  expect(normalizePreset('가'.repeat(60))).toHaveLength(MAX_PRESET_LEN);
  expect(normalizePreset(null)).toBe('');
  expect(sanitizePresets(['a b', 'a  b', '', null, '다른 문구'])).toEqual(['a b', '다른 문구']); // 중복·빈 값 제거
  // 거절 사유를 조용히 버리지 않는다
  expect(addPreset([], ' ').error).toBe('문구를 입력해주세요.');
  expect(addPreset([], '가').error).toBe('두 글자 이상 적어주세요.');
  expect(addPreset(['자극 없음'], '자극  없음').error).toBe('이미 있는 문구입니다.');
  const full = Array.from({ length: MAX_PRESETS }, (_, i) => '문구' + i);
  expect(addPreset(full, '하나 더').error).toContain(`${MAX_PRESETS}개까지`);
  expect(addPreset(['자극 없음'], '강도 낮춤').list).toEqual(['자극 없음', '강도 낮춤']);
  expect(removePreset(['자극 없음', '강도 낮춤'], '자극 없음')).toEqual(['강도 낮춤']);
});

test('메모 문구 — 메모에 덧붙이고 같은 줄을 두 번 넣지 않는다 (251)', () => {
  expect(appendPreset('', '자극 없음')).toBe('자극 없음');                       // 빈 메모에는 줄바꿈을 만들지 않는다
  expect(appendPreset('홈케어 안내', '자극 없음')).toBe('홈케어 안내\n자극 없음');
  expect(appendPreset('자극 없음', '자극 없음')).toBe('자극 없음');              // 이미 있으면 그대로
  expect(appendPreset('홈케어 안내\n', '자극 없음')).toBe('홈케어 안내\n자극 없음'); // 끝 빈 줄 정리
  expect(appendPreset('메모', '  ')).toBe('메모');
  expect(presetInMemo('홈케어 안내\n자극 없음', '자극 없음')).toBe(true);
  expect(presetInMemo('자극 없음이 있었다', '자극 없음')).toBe(false);           // 줄 단위로만 본다
});

// ── 252: 고객 정보 변경 이력 ──

const custBefore = { name: '홍길동', phone: '010-1234-5678', email: 'hong@test.com', grade: '일반', tags: ['민감성'], memo: '', allergies: '' };

test('고객 변경 이력 — 개인정보는 적게 남긴다(연락처 일부·메모는 사실만) (252)', () => {
  const changes = diffCustomer(custBefore, { ...custBefore, phone: '010-9999-0000', email: 'new@test.com', memo: '임신 중', allergies: '복숭아' });
  const byLabel = new Map(changes.map(c => [c.label, c]));
  expect(byLabel.get('연락처')).toEqual({ label: '연락처', from: '···5678', to: '···0000' }); // 뒤 4자리만
  expect(byLabel.get('이메일')?.to).toBe('ne···@test.com');
  expect(byLabel.get('메모')).toEqual({ label: '메모', from: '없음', to: '있음' });            // 내용은 남기지 않는다
  expect(byLabel.get('알레르기')).toEqual({ label: '알레르기', from: '없음', to: '있음' });
  expect(maskPhone('')).toBe('없음');
  expect(maskEmail(undefined)).toBe('없음');
  // 생일·주소는 적었는지만
  const privacy = diffCustomer(custBefore, { ...custBefore, birthDate: '1990-01-01', address: '서울시 강남구 …' });
  expect(privacy.map(c => [c.label, c.to])).toEqual([['생일', '적음'], ['주소', '적음']]);
});

test('고객 변경 이력 — 등급·태그·이름은 그대로, 바뀐 것이 없으면 기록하지 않는다 (252)', () => {
  expect(diffCustomer(custBefore, custBefore)).toEqual([]);
  const changes = diffCustomer(custBefore, { ...custBefore, name: '김길동', grade: 'VIP', tags: ['민감성', '임산부'] });
  expect(changes.map(c => describeCustomerChange(c))).toEqual([
    '이름 홍길동 → 김길동',
    '등급 일반 → VIP',
    '태그 민감성 → 민감성, 임산부',
  ]);
  expect(gradeChange('일반', 'VIP')).toEqual([{ label: '등급', from: '일반', to: 'VIP' }]);
  expect(gradeChange('VIP', 'VIP')).toEqual([]);
  expect(describeCustomerEntryHead({ id: 'x', customerId: 'c1', at: '2026-11-26T01:00:00.000Z', kind: 'grade', actor: '김실장', changes: [] }, () => '11-26 10:00'))
    .toBe('11-26 10:00 · 김실장 · 등급 변경');
});

test('고객 변경 이력 — 모양이 깨진 기록·상한·고객별 조회 (252)', () => {
  const entry = (id: string, cid: string, at: string) => ({ id, customerId: cid, at, kind: 'edit' as const, changes: [{ label: '등급', from: '일반', to: 'VIP' }] });
  const clean = sanitizeCustomerHistory([entry('1', 'c1', '2026-11-26T01:00:00.000Z'), { id: '2', customerId: '', at: 'x', kind: 'edit', changes: [] }, null]);
  expect(clean.map(e => e.id)).toEqual(['1']);
  const lots = Array.from({ length: MAX_PER_CUSTOMER + 5 }, (_, i) => entry('e' + i, 'c1', `2026-11-26T${String(i % 24).padStart(2, '0')}:00:00.000Z`));
  expect(trimCustomerHistory(lots, '2026-06-01').filter(e => e.customerId === 'c1')).toHaveLength(MAX_PER_CUSTOMER);
  expect(trimCustomerHistory([entry('old', 'c1', '2026-01-02T00:00:00.000Z')], '2026-06-01')).toEqual([]);
  const mixed = [entry('a', 'c1', '2026-11-26T01:00:00.000Z'), entry('b', 'c2', '2026-11-26T02:00:00.000Z'), entry('c', 'c1', '2026-11-26T03:00:00.000Z')];
  expect(customerHistoryFor(mixed, 'c1').map(e => e.id)).toEqual(['c', 'a']);
});

// ── 253: 취소·노쇼 사유 지난달 비교 ──

test('취소 사유 추세 — 지난달 자료가 없으면 비교하지 않는다 (253)', () => {
  const cur = summarizeReasons({ cancelled: 5, noshow: 2 }, [{ kind: 'cancelled', reason: 'shop-schedule' }]);
  const emptyPrev = summarizeReasons({ cancelled: 0, noshow: 0 }, []);
  const t0 = compareReasonMonths(cur, emptyPrev);
  expect(t0.comparable).toBe(false);
  expect(describeReasonTrend(t0)).toBeNull(); // 0 에서 늘었다고 말하지 않는다
  // 지난달 자료가 있으면 변화만 적는다
  const prev = summarizeReasons({ cancelled: 3, noshow: 2 }, [{ kind: 'cancelled', reason: 'customer-schedule' }]);
  const t1 = compareReasonMonths(cur, prev);
  expect(t1).toMatchObject({ comparable: true, shopComparable: true, cancelDelta: 2, noshowDelta: 0, shopSideDelta: 1 });
  expect(describeReasonTrend(t1)).toBe('지난달 대비 취소 +2 · 매장 쪽 사유 +1 (지난달 사유 기록 1건 기준)');
  // 줄어든 것도 그대로
  const t2 = compareReasonMonths(prev, cur);
  expect(describeReasonTrend(t2)).toBe('지난달 대비 취소 -2 · 매장 쪽 사유 -1 (지난달 사유 기록 1건 기준)');
  // 변화가 없으면 그 사실을 말한다
  expect(describeReasonTrend(compareReasonMonths(prev, prev))).toBe('지난달과 취소·노쇼 건수가 같습니다');
});

test('지난달 계산 — 연말 경계 (253)', () => {
  expect(previousMonth('2026-11')).toBe('2026-10');
  expect(previousMonth('2026-01')).toBe('2025-12');
  expect(previousMonth('엉망')).toBe('엉망');
});

// ── 254: 251~253 리뷰 반영 ──

test('취소 사유 추세 — 지난달에 사유를 아무도 적지 않았으면 "매장 쪽 +N" 을 말하지 않는다 (254 리뷰 H-1)', () => {
  // 244(사유 입력)가 나간 첫 달의 모든 매장이 보던 거짓 악화
  const prevNoReasons = summarizeReasons({ cancelled: 8, noshow: 3 }, []);               // 지난달: 취소는 있었지만 사유 0건
  const curWithReasons = summarizeReasons({ cancelled: 8, noshow: 3 }, [
    { kind: 'cancelled', reason: 'shop-schedule' },
    { kind: 'cancelled', reason: 'shop-schedule' },
    { kind: 'cancelled', reason: 'duplicate' },
  ]);
  const t = compareReasonMonths(curWithReasons, prevNoReasons);
  expect(t.comparable).toBe(true);        // 건수는 비교할 수 있다
  expect(t.shopComparable).toBe(false);   // 매장 쪽 사유는 비교할 수 없다
  const line = describeReasonTrend(t);
  expect(line).not.toContain('매장 쪽');  // 취소 건수가 같으니 변화 없음만 말한다
  expect(line).toBe('지난달과 취소·노쇼 건수가 같습니다');
  // 거꾸로 이번 달에 사유를 안 적었을 때도 "개선" 으로 말하지 않는다
  const back = compareReasonMonths(prevNoReasons, curWithReasons);
  expect(describeReasonTrend(back)).not.toContain('매장 쪽');
});

test('메모 문구 — 칩을 다시 누르면 그 줄이 빠진다(실제 토글) (254 리뷰 M-4)', () => {
  const memo = appendPreset(appendPreset('', '자극 없음'), '강도 낮춤');
  expect(memo).toBe('자극 없음\n강도 낮춤');
  expect(removePresetLine(memo, '자극 없음')).toBe('강도 낮춤');
  expect(removePresetLine(memo, '강도 낮춤')).toBe('자극 없음');
  expect(removePresetLine('자극 없음', '자극 없음')).toBe('');
  // 없던 문구면 메모를 건드리지 않는다(타이핑 중인 끝 공백도 그대로)
  expect(removePresetLine('직접 쓴 메모   ', '자극 없음')).toBe('직접 쓴 메모   ');
  // 사이 빈 줄이 겹치지 않게 정리한다
  expect(removePresetLine('A\n자극 없음\nB', '자극 없음')).toBe('A\nB');
});

test('고객 변경 이력 — 형식만 바뀐 연락처·순서만 바뀐 태그는 기록하지 않는다 (254 리뷰 M-6)', () => {
  const before = { phone: '010-1234-5678', email: 'hong@test.com', tags: ['a', 'b'] };
  expect(diffCustomer(before, { ...before, phone: '01012345678' })).toEqual([]);  // 하이픈만 지웠다
  expect(diffCustomer(before, { ...before, tags: ['b', 'a'] })).toEqual([]);      // 순서만 바뀜
  expect(diffCustomer(before, { ...before, tags: ['b', 'a', 'c'] })).toHaveLength(1);
  // 실제로 다른 번호는 기록한다
  expect(diffCustomer(before, { ...before, phone: '010-1234-9999' })).toHaveLength(1);
  // @ 가 여러 개인 이메일도 도메인을 잘라 먹지 않는다
  expect(maskEmail('a@b@c.com')).toBe('a···@b@c.com');
});

test('고객 변경 이력 — 날짜 모양이 아닌 기록은 버린다(영구 잔류 방지) (254 리뷰 L-3)', () => {
  const broken = [{ id: 'x', customerId: 'c1', at: 'not-a-date', kind: 'edit' as const, changes: [{ label: '등급', from: '일반', to: 'VIP' }] }];
  expect(sanitizeCustomerHistory(broken)).toEqual([]);
  expect(trimCustomerHistory(sanitizeCustomerHistory(broken), '2026-06-01')).toEqual([]);
});

// ── 256: 영수증 인사말 ──

test('영수증 인사말 — 정리하고, 환불·예정 내역서에는 붙이지 않는다 (256)', () => {
  expect(normalizeGreeting('  오늘도  찾아주셔서' + String.fromCharCode(10) + '감사합니다 ')).toBe('오늘도 찾아주셔서 감사합니다');
  expect(normalizeGreeting('   ')).toBeNull();
  expect(normalizeGreeting(undefined)).toBeNull();
  expect(normalizeGreeting('가'.repeat(80))).toHaveLength(MAX_GREETING);
  const shop = { name: '테스트샵', phone: '02-0000-0000', businessNumber: '000-00-00000', greeting: '오늘도 감사합니다' };
  const paid = buildReceipt({ payment: { paymentDate: '2026-11-26', amount: 90_000, paymentMethod: '카드', status: 'completed' }, shop, customerName: '홍길동' });
  expect(paid.greeting).toBe('오늘도 감사합니다');
  // 환불 영수증·예정 내역서에는 붙지 않는다("감사합니다" 가 환불 문서에 찍히지 않게)
  const refund = buildReceipt({ payment: { paymentDate: '2026-11-26', amount: 90_000, paymentMethod: '카드', status: 'refunded' }, shop });
  expect(refund.greeting).toBeNull();
  const pending = buildReceipt({ payment: { paymentDate: '2026-11-26', amount: 90_000, paymentMethod: '카드', status: 'pending' }, shop });
  expect(pending.greeting).toBeNull();
  // 설정에 인사말이 없으면 null — 빈 줄을 만들지 않는다
  expect(buildReceipt({ payment: { paymentDate: '2026-11-26', amount: 1000, paymentMethod: '현금', status: 'completed' }, shop: { name: '샵' } }).greeting).toBeNull();
});

// ── 258: 한 줄 칸(빠른 메모) 문구 토글 — 255~257 리뷰 H-2 회귀 ──

test('한 줄 메모 문구 — 문구에 구분자가 들어 있어도 실제로 토글되고 중복되지 않는다 (258, 리뷰 H-2)', () => {
  // 기본 예시 문구가 그 자체로 ' · ' 를 품고 있다 — 255 는 구분자로 쪼개 비교해 칩이 꺼진 채 계속 덧붙었다
  const presets = ['자극 없음 · 홈케어 안내', '다음에 10분 추가'];
  const one = toggleOneLine('', presets[0], presets);
  expect(one).toBe('자극 없음 · 홈케어 안내');
  expect(oneLineHas(one, presets[0], presets)).toBe(true);          // 255 에서는 false 였다(거짓 토글)
  expect(splitOneLine(one, presets)).toEqual(['자극 없음 · 홈케어 안내']);
  // 다시 누르면 빠진다 — 255 에서는 같은 문구가 두 번 들어갔다
  expect(toggleOneLine(one, presets[0], presets)).toBe('');
  // 두 문구를 넣으면 구분자로 잇고, 한쪽만 빼도 다른 쪽은 남는다
  const two = toggleOneLine(one, presets[1], presets);
  expect(two).toBe('자극 없음 · 홈케어 안내 · 다음에 10분 추가');
  expect(splitOneLine(two, presets)).toEqual(presets);
  expect(toggleOneLine(two, presets[1], presets)).toBe('자극 없음 · 홈케어 안내');
  // 손으로 적은 글은 그대로 두고 뒤에 붙인다
  const typed = toggleOneLine('컨디션 좋음', presets[1], presets);
  expect(typed).toBe('컨디션 좋음 · 다음에 10분 추가');
  expect(oneLineHas(typed, presets[1], presets)).toBe(true);
  expect(oneLineHas(typed, presets[0], presets)).toBe(false);
  // 긴 문구를 먼저 맞춰 본다 — 짧은 문구가 긴 문구의 앞머리와 같아도 섞이지 않는다
  const both = ['자극 없음 · 홈케어 안내', '자극 없음'];
  expect(splitOneLine('자극 없음 · 홈케어 안내', both)).toEqual(['자극 없음 · 홈케어 안내']);
  expect(oneLineHas('자극 없음 · 홈케어 안내', '자극 없음', both)).toBe(false);
  expect(toggleOneLine('자극 없음 · 홈케어 안내', '자극 없음', both)).toBe('자극 없음 · 홈케어 안내 · 자극 없음');
  expect(toggleOneLine('자극 없음 · 홈케어 안내 · 자극 없음', '자극 없음', both)).toBe('자극 없음 · 홈케어 안내');
});

// ── 260: 매출 지표 근거 보기(드릴다운) — 목록 합이 카드 숫자와 같아야 한다 ──

test('매출 지표 근거 — 목록 합계가 카드 숫자와 1원도 어긋나지 않는다 (260, GAP P-6)', () => {
  const payments = [
    { id: 'pay1', paymentDate: '2026-11-03', type: 'program' as const, status: 'completed' as const, amount: 300000, discountAmount: 20000, customerId: 'c-new', customerName: '김신규' },
    { id: 'pay2', paymentDate: '2026-11-09', type: 'product' as const, status: 'completed' as const, amount: 50000, customerId: 'c-new', customerName: '김신규' },
    { id: 'pay3', paymentDate: '2026-11-10', type: 'single_treatment' as const, status: 'completed' as const, amount: 100000, discountAmount: 5000, customerId: 'c-old', customerName: '박기존' },
    { id: 'pay4', paymentDate: '2026-11-12', type: 'product' as const, status: 'refunded' as const, amount: 70000, discountAmount: 7000, customerId: 'c-old', customerName: '박기존' }, // 환불은 어느 목록에도 없다
    { id: 'pay5', paymentDate: '2026-11-15', type: 'other' as const, status: 'completed' as const, amount: 40000 },                                                                  // 고객 미연결 — 신규가 아니다
    { id: 'pay6', paymentDate: '2026-10-20', type: 'single_treatment' as const, status: 'completed' as const, amount: 200000, customerId: 'c-new', customerName: '김신규' },          // 다른 달
  ];
  const customers = [
    { id: 'c-new', name: '김신규', registeredAt: '2026-11-02T00:00:00.000Z' },
    { id: 'c-old', name: '박기존', registeredAt: '2026-05-01T00:00:00.000Z' },
  ];
  const programs = [
    { id: 'g1', customerName: '김신규', programName: '등 관리 10회', pricePaid: 300000, totalSessions: 10, usedSessions: 2 },
    { id: 'g2', customerName: '박기존', programName: '완료권', pricePaid: 100000, totalSessions: 4, usedSessions: 4, isCompleted: true },  // 완료 제외
    { id: 'g3', customerName: '박기존', programName: '기간제', pricePaid: 90000, totalSessions: null, usedSessions: 0 },                   // 회차 없음 제외
    { id: 'g4', customerName: '최만료', programName: '만료권', pricePaid: 90000, totalSessions: 3, usedSessions: 0, expiryDate: '2026-11-01' }, // 만료 제외
    { id: 'g5', customerName: '이잔여', programName: '7회권', pricePaid: 100000, totalSessions: 3, usedSessions: 1 },                      // 회당 33,333.33… 반올림
  ];
  const m = monthMetrics({ month: '2026-11', today: '2026-11-20', payments, expenses: [], programs, logs: [], customers, target: null });

  // 신규 고객 매출 — 고객별로 묶고, 합은 카드와 같다
  const nc = newCustomerRows('2026-11', payments, customers);
  expect(nc.total).toBe(m.newCustomerRevenue);
  expect(nc.rows).toHaveLength(1);
  expect(nc.rows[0].label).toBe('김신규');
  expect(nc.rows[0].amount).toBe(350000);        // 30만 + 5만(10월 결제·환불은 제외)
  expect(nc.rows[0].detail).toContain('결제 2건');
  expect(nc.caveat).toContain('기존 고객 매출');  // 고객 미연결 결제가 어디 있는지 밝힌다
  expect(nc.rows.reduce((s2, r) => s2 + r.amount, 0)).toBe(nc.total);

  // 할인 합계 — 완료 결제만, 줄 합 = 카드
  const dc = discountRows('2026-11', payments);
  expect(dc.total).toBe(m.discount);
  expect(dc.rows).toHaveLength(2);
  expect(dc.rows.map(r => r.key)).toEqual(['pay1', 'pay3']); // 금액 큰 순
  expect(dc.rows.reduce((s2, r) => s2 + r.amount, 0)).toBe(dc.total);

  // 미사용 잔액 — 완료·기간제·만료를 빼고, 반올림까지 카드와 같다
  const ub = unusedBalanceRows('2026-11-20', programs);
  expect(ub.total).toBe(m.unusedBalance);
  expect(ub.rows.map(r => r.key)).toEqual(['g1', 'g5']);
  expect(ub.rows.reduce((s2, r) => s2 + r.amount, 0)).toBe(ub.total);
  expect(ub.rows[1].detail).toContain('잔여 2회');
  expect(ub.caveat).toContain('만료');

  // 빈 상태는 "없다" 를 말한다(0원이라고 꾸미지 않는다)
  const empty = newCustomerRows('2026-12', payments, customers);
  expect(empty.rows).toHaveLength(0);
  expect(empty.total).toBe(0);
  expect(empty.empty).toContain('없습니다');

  // 줄이 많으면 상위 DRILL_MAX_ROWS 줄만 보여 주고 합계는 전체 기준
  const many = Array.from({ length: DRILL_MAX_ROWS + 5 }, (_, i) => ({
    id: `big${i}`, paymentDate: '2026-11-05', type: 'other' as const, status: 'completed' as const,
    amount: 10000, discountAmount: 1000 + i, customerName: `고객${i}`,
  }));
  const big = discountRows('2026-11', many);
  expect(big.rows).toHaveLength(DRILL_MAX_ROWS);
  expect(big.truncatedFrom).toBe(DRILL_MAX_ROWS + 5);
  expect(big.total).toBe(many.reduce((s2, r) => s2 + (r.discountAmount || 0), 0)); // 자른 줄도 합계에는 들어간다
});

// ── 263: 발송 성과 근거 목록(누가 세어졌나) ──

test('발송 성과 근거 — 요약 숫자와 같은 창·같은 조건으로 고른다 (263, GAP M-6)', () => {
  const sends = [
    { customerId: 'c1', at: '2026-11-10T01:00:00.000Z' },
    { customerId: 'c1', at: '2026-11-12T01:00:00.000Z' }, // 같은 고객 두 번 — 첫 발송부터 창을 연다
    { customerId: 'c2', at: '2026-11-10T01:00:00.000Z' },
    { customerId: 'c3', at: '2026-11-10T01:00:00.000Z' },
  ];
  const sentOn = (() => { const t = new Date('2026-11-10T01:00:00.000Z'); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
  const reservations = [
    { customerId: 'c1', date: '2026-11-12', status: 'confirmed' },
    { customerId: 'c2', date: '2026-11-11', status: 'cancelled' },   // 취소는 세지 않는다
    { customerId: 'c3', date: '2026-12-20', status: 'confirmed' },   // 창(14일) 밖
  ];
  const payments = [
    { customerId: 'c1', paymentDate: '2026-11-13', amount: 120000, status: 'completed' as const },
    { customerId: 'c1', paymentDate: '2026-11-14', amount: 30000, status: 'completed' as const },
    { customerId: 'c2', paymentDate: '2026-11-13', amount: 50000, status: 'refunded' as const }, // 환불은 세지 않는다
  ];
  const sum = estimatePerformance(sends, reservations, payments);
  const rows = performanceRows(sends, reservations, payments);

  expect(rows).toHaveLength(3);                       // 발송 고객 수(중복 제거) 와 같다
  expect(rows.length).toBe(sum.sent);
  expect(rows[0].customerId).toBe('c1');              // 결제 금액 큰 순
  expect(rows[0].sentOn).toBe(sentOn);                // 첫 발송일 기준(로컬 날짜)
  expect(rows[0].reservedOn).toBe('2026-11-12');
  expect(rows[0].paidOn).toBe('2026-11-13');          // 창 안 첫 결제일
  expect(rows[0].amount).toBe(150000);
  // 요약과 목록이 같은 조건 — 합계·인원이 어긋나지 않는다
  expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(sum.revenue);
  expect(rows.filter(r => r.reservedOn).length).toBe(sum.reserved);
  expect(rows.filter(r => r.paidOn !== null).length).toBe(sum.paid); // 0원 완료 결제(이벤트)도 "결제한 사람" 이다 (266, 리뷰 L-3)
  // 취소·창 밖만 있는 고객은 "없음" 으로 남는다(줄을 지우지 않는다 — 누가 안 움직였는지도 사실이다)
  const c2 = rows.find(r => r.customerId === 'c2')!;
  expect(c2.reservedOn).toBeNull();
  expect(c2.paidOn).toBeNull();
  expect(c2.amount).toBe(0);
  const c3 = rows.find(r => r.customerId === 'c3')!;
  expect(c3.reservedOn).toBeNull();
  expect(c3.windowEnd > c3.sentOn).toBe(true);
});

// ── 264: 중복 결제 의심 판정 ──

test('중복 결제 의심 — 같은 고객·같은 금액·같은 날짜의 최근 완료 결제만 집어낸다 (264, GAP P-4)', () => {
  const now = '2026-11-26T05:00:00.000Z';
  const base = { customerId: 'c1', amount: 90000, paymentDate: '2026-11-26', status: 'completed' as const };
  const existing = [
    { id: 'p1', ...base, createdAt: '2026-11-26T04:58:00.000Z', paymentMethod: '카드', typeLabel: '등 관리' },   // 2분 전 — 의심
    { id: 'p2', ...base, createdAt: '2026-11-26T04:10:00.000Z', paymentMethod: '현금' },                        // 50분 전 — 창 밖
    { id: 'p3', ...base, amount: 80000, createdAt: '2026-11-26T04:59:00.000Z' },                                // 금액 다름
    { id: 'p4', ...base, customerId: 'c2', createdAt: '2026-11-26T04:59:00.000Z' },                             // 다른 고객
    { id: 'p5', ...base, paymentDate: '2026-11-25', createdAt: '2026-11-26T04:59:00.000Z' },                    // 다른 업무 날짜 — 266 부터 이것도 의심(늦은 완료 처리)
    { id: 'p6', ...base, status: 'refunded' as const, createdAt: '2026-11-26T04:59:00.000Z' },                  // 환불된 건
    { id: 'p7', ...base, createdAt: '이상한값' },                                                                // 등록 시각 모름 — "몇 분 전" 을 지어내지 않는다
  ];
  const hits = findDuplicateSuspects(base, existing, now);
  // 266(리뷰 M-3): 업무 날짜가 달라도 **등록 시각**이 창 안이면 의심한다 — 예약 완료 결제는 예약일로,
  // 매출 화면은 오늘로 적혀, 늦은 완료 처리 날 두 직원이 각자 등록하면 서로 걸리지 않았다
  expect(hits.map(h => h.id)).toEqual(['p5', 'p1']); // 1분 전(p5) → 2분 전(p1)
  expect(hits[1].minutesAgo).toBe(2);
  expect(hits[0].paymentDate).toBe('2026-11-25');    // 그 결제의 결제일을 함께 돌려준다(문구에 적는다)

  // 환불·예정 건을 등록할 때는 묻지 않는다(중복 경고 대상이 아니다)
  expect(findDuplicateSuspects({ ...base, status: 'refunded' }, existing, now)).toEqual([]);
  expect(findDuplicateSuspects({ ...base, status: 'pending' }, existing, now)).toEqual([]);
  // 고객을 연결하지 않은 결제는 같은 사람인지 알 수 없다 → 묻지 않는다
  expect(findDuplicateSuspects({ ...base, customerId: undefined }, existing, now)).toEqual([]);
  // 창을 넓히면 50분 전 건도 들어온다(기본 창은 30분)
  expect(findDuplicateSuspects(base, existing, now, 60).map(h => h.id)).toEqual(['p5', 'p1', 'p2']);
  expect(DUP_WINDOW_MINUTES).toBe(30);

  // 문구 — 언제·무엇으로 들어온 결제인지 적고, 이 PC 한계도 밝힌다
  const text = describeDuplicateWarning(hits, { amount: 90000, customerName: '홍길동' }, n => `${n.toLocaleString('ko-KR')}원`);
  expect(text).toContain('홍길동 고객의 90,000원 결제가 이미 2건'); // 266: 다른 업무 날짜 건도 의심에 들어온다
  expect(text).toContain('2분 전 등록');
  expect(text).toContain('등 관리 · 카드');
  expect(text).toContain('결제일 2026-11-26');
  expect(text).toContain('이 PC 에 저장된 결제만');
  expect(describeDuplicateWarning([], { amount: 1000 }, String)).toBe(''); // 의심이 없으면 빈 문구(창을 띄우지 않는다)
});

// ── 266: 0원 완료 결제가 섞여도 성과 인원이 어긋나지 않는다 (리뷰 L-3) ──

test('발송 성과 근거 — 0원 완료 결제도 결제한 사람으로 센다 (266, 리뷰 L-3)', () => {
  const sends = [{ customerId: 'z1', at: '2026-11-10T01:00:00.000Z' }];
  const payments = [{ customerId: 'z1', paymentDate: '2026-11-12', amount: 0, status: 'completed' as const }]; // 0원 이벤트 결제
  const sum = estimatePerformance(sends, [], payments);
  const rows = performanceRows(sends, [], payments);
  expect(sum.paid).toBe(1);
  expect(sum.revenue).toBe(0);
  expect(rows[0].paidOn).toBe('2026-11-12');
  expect(rows[0].amount).toBe(0);
  expect(rows.filter(r => r.paidOn !== null).length).toBe(sum.paid); // 금액으로 세면 0원 건이 빠진다
});

// ── 267: 기기 시계가 앞선 PC 에서도 중복을 놓치지 않는다 (리뷰 L-6) ──

test('중복 결제 의심 — 등록 시각이 미래인 결제(시계 어긋남)도 창 안이면 잡는다 (267)', () => {
  const now = '2026-11-26T05:00:00.000Z';
  const base = { customerId: 'c9', amount: 70000, paymentDate: '2026-11-26', status: 'completed' as const };
  const future = [{ id: 'f1', ...base, createdAt: '2026-11-26T05:10:00.000Z', paymentMethod: '카드' }]; // 10분 뒤로 적힌 결제
  const hits = findDuplicateSuspects(base, future, now);
  expect(hits.map(h => h.id)).toEqual(['f1']);
  expect(hits[0].minutesAgo).toBe(0); // "방금" 으로 말한다(음수 분을 보여 주지 않는다)
  // 창을 크게 벗어난 미래(시계가 하루 틀린 PC)는 넣지 않는다 — 엉뚱한 경고를 만들지 않는다
  const farFuture = [{ id: 'f2', ...base, createdAt: '2026-11-27T05:00:00.000Z' }];
  expect(findDuplicateSuspects(base, farFuture, now)).toEqual([]);
});

// ════════════════════════════════════════════════════════════════
// 268 (GAP Q-3): 테스트가 한 번도 부르지 않던 순수 함수 9개 — 다른 규칙이 이 값들을 믿고 계산한다
// ════════════════════════════════════════════════════════════════

test('시간 변환 — HH:mm ↔ 분, 자정·잘못된 값 (268, schedulingRule)', () => {
  expect(toMinutes('10:30')).toBe(630);
  expect(toMinutes('9:05')).toBe(545);          // 한 자리 시
  expect(toMinutes('00:00')).toBe(0);
  expect(toMinutes('24:00')).toBe(1440);        // 마감 자정은 24:00 으로 받는다(영업시간 계산이 이 값을 쓴다)
  expect(toMinutes('25:00')).toBeNull();
  expect(toMinutes('10:75')).toBeNull();
  expect(toMinutes('열시')).toBeNull();
  expect(toMinutes('')).toBeNull();
  expect(toMinutes(undefined)).toBeNull();
  expect(toMinutes(null)).toBeNull();
  // 되돌리기 — 하루를 넘거나 음수여도 24시간 안으로 감는다(자정 넘김 예약의 시작 시각 표기)
  expect(fromMinutes(630)).toBe('10:30');
  expect(fromMinutes(0)).toBe('00:00');
  expect(fromMinutes(1440)).toBe('00:00');
  expect(fromMinutes(1500)).toBe('01:00');
  expect(fromMinutes(-30)).toBe('23:30');
  expect(fromMinutes(toMinutes('19:05') as number)).toBe('19:05'); // 왕복
});

test('근무표 — 기본 근무·요일 판정·같은 근무표 비교 (268, staffScheduleRule)', () => {
  expect(defaultShift()).toEqual({ off: false, start: '10:00', end: '19:00' });
  // 요일 키는 Date.getDay() 순서를 그대로 따라야 한다(월요일 시작 배열과 섞이면 하루가 밀린다)
  expect(dayKeyOf(new Date(2026, 10, 23))).toBe('월'); // 2026-11-23 은 월요일
  expect(dayKeyOf(new Date(2026, 10, 29))).toBe('일');
  expect(dayKeyOf(new Date(2026, 10, 28))).toBe('토');
  expect(DAY_KEYS).toHaveLength(7);

  // sameSchedule — 바뀌지 않은 근무표를 설정 행에 다시 쓰지 않으려고 쓴다(191 리뷰 M-2).
  // updatedAt 은 비교에서 빠져야 한다(그 값만 다르면 "바뀌었다" 가 되어 매번 설정 행을 덮는다)
  const a = defaultSchedule('s1');
  const b = { ...defaultSchedule('s1'), updatedAt: '2026-11-26T00:00:00.000Z' };
  expect(sameSchedule(a, b)).toBe(true);
  expect(sameSchedule(a, { ...a, bufferBeforeMin: 10 })).toBe(false);
  expect(sameSchedule(a, { ...a, useShopHours: false })).toBe(false);
  const changedDay = { ...a, weekly: { ...a.weekly, 월: { ...a.weekly['월'], end: '20:00' } } };
  expect(sameSchedule(a, changedDay)).toBe(false);
  const withBreak = { ...a, weekly: { ...a.weekly, 화: { ...a.weekly['화'], breakStart: '13:00', breakEnd: '14:00' } } };
  expect(sameSchedule(a, withBreak)).toBe(false);
  // 다른 직원 id 는 비교 대상이 아니다(같은 근무 내용이면 같다고 본다 — 호출 쪽이 같은 직원끼리만 비교한다)
  expect(sameSchedule(a, { ...a, staffId: 's2' })).toBe(true);
});

test('광고 동의 태그 — 날짜 태그만 가려낸다 (268, consentRule)', () => {
  expect(isConsentDateTag('광고동의:2026-11-26')).toBe(true);
  expect(isConsentDateTag('광고동의:2026-1-5')).toBe(false);   // 자리 수가 다르면 날짜 태그가 아니다
  expect(isConsentDateTag('광고동의')).toBe(false);
  expect(isConsentDateTag('광고거부')).toBe(false);
  expect(isConsentDateTag('VIP')).toBe(false);
  expect(isConsentDateTag('')).toBe(false);
  expect(isConsentDateTag(' 광고동의:2026-11-26')).toBe(false); // 앞뒤 공백이 붙은 값은 태그 칩으로 셈하지 않는다
});

test('재예약 기록 — 매장 기준 날짜를 쓰고, 없으면 ISO 앞 10자 (268, rebookStatsRule)', () => {
  const base = { id: 'r1', customerId: 'c1', suggestedDate: '2026-12-01', shownAt: '2026-11-30T16:00:00.000Z' };
  expect(entryDay({ ...base, day: '2026-12-01' })).toBe('2026-12-01'); // 매장 기준 날(UTC 로 자르면 11-30 이 된다)
  expect(entryDay(base)).toBe('2026-11-30');                            // 옛 기록(day 없음)은 ISO 앞 10자
  expect(entryDay({ ...base, day: '이상한값' })).toBe('2026-11-30');     // 모양이 깨진 day 는 믿지 않는다
  expect(entryDay({ ...base, day: '' })).toBe('2026-11-30');
});

test('환불 메모 — 원 결제를 되찾을 수 있게 적는다 (268, refundRule)', () => {
  const original = { id: 'pay-1', paymentDate: '2026-11-20' };
  expect(refundMemo(original, '2026-11-26')).toBe('[환불 2026-11-26 ← 2026-11-20 pay-1]');
  expect(refundMemo(original, '2026-11-26', '고객 요청')).toBe('[환불 2026-11-26 ← 2026-11-20 pay-1] 고객 요청');
  expect(refundMemo(original, '2026-11-26', '고객 요청', '김원장')).toBe('[환불 2026-11-26 ← 2026-11-20 pay-1] 고객 요청 · 처리 김원장');
  expect(refundMemo(original, '2026-11-26', '  ', '  ')).toBe('[환불 2026-11-26 ← 2026-11-20 pay-1]'); // 공백만이면 꼬리를 붙이지 않는다
  expect(refundMemo(original, '2026-11-26', undefined, '김원장')).toContain('처리 김원장');
});

test('날짜 문자열 — 로컬 기준으로 자른다(UTC 로 밀리지 않게) (268, revisitRule)', () => {
  expect(toISO(new Date(2026, 10, 26))).toBe('2026-11-26');
  expect(toISO(new Date(2026, 0, 5))).toBe('2026-01-05');   // 한 자리 월·일은 0 을 채운다
  expect(toISO(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  // 자정 직전·직후가 같은 날로 뭉치지 않는다
  expect(toISO(new Date(2026, 10, 26, 0, 0))).toBe('2026-11-26');
  expect(toISO(new Date(2026, 10, 25, 23, 59))).toBe('2026-11-25');
});
