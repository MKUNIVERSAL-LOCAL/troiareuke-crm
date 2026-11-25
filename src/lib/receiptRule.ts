// ═══════════════════════════════════════════════════════════════
// receiptRule — 결제 영수증 내용 규칙 (순수 모듈, 235, GAP P-9)
// ───────────────────────────────────────────────────────────────
// 왜: 고객이 "영수증 주세요" 하면 지금은 줄 것이 없었다. 상용 CRM(Fresha·Zenoti·Mindbody)은
//     결제 1건을 영수증으로 인쇄·전송한다. 우리는 결제 내역에서 A4 PDF 로 저장·공유한다.
// 정직하게 적는 것(돈 문서라 과장하면 안 된다):
//   - 이것은 **세금계산서·현금영수증이 아니다**. 그 발급은 매장이 별도 수단으로 한다 — 꼬리말에 명시.
//   - 환불 건은 제목·금액을 환불로 적는다(원 결제 영수증처럼 보이면 안 된다).
//   - 아직 받지 않은 결제(대기)는 "영수증" 이 아니라 "결제 예정 내역서" 로 적고 그렇게 말한다.
//   - 사업자등록번호 같은 매장 정보가 비어 있으면 그 줄을 빼고, 설정에서 채우라고 안내한다(빈 칸을 인쇄하지 않는다).
//   - **직원용 메모는 인쇄하지 않는다** — "컴플레인 주의"·"원장 지인 할인" 같은 내부 기록이 고객 손에 가면 안 된다 (238, 리뷰 M-2).
//   - 환불 건의 금액은 **원 결제 금액**으로 적고, 부분 환불이면 실제 환불액이 다를 수 있다고 밝힌다 —
//     현행 환불 모델은 부분 환불 금액을 기록할 자리가 없다(결정 #9 대기) (238, 리뷰 M-3).
// e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 검증한다.
// ═══════════════════════════════════════════════════════════════

import { formatPrice, formatDate } from './format';

export interface ReceiptShop {
  name?: string;
  phone?: string;
  address?: string;
  businessNumber?: string;
  /** 대표자명 — 매장이 설정에 적으면 사업자등록번호 줄에 함께 인쇄된다 */
  ownerName?: string;
}

export interface ReceiptPayment {
  paymentDate: string;
  amount: number;
  discountAmount?: number;
  paymentMethod?: string;
  /** 화면에 쓰는 구분 이름(단건 시술·프로그램·제품 판매·기타) */
  typeLabel?: string;
  status?: string;
  memo?: string;
  /** 분할 결제 요약 — 같은 예약·건에 결제가 2건 이상일 때 호출 쪽이 채운다 (238, 리뷰 M-1) */
  splitNote?: string;
}

export interface ReceiptModel {
  title: string;
  /** 환불 영수증인가 */
  isRefund: boolean;
  /** 아직 받지 않은 결제인가 */
  isPending: boolean;
  /** 매장 머리말 줄(빈 값은 빠진다) */
  shopLines: string[];
  /** 고객 줄 — 이름이 없으면 '고객 미지정' */
  customerLine: string;
  rows: { label: string; value: string }[];
  totalLabel: string;
  totalValue: string;
  /** 꼬리말 — 세금계산서 안내, 설정 보완 안내 등 */
  notes: string[];
}

export interface ReceiptInput {
  payment: ReceiptPayment;
  customerName?: string | null;
  shop: ReceiptShop;
  /** 이 영수증을 뽑은 날(기본 결제일) — "발행일" 로 적는다 */
  issuedOn?: string;
}

const CLEAN = /[\\/:*?"<>|]/g;

export function buildReceipt(i: ReceiptInput): ReceiptModel {
  const p = i.payment;
  const isRefund = p.status === 'refunded';
  const isPending = p.status === 'pending';
  const amount = Number.isFinite(p.amount) ? Math.round(p.amount) : 0;
  const discount = Number.isFinite(p.discountAmount) ? Math.round(p.discountAmount as number) : 0;

  const bizLine = [
    i.shop.businessNumber?.trim() ? `사업자등록번호 ${i.shop.businessNumber.trim()}` : '',
    i.shop.ownerName?.trim() ? `대표 ${i.shop.ownerName.trim()}` : '',
  ].filter(Boolean).join(' · ');
  const shopLines = [
    i.shop.name?.trim(),
    bizLine,
    [i.shop.phone?.trim(), i.shop.address?.trim()].filter(Boolean).join(' · '),
  ].filter((s): s is string => !!s && s !== '');

  const rows: { label: string; value: string }[] = [
    { label: '결제일', value: formatDate(p.paymentDate) },
    { label: '구분', value: p.typeLabel?.trim() || '기타' },
    { label: '결제 수단', value: p.paymentMethod?.trim() || '미지정' },
  ];
  if (p.splitNote) rows.push({ label: '분할 결제', value: p.splitNote });
  if (discount > 0) {
    rows.push({ label: '정가', value: formatPrice(amount + discount) });
    rows.push({ label: '할인', value: `-${formatPrice(discount)}` });
  }
  if (i.issuedOn && i.issuedOn !== p.paymentDate) rows.push({ label: '발행일', value: formatDate(i.issuedOn) });

  const notes = [
    '본 영수증은 매장 발행 간이 영수증입니다. 세금계산서·현금영수증은 포함되지 않으며 필요하시면 매장에 따로 요청해 주세요.',
  ];
  if (shopLines.length === 0) notes.push('※ 매장 이름·연락처가 설정되어 있지 않습니다 — 설정 > 매장 정보에서 입력해 주세요.');
  if (p.splitNote) notes.push(`※ ${p.splitNote}`);
  if (!i.shop.businessNumber?.trim()) notes.push('※ 매장 사업자등록번호가 설정되어 있지 않아 표시하지 못했습니다 — 설정 > 매장 정보에서 입력하면 다음 영수증부터 함께 인쇄됩니다.');
  if (isRefund) notes.push('※ 이 건은 환불 처리된 결제입니다. 아래 금액은 원 결제 금액이며, 부분 환불이라면 실제 환불액은 매장 기록을 따릅니다.');
  if (isPending) notes.push('※ 아직 입금이 확인되지 않은 결제입니다. 영수증이 아니라 예정 내역서입니다.');

  return {
    title: isRefund ? '환불 영수증' : isPending ? '결제 예정 내역서' : '영수증',
    isRefund,
    isPending,
    shopLines,
    customerLine: i.customerName?.trim() ? `${i.customerName.trim()} 고객님` : '고객 미지정',
    rows,
    totalLabel: isRefund ? '환불 처리된 원 결제 금액' : isPending ? '결제 예정 금액' : '결제 금액',
    totalValue: isRefund ? `-${formatPrice(amount)}` : formatPrice(amount),
    notes,
  };
}

/**
 * 같은 건(같은 예약·회차권)에 결제가 2건 이상일 때 영수증에 붙일 요약 (238, 리뷰 M-1).
 * 10만원을 카드 5만·현금 5만으로 받으면 영수증 한 장에는 5만원만 적혀 나머지가 어디에도 없었다.
 * 1건뿐이면 null — 쓸데없는 안내를 붙이지 않는다.
 */
export function splitPaymentNote(
  parts: { amount: number; paymentMethod?: string; status?: string }[],
  formatMoney: (n: number) => string = formatPrice,
): string | null {
  const alive = parts.filter(p => p.status !== 'refunded');
  if (alive.length < 2) return null;
  const total = alive.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? Math.round(p.amount) : 0), 0);
  const detail = alive.map(p => `${p.paymentMethod?.trim() || '미지정'} ${formatMoney(Math.round(p.amount || 0))}`).join(' + ');
  return `이 건은 ${alive.length}건으로 나눠 결제했습니다: ${detail} · 합계 ${formatMoney(total)}`;
}

/** 파일 이름 — 매장·고객·날짜. 경로에 쓸 수 없는 글자는 뺀다 */
export function receiptFileName(shopName: string | undefined, customerName: string | undefined, paymentDate: string, isRefund = false): string {
  const shop = (shopName || 'CRM').replace(CLEAN, '').trim() || 'CRM';
  const who = (customerName || '고객').replace(CLEAN, '').replace(/\s+/g, '') || '고객';
  return `${shop}_${who}_${isRefund ? '환불영수증' : '영수증'}_${paymentDate}.pdf`;
}
