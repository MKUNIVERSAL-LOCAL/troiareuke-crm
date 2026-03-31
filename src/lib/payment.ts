/**
 * 포트원(PortOne / iamport) 결제 연동 유틸리티
 */

// ── window.IMP 타입 선언 ──────────────────────────────────────────
interface IMPRequestPayParams {
  pg?: string;
  pay_method: string;
  merchant_uid: string;
  name: string;
  amount: number;
  buyer_email?: string;
  buyer_name?: string;
  buyer_tel?: string;
  currency?: string;
  customer_uid?: string;
  notice_url?: string;
  custom_data?: Record<string, unknown>;
}

interface IMPResponse {
  success: boolean;
  imp_uid?: string;
  merchant_uid?: string;
  error_msg?: string;
  error_code?: string;
  paid_amount?: number;
  status?: string;
  customer_uid?: string;
}

interface IMPInstance {
  init: (impCode: string) => void;
  request_pay: (params: IMPRequestPayParams, callback: (response: IMPResponse) => void) => void;
}

declare global {
  interface Window {
    IMP?: IMPInstance;
  }
}

// ── 상수 ──────────────────────────────────────────────────────────
const IMP_CODE = import.meta.env.VITE_PORTONE_IMP_CODE || 'imp19424728';

// ── IMP 초기화 ────────────────────────────────────────────────────
function getIMP(): IMPInstance {
  if (!window.IMP) {
    throw new Error('포트원 SDK가 로드되지 않았습니다. index.html에 스크립트를 확인해주세요.');
  }
  window.IMP.init(IMP_CODE);
  return window.IMP;
}

// ── 고유 주문번호 생성 ────────────────────────────────────────────
function generateMerchantUid(): string {
  return `order_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ── 일반 결제 요청 ────────────────────────────────────────────────
export interface PaymentParams {
  planName: string;
  amount: number;
  buyerEmail: string;
  buyerName: string;
  buyerTel?: string;
}

export interface PaymentResult {
  success: boolean;
  impUid?: string;
  merchantUid?: string;
  error?: string;
}

export async function requestPayment(params: PaymentParams): Promise<PaymentResult> {
  return new Promise((resolve) => {
    try {
      const imp = getIMP();
      const merchantUid = generateMerchantUid();

      imp.request_pay(
        {
          pg: 'html5_inicis.INIpayTest',
          pay_method: 'card',
          merchant_uid: merchantUid,
          name: `트로이아르케 CRM - ${params.planName}`,
          amount: params.amount,
          buyer_email: params.buyerEmail,
          buyer_name: params.buyerName,
          buyer_tel: params.buyerTel,
          currency: 'KRW',
        },
        (response: IMPResponse) => {
          if (response.success) {
            resolve({
              success: true,
              impUid: response.imp_uid,
              merchantUid: response.merchant_uid,
            });
          } else {
            resolve({
              success: false,
              error: response.error_msg || '결제에 실패했습니다.',
            });
          }
        },
      );
    } catch (err) {
      resolve({
        success: false,
        error: err instanceof Error ? err.message : '결제 처리 중 오류가 발생했습니다.',
      });
    }
  });
}

// ── 정기결제(구독) 빌링키 요청 ────────────────────────────────────
export interface SubscriptionParams {
  planName: string;
  amount: number;
  buyerEmail: string;
  buyerName: string;
}

export interface SubscriptionResult {
  success: boolean;
  customerUid?: string;
  impUid?: string;
  merchantUid?: string;
  error?: string;
}

export async function requestSubscription(params: SubscriptionParams): Promise<SubscriptionResult> {
  return new Promise((resolve) => {
    try {
      const imp = getIMP();
      const merchantUid = generateMerchantUid();
      const customerUid = `customer_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      imp.request_pay(
        {
          pg: 'html5_inicis.INIpayTest',
          pay_method: 'card',
          merchant_uid: merchantUid,
          name: `트로이아르케 CRM - ${params.planName} (정기결제)`,
          amount: params.amount,
          buyer_email: params.buyerEmail,
          buyer_name: params.buyerName,
          currency: 'KRW',
          customer_uid: customerUid,
        },
        (response: IMPResponse) => {
          if (response.success) {
            resolve({
              success: true,
              customerUid,
              impUid: response.imp_uid,
              merchantUid: response.merchant_uid,
            });
          } else {
            resolve({
              success: false,
              error: response.error_msg || '정기결제 등록에 실패했습니다.',
            });
          }
        },
      );
    } catch (err) {
      resolve({
        success: false,
        error: err instanceof Error ? err.message : '정기결제 처리 중 오류가 발생했습니다.',
      });
    }
  });
}

// ── 플랜 정보 ─────────────────────────────────────────────────────
export interface PlanInfo {
  id: 'trial' | 'starter' | 'pro' | 'enterprise';
  name: string;
  price: number;
  description: string;
  features: string[];
}

export const PLANS: PlanInfo[] = [
  {
    id: 'trial',
    name: '무료 체험',
    price: 0,
    description: '14일간 모든 기능 무료 체험',
    features: ['고객 관리 (100명)', '예약 관리', '기본 통계', '카카오 알림'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 29000,
    description: '소규모 에스테틱 샵에 딱 맞는 플랜',
    features: ['고객 관리 (500명)', '예약 관리', '매출 분석', '카카오/SMS 알림', '네이버 예약 연동'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 59000,
    description: '성장하는 에스테틱 샵을 위한 프리미엄 플랜',
    features: ['고객 관리 (무제한)', '예약 관리', '고급 매출 분석', '카카오/SMS 알림', '네이버 예약 연동', 'AI 챗봇', '직원 관리', '제품 재고 관리'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 0,
    description: '대규모 프랜차이즈 맞춤 솔루션',
    features: ['모든 Pro 기능', '멀티 지점 관리', '커스텀 API 연동', '전담 매니저', '맞춤 교육'],
  },
];

export function getPlanById(planId: string): PlanInfo | undefined {
  return PLANS.find((p) => p.id === planId);
}
