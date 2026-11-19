// ═══════════════════════════════════════════════════════════════
// birthdayRule — 다음 생일까지 남은 날 (순수 모듈, 저장소 의존 없음)
// ───────────────────────────────────────────────────────────────
// 생년월일은 YYYY-MM-DD 문자열(월·일만 사용). 올해 생일이 이미 지났으면 내년 생일로(연말 → 연초 경계),
// 2/29는 평년에 2/28로, 그 밖의 존재하지 않는 날짜(예: 4/31)와 형식 불량은 null.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 경계를 검증한다 (커버리지 감사 2026-11-20).
// ═══════════════════════════════════════════════════════════════

export interface NextBirthday {
  daysUntil: number;  // 0 = 오늘
  dateLabel: string;  // M/D (생년월일 그대로 — 2/29 생일은 평년에도 '2/29')
}

export function nextBirthday(birthDate: string | null | undefined, today: Date): NextBirthday | null {
  if (!birthDate) return null;
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m) return null;
  const month = Number(m[1]) - 1, day = Number(m[2]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const birthdayIn = (year: number): Date | null => {
    const d = new Date(year, month, day);
    if (d.getMonth() === month) return d;
    if (month === 1 && day === 29) return new Date(year, 1, 28);
    return null;
  };
  let next = birthdayIn(base.getFullYear());
  if (next && next < base) next = birthdayIn(base.getFullYear() + 1);
  if (!next) return null;
  return { daysUntil: Math.round((next.getTime() - base.getTime()) / 86_400_000), dateLabel: `${month + 1}/${day}` };
}
