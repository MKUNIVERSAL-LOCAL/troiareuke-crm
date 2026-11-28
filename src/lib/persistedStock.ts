// persistedStock — 이 PC 에 **실제로 저장된** 제품 재고를 원본(localStorage)에서 되읽는다 (255~257 리뷰 H-1)
// 왜: 코어 `ProductStore.update` 는 메모리 배열을 먼저 갈아 끼우고 저장은 `safeSetItem` 으로 한다 —
//     저장 공간이 꽉 찬 PC 에서는 QuotaExceededError 가 조용히 삼켜지므로(배너 토스트만 뜬다) 반환값·화면은 성공처럼 보인다.
//     실사처럼 수십 종을 한 번에 맞추는 작업에서 "맞췄습니다" 가 거짓이면, 직원은 틀린 재고를 기준으로 원장을 손조정하고
//     프로그램을 다시 열면 옛 수량이 돌아온다. 그래서 끝에 한 번 원본을 읽어 **남았는지**를 확인한다.
// 비코어: 코어를 고치지 않고 같은 키를 읽기만 한다(쓰기는 하지 않는다).
import { getShopId } from './store';

/** 제품 id → 이 PC 에 저장된 재고. 확인할 수 없으면 null(없는 실패를 만들지 않는다) */
export function persistedStockMap(): Map<string, number> | null {
  try {
    const raw = localStorage.getItem(`crm_${getShopId()}_products`);
    if (!raw) return null;
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    const out = new Map<string, number>();
    for (const p of list) {
      const row = p as { id?: unknown; stock?: unknown };
      if (typeof row?.id === 'string' && typeof row?.stock === 'number') out.set(row.id, row.stock);
    }
    return out;
  } catch {
    return null;
  }
}
