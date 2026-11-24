// src/lib/ai/keyLeak.ts — API 키 꼴 문자열 탐지·가리기 (순수, 152, GAP A-2 / 마스터 프롬프트 21절)
// 키가 밖으로 나가는 길(AI 컨텍스트·백업·로그·공유 문구)에서 마지막 방어선. 고객 메모에 누가 키를 붙여넣어도 제공사로 다시 나가지 않게 한다.
// 탐지 패턴은 보수적(앞머리 + 길이) — 긴 영숫자 일반 문자열(주문번호 등)은 건드리지 않는다.
const PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{24,}/g,          // Anthropic (실제 키는 90자 안팎)
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/g, // OpenAI(신·구, 실제 키는 48자 이상) — 'sk-live-order-2026…' 같은 짧은 코드는 제외 (154 리뷰 L-6)
  /\bAIza[0-9A-Za-z_-]{30,}/g,             // Google API key
  /\bya29\.[0-9A-Za-z_-]{20,}/g,           // Google OAuth access token
  /\bxox[abp]-[0-9A-Za-z-]{10,}/g,         // Slack 류(붙여넣기 사고 대비)
];

/** 키 꼴 문자열이 있으면 true */
export function containsKeyLike(text: string): boolean {
  if (!text) return false;
  return PATTERNS.some(re => { re.lastIndex = 0; return re.test(text); });
}

/** 키 꼴 문자열을 앞 4자만 남기고 가린다 — "sk-a••••(가려진 키)" */
export function scrubKeyLike(text: string): string {
  if (!text) return text;
  let out = text;
  for (const re of PATTERNS) out = out.replace(re, m => `${m.slice(0, 4)}••••(가려진 키)`);
  return out;
}

/** 저장소 스냅샷(백업·내보내기) 전체에서 키 꼴 값을 찾는다 — 평문 저장 0 검사용. 반환: 걸린 키 이름들 */
export function findKeyLikeEntries(snapshot: Record<string, string>): string[] {
  return Object.entries(snapshot).filter(([, v]) => containsKeyLike(v)).map(([k]) => k);
}
