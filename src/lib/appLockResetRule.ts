/**
 * 화면 PIN 초기화 판정 (순수, 219) — 본사 어드민이 누른 "초기화 시각"(서버)과 이 기기가 이미 처리한 시각을 비교한다.
 * 서버에는 PIN 해시를 올리지 않고 시각만 둔다(유출 위험 없음). 같은 초기화를 두 번 처리하지 않도록 기기에 마지막 처리값을 적는다.
 */
export function shouldResetAppLock(serverIso: string | null | undefined, seenIso: string | null | undefined): boolean {
  if (!serverIso) return false;
  const server = Date.parse(serverIso);
  if (Number.isNaN(server)) return false;         // 깨진 값으로 PIN 을 지우지 않는다
  if (!seenIso) return true;                       // 처음 보는 초기화
  const seen = Date.parse(seenIso);
  if (Number.isNaN(seen)) return true;             // 기기 기록이 깨졌으면 서버를 따른다
  return server > seen;
}
