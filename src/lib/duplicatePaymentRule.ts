// ═══════════════════════════════════════════════════════════════
// duplicatePaymentRule — 중복 결제 의심 판정 (순수 모듈, 264, GAP P-4)
// ───────────────────────────────────────────────────────────────
// 왜: 221 의 이중 제출 잠금은 **한 번의 클릭 폭주**만 막는다. 실제 매장에서 매출이 부풀는 경로는 따로다 —
//     저장이 안 된 줄 알고 다시 등록하거나(토스트를 못 보고), 두 직원이 같은 결제를 각자 등록한다.
//     결제가 두 줄이면 매출·회차권·영수증이 모두 틀린 말을 하고, 환불로 지우기 전까지 그대로 남는다.
// 하는 일: 저장 직전에 **같은 고객·같은 금액**의 최근 결제를 찾아, 몇 분 전인지와 함께 돌려준다.
//     막지 않는다 — 진짜로 같은 금액을 두 번 받는 날도 있다(2회분 선결제 등). 사실만 보여 주고 사람이 고른다.
// 한계: 이 PC 에 저장된 결제만 본다(서버 멱등키는 승인 대기 — 다른 PC 가 1분 안에 넣은 건은 못 잡는다).
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

/** 기본 창 — 같은 결제를 다시 넣는 일은 보통 몇 분 안에 일어난다 */
export const DUP_WINDOW_MINUTES = 30;

export interface DupCandidate {
  customerId?: string;
  amount: number;
  paymentDate: string;          // YYYY-MM-DD(업무 날짜)
  status: 'completed' | 'refunded' | 'pending';
}

export interface DupExisting extends DupCandidate {
  id: string;
  createdAt: string;            // ISO
  paymentMethod?: string;
  typeLabel?: string;
}

export interface DupSuspect {
  id: string;
  minutesAgo: number;           // 몇 분 전에 들어온 결제인지(음수 없음)
  paymentDate: string;          // 그 결제의 업무 날짜 — 늦은 완료 처리는 오늘이 아닐 수 있다 (266, 리뷰 M-3)
  paymentMethod?: string;
  typeLabel?: string;
}

/**
 * 중복으로 의심되는 기존 결제 — 같은 고객·같은 금액이고 창 안에 **등록된**(createdAt) 완료 결제.
 * 업무 날짜(paymentDate)는 같을 것을 요구하지 않는다 — 예약 완료 결제는 예약일로, 매출 화면은 오늘로 적혀
 * 늦은 완료 처리 날 두 직원이 각자 등록하면 서로 걸리지 않았다(266, 리뷰 M-3). 대신 그 날짜를 문구에 적는다.
 * @param now 지금 시각(ISO) — 테스트가 고정할 수 있게 받는다
 */
export function findDuplicateSuspects(
  candidate: DupCandidate,
  existing: DupExisting[],
  now: string,
  windowMinutes = DUP_WINDOW_MINUTES,
): DupSuspect[] {
  if (candidate.status !== 'completed') return [];        // 환불·예정 건은 중복 경고 대상이 아니다
  if (!candidate.customerId) return [];                   // 고객을 연결하지 않은 결제는 같은 사람인지 알 수 없다
  if (!(candidate.amount > 0)) return [];
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(nowMs)) return [];
  const out: DupSuspect[] = [];
  for (const p of existing) {
    if (p.status !== 'completed') continue;
    if (p.customerId !== candidate.customerId) continue;
    if (p.amount !== candidate.amount) continue;
    const t = new Date(p.createdAt).getTime();
    if (Number.isNaN(t)) continue;                        // 등록 시각을 모르면 "몇 분 전" 을 지어내지 않는다
    const minutes = Math.floor((nowMs - t) / 60_000);
    if (minutes > windowMinutes) continue;
    // 기기 시계가 앞서 있으면 "미래에 등록된" 결제가 생긴다 — 창 안이면 0분(방금)으로 보고 넘기지 않는다 (267, 리뷰 L-6)
    if (minutes < 0 && -minutes > windowMinutes) continue;
    out.push({ id: p.id, minutesAgo: Math.max(0, minutes), paymentDate: p.paymentDate, paymentMethod: p.paymentMethod, typeLabel: p.typeLabel });
  }
  return out.sort((a, b) => a.minutesAgo - b.minutesAgo);
}

/**
 * 확인창에 쓸 말 — 숫자만 주면 직원이 판단할 수 없어 "언제·무엇으로" 를 함께 적는다.
 * @param formatPrice 금액 표기는 화면 규칙을 그대로 쓴다
 */
export function describeDuplicateWarning(
  suspects: DupSuspect[],
  candidate: { amount: number; customerName?: string },
  formatPrice: (n: number) => string,
): string {
  if (suspects.length === 0) return '';
  const who = candidate.customerName ? `${candidate.customerName} 고객` : '같은 고객';
  const lines = suspects.slice(0, 3).map(s => {
    const when = s.minutesAgo <= 0 ? '방금' : `${s.minutesAgo}분 전`;
    const what = [s.typeLabel, s.paymentMethod].filter(Boolean).join(' · ');
    // 결제일을 함께 적는다 — 늦은 완료 처리는 오늘이 아닌 날짜로 들어간다 (266, 리뷰 M-3)
    return `· ${when} 등록${what ? ` (${what})` : ''} · 결제일 ${s.paymentDate}`;
  });
  const more = suspects.length > 3 ? `· 그 밖에 ${suspects.length - 3}건` : null;
  return [
    `${who}의 ${formatPrice(candidate.amount)} 결제가 이미 ${suspects.length}건 있습니다.`,
    ...lines,
    more,
    '',
    '같은 금액을 한 번 더 받은 것이면 그대로 등록하세요. 아니면 취소하고 매출 > 결제 내역에서 확인해주세요.',
    '이 PC 에 저장된 결제만 확인합니다(다른 PC 에서 같은 시각에 넣은 건은 못 잡습니다).',
  ].filter((l): l is string => l !== null).join('\n');
}
