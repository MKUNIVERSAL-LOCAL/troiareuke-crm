// ═══════════════════════════════════════════════════════════════
// memoPresetRule — 자주 쓰는 메모 문구 규칙 (순수 모듈, 251, GAP C-2·입력 속도)
// ───────────────────────────────────────────────────────────────
// 왜: 시술 기록 메모에 매장마다 같은 문장을 하루 수십 번 손으로 다시 쓴다
//     ("자극 없음 · 홈케어 안내", "강도 한 단계 낮춤", "다음에 10분 추가"). 바쁜 시간에는 아예 비워 두고,
//     그러면 다음 방문 때 주의사항이 남지 않는다 — 기록이 비는 가장 큰 이유가 타이핑이다.
// 하는 일: 문구를 정리(공백 축약·40자·중복 제거·20개 상한)하고, 메모에 **덧붙이는 규칙**을 정한다.
// 정직성: 이미 들어 있는 문구는 다시 넣지 않고(중복 줄 금지), 빈 메모에는 줄바꿈을 만들지 않는다.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export const MAX_PRESET_LEN = 40;
export const MAX_PRESETS = 20;

/** 한 문구 정리 — 공백 축약·줄바꿈 제거·길이 제한. 빈 값이면 '' */
export function normalizePreset(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_PRESET_LEN);
}

/** 저장값 정리 — 모양이 깨진 값·중복·상한 초과를 걸러 낸다(먼저 들어온 순서 유지) */
export function sanitizePresets(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    const clean = normalizePreset(raw);
    if (!clean || out.includes(clean)) continue;
    out.push(clean);
    if (out.length >= MAX_PRESETS) break;
  }
  return out;
}

export interface PresetAddResult { list: string[]; error?: string }

/** 문구 추가 — 거절 사유를 돌려준다(조용히 버리지 않는다) */
export function addPreset(list: string[], value: string): PresetAddResult {
  const clean = normalizePreset(value);
  if (!clean) return { list, error: '문구를 입력해주세요.' };
  if (clean.length < 2) return { list, error: '두 글자 이상 적어주세요.' };
  const current = sanitizePresets(list);
  if (current.includes(clean)) return { list: current, error: '이미 있는 문구입니다.' };
  if (current.length >= MAX_PRESETS) return { list: current, error: `문구는 ${MAX_PRESETS}개까지 저장할 수 있습니다. 쓰지 않는 문구를 지워주세요.` };
  return { list: [...current, clean] };
}

export function removePreset(list: string[], value: string): string[] {
  const clean = normalizePreset(value);
  return sanitizePresets(list).filter(p => p !== clean);
}

/**
 * 메모에 문구를 덧붙인다. 이미 들어 있으면 그대로 돌려준다(같은 줄이 두 번 생기지 않게).
 * 빈 메모면 문구만, 아니면 줄바꿈 뒤에 붙인다. 끝의 빈 줄은 정리한다.
 */
export function appendPreset(memo: string, preset: string): string {
  const clean = normalizePreset(preset);
  if (!clean) return memo;
  const base = (memo ?? '').replace(/\s+$/, '');
  const lines = base.split('\n').map(l => l.trim());
  if (lines.includes(clean)) return base;
  return base ? `${base}\n${clean}` : clean;
}

/**
 * 메모에서 그 문구 줄을 뺀다 — 칩을 다시 누르면 빠져야 한다.
 * 전에는 눌린 칩을 다시 눌러도 아무 일이 없어(장식 UI) 직원이 메모에서 손으로 지워야 했다 (254 리뷰 M-4).
 */
export function removePresetLine(memo: string, preset: string): string {
  const clean = normalizePreset(preset);
  if (!clean) return memo;
  const lines = (memo ?? '').split('\n');
  const kept = lines.filter(l => l.trim() !== clean);
  if (kept.length === lines.length) return memo;          // 없던 줄이면 그대로(끝 공백도 건드리지 않는다)
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '');
}

/** 이미 메모에 들어 있는 문구인가 — 칩을 눌린 상태로 보여 주려고 */
export function presetInMemo(memo: string, preset: string): boolean {
  const clean = normalizePreset(preset);
  if (!clean) return false;
  return (memo ?? '').split('\n').map(l => l.trim()).includes(clean);
}

// ─────────────────────────────────────────────────────────────
// 한 줄 칸(빠른 메모) — 줄바꿈을 쓸 수 없는 입력칸
// 255 는 ' · ' 로 단순히 쪼개 비교했는데, **문구 자체에 ' · ' 가 들어갈 수 있다**
// (기본 예시가 "자극 없음 · 홈케어 안내"). 그래서 그 문구를 넣고도 칩은 꺼진 채였고,
// 다시 누르면 같은 문구가 두 번·세 번 쌓여 고객 메모에 그대로 저장됐다 (255~257 리뷰 H-2).
// 해결: **긴 문구부터** 맞춰 보며 조각이 아니라 문구 단위로 읽는다.
// ─────────────────────────────────────────────────────────────

/** 한 줄 칸에서 문구를 잇는 구분자 */
const ONE_LINE_SEP = ' · ';

/** 한 줄 글을 문구 단위로 쪼갠다 — 아는 문구는 통째로, 손으로 적은 조각은 그대로 둔다 */
export function splitOneLine(value: string, presets: string[]): string[] {
  const known = sanitizePresets(presets).sort((a, b) => b.length - a.length); // 긴 문구 우선
  const out: string[] = [];
  let rest = (value ?? '').trim();
  while (rest) {
    const hit = known.find(p => rest === p || rest.startsWith(p + ONE_LINE_SEP));
    if (hit) {
      out.push(hit);
      rest = rest.slice(hit.length).replace(/^\s*·\s*/, '').trim();
      continue;
    }
    const at = rest.indexOf(ONE_LINE_SEP);
    if (at < 0) { out.push(rest); rest = ''; continue; }
    const piece = rest.slice(0, at).trim();
    if (piece) out.push(piece);
    rest = rest.slice(at + ONE_LINE_SEP.length).trim();
  }
  return out;
}

/** 한 줄 글에 그 문구가 들어 있는가(칩을 눌린 상태로 보여 주려고) */
export function oneLineHas(value: string, preset: string, presets: string[]): boolean {
  const clean = normalizePreset(preset);
  if (!clean) return false;
  return splitOneLine(value, presets).includes(clean);
}

/** 한 줄 글에서 문구를 넣거나 뺀다(실제 토글) — 같은 문구가 두 번 들어가지 않는다 */
export function toggleOneLine(value: string, preset: string, presets: string[]): string {
  const clean = normalizePreset(preset);
  if (!clean) return value ?? '';
  const parts = splitOneLine(value, presets);
  const next = parts.includes(clean) ? parts.filter(p => p !== clean) : [...parts, clean];
  return next.join(ONE_LINE_SEP);
}
