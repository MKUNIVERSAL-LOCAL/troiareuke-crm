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
  rfmSegment: RfmSegment | null;
  churnLevel: ChurnLevel | null;
  birthMonth: number | null;           // 1~12
  hasUpcoming: boolean;
  adConsent: 'consented' | 'optout' | 'unknown';
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
    || c.spentMin !== undefined || c.rfmSegments?.length || c.churnLevels?.length || c.birthdayThisMonth || c.hasUpcoming !== undefined || c.adConsent);
}

export function validateSegment(name: string, c: SegmentCondition): string[] {
  const errs: string[] = [];
  if (!name.trim()) errs.push('세그먼트 이름을 입력해주세요.');
  if (isEmptyCondition(c)) errs.push('조건을 하나 이상 넣어주세요(비어 있으면 전체 고객).');
  const nonneg = (v: number | undefined, label: string) => { if (v !== undefined && (!Number.isInteger(v) || v < 0)) errs.push(`${label}은 0 이상 정수로 입력해주세요.`); };
  nonneg(c.lastVisitDaysMin, '마지막 방문 뒤 최소 일수'); nonneg(c.lastVisitDaysMax, '마지막 방문 뒤 최대 일수'); nonneg(c.visitsMin, '최소 방문 횟수'); nonneg(c.visitsMax, '최대 방문 횟수'); nonneg(c.spentMin, '최소 누적 결제');
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
  if (c.rfmSegments?.length) parts.push(`RFM ${c.rfmSegments.join('/')}`);
  if (c.churnLevels?.length) parts.push(`이탈 위험 ${c.churnLevels.map(l => CHURN_LABEL[l]).join('/')}`);
  if (c.birthdayThisMonth) parts.push('이달 생일');
  if (c.hasUpcoming === true) parts.push('다음 예약 있음'); else if (c.hasUpcoming === false) parts.push('다음 예약 없음');
  if (c.adConsent) parts.push(CONSENT_LABEL[c.adConsent]);
  return parts.join(' · ') || '전체';
}
