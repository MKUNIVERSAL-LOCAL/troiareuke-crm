import type { Campaign } from '../lib/campaignRule'; // 캠페인 정의는 순수 규칙 모듈에 (156)
import type { SavedSegment } from '../lib/segmentFilterRule'; // 저장 세그먼트 (166)
import type { ReservationPolicy } from '../lib/reservationPolicyRule'; // 예약 정책 (173)
// =============================================
// 기존 타입
// =============================================
export type CustomerGrade = 'VIP' | '골드' | '일반' | '신규';
export type Gender = '여성' | '남성' | '미입력';
export type ReservationStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled' | 'noshow';
export type ReservationSource = 'manual' | 'naver' | 'kakao' | 'phone' | 'walk-in' | 'app';
// (string & {}) — 매장이 직접 추가한 커스텀 결제수단(예: 상품권) 허용. 기본값 자동완성은 유지.
export type PaymentMethod = '카드' | '현금' | '계좌이체' | '카카오페이' | '혼합' | (string & {});
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
  /** 개인정보 수집·이용 동의 (등록 시 필수 체크) */
  privacyConsent?: boolean;
  privacyConsentAt?: string;
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
  // 피부관리(에스테틱) 업종 전용 — 무관 업종(헤어·네일·속눈썹·반영구 등) 제거 (2026-07-30 오너 지시).
  // UI 업종 목록('에스테틱샵' 등 Onboarding/Settings/Admin)과 커스텀 값을 모두 수용.
  type: '피부관리실' | '에스테틱샵' | '복합샵' | (string & {});
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
  /**
   * 지점 환경설정 묶음 — 예전엔 PC별 localStorage에만 있어 PC를 바꾸면 사라지던 값들 (2026-09-07 서버 저장으로 승격).
   * shop_settings 행에 preferences JSON으로 함께 저장·동기화된다.
   */
  preferences?: ShopPreferences;
}

/** 직원 근무표 — 요일 키는 businessHours 와 같은 '월'~'일' (141, GAP R-4) */
export type DayKey = '월' | '화' | '수' | '목' | '금' | '토' | '일';
export interface DayShift {
  off: boolean;
  start: string;       // 'HH:mm'
  end: string;         // 'HH:mm' — start 이하면 자정 넘김
  breakStart?: string; // 둘 다 있어야 휴게로 인정
  breakEnd?: string;
}
export interface StaffSchedule {
  staffId: string;
  useShopHours: boolean;             // true 면 weekly 무시, 매장 영업시간 사용(버퍼는 적용)
  weekly: Record<DayKey, DayShift>;
  bufferBeforeMin: number;           // 시술 전 준비(분)
  bufferAfterMin: number;            // 시술 뒤 정리(분)
  updatedAt: string;
}

/** 예약 요청(요청함) — 전화·카톡·네이버·온라인으로 온 요청을 예약으로 등록하기 전 대기 목록. 예약이 아니다 (143, GAP R-6·R-10) */
export type BookingChannel = 'phone' | 'kakao' | 'naver' | 'web';
export interface BookingRequest {
  id: string;
  channel: BookingChannel;
  customerName: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  durationMin: number;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:mm 희망 시간
  memo?: string;
  privacyConsent: boolean; // 처음 고객은 접수 때 동의 필수 → 예약으로 등록할 때 고객 등록에 기록
  createdAt: string;
  status: 'new' | 'accepted' | 'rejected';
  reservationId?: string;
  decidedAt?: string;
}

/** 베드/룸/장비 자원 — 한 번에 예약 하나(처리량 상한). 목록 순서 = 자동 배정 우선순위 (142, GAP R-5) */
export interface Resource { id: string; name: string; kind: 'bed' | 'room' | 'device'; isActive: boolean }

export interface ShopPreferences {
  /** 매장이 직접 추가한 결제수단 (기본 4종 제외) */
  customPaymentMethods?: string[];
  /** 재방문 권장 주기(일). 시술기록에 다음 방문일이 없을 때 이 주기로 권장일을 계산 */
  revisitCycleDays?: number;
  /** 기능 키 → 지점 사용 여부 (본사 허용 범위 안에서 지점이 켜고 끄는 토글, 예: customers.beacon) */
  deviceFeatures?: Record<string, boolean>;
  /** API 연동 가이드 체크리스트 상태 */
  apiGuideStatus?: Record<string, 'connected' | 'pending' | 'not-started'>;
  /** 개인정보 처리 기록(익명화·병합) — 파기 대장. 지점 설정에 두어 서버 동기·PC 교체·로그아웃 wipe 와 무관 (9차 점검 #29, 리뷰 2026-11-20) */
  privacyActions?: { id: string; at: string; type: 'anonymize' | 'merge'; count: number; actor: string; detail?: string }[];
  /** 직원 이름 변경 이력 staffId → 옛 이름들 — 제품 판매 행은 수정 API 가 없어(코어) 옛 담당자 이름으로 남으므로 실적 집계가 별칭으로 찾는다 (11차 #M2) */
  staffAliases?: Record<string, string[]>;
  /** 병합으로 사라진 고객 id → 남은 고객 id — 제품 판매 행은 옮길 수 없어(코어) 읽을 때 되짚는다 (11차 #M10) */
  mergedCustomerIds?: Record<string, string>;
  /** 마지막 전체 백업 저장 시각(ISO, 매장 기준) — 첫 설정 체크리스트 "전체 백업 1회" 판정. 설정 행이라 NAS 동기·로그아웃 wipe 와 무관 (193·195) */
  lastBackupAt?: string;
  /** 매장이 추가한 고객 주의 키워드 — 메모에서 이 말이 든 줄을 경고로 올린다 (240) */
  cautionKeywords?: string[];
  /** 자주 쓰는 태그 목록(태그 마스터) — 고객 창에서 눌러 넣는다 (237) */
  tagMaster?: string[];
  /** 영수증에 인쇄할 사업자 정보 (235) — 가입 계정의 사업자등록번호는 코어 AuthUser 에 없어 매장이 직접 적는다 */
  receiptInfo?: { businessNumber?: string; ownerName?: string };
  /** 직원 인센티브(수당) 비율 — 매장 기본값 + 직원별 예외. 설정 행이라 NAS 동기, PC 교체와 무관 (233) */
  staffCommission?: { serviceRate: number; productRate: number; perStaff?: Record<string, { serviceRate?: number; productRate?: number }> };
  /** 직원별 근무표·휴게·준비/정리 버퍼 staffId → 근무표 — 새 컬렉션(서버 화이트리스트 승인 B-2) 대신 설정 행으로 동기화 (141) */
  staffSchedules?: Record<string, StaffSchedule>;
  /** 베드·룸·장비 자원 목록 (142) */
  resources?: Resource[];
  /** 예약 id → 자원 id — 코어 Reservation 에 resourceId 가 없어(toDbReservation 이 버림, 코어 수정은 승인 A) 설정 행에 둔다. 60일 지난 배정은 저장 때 정리 (142) */
  reservationResources?: Record<string, string>;
  /** 마감한 달(YYYY-MM) — 그 달의 결제·지출·판매는 등록·수정·삭제할 수 없다(저장 경로 가드) (147, GAP P-7) */
  closedMonths?: string[];
  /** 월 매출 목표 YYYY-MM → 원 (147, GAP P-6) */
  monthlyTargets?: Record<string, number>;
  /** 광고 메시지 무료수신거부 080 번호(정보통신망법 표기) — 없으면 광고 발송 차단 (155) */
  adsOptOutNumber?: string;
  /** 자동 발송 캠페인 정의(트리거·조건·채널·본문·반복·광고 여부) — 작고 적어 설정 행에 둔다. 발송 기록·멱등키는 기기별(서버 보관은 승인 B-4) (156) */
  campaigns?: Campaign[];
  /** 저장 세그먼트(조건 조합) — 고객 목록 필터·발송 대상·캠페인 조건에 공용 (166, GAP C-6·M-2) */
  savedSegments?: SavedSegment[];
  /** 예약 정책 — 겹침 하드 블록 등(기본 꺼짐) (173, GAP R-3) */
  reservationPolicy?: ReservationPolicy;
  /** 예약 id → 취소·노쇼 사유. 코어 Reservation 에 사유 칸이 없어 설정 행에 둔다. 1년 보관 (244) */
  reservationCancelReasons?: Record<string, { kind: 'cancelled' | 'noshow'; reason: string; at: string }>;
  /** 체크아웃 재예약 안내 기록(추천·누름) — 성과 지표 산출용. 180일·400건까지 보관 (243) */
  rebookLog?: { id: string; customerId: string; suggestedDate: string; basis?: string; shownAt: string; clickedAt?: string }[];
  /** 개인정보 보존기간 정책 — 켜면 마지막 활동 후 years년 지난 고객을 "보존기간 경과"로 모아 익명화 (P4, 2026-11-17) */
  retentionPolicy?: { enabled: boolean; years: number };
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

/** 지출(매입·비용) 분류 — 매출원가성 2종 + 판매비와관리비 */
export type ExpenseCategory =
  | '제품 매입'      // 판매용 화장품 등 (매출원가)
  | '소모품 매입'    // 시술 소모품·비품 (매출원가)
  | '인건비'
  | '임대료'
  | '관리비'         // 수도·전기·통신 등
  | '마케팅·광고'
  | '수수료'         // 카드·플랫폼 수수료
  | '세금·공과'
  | '기타';

/** 매출원가로 분류되는 지출 카테고리 (나머지는 판매비와관리비) */
export const COGS_CATEGORIES: ExpenseCategory[] = ['제품 매입', '소모품 매입'];

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  '제품 매입', '소모품 매입', '인건비', '임대료', '관리비',
  '마케팅·광고', '수수료', '세금·공과', '기타',
];

/** 지출(매입) 기록 — 손익계산서의 비용 원장 */
export interface Expense {
  id: string;
  shopId: string;
  expenseDate: string;       // YYYY-MM-DD
  category: ExpenseCategory;
  vendor?: string;           // 거래처
  description: string;       // 내용
  amount: number;
  paymentMethod: PaymentMethod;
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
  /** 서버 스키마 호환용 — 실제 상담 사진은 photoStore의 consult:<id> 키에 있고 이 배열은 늘 비어 있다 */
  photos: string[];
  createdAt: string;
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
