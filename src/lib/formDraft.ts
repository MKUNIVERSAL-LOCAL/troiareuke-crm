/**
 * 긴 입력 폼(가입·온보딩)의 임시 저장 — 새로고침·실수로 닫힘에도 입력이 남게 (3차 UX 점검 후속 2026-11-19).
 * sessionStorage라 탭을 닫으면 사라지고 다른 탭과 섞이지 않는다. 비밀번호·사진(data URL)은 호출 쪽이 담지 않는다.
 * 프라이빗 모드·용량 초과로 저장이 막혀도 폼은 그대로 동작해야 하므로 전부 try/catch.
 */
export function readDraft<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
export function writeDraft(key: string, value: unknown): void {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* 임시 저장만 건너뜀 */ }
}
export function clearDraft(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* noop */ }
}
