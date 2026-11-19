/**
 * localStorage JSON 읽기 — 손상된 값(수동 편집·중단된 쓰기)으로 화면이 통째로 죽지 않게 try/catch로 감싼다 (정합성 감사 2026-11-19).
 * lib/*는 이미 각자 보호돼 있고, 페이지(온보딩·어드민 로컬 분기)에 남아 있던 날것 JSON.parse를 이것으로 모은다.
 */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
