// ═══════════════════════════════════════════════════════════════
// customerAlertRule — 현장 주의사항 경고 규칙 (순수 모듈, 232 · 234 리뷰 반영, GAP C-11)
// ───────────────────────────────────────────────────────────────
// 왜: 알레르기·주의사항을 고객 상세에만 보여 줬다. 정작 예약을 잡거나 시술을 기록하는 자리에서는 보이지 않아
//     레티놀 자극·임신·약 복용 같은 금기를 모른 채 시술이 들어갈 수 있었다.
//     상용 CRM(Zenoti·Boulevard)은 예약·체크인 화면에 client alert 를 띄운다.
// 규칙:
//   1) 알레르기 칸은 적힌 그대로 경고로 올린다(사람이 쓴 문장을 해석하지 않는다).
//   2) 메모에서 주의 키워드가 들어간 줄만 올린다 — 메모 전문을 띄우면 아무도 읽지 않는다.
//      키워드를 못 찾으면 메모는 올리지 않는다(없는 경고를 만들지 않는다).
//   3) "없음·아님" 같은 부정 표현이 붙은 줄은 올리지 않는다 — "주의사항 없음" 이 경고로 뜨면
//      늑대 소년이 되어 진짜 금기까지 무시된다 (234, 리뷰 M-5).
//   4) 줄이 상한을 넘으면 **위험한 줄부터** 남기고, 가린 줄 수를 돌려준다 — 화면이 "+N 더 보기" 로 펼친다.
//      순서를 메모 원문대로 두면 '시술 불가' 가 조용히 밀려났다 (234, 리뷰 H-1).
//   5) 노쇼는 2회 이상일 때만 — 1회는 흔하고, 2회부터 예약 확인 전화의 근거가 된다.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

/** 위험도 1순위 — 시술 자체를 멈춰야 하는 말 */
const CRITICAL_KEYWORDS = ['시술 불가', '금기', '임신', '임산부', '수유'];
/** 2순위 — 시술 방법·강도를 바꿔야 하는 몸 상태 */
const BODY_KEYWORDS = ['알레르기', '알러지', '약 복용', '복용 중', '항생제', '당뇨', '고혈압', '켈로이드', '아토피', '피부염'];
/** 3순위 — 참고 */
const NOTE_KEYWORDS = ['민감', '통증 예민', '주의'];

/** 메모에서 경고로 올릴 키워드 — 에스테틱 현장에서 실제로 적는 말 (위험한 것부터) */
export const CAUTION_KEYWORDS = [...CRITICAL_KEYWORDS, ...BODY_KEYWORDS, ...NOTE_KEYWORDS];

/** 그 줄이 경고가 아니라는 표시 — "주의사항 없음", "임신 계획 없음", "민감하지 않은 편" */
const NEGATION_PATTERNS = [/없음/, /없습니다/, /없어요/, /아님/, /아닙니다/, /아니에요/, /하지\s*않/, /안\s*함/, /해당\s*없/, /무관/];

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
  /** 바로 띄우는 줄 (상한까지) */
  lines: string[];
  /** 위험도 순으로 정렬한 전체 줄 — 화면이 "더 보기" 로 펼친다 */
  allLines: string[];
  /** lines 에 들지 못한 줄 수 */
  hiddenCount: number;
  /** 알레르기 칸 값(있으면) */
  allergies: string | null;
  /** 경고로 올린 노쇼 횟수(기준 미달이면 0) */
  noshow: number;
}

function clip(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > MAX_ALERT_LINE_LENGTH ? `${t.slice(0, MAX_ALERT_LINE_LENGTH - 1)}…` : t;
}

/** 위험도 — 작은 수가 먼저 */
function severity(line: string): number {
  if (CRITICAL_KEYWORDS.some(k => line.includes(k))) return 0;
  if (BODY_KEYWORDS.some(k => line.includes(k))) return 1;
  return 2;
}

/** "주의사항 없음" 처럼 경고가 아닌 줄인가 */
export function isNegatedCaution(line: string): boolean {
  return NEGATION_PATTERNS.some(re => re.test(line));
}

/** 메모에서 주의 키워드가 들어간 줄만 (위험한 순서, 중복 제거, 부정 표현 제외) */
export function memoCautionLines(memo?: string | null): string[] {
  if (typeof memo !== 'string' || memo.trim() === '') return [];
  const picked: { line: string; sev: number; order: number }[] = [];
  let order = 0;
  for (const raw of memo.split(/[\r\n]+/)) {
    const line = clip(raw);
    order += 1;
    if (line === '') continue;
    if (!CAUTION_KEYWORDS.some(k => line.includes(k))) continue;
    if (isNegatedCaution(line)) continue; // 234 리뷰 M-5
    if (picked.some(p => p.line === line)) continue;
    picked.push({ line, sev: severity(line), order });
  }
  picked.sort((a, b) => a.sev - b.sev || a.order - b.order); // 위험한 줄 먼저, 같으면 적은 순서대로
  return picked.map(p => p.line);
}

/** 현장 경고 — 올릴 것이 없으면 lines 가 빈 배열 */
export function buildCustomerAlert(i: CustomerAlertInput): CustomerAlert {
  const allergies = typeof i.allergies === 'string' && i.allergies.trim() !== '' ? clip(i.allergies) : null;
  const noshow = Number.isFinite(i.noshowCount) && (i.noshowCount as number) >= NOSHOW_ALERT_MIN ? Math.floor(i.noshowCount as number) : 0;
  const all: string[] = [];
  if (allergies) all.push(`알레르기·주의: ${allergies}`);
  for (const line of memoCautionLines(i.memo)) {
    if (allergies && line.includes(allergies)) continue; // 같은 말을 두 번 띄우지 않는다
    all.push(line);
  }
  if (noshow > 0) all.push(`노쇼 ${noshow}회 — 예약 확인 전화를 권합니다`);
  return {
    lines: all.slice(0, MAX_ALERT_LINES),
    allLines: all,
    hiddenCount: Math.max(0, all.length - MAX_ALERT_LINES),
    allergies,
    noshow,
  };
}

export function hasCustomerAlert(a: CustomerAlert | null | undefined): boolean {
  return !!a && a.allLines.length > 0;
}
