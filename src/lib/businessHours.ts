// ═══════════════════════════════════════════════════════════════
// businessHours — 영업시간·휴무일 점검 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 예약을 휴무일·지정 휴일·영업시간 밖에 잡으면 저장 전에 경고한다(막지는 않는다 — 예외 영업이 흔하므로 confirm).
// 설정 > 영업시간의 요일별 open/close/isOff와 holidays(YYYY-MM-DD)를 쓴다.
// ═══════════════════════════════════════════════════════════════

import { SettingsStore } from './store';
import { parseISODate } from './format';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export interface HoursWarning {
  kind: 'holiday' | 'dayOff' | 'outsideHours';
  message: string;
}

/** 날짜·시간이 영업 조건에 맞지 않으면 경고 목록(빈 배열이면 정상) */
export function checkBusinessHours(date: string, startTime: string, endTime: string): HoursWarning[] {
  const s = SettingsStore.get();
  const out: HoursWarning[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return out;
  if ((s.holidays || []).includes(date)) {
    out.push({ kind: 'holiday', message: `${date}은(는) 지정 휴일입니다.` });
    return out;
  }
  const day = DAY_LABELS[parseISODate(date).getDay()];
  const hours = s.businessHours?.[day];
  if (!hours) return out;
  if (hours.isOff) {
    out.push({ kind: 'dayOff', message: `${day}요일은 휴무일입니다.` });
    return out;
  }
  if (hours.open && hours.close && (startTime < hours.open || endTime > hours.close)) {
    out.push({ kind: 'outsideHours', message: `${day}요일 영업시간(${hours.open}~${hours.close}) 밖입니다 (${startTime}~${endTime}).` });
  }
  return out;
}
