// =============================================
// 기존 타입
// =============================================
export type CustomerGrade = 'VIP' | '골드' | '일반' | '신규';
export type Gender = '여성' | '남성' | '미입력';
export type ReservationStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled' | 'noshow';
export type ReservationSource = 'manual' | 'naver' | 'kakao' | 'phone' | 'walk-in' | 'app';
export type PaymentMethod = '카드' | '현금' | '계좌이체' | '카카오페이' | '혼합';
export type MessageType = 'sms' | 'lms' | 'mms' | 'kakao-channel' | 'kakao-openchat';
export type MessageStatus = 'draft' | 'sending' | 'sent' | 'failed';

export interface Customer {
  id: string;
  shopId: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  birthDate?: string;
  gender: Gender;
  grade: CustomerGrade;
  memo?: string;
  skinType?: string;
  allergies?: string;
  totalVisits: number;
  totalSpent: number;
  lastVisitDate?: string;
  registeredAt: string;
  tags: string[];
  isActive: boolean;
  referralSource?: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  duration: number;
  price: number;
  description?: string;
  isActive: boolean;
}

export interface Staff {
  id: string;
  shopId: string;
  name: string;
  role: string;
  phone: string;
  email?: string;
  specialty: string[];
  color: string;
  isActive: boolean;
  hireDate: string;
}

export interface Reservation {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  staffId: string;
  staffName: string;
  services: { serviceId: string; serviceName: string; price: number; duration: number }[];
  date: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  source: ReservationSource;
  memo?: string;
  totalPrice: number;
  naverBookingId?: string;
}

export interface TreatmentRecord {
  id: string;
  customerId: string;
  customerName: string;
  reservationId?: string;
  date: string;
  services: { serviceId: string; serviceName: string; price: number }[];
  staffId: string;
  staffName: string;
  totalAmount: number;
  paidAmount: number;
  paymentMethod: PaymentMethod;
  memo?: string;
  skinCondition?: string;
  nextVisitRecommended?: string;
  photos: string[];
  usedPoints: number;
  earnedPoints: number;
}

export interface Product {
  id: string;
  shopId: string;
  name: string;
  category: string;
  brand?: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  unit: string;
  description?: string;
  isActive: boolean;
}

export interface MessageTemplate {
  id: string;
  name: string;
  type: MessageType;
  title?: string;
  content: string;
  variables: string[];
  category: string;
}

export interface MessageHistory {
  id: string;
  type: MessageType;
  templateId?: string;
  templateName?: string;
  title?: string;
  content: string;
  recipients: number;
  successCount: number;
  failCount: number;
  sentAt: string;
  status: MessageStatus;
  cost?: number;
}

export interface SalesData {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  reservationCount: number;
  newCustomers: number;
}

export interface NaverBookingSettings {
  isConnected: boolean;
  placeId?: string;
  placeName?: string;
  lastSyncAt?: string;
}

export interface KakaoSettings {
  channelConnected: boolean;
  channelId?: string;
  channelName?: string;
  openchatConnected: boolean;
  openchatUrl?: string;
}

export interface ShopSettings {
  id: string;
  name: string;
  type: '피부관리실' | '네일샵' | '헤어샵' | '복합샵';
  phone: string;
  address: string;
  businessHours: Record<string, { open: string; close: string; isOff: boolean }>;
  holidays: string[];
  naverBooking: NaverBookingSettings;
  kakao: KakaoSettings;
  smsApiKey?: string;
  smsCallerId?: string;
  pointRate: number;
  notificationSettings: {
    reservationConfirm: boolean;
    reservationReminder: boolean;
    birthdayMessage: boolean;
    novisitMessage: boolean;
  };
}

// =============================================
// 신규 타입: 프로그램 / 결제 / 제품 판매
// =============================================

/** 시술 프로그램 정의 (10회권, 패키지 등) */
export interface Program {
  id: string;
  shopId: string;
  name: string;
  category: string;
  totalSessions: number | null;
  validityDays: number | null;
  price: number;
  costPrice: number;
  description?: string;
  color: string;
  isActive: boolean;
  createdAt: string;
}

/** 고객에게 등록된 프로그램 (구매한 회권) */
export interface CustomerProgram {
  id: string;
  shopId: string;
  customerId: string;
  customerName: string;
  programId?: string;
  programName: string;
  category: string;
  totalSessions: number | null;
  usedSessions: number;
  pricePaid: number;
  paymentMethod: PaymentMethod;
  purchaseDate: string;
  expiryDate?: string;
  isCompleted: boolean;
  notes?: string;
  createdAt: string;
}

/** 시술 기록 (회차 차감) */
export interface TreatmentLog {
  id: string;
  shopId: string;
  customerId: string;
  customerName: string;
  customerProgramId?: string;
  programName?: string;
  staffName?: string;
  treatmentDate: string;
  treatmentTime?: string;
  sessionsUsed: number;
  treatmentDetails?: string;
  skinCondition?: string;
  staffNotes?: string;
  nextAppointment?: string;
  createdAt: string;
}

/** 제품 판매 기록 */
export interface ProductSale {
  id: string;
  shopId: string;
  customerId?: string;
  customerName?: string;
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  paymentMethod: PaymentMethod;
  saleDate: string;
  staffName?: string;
  notes?: string;
  createdAt: string;
}

/** 통합 결제 기록 */
export interface Payment {
  id: string;
  shopId: string;
  customerId?: string;
  customerName?: string;
  paymentDate: string;
  type: 'program' | 'product' | 'single_treatment' | 'other';
  typeLabel: string;
  referenceId?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  discountAmount: number;
  status: 'completed' | 'refunded' | 'pending';
  memo?: string;
  createdAt: string;
}

/** 비컨(AI 피부진단기) 측정 지표 — 각 0~100 점수 (없으면 미측정) */
export interface BeaconMetrics {
  moisture?: number;     // 수분
  oil?: number;          // 유분
  elasticity?: number;   // 탄력
  pigmentation?: number; // 색소침착
  pore?: number;         // 모공
  wrinkle?: number;      // 주름
  redness?: number;      // 홍조
  sensitivity?: number;  // 민감도
  skinTone?: number;     // 피부톤(밝기)
}

/** 고객 피부상담 기록 (트로이아르케 비컨 1:1 맞춤) */
export interface Consultation {
  id: string;
  shopId: string;
  customerId: string;
  customerName: string;
  consultDate: string;
  staffName?: string;
  /** 고객 주관적 피부 고민 (체크리스트 태그) */
  concerns: string[];
  /** 비컨 진단 측정값 */
  beaconMetrics: BeaconMetrics;
  /** 종합 피부타입 판정 */
  skinTypeResult?: string;
  /** 관리사 소견 */
  managerNote?: string;
  /** 1:1 맞춤 솔루션 제안 (서술) */
  recommendedSolution?: string;
  /** 추천 제품/프로그램명 */
  recommendedProducts: string[];
  /** 다음 상담/관리 권고일 */
  nextConsultDate?: string;
  /** 전/후 사진 URL */
  photos: string[];
  createdAt: string;
}

/** 일별 매출 집계 */
export interface DailySales {
  date: string;
  treatmentRevenue: number;
  productRevenue: number;
  totalRevenue: number;
  paymentCount: number;
}

// =============================================
// 구독/결제 타입
// =============================================

export type SubscriptionPlan = 'trial' | 'starter' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';

export interface Subscription {
  id: string;
  branchId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: string;
  expiresAt: string;
  paymentMethod?: string;
  amount?: number;
  currency?: string;
  impUid?: string;
  merchantUid?: string;
  customerUid?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
