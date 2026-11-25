/**
 * waitlistRule — 취소된 예약 자리에 들어갈 수 있는 대기 요청(순수 모듈, 185, GAP R-10).
 *  - 대상 = 같은 날짜의 처리 전(new) 요청. 취소된 예약의 시작 시각과 희망 시각이 가까운 순(같으면 시각순)
 *  - 안내 문장은 건수와 앞 3건의 희망 시각만 — 이름·전화는 요청함에서 본다(알림에 개인정보를 띄우지 않는다)
 */
export interface WaitlistLike { id: string; status: string; date: string; startTime: string }

function toMin(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function waitlistFor<T extends WaitlistLike>(requests: T[], date: string, startTime?: string): T[] {
  const base = startTime ? toMin(startTime) : null;
  return requests
    .filter(r => r.status === 'new' && r.date === date)
    .map(r => ({ r, d: base === null ? 0 : Math.abs((toMin(r.startTime) ?? base) - base) }))
    .sort((a, b) => a.d - b.d || a.r.startTime.localeCompare(b.r.startTime))
    .map(x => x.r);
}

/** 취소 직후 안내 문장 — 대기 요청이 없으면 null(알림 없음) */
export function describeWaitlist(list: WaitlistLike[], dateLabel: string): string | null {
  if (list.length === 0) return null;
  const times = list.slice(0, 3).map(r => r.startTime).join('·');
  return `${dateLabel}에 들어오고 싶어 한 대기 요청 ${list.length}건(${times}${list.length > 3 ? ' 외' : ''})이 있습니다 — 예약 요청함에서 연락해 보세요.`;
}
