/**
 * 익명화 잔존 건수 세기 (216) — 저장소를 읽는 쪽. 순수 규칙은 anonymizeResidue.ts.
 * 발송 이력은 이 PC 사이드맵(206)에 수신 고객이 적힌 건만 셀 수 있다(그 전 이력·다른 PC 발송은 셀 수 없어 0 으로 둔다).
 */
import { ProductSaleStore, CustomerStore } from './store';
import { recipientIndex } from './messageRecipients';
import { anonymizeResidue, type ResidueItem } from './anonymizeResidue';

export function countAnonymizeResidue(customerIds: string[]): ResidueItem[] {
  const ids = new Set(customerIds);
  if (ids.size === 0) return [];
  let messageHistory = 0;
  for (const [, recipients] of recipientIndex()) if (recipients.some(id => ids.has(id))) messageHistory += 1;
  const names = new Set(CustomerStore.getAll().filter(c => ids.has(c.id)).map(c => c.name));
  const productSales = ProductSaleStore.getAll().filter(s => (s.customerId && ids.has(s.customerId)) || (!!s.customerName && names.has(s.customerName))).length;
  return anonymizeResidue({ messageHistory, productSales });
}
