import { josa } from './josa';
// ═══════════════════════════════════════════════════════════════
// businessHours — 영업시간·휴무일 점검 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 예약을 휴무일·지정 휴일·영업시간 밖에 잡으면 저장 전에 경고한다(막지는 않는다 — 예외 영업이 흔하므로 confirm).
// 설정 > 영업시간의 요일별 open/close/isOff와 holidays(YYYY-MM-DD, 설정 > 영업시간의 지정 휴일 편집기에서 관리)를 쓴다.
// 시간은 분으로 비교한다 — 'HH:mm' 문자열 비교는 자정을 넘는 예약(23:30+60분 → 00:30)에서 틀린다.
// ═══════════════════════════════════════════════════════════════

import { SettingsStore } from './store';
import { parseISODate } from './format';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export interface HoursWarning {
  kind: 'holiday' | 'dayOff' | 'outsideHours';
  message: string;
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function fromMinutes(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 날짜·시작 시각·소요 시간(분)이 영업 조건에 맞지 않으면 경고 목록(빈 배열이면 정상).
 * 종료가 자정을 넘으면 24:00 이후로 계산해 영업시간 밖으로 잡힌다.
 */
export function checkBusinessHours(date: string, startTime: string, durationMinutes: number): HoursWarning[] {
  const s = SettingsStore.get();
  const out: HoursWarning[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return out;
  if ((s.holidays || []).includes(date)) {
    out.push({ kind: 'holiday', message: `${josa(date, '은/는')} 지정 휴일입니다.` });
    return out;
  }
  const day = DAY_LABELS[parseISODate(date).getDay()];
  const hours = s.businessHours?.[day];
  if (!hours) return out;
  if (hours.isOff) {
    out.push({ kind: 'dayOff', message: `${day}요일은 휴무일입니다.` });
    return out;
  }
  const open = toMinutes(hours.open), start = toMinutes(startTime);
  let close = hours.close === '00:00' ? 24 * 60 : toMinutes(hours.close); // '00:00' 마감은 자정(24:00) — 예약표 범위(Reservations gridRangeFromSettings)와 같은 해석 (12차 #M1)
  if (open === null || close === null || start === null) return out;
  if (close <= open) close += 24 * 60; // 자정 넘는 마감(서버 시드·구버전 데이터) — 정상 영업시간을 "밖"으로 판정하지 않게
  const s0 = close > 24 * 60 && start < open ? start + 24 * 60 : start; // 18:00~02:00 영업의 01:00 예약은 다음날 새벽으로 본다 (117~119 리뷰 #M3)
  const end = s0 + Math.max(0, durationMinutes || 0);
  if (s0 < open || end > close) {
    out.push({ kind: 'outsideHours', message: `${day}요일 영업시간(${hours.open}~${hours.close}) 밖입니다 (${startTime}~${fromMinutes(end % (24 * 60))}).` });
  }
  return out;
}
