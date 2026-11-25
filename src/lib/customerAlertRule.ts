// ═══════════════════════════════════════════════════════════════
// customerAlertRule — 현장 주의사항 경고 규칙 (순수 모듈, 232, GAP C-11)
// ───────────────────────────────────────────────────────────────
// 왜: 알레르기·주의사항을 고객 상세에만 보여 줬다. 정작 예약을 잡거나 시술을 기록하는 자리에서는 보이지 않아
//     레티놀 자극·임신·약 복용 같은 금기를 모른 채 시술이 들어갈 수 있었다.
//     상용 CRM(Zenoti·Boulevard)은 예약·체크인 화면에 client alert 를 띄운다.
// 규칙:
//   1) 알레르기 칸은 적힌 그대로 경고로 올린다(사람이 쓴 문장을 해석하지 않는다).
//   2) 메모에서 주의 키워드가 들어간 줄만 올린다 — 메모 전문을 띄우면 아무도 읽지 않는다.
//      키워드를 못 찾으면 메모는 올리지 않는다(없는 경고를 만들지 않는다).
//   3) 노쇼는 2회 이상일 때만 — 1회는 흔하고, 2회부터 예약 확인 전화의 근거가 된다.
// 줄은 최대 3개, 각 줄 80자로 자른다(모바일 한 화면).
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

/** 메모에서 경고로 올릴 키워드 — 에스테틱 현장에서 실제로 적는 말 */
export const CAUTION_KEYWORDS = [
  '주의', '금기', '알레르기', '알러지', '임신', '임산부', '수유', '당뇨', '고혈압',
  '약 복용', '복용 중', '항생제', '피부염', '아토피', '켈로이드', '시술 불가', '통증 예민', '민감',
];

export const MAX_ALERT_LINES = 3;
export const MAX_ALERT_LINE_LENGTH = 80;
/** 이 횟수부터 노쇼를 경고로 올린다 */
export const NOSHOW_ALERT_MIN = 2;

export interface CustomerAlertInput {
  allergies?: string | null;
  memo?: string | null;
  /** 그 고객의 노쇼 건수 */
  noshowCount?: number;
}

export interface CustomerAlert {
  /** 화면에 그대로 띄우는 줄 (비어 있으면 경고 없음) */
  lines: string[];
  /** 알레르기 칸 값(있으면) */
  allergies: string | null;
  /** 경고로 올린 노쇼 횟수(기준 미달이면 0) */
  noshow: number;
}

function clip(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > MAX_ALERT_LINE_LENGTH ? `${t.slice(0, MAX_ALERT_LINE_LENGTH - 1)}…` : t;
}

/** 메모에서 주의 키워드가 들어간 줄만 (원문 순서, 중복 제거) */
export function memoCautionLines(memo?: string | null): string[] {
  if (typeof memo !== 'string' || memo.trim() === '') return [];
  const out: string[] = [];
  for (const raw of memo.split(/[\r\n]+/)) {
    const line = clip(raw);
    if (line === '') continue;
    if (!CAUTION_KEYWORDS.some(k => line.includes(k))) continue;
    if (!out.includes(line)) out.push(line);
  }
  return out;
}

/** 현장 경고 — 올릴 것이 없으면 lines 가 빈 배열 */
export function buildCustomerAlert(i: CustomerAlertInput): CustomerAlert {
  const allergies = typeof i.allergies === 'string' && i.allergies.trim() !== '' ? clip(i.allergies) : null;
  const noshow = Number.isFinite(i.noshowCount) && (i.noshowCount as number) >= NOSHOW_ALERT_MIN ? Math.floor(i.noshowCount as number) : 0;
  const lines: string[] = [];
  if (allergies) lines.push(`알레르기·주의: ${allergies}`);
  for (const line of memoCautionLines(i.memo)) {
    if (lines.length >= MAX_ALERT_LINES) break;
    if (allergies && line.includes(allergies)) continue; // 같은 말을 두 번 띄우지 않는다
    lines.push(line);
  }
  if (noshow > 0 && lines.length < MAX_ALERT_LINES) lines.push(`노쇼 ${noshow}회 — 예약 확인 전화를 권합니다`);
  return { lines: lines.slice(0, MAX_ALERT_LINES), allergies, noshow };
}

export function hasCustomerAlert(a: CustomerAlert | null | undefined): boolean {
  return !!a && a.lines.length > 0;
}
