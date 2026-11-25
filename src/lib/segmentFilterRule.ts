// segmentFilterRule — 저장 세그먼트(조건 조합) 평가 규칙 (순수, 166, GAP C-6·M-2). 저장·자료 수집은 savedSegments.ts
// 조건은 전부 "그리고(AND)" 로 묶인다. 비어 있는 조건은 무시(전체). 숫자·날짜는 호출 쪽(엔진)이 계산해 facts 로 넘기고 여기서는 비교만 한다.
import type { CustomerGrade } from '../types';
import type { RfmSegment } from './rfmRule';
import type { ChurnLevel } from './churnRule';

export interface SegmentCondition {
  grades?: CustomerGrade[];            // 등급 중 하나
  tagsAny?: string[];                  // 태그 중 하나 이상
  lastVisitDaysMin?: number;           // 마지막 방문 뒤 N일 이상(미방문은 제외)
  lastVisitDaysMax?: number;           // 마지막 방문 뒤 N일 이하
  visitsMin?: number;                  // 방문 횟수 이상
  visitsMax?: number;
  spentMin?: number;                   // 누적 결제(원) 이상
  recentSpendDays?: number;            // 최근 N일 결제 합을 볼 때의 N(기본 90) — recentSpendMin 과 함께 (175)
  recentSpendMin?: number;             // 최근 N일 완료 결제 합(원) 이상 (175)
  hasActiveProgram?: boolean;          // true = 진행 중 회차권 있음, false = 없음 (175)
  rfmSegments?: RfmSegment[];          // RFM 구분 중 하나
  churnLevels?: ChurnLevel[];          // 이탈 위험 등급 중 하나
  birthdayThisMonth?: boolean;         // 이달 생일
  hasUpcoming?: boolean;               // true = 다음 예약 있음, false = 없음
  adConsent?: 'consented' | 'optout' | 'unknown'; // 광고 수신 상태
}
export interface SavedSegment { id: string; name: string; condition: SegmentCondition; createdAt: string; updatedAt: string }

/** 평가에 필요한 고객 사실 — 엔진(customerStats·customerSegments·marketingConsent)이 채운다 */
export interface CustomerFacts {
  id: string;
  grade: CustomerGrade;
  tags: string[];
  lastVisitDate: string | null;        // YYYY-MM-DD
  totalVisits: number;
  totalSpent: number;
  recentPayments: { date: string; amount: number }[]; // 완료 결제(날짜·금액, 환불 행은 음수) — 최근 N일 합은 여기서 (175·178)
  activePrograms: number;              // 진행 중(미완료·만료 전) 회차권 수 (175·178)
  rfmSegment: RfmSegment | null;
  churnLevel: ChurnLevel | null;
  birthMonth: number | null;           // 1~12
  hasUpcoming: boolean;
  adConsent: 'consented' | 'optout' | 'unknown';
}

export const DEFAULT_RECENT_SPEND_DAYS = 90;
function addDaysISO(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function daysBetweenISO(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number); const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()) / 86_400_000);
}

export function matchesSegment(f: CustomerFacts, c: SegmentCondition, today: string): boolean {
  if (c.grades?.length && !c.grades.includes(f.grade)) return false;
  if (c.tagsAny?.length && !c.tagsAny.some(t => f.tags.includes(t))) return false;
  if (c.lastVisitDaysMin !== undefined || c.lastVisitDaysMax !== undefined) {
    if (!f.lastVisitDate) return false;
    const d = daysBetweenISO(f.lastVisitDate, today);
    if (c.lastVisitDaysMin !== undefined && d < c.lastVisitDaysMin) return false;
    if (c.lastVisitDaysMax !== undefined && d > c.lastVisitDaysMax) return false;
  }
  if (c.visitsMin !== undefined && f.totalVisits < c.visitsMin) return false;
  if (c.visitsMax !== undefined && f.totalVisits > c.visitsMax) return false;
  if (c.spentMin !== undefined && f.totalSpent < c.spentMin) return false;
  if (c.recentSpendMin !== undefined) {
    const since = addDaysISO(today, -(c.recentSpendDays ?? DEFAULT_RECENT_SPEND_DAYS));
    const sum = f.recentPayments.filter(p => p.date >= since && p.date <= today).reduce((a, p) => a + p.amount, 0);
    if (sum < c.recentSpendMin) return false;
  }
  if (c.hasActiveProgram !== undefined && (f.activePrograms > 0) !== c.hasActiveProgram) return false;
  if (c.rfmSegments?.length && (!f.rfmSegment || !c.rfmSegments.includes(f.rfmSegment))) return false;
  if (c.churnLevels?.length && (!f.churnLevel || !c.churnLevels.includes(f.churnLevel))) return false;
  if (c.birthdayThisMonth && f.birthMonth !== Number(today.slice(5, 7))) return false;
  if (c.hasUpcoming !== undefined && f.hasUpcoming !== c.hasUpcoming) return false;
  if (c.adConsent && f.adConsent !== c.adConsent) return false;
  return true;
}

/** 조건이 하나라도 있는가 — 빈 조건은 전체 고객이므로 저장을 막는다 */
export function isEmptyCondition(c: SegmentCondition): boolean {
  return !(c.grades?.length || c.tagsAny?.length || c.lastVisitDaysMin !== undefined || c.lastVisitDaysMax !== undefined || c.visitsMin !== undefined || c.visitsMax !== undefined
    || c.spentMin !== undefined || c.recentSpendMin !== undefined || c.hasActiveProgram !== undefined || c.rfmSegments?.length || c.churnLevels?.length || c.birthdayThisMonth || c.hasUpcoming !== undefined || c.adConsent);
}

export function validateSegment(name: string, c: SegmentCondition): string[] {
  const errs: string[] = [];
  if (!name.trim()) errs.push('세그먼트 이름을 입력해주세요.');
  if (isEmptyCondition(c)) errs.push('조건을 하나 이상 넣어주세요(비어 있으면 전체 고객).');
  const nonneg = (v: number | undefined, label: string) => { if (v !== undefined && (!Number.isInteger(v) || v < 0)) errs.push(`${label}: 0 이상 정수로 입력해주세요.`); };
  const pos = (v: number | undefined, label: string) => { if (v !== undefined && (!Number.isInteger(v) || v < 1)) errs.push(`${label}: 1 이상 정수로 입력해주세요.`); }; // 0 은 항상 참이라 조건이 아니다 — 빈 조건 거절 우회 방지 (178 리뷰 L-1)
  nonneg(c.lastVisitDaysMin, '마지막 방문 뒤 최소 일수'); nonneg(c.lastVisitDaysMax, '마지막 방문 뒤 최대 일수'); pos(c.visitsMin, '최소 방문 횟수'); nonneg(c.visitsMax, '최대 방문 횟수'); pos(c.spentMin, '최소 누적 결제'); pos(c.recentSpendMin, '최근 결제 최소 금액');
  if (c.recentSpendDays !== undefined && (!Number.isInteger(c.recentSpendDays) || c.recentSpendDays < 1 || c.recentSpendDays > 365)) errs.push('최근 결제 기간: 1~365일로 입력해주세요.');
  if (c.recentSpendDays !== undefined && c.recentSpendMin === undefined) errs.push('최근 결제 기간을 쓰려면 최소 금액도 입력해주세요.');
  if (c.lastVisitDaysMin !== undefined && c.lastVisitDaysMax !== undefined && c.lastVisitDaysMin > c.lastVisitDaysMax) errs.push('마지막 방문 일수의 최소가 최대보다 큽니다.');
  if (c.visitsMin !== undefined && c.visitsMax !== undefined && c.visitsMin > c.visitsMax) errs.push('방문 횟수의 최소가 최대보다 큽니다.');
  return errs;
}

const CHURN_LABEL: Record<ChurnLevel, string> = { high: '높음', medium: '주의', low: '낮음' };
const CONSENT_LABEL = { consented: '광고 동의', optout: '광고 거부', unknown: '광고 동의 없음' } as const;

/** 사람이 읽는 조건 요약(AND 로 이어진 구절) */
export function describeSegment(c: SegmentCondition): string {
  const parts: string[] = [];
  if (c.grades?.length) parts.push(`등급 ${c.grades.join('/')}`);
  if (c.tagsAny?.length) parts.push(`태그 ${c.tagsAny.map(t => `#${t}`).join('/')}`);
  if (c.lastVisitDaysMin !== undefined && c.lastVisitDaysMax !== undefined) parts.push(`마지막 방문 ${c.lastVisitDaysMin}~${c.lastVisitDaysMax}일 전`);
  else if (c.lastVisitDaysMin !== undefined) parts.push(`마지막 방문 ${c.lastVisitDaysMin}일 이상 전`);
  else if (c.lastVisitDaysMax !== undefined) parts.push(`마지막 방문 ${c.lastVisitDaysMax}일 이내`);
  if (c.visitsMin !== undefined && c.visitsMax !== undefined) parts.push(`방문 ${c.visitsMin}~${c.visitsMax}회`);
  else if (c.visitsMin !== undefined) parts.push(`방문 ${c.visitsMin}회 이상`);
  else if (c.visitsMax !== undefined) parts.push(`방문 ${c.visitsMax}회 이하`);
  if (c.spentMin !== undefined) parts.push(`누적 결제 ${c.spentMin.toLocaleString('ko-KR')}원 이상`);
  if (c.recentSpendMin !== undefined) parts.push(`최근 ${c.recentSpendDays ?? DEFAULT_RECENT_SPEND_DAYS}일 결제 ${c.recentSpendMin.toLocaleString('ko-KR')}원 이상`);
  if (c.hasActiveProgram === true) parts.push('진행 중 회차권 있음'); else if (c.hasActiveProgram === false) parts.push('진행 중 회차권 없음');
  if (c.rfmSegments?.length) parts.push(`RFM ${c.rfmSegments.join('/')}`);
  if (c.churnLevels?.length) parts.push(`이탈 위험 ${c.churnLevels.map(l => CHURN_LABEL[l]).join('/')}`);
  if (c.birthdayThisMonth) parts.push('이달 생일');
  if (c.hasUpcoming === true) parts.push('다음 예약 있음'); else if (c.hasUpcoming === false) parts.push('다음 예약 없음');
  if (c.adConsent) parts.push(CONSENT_LABEL[c.adConsent]);
  return parts.join(' · ') || '전체';
}

/**
 * 저장 세그먼트의 태그 조건에서 이름을 바꾼다 (242, 리뷰 H-1).
 * 태그 이름을 일괄 변경하면 고객 태그는 바뀌는데 세그먼트 조건은 옛 이름을 문자열로 들고 있어
 * "민감 고객" 세그먼트가 아무 설명 없이 0명이 됐다 — 태그 통합을 하려고 만든 기능이 세그먼트를 끊었다.
 * 바꾼 이름이 이미 조건에 있으면 합친다. 바뀐 세그먼트만 새 객체로 돌려준다(나머지는 그대로).
 */
export function renameTagInSegments(segments: SavedSegment[], from: string, to: string): { segments: SavedSegment[]; affected: string[] } {
  const affected: string[] = [];
  const next = segments.map(seg => {
    const tags = seg.condition.tagsAny;
    if (!tags?.length || !tags.includes(from)) return seg;
    const replaced: string[] = [];
    for (const t of tags) {
      const name = t === from ? to : t;
      if (!replaced.includes(name)) replaced.push(name);
    }
    affected.push(seg.name);
    return { ...seg, condition: { ...seg.condition, tagsAny: replaced } };
  });
  return { segments: next, affected };
}
