/**
 * 익명화 뒤에도 이름이 남는 기록 — 순수 규칙 (216).
 * `anonymizeCustomers`(retentionPolicy) + `propagateCustomerIdentity`(customerIdentity) 는 고객 행과 예약·시술·회차권·결제·상담·공유 캘린더의
 * 이름·전화를 지운다. 그러나 코어 저장소에 수정 수단이 없는 두 곳은 그대로 남는다:
 *   - 발송 이력(msg_history): 본문·제목에 치환된 이름(민원·분쟁 증빙으로 보관, 파기 수단은 코어 `MessageHistoryStore` 에 없다)
 *   - 제품 판매(product_sales): 행의 `customerName`(코어 `ProductSaleStore` 에 update 가 없다)
 * 승인 큐 A-19 가 통과하면 두 곳도 함께 지운다. 그 전까지는 사용자에게 사실대로 알린다(가짜 성공 금지).
 */

export interface ResidueInput {
  /** 이 고객 id 가 수신 고객으로 적힌 발송 이력 건수(이 PC 사이드맵 기준) */
  messageHistory: number;
  /** 이 고객 이름이 적힌 제품 판매 행 수 */
  productSales: number;
}

export interface ResidueItem { label: string; count: number }

/** 남는 기록 목록 — 0건은 넣지 않는다(없는 걱정을 만들지 않게) */
export function anonymizeResidue(i: ResidueInput): ResidueItem[] {
  const out: ResidueItem[] = [];
  if (i.messageHistory > 0) out.push({ label: '문자·카카오 발송 이력의 본문·제목', count: i.messageHistory });
  if (i.productSales > 0) out.push({ label: '제품 판매 기록의 이름', count: i.productSales });
  return out;
}

/** 확인 창에 붙일 한 줄 — 남는 것이 없으면 null(문장을 만들지 않는다) */
export function describeAnonymizeResidue(items: ResidueItem[]): string | null {
  if (items.length === 0) return null;
  const parts = items.map(it => `${it.label} ${it.count}건`).join(', ');
  return `다만 ${parts}에 적힌 이름은 이번에 지워지지 않습니다(프로그램 보관 기록).`;
}
