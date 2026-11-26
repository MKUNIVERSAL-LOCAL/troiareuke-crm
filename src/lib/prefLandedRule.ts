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
// 290(285~287 리뷰 H-1): 되읽는 곳은 **이 PC 뿐**이다. 그런데 서버 모드(NAS)에서는 같은 저장이
//     설정 행을 서버에도 올리고, 다시 열 때 서버 값을 받아온다 — 그래서 이 PC 쓰기만 실패한 경우
//     "다시 열면 사라집니다" 는 **거짓일 수 있다**. 문구를 저장 방식(`PrefSaveMode`)별로 나눈다.
//     모드는 기본값을 두지 않는다 — 부르는 쪽이 반드시 고르게 해서 조용히 센 말이 나가는 길을 막는다.
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════
import { josa } from './josa';

/** 'invalid' = 넘어온 값이 형식에 맞지 않아 **아무것도 바꾸지 않았다**(저장 공간 탓이 아니다, 290 리뷰 LOW-7) */
export type PrefLanded = 'landed' | 'lost' | 'unknown' | 'invalid';

/** 이 설정이 어디에 저장되는지 — 서버 모드면 이 PC 쓰기가 실패해도 서버에 남을 수 있다 */
export type PrefSaveMode = 'local-only' | 'server-backed';

/**
 * @param persisted 되읽은 값 — `readPersistedPreference` 의 세 가지 답을 **그대로** 받는다:
 *   `null` = 설정 행 자체를 읽을 수 없었다(확인 불가), `undefined` = 행은 읽혔는데 **그 키가 없다**(= 확인된 실패),
 *   그 밖 = 저장된 값. 285 전에는 호출 쪽이 `?? null` 로 둘을 접어, **아는 실패를 "확인 불가" 로 말했다**(리뷰 M-1).
 * @param wanted 저장하려던 값
 */
export function prefLanded(persisted: unknown, wanted: unknown): PrefLanded {
  // 행을 못 읽으면 아무것도 단정할 수 없다 — 지웠는지도 확인할 수 없다(285, 리뷰 M-1)
  if (persisted === null) return 'unknown';
  return sameValue(persisted, wanted) ? 'landed' : 'lost';
}

/**
 * 되읽은 값이 **없을 때**(그 칸이 아직 없거나 행을 못 읽음) 주장이 "없음과 같다" 면 **잃은 것이 없다** (297, 293~296 리뷰 H-1).
 * 왜: 294 가 "렌더마다 되읽기" 로 바꾸면서, **마감을 한 번도 하지 않은 매장**의 매출 카드에 빨간
 * "이 PC 에 저장 안 됨" 배지가 떴다 — 메모리는 `[]`, 디스크에는 그 칸이 아예 없어 `'lost'` 로 갈렸다.
 * 아무것도 저장하려 하지 않은 자리에서 "저장 안 됨" 이라고 말하면 그것이 거짓이고, 늑대 소년이 된다.
 * 되읽은 값이 있으면(예: 디스크엔 마감이 남았는데 메모리는 비었다 = 마감 해제가 안 남았다) 그대로 비교한다.
 */
export function prefLandedWithAbsent(persisted: unknown, wanted: unknown, absentIs: unknown): PrefLanded {
  if ((persisted === null || persisted === undefined) && sameValue(wanted, absentIs)) return 'landed';
  return prefLanded(persisted, wanted);
}

/** 설정 값 비교 — 객체·배열은 내용으로, 나머지는 값으로. 키 순서는 보지 않는다 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true; // NaN 끼리도 같다고 본다 — 되읽은 NaN 을 "사라짐" 으로 말하지 않는다 (285, 리뷰 LOW)
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

/**
 * 화면에 적을 말 — 남지 않았을 때만 돌려준다(남았으면 null).
 * 조사는 `josa` 로 고른다 — 290 전에는 `${what}이`·`${what}을` 이 박혀 있어 "월 매출 목표**이**" 처럼
 * 호출 다섯 곳 중 셋이 비문으로 나갔다(리뷰 M-1).
 */
export function describePrefLoss(state: PrefLanded, what: string, mode: PrefSaveMode): string | null {
  if (state === 'landed') return null;
  if (state === 'invalid') return `${josa(what, '을/를')} 바꾸지 못했습니다 — 넘어온 값의 형식이 올바르지 않아 아무것도 바꾸지 않았습니다. 화면을 새로 열어 다시 시도해주세요.`;
  if (state === 'unknown') return `${josa(what, '을/를')} 저장했지만 이 PC 에서 확인할 수 없었습니다(저장 공간·브라우저 설정). 프로그램을 다시 열어 값이 남았는지 확인해주세요.`;
  if (mode === 'server-backed') {
    // 서버에 남았는지는 이 자리에서 알 수 없다 — 사라진다고도, 남는다고도 말하지 않는다 (리뷰 H-1)
    return `${josa(what, '이/가')} 이 PC 에 저장되지 않았습니다(저장 공간이 모자랍니다). 중앙 서버에는 올라갔을 수 있어 사라진다고 단정할 수 없습니다 — 공간을 비우고 프로그램을 다시 열어 값이 남았는지 확인해주세요.`;
  }
  return `${josa(what, '이/가')} 이 PC 에 저장되지 않았습니다(저장 공간이 모자랍니다). 공간을 비운 뒤 다시 저장해주세요 — 지금 화면의 값은 프로그램을 다시 열면 사라집니다.`;
}

/**
 * 지운 것이 남지 않았을 때의 말 (297, 293~296 리뷰 M-3).
 * `describePrefLoss` 는 "공간을 비운 뒤 **다시 저장**해주세요 — 지금 화면의 값은 다시 열면 **사라집니다**" 라고
 * 적는다. 삭제 자리에서는 둘 다 틀린 말이다 — 사용자가 할 일은 "다시 지우기" 고, 다시 열면 **지운 것이 돌아온다**.
 * 296 이 파기 대장에서만 이것을 알아보고 전용 문구를 만들었는데, 삭제형 여섯 자리에는 적용하지 않았다.
 */
export function describePrefRemovalLoss(state: PrefLanded, what: string, mode: PrefSaveMode): string | null {
  if (state === 'landed') return null;
  if (state === 'invalid') return `${josa(what, '을/를')} 지우지 못했습니다 — 넘어온 값의 형식이 올바르지 않아 아무것도 바꾸지 않았습니다.`;
  if (state === 'unknown') return `${josa(what, '을/를')} 지웠지만 이 PC 에서 확인할 수 없었습니다(저장 공간·브라우저 설정). 프로그램을 다시 열어 정말 지워졌는지 확인해주세요.`;
  if (mode === 'server-backed') {
    return `${josa(what, '을/를')} 지운 것이 이 PC 에 저장되지 않았습니다(저장 공간이 모자랍니다). 중앙 서버에는 올라갔을 수 있어 단정할 수 없습니다 — 공간을 비우고 프로그램을 다시 열어 확인해주세요.`;
  }
  return `${josa(what, '을/를')} 지운 것이 이 PC 에 저장되지 않았습니다(저장 공간이 모자랍니다). 공간을 비운 뒤 다시 지워주세요 — 프로그램을 다시 열면 그 항목이 돌아옵니다.`;
}

/**
 * 화면에 **남겨 두는** 짧은 표시 — 토스트는 4초면 사라지는데 배지·단추는 그대로 남아
 * "마감됨" 만 보이던 자리(리뷰 M-2)를 위해. 남았으면 null.
 */
export function prefLossNote(state: PrefLanded, mode: PrefSaveMode): string | null {
  if (state === 'landed') return null;
  if (state === 'invalid') return '바뀌지 않음(형식 오류)';
  if (state === 'unknown') return '이 PC 에서 확인 못 함';
  return mode === 'server-backed' ? '이 PC 에 저장 안 됨(서버는 확인 필요)' : '이 PC 에 저장 안 됨';
}
