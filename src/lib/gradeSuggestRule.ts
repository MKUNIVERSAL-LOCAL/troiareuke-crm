// ═══════════════════════════════════════════════════════════════
// gradeSuggestRule — 고객 등급 자동 제안 규칙 (순수 모듈, 236, GAP C-1)
// ───────────────────────────────────────────────────────────────
// 왜: 등급(VIP·골드·일반·신규)이 전부 수동이라 한 번 정하면 그대로 굳었다. 방문·결제가 쌓여도
//     아무도 올려 주지 않아 단골이 '신규' 로 남고, 등급으로 거는 혜택·발송 대상이 어긋났다.
//     상용 CRM(Zenoti·Mindbody)은 방문·매출로 등급을 자동 산정한다.
// 설계 원칙:
//   1) **제안만 한다.** 자동으로 바꾸지 않는다 — 등급은 매장이 고객에게 약속한 것이라 조용히 바뀌면 안 된다.
//   2) **올리는 제안만 한다.** 내리는 제안은 하지 않는다(휴면 VIP 를 강등해 버리면 돌아온 고객을 잃는다).
//   3) 근거(방문 수·누적 결제·RFM 구분)를 함께 돌려줘 화면이 그대로 보여 준다.
//   4) 방문 기록이 없는 고객은 제안하지 않는다.
// 기준(화면에 그대로 적는다): VIP = 방문 8회 이상 & 누적 200만원 이상, 또는 RFM '충성'.
//                             골드 = 방문 4회 이상 & 누적 80만원 이상, 또는 RFM '우수'.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export type SuggestGrade = 'VIP' | '골드' | '일반' | '신규';

/** 등급 순서 — 올리는 제안만 하기 위해 비교에 쓴다 */
const RANK: Record<SuggestGrade, number> = { 신규: 0, 일반: 1, 골드: 2, VIP: 3 };

export const VIP_VISITS = 8;
export const VIP_SPENT = 2_000_000;
export const GOLD_VISITS = 4;
export const GOLD_SPENT = 800_000;

export interface GradeSuggestInput {
  current: string;
  /** 방문 수(완료 예약 ∪ 시술 기록) */
  visits: number;
  /** 누적 결제(완료 결제 합) */
  spent: number;
  /** RFM 구분 — 없으면 방문·금액만 본다 */
  segment?: string;
}

export interface GradeSuggestion {
  grade: SuggestGrade;
  reason: string;
}

/** 등급 제안 — 올릴 이유가 없으면 null */
export function suggestGrade(i: GradeSuggestInput): GradeSuggestion | null {
  const visits = Number.isFinite(i.visits) ? Math.max(0, Math.floor(i.visits)) : 0;
  const spent = Number.isFinite(i.spent) ? Math.max(0, Math.round(i.spent)) : 0;
  if (visits === 0) return null; // 방문 기록이 없으면 판단 근거가 없다

  let target: SuggestGrade | null = null;
  let reason = '';
  if (visits >= VIP_VISITS && spent >= VIP_SPENT) {
    target = 'VIP';
    reason = `방문 ${visits}회 · 누적 ${man(spent)}만원`;
  } else if (i.segment === '충성') {
    target = 'VIP';
    reason = `RFM 충성 고객(방문 ${visits}회 · 누적 ${man(spent)}만원)`;
  } else if (visits >= GOLD_VISITS && spent >= GOLD_SPENT) {
    target = '골드';
    reason = `방문 ${visits}회 · 누적 ${man(spent)}만원`;
  } else if (i.segment === '우수') {
    target = '골드';
    reason = `RFM 우수 고객(방문 ${visits}회 · 누적 ${man(spent)}만원)`;
  } else if (visits >= 2) {
    target = '일반';
    reason = `방문 ${visits}회 — 신규 단계는 지났습니다`;
  }
  if (!target) return null;

  const currentRank = RANK[(i.current as SuggestGrade)] ?? 0; // 모르는 등급 값은 가장 낮게 본다(제안이 막히지 않게)
  if (RANK[target] <= currentRank) return null; // 내리는 제안·같은 등급 제안은 하지 않는다
  return { grade: target, reason };
}

function man(won: number): string {
  return String(Math.floor(won / 10_000));
}

/** 설정·안내 문구 — 기준을 숨기지 않는다 */
export const GRADE_RULE_TEXT = `VIP: 방문 ${VIP_VISITS}회 이상·누적 ${VIP_SPENT / 10_000}만원 이상 또는 RFM 충성 / 골드: 방문 ${GOLD_VISITS}회 이상·누적 ${GOLD_SPENT / 10_000}만원 이상 또는 RFM 우수 / 일반: 방문 2회 이상`;
export const GRADE_SUGGEST_NOTE = '등급을 자동으로 바꾸지 않고 올릴 후보만 보여 줍니다. 내리는 제안은 하지 않습니다(휴면 고객의 등급을 떨어뜨리지 않기 위해).';
