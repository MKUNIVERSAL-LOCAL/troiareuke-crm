// ═══════════════════════════════════════════════════════════════
// prefLandedRule — 설정 한 칸이 **디스크에 남았는지** 판정 (순수 모듈, 284)
// ───────────────────────────────────────────────────────────────
// 왜: 설정 저장은 `SettingsStore.save` → `safeSetItem` 을 지나는데, 저장 공간이 모자라면
//     그 오류를 **삼킨다**(토스트만 뜬다). 그래서 화면이 "저장했습니다" 라고 말한 뒤 프로그램을
//     다시 열면 옛 값이 보이는 일이 생긴다(254 리뷰 M-1 이 영수증 정보에서 찾은 그 길).
//     메모리 캐시를 되읽는 확인은 이것을 잡지 못한다 — localStorage 원본을 봐야 한다.
// 하는 일: 되읽은 값과 저장하려던 값을 비교해 **남았다/안 남았다/확인 불가**를 가린다.
//     확인 불가(프라이빗 모드 등 읽기 자체가 안 되는 경우)를 "실패" 로 단정하지 않는다 —
//     없는 실패를 알리면 그것도 거짓이다.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

export type PrefLanded = 'landed' | 'lost' | 'unknown';

/**
 * @param persisted 되읽은 값. `null` 은 설정 행 자체를 읽을 수 없었다는 뜻(확인 불가).
 * @param wanted 저장하려던 값
 */
export function prefLanded(persisted: unknown, wanted: unknown): PrefLanded {
  if (persisted === null && wanted !== null) return 'unknown'; // 읽기 자체가 안 됐다 — 실패로 단정하지 않는다
  return sameValue(persisted, wanted) ? 'landed' : 'lost';
}

/** 설정 값 비교 — 객체·배열은 내용으로, 나머지는 값으로. 키 순서는 보지 않는다 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  const ka = Object.keys(a as object).filter(k => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter(k => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every(k => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** 화면에 적을 말 — 남지 않았을 때만 돌려준다(남았으면 null) */
export function describePrefLoss(state: PrefLanded, what: string): string | null {
  if (state === 'landed') return null;
  if (state === 'unknown') return `${what}을 저장했지만 이 PC 에서 확인할 수 없었습니다(저장 공간·브라우저 설정). 프로그램을 다시 열어 값이 남았는지 확인해주세요.`;
  return `${what}이 이 PC 에 저장되지 않았습니다(저장 공간이 모자랍니다). 공간을 비운 뒤 다시 저장해주세요 — 지금 화면의 값은 프로그램을 다시 열면 사라집니다.`;
}
