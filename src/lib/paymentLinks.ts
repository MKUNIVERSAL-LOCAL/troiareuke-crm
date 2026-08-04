/**
 * paymentLinks.ts — 지점 → 고객 결제 요청 링크 (토스페이먼츠 카드/가상계좌 수납)
 *
 * 서버(NAS)가 결제 페이지 호스팅·승인·웹훅을 전담하고, 완료 시 지점 매출
 * (crm_records payments)에 자동 기록한다. PG 키(TOSS_*)는 서버에만 존재.
 * 키 미설정 상태에서는 pg-config.enabled=false — UI는 준비 중 안내만 표시.
 * 연결 절차: docs/PAYMENT-INTEGRATION.md
 */
import { apiRequest, isAuthApiConfigured } from './authApi';

export interface PaymentRequestRow {
  id: string;
  customerId?: string;
  customerName?: string;
  orderName: string;
  amount: number;
  method: 'card' | 'vbank' | 'both';
  memo?: string;
  status: 'pending' | 'vbank_wait' | 'paid' | 'canceled' | 'expired';
  paidMethod?: string;
  vbank?: { bankName?: string; bank?: string; accountNumber?: string; dueDate?: string };
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
  url: string;
}

export const isPaymentLinkAvailable = isAuthApiConfigured;

export function fetchPgConfig() {
  return apiRequest<{ enabled: boolean; methods: string[] }>('/api/payments/pg-config');
}

export function createPaymentRequest(payload: {
  amount: number;
  orderName: string;
  method: 'card' | 'vbank' | 'both';
  customerId?: string;
  customerName?: string;
  memo?: string;
}) {
  return apiRequest<{ request: PaymentRequestRow }>('/api/payments/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listPaymentRequests() {
  return apiRequest<{ enabled: boolean; requests: PaymentRequestRow[] }>('/api/payments/requests');
}

export function cancelPaymentRequest(id: string) {
  return apiRequest<{ request: PaymentRequestRow }>(`/api/payments/requests/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}

export const PAYMENT_STATUS_LABELS: Record<PaymentRequestRow['status'], { label: string; tone: 'wait' | 'ok' | 'bad' }> = {
  pending: { label: '결제 대기', tone: 'wait' },
  vbank_wait: { label: '입금 대기', tone: 'wait' },
  paid: { label: '결제 완료', tone: 'ok' },
  canceled: { label: '취소됨', tone: 'bad' },
  expired: { label: '기한 만료', tone: 'bad' },
};
