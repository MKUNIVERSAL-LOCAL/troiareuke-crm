/**
 * staffScheduleRule — 직원 근무표·휴게·준비/정리 버퍼의 순수 규칙 (저장소 의존 없음). 141, GAP R-4.
 *  - 근무표가 없거나 "매장 영업시간과 같음"이면 매장 영업시간(설정 > 영업시간)이 그 직원의 근무 창.
 *  - 요일별 근무 시작·끝(끝이 시작 이하면 자정 넘김 +24h), 휴무, 휴게 1구간(근무 창 안에 있을 때만 인정).
 *  - 준비(before)·정리(after) 버퍼는 가용 시간 계산(availabilityRule)과 "버퍼 포함 겹침" 경고에만 쓰고, 예약 자체의 시간은 바꾸지 않는다.
 *  - 경고는 막지 않는다(예외 근무가 흔하다) — 예약 폼은 confirm 으로 묻는다(businessHours 와 같은 태도).
 */
import { toMinutes, fromMinutes as hhmm, type Interval } from './schedulingRule';
import type { DayKey, DayShift, StaffSchedule } from '../types';

export const DAY_KEYS: readonly DayKey[] = ['월', '화', '수', '목', '금', '토', '일'];

export interface ShopDayHours { open: string; close: string; isOff: boolean }

/** 하루의 근무 창 — work 가 null 이면 휴무(또는 매장 휴무) */
export interface DayWindow {
  work: Interval | null;
  breaks: Interval[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  /** 매장 영업시간을 그대로 쓴 창인지(그러면 영업시간 경고와 중복되니 직원 경고는 생략) */
  fromShopHours: boolean;
}

export const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30] as const;

export function defaultShift(): DayShift {
  return { off: false, start: '10:00', end: '19:00' };
}

export function defaultSchedule(staffId: string): StaffSchedule {
  const weekly = {} as Record<DayKey, DayShift>;
  for (const d of DAY_KEYS) weekly[d] = defaultShift();
  return { staffId, useShopHours: true, weekly, bufferBeforeMin: 0, bufferAfterMin: 0, updatedAt: '' };
}

/** 'HH:mm' 쌍 → 구간. close '00:00' 은 자정(24:00), 끝이 시작 이하면 자정 넘김 */
function spanOf(start: string | undefined, end: string | undefined): Interval | null {
  const s = toMinutes(start);
  if (s === null) return null;
  let e = end === '00:00' ? 24 * 60 : toMinutes(end);
  if (e === null) return null;
  if (e <= s) e += 24 * 60;
  return { startMin: s, endMin: e };
}

function shopDayWindow(hours: ShopDayHours | undefined, bufferBeforeMin = 0, bufferAfterMin = 0): DayWindow {
  const work = hours && !hours.isOff ? spanOf(hours.open, hours.close) : null;
  return { work, breaks: [], bufferBeforeMin, bufferAfterMin, fromShopHours: true };
}

/** 직원 근무표 + 요일 + 매장 영업시간 → 그날의 근무 창 */
export function dayWindow(schedule: StaffSchedule | null | undefined, day: DayKey, shopHours: ShopDayHours | undefined): DayWindow {
  const before = Math.max(0, schedule?.bufferBeforeMin || 0), after = Math.max(0, schedule?.bufferAfterMin || 0);
  if (!schedule || schedule.useShopHours) return shopDayWindow(shopHours, before, after);
  const shift = schedule.weekly[day];
  if (!shift || shift.off) return { work: null, breaks: [], bufferBeforeMin: before, bufferAfterMin: after, fromShopHours: false };
  const work = spanOf(shift.start, shift.end);
  if (!work) return shopDayWindow(shopHours, before, after); // 깨진 시간은 매장 영업시간으로 대신
  const br = spanOf(shift.breakStart, shift.breakEnd);
  const breaks = br && br.startMin >= work.startMin && br.endMin <= work.endMin ? [br] : [];
  return { work, breaks, bufferBeforeMin: before, bufferAfterMin: after, fromShopHours: false };
}

export interface StaffWindowWarning { kind: 'off' | 'outside' | 'break'; message: string }

/** 예약 후보(시작 분·소요)가 직원 근무 창을 벗어나거나 휴게와 겹치면 경고(빈 배열이면 정상). 매장 영업시간 창은 businessHours 가 따로 경고하니 생략 */
export function checkStaffWindow(window: DayWindow, staffName: string, day: DayKey, startMin: number, durationMin: number): StaffWindowWarning[] {
  if (window.fromShopHours) return [];
  const endMin = startMin + Math.max(0, durationMin || 0);
  if (!window.work) return [{ kind: 'off', message: `${staffName} 담당자는 ${day}요일 근무가 아닙니다.` }];
  const out: StaffWindowWarning[] = [];
  if (startMin < window.work.startMin || endMin > window.work.endMin) {
    out.push({ kind: 'outside', message: `${staffName} 담당자의 ${day}요일 근무 시간(${hhmm(window.work.startMin)}~${hhmm(window.work.endMin)}) 밖입니다.` });
  }
  for (const b of window.breaks) {
    if (startMin < b.endMin && endMin > b.startMin) out.push({ kind: 'break', message: `${staffName} 담당자의 휴게 시간(${hhmm(b.startMin)}~${hhmm(b.endMin)})과 겹칩니다.` });
  }
  return out;
}

/** 그리드 범위 안에서 "근무 아님" 구간(휴무면 전체) — 직원 열 뷰 음영용 */
export function offRanges(window: DayWindow, range: Interval): Interval[] {
  if (!window.work) return [{ ...range }];
  const out: Interval[] = [];
  if (window.work.startMin > range.startMin) out.push({ startMin: range.startMin, endMin: Math.min(window.work.startMin, range.endMin) });
  if (window.work.endMin < range.endMin) out.push({ startMin: Math.max(window.work.endMin, range.startMin), endMin: range.endMin });
  return out.filter(iv => iv.endMin > iv.startMin);
}

/** 근무 창 한 줄 요약 — "휴무" / "10:00~19:00" / "10:00~19:00 · 휴게 13:00~14:00" */
export function describeWindow(window: DayWindow): string {
  if (!window.work) return '휴무';
  const base = `${hhmm(window.work.startMin)}~${hhmm(window.work.endMin)}`;
  return window.breaks.length ? `${base} · 휴게 ${window.breaks.map(b => `${hhmm(b.startMin)}~${hhmm(b.endMin)}`).join(', ')}` : base;
}

/** 요일 라벨 — businessHours 와 같은 키('월'~'일') */
export function dayKeyOf(date: Date): DayKey {
  return (['일', '월', '화', '수', '목', '금', '토'] as DayKey[])[date.getDay()];
}

/** 두 근무표가 같은가(updatedAt 제외) — 직원 수정 저장 때 바뀌지 않은 기본값을 설정 행에 쓰지 않게 (191 리뷰 M-2) */
export function sameSchedule(a: StaffSchedule, b: StaffSchedule): boolean {
  const norm = (x: StaffSchedule) => JSON.stringify({ u: x.useShopHours, b1: x.bufferBeforeMin, b2: x.bufferAfterMin, w: DAY_KEYS.map(d => { const sh = x.weekly[d]; return [sh.off, sh.start, sh.end, sh.breakStart ?? '', sh.breakEnd ?? '']; }) });
  return norm(a) === norm(b);
}
