// 🔒 CORE — 보호 파일(코어 잠금). 수정 금지. 변경 필요 시 docs/CORE-LOCK.md 의 CORE_EDIT=1 우회 절차.
/**
 * 트로이아르케 CRM — 데이터 저장소 (Supabase + localStorage 폴백)
 *
 * Supabase가 설정되어 있으면 DB를 사용하고,
 * 아니면 localStorage로 폴백합니다.
 * 동기 인터페이스를 유지하기 위해 메모리 캐시 레이어를 사용합니다.
 */

import type {
  Customer, Program, CustomerProgram, TreatmentLog,
  Product, ProductSale, Payment, Staff,
  Service, Reservation, ShopSettings, MessageTemplate, MessageHistory
} from '../types';

import { supabase, isSupabaseConfigured } from './supabase';

// ─── 오프라인 배너용 동기화 타임스탬프 ────────────────────────
// OfflineBanner.tsx의 recordSyncTimestamp와 동일 키를 직접 기록
// (컴포넌트 → lib 역방향 import 회피)
const LAST_SYNC_KEY = 'crm_last_sync_at';
function recordSyncTimestamp(): void {
  try { localStorage.setItem(LAST_SYNC_KEY, String(Date.now())); } catch {}
}

// ─── 현재 브랜치(샵) ID 가져오기 ──────────────────────────────
export function getShopId(): string {
  try {
    const auth = localStorage.getItem('troiareuke_auth_user');
    if (auth) {
      const user = JSON.parse(auth);
      if (user.role === 'superadmin') return 'superadmin';
      return user.branchId || user.id || 'default_shop';
    }
  } catch {}
  return 'default_shop';
}

function isSuperadmin(): boolean {
  try {
    const auth = localStorage.getItem('troiareuke_auth_user');
    if (auth) {
      const user = JSON.parse(auth);
      return user.role === 'superadmin';
    }
  } catch {}
  return false;
}

// ─── 유틸리티 ─────────────────────────────────────────────────
function genId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function getList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── BW-H4: QuotaExceededError 안전 래퍼 ───────────────────────
export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (err instanceof DOMException && (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    )) {
      console.warn('[CRM] localStorage 용량 초과:', key);
      // 브라우저 alert 대신 커스텀 이벤트를 dispatch해 UI에서 토스트 처리
      window.dispatchEvent(new CustomEvent('crm:storage-quota-exceeded', { detail: { key } }));
    } else {
      throw err;
    }
  }
}

function saveList<T>(key: string, data: T[]): void {
  safeSetItem(key, JSON.stringify(data));
}

function shopKey(table: string): string {
  return `crm_${getShopId()}_${table}`;
}

// ─── camelCase ↔ snake_case 변환 유틸 ──────────────────────────
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function objectToSnake(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    result[snakeKey] = value;
  }
  return result;
}

function objectToCamel(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    result[camelKey] = value;
  }
  return result;
}

// ─── Supabase ↔ App 필드 매핑 ──────────────────────────────────
// shopId → branch_id 변환을 포함한 매핑

function toDbCustomer(c: Partial<Customer>): Record<string, any> {
  const db: Record<string, any> = {};
  if (c.id !== undefined) db.id = c.id;
  if (c.shopId !== undefined) db.branch_id = c.shopId;
  if (c.name !== undefined) db.name = c.name;
  if (c.phone !== undefined) db.phone = c.phone;
  if (c.email !== undefined) db.email = c.email;
  if (c.birthDate !== undefined) db.birth_date = c.birthDate;
  if (c.gender !== undefined) db.gender = c.gender;
  if (c.grade !== undefined) db.grade = c.grade;
  if (c.memo !== undefined) db.memo = c.memo;
  if (c.skinType !== undefined) db.skin_type = c.skinType;
  if (c.allergies !== undefined) db.allergies = c.allergies;
  if (c.totalVisits !== undefined) db.total_visits = c.totalVisits;
  if (c.totalSpent !== undefined) db.total_spent = c.totalSpent;
  if (c.lastVisitDate !== undefined) db.last_visit_date = c.lastVisitDate;
  if (c.registeredAt !== undefined) db.registered_at = c.registeredAt;
  if (c.tags !== undefined) db.tags = c.tags;
  if (c.isActive !== undefined) db.is_active = c.isActive;
  if (c.referralSource !== undefined) db.referral_source = c.referralSource;
  return db;
}

function fromDbCustomer(row: Record<string, any>): Customer {
  return {
    id: row.id,
    shopId: row.branch_id,
    name: row.name,
    phone: row.phone || '',
    email: row.email,
    birthDate: row.birth_date,
    gender: row.gender || '미입력',
    grade: row.grade || '일반',
    memo: row.memo,
    skinType: row.skin_type,
    allergies: row.allergies,
    totalVisits: row.total_visits || 0,
    totalSpent: row.total_spent || 0,
    lastVisitDate: row.last_visit_date,
    registeredAt: row.registered_at || row.created_at || now(),
    tags: row.tags || [],
    isActive: row.is_active ?? true,
    referralSource: row.referral_source,
  };
}

function toDbStaff(s: Partial<Staff>): Record<string, any> {
  const db: Record<string, any> = {};
  if (s.id !== undefined) db.id = s.id;
  if (s.shopId !== undefined) db.branch_id = s.shopId;
  if (s.name !== undefined) db.name = s.name;
  if (s.role !== undefined) db.role = s.role;
  if (s.phone !== undefined) db.phone = s.phone;
  if (s.email !== undefined) db.email = s.email;
  if (s.specialty !== undefined) db.specialty = s.specialty;
  if (s.color !== undefined) db.color = s.color;
  if (s.isActive !== undefined) db.is_active = s.isActive;
  if (s.hireDate !== undefined) db.hire_date = s.hireDate;
  return db;
}

function fromDbStaff(row: Record<string, any>): Staff {
  return {
    id: row.id,
    shopId: row.branch_id,
    name: row.name,
    role: row.role || '',
    phone: row.phone || '',
    email: row.email,
    specialty: row.specialty || [],
    color: row.color || '#1a3a8f',
    isActive: row.is_active ?? true,
    hireDate: row.hire_date || '',
  };
}

function toDbService(s: Partial<Service> & { shopId?: string }): Record<string, any> {
  const db: Record<string, any> = {};
  if (s.id !== undefined) db.id = s.id;
  if ((s as any).shopId !== undefined) db.branch_id = (s as any).shopId;
  if (s.name !== undefined) db.name = s.name;
  if (s.category !== undefined) db.category = s.category;
  if (s.duration !== undefined) db.duration = s.duration;
  if (s.price !== undefined) db.price = s.price;
  if (s.description !== undefined) db.description = s.description;
  if (s.isActive !== undefined) db.is_active = s.isActive;
  return db;
}

function fromDbService(row: Record<string, any>): Service {
  return {
    id: row.id,
    name: row.name,
    category: row.category || '',
    duration: row.duration || 0,
    price: row.price || 0,
    description: row.description,
    isActive: row.is_active ?? true,
  };
}

function toDbReservation(r: Partial<Reservation> & { shopId?: string }): Record<string, any> {
  const db: Record<string, any> = {};
  if (r.id !== undefined) db.id = r.id;
  if ((r as any).shopId !== undefined) db.branch_id = (r as any).shopId;
  if (r.customerId !== undefined) db.customer_id = r.customerId;
  if (r.customerName !== undefined) db.customer_name = r.customerName;
  if (r.customerPhone !== undefined) db.customer_phone = r.customerPhone;
  if (r.staffId !== undefined) db.staff_id = r.staffId;
  if (r.staffName !== undefined) db.staff_name = r.staffName;
  if (r.services !== undefined) db.services = r.services;
  if (r.date !== undefined) db.date = r.date;
  if (r.startTime !== undefined) db.start_time = r.startTime;
  if (r.endTime !== undefined) db.end_time = r.endTime;
  if (r.status !== undefined) db.status = r.status;
  if (r.source !== undefined) db.source = r.source;
  if (r.memo !== undefined) db.memo = r.memo;
  if (r.totalPrice !== undefined) db.total_price = r.totalPrice;
  if (r.naverBookingId !== undefined) db.naver_booking_id = r.naverBookingId;
  return db;
}

function fromDbReservation(row: Record<string, any>): Reservation {
  return {
    id: row.id,
    customerId: row.customer_id || '',
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    staffId: row.staff_id || '',
    staffName: row.staff_name || '',
    services: row.services || [],
    date: row.date || '',
    startTime: row.start_time || '',
    endTime: row.end_time || '',
    status: row.status || 'pending',
    source: row.source || 'manual',
    memo: row.memo,
    totalPrice: row.total_price || 0,
    naverBookingId: row.naver_booking_id,
  };
}

function toDbProgram(p: Partial<Program>): Record<string, any> {
  const db: Record<string, any> = {};
  if (p.id !== undefined) db.id = p.id;
  if (p.shopId !== undefined) db.branch_id = p.shopId;
  if (p.name !== undefined) db.name = p.name;
  if (p.category !== undefined) db.category = p.category;
  if (p.totalSessions !== undefined) db.total_sessions = p.totalSessions;
  if (p.validityDays !== undefined) db.validity_days = p.validityDays;
  if (p.price !== undefined) db.price = p.price;
  if (p.costPrice !== undefined) db.cost_price = p.costPrice;
  if (p.description !== undefined) db.description = p.description;
  if (p.color !== undefined) db.color = p.color;
  if (p.isActive !== undefined) db.is_active = p.isActive;
  if (p.createdAt !== undefined) db.created_at = p.createdAt;
  return db;
}

function fromDbProgram(row: Record<string, any>): Program {
  return {
    id: row.id,
    shopId: row.branch_id,
    name: row.name,
    category: row.category || '',
    totalSessions: row.total_sessions,
    validityDays: row.validity_days,
    price: row.price || 0,
    costPrice: row.cost_price || 0,
    description: row.description,
    color: row.color || '#1a3a8f',
    isActive: row.is_active ?? true,
    createdAt: row.created_at || now(),
  };
}

function toDbCustomerProgram(cp: Partial<CustomerProgram>): Record<string, any> {
  const db: Record<string, any> = {};
  if (cp.id !== undefined) db.id = cp.id;
  if (cp.shopId !== undefined) db.branch_id = cp.shopId;
  if (cp.customerId !== undefined) db.customer_id = cp.customerId;
  if (cp.customerName !== undefined) db.customer_name = cp.customerName;
  if (cp.programId !== undefined) db.program_id = cp.programId;
  if (cp.programName !== undefined) db.program_name = cp.programName;
  if (cp.category !== undefined) db.category = cp.category;
  if (cp.totalSessions !== undefined) db.total_sessions = cp.totalSessions;
  if (cp.usedSessions !== undefined) db.used_sessions = cp.usedSessions;
  if (cp.pricePaid !== undefined) db.price_paid = cp.pricePaid;
  if (cp.paymentMethod !== undefined) db.payment_method = cp.paymentMethod;
  if (cp.purchaseDate !== undefined) db.purchase_date = cp.purchaseDate;
  if (cp.expiryDate !== undefined) db.expiry_date = cp.expiryDate;
  if (cp.isCompleted !== undefined) db.is_completed = cp.isCompleted;
  if (cp.notes !== undefined) db.notes = cp.notes;
  if (cp.createdAt !== undefined) db.created_at = cp.createdAt;
  return db;
}

function fromDbCustomerProgram(row: Record<string, any>): CustomerProgram {
  return {
    id: row.id,
    shopId: row.branch_id,
    customerId: row.customer_id || '',
    customerName: row.customer_name || '',
    programId: row.program_id,
    programName: row.program_name || '',
    category: row.category || '',
    totalSessions: row.total_sessions,
    usedSessions: row.used_sessions || 0,
    pricePaid: row.price_paid || 0,
    paymentMethod: row.payment_method || '카드',
    purchaseDate: row.purchase_date || '',
    expiryDate: row.expiry_date,
    isCompleted: row.is_completed ?? false,
    notes: row.notes,
    createdAt: row.created_at || now(),
  };
}

function toDbTreatmentLog(t: Partial<TreatmentLog>): Record<string, any> {
  const db: Record<string, any> = {};
  if (t.id !== undefined) db.id = t.id;
  if (t.shopId !== undefined) db.branch_id = t.shopId;
  if (t.customerId !== undefined) db.customer_id = t.customerId;
  if (t.customerName !== undefined) db.customer_name = t.customerName;
  if (t.customerProgramId !== undefined) db.customer_program_id = t.customerProgramId;
  if (t.programName !== undefined) db.program_name = t.programName;
  if (t.staffName !== undefined) db.staff_name = t.staffName;
  if (t.treatmentDate !== undefined) db.treatment_date = t.treatmentDate;
  if (t.treatmentTime !== undefined) db.treatment_time = t.treatmentTime;
  if (t.sessionsUsed !== undefined) db.sessions_used = t.sessionsUsed;
  if (t.treatmentDetails !== undefined) db.treatment_details = t.treatmentDetails;
  if (t.skinCondition !== undefined) db.skin_condition = t.skinCondition;
  if (t.staffNotes !== undefined) db.staff_notes = t.staffNotes;
  if (t.nextAppointment !== undefined) db.next_appointment = t.nextAppointment;
  if (t.createdAt !== undefined) db.created_at = t.createdAt;
  return db;
}

function fromDbTreatmentLog(row: Record<string, any>): TreatmentLog {
  return {
    id: row.id,
    shopId: row.branch_id,
    customerId: row.customer_id || '',
    customerName: row.customer_name || '',
    customerProgramId: row.customer_program_id,
    programName: row.program_name,
    staffName: row.staff_name,
    treatmentDate: row.treatment_date || '',
    treatmentTime: row.treatment_time,
    sessionsUsed: row.sessions_used || 1,
    treatmentDetails: row.treatment_details,
    skinCondition: row.skin_condition,
    staffNotes: row.staff_notes,
    nextAppointment: row.next_appointment,
    createdAt: row.created_at || now(),
  };
}

function toDbProduct(p: Partial<Product>): Record<string, any> {
  const db: Record<string, any> = {};
  if (p.id !== undefined) db.id = p.id;
  if (p.shopId !== undefined) db.branch_id = p.shopId;
  if (p.name !== undefined) db.name = p.name;
  if (p.category !== undefined) db.category = p.category;
  if (p.brand !== undefined) db.brand = p.brand;
  if (p.price !== undefined) db.price = p.price;
  if (p.cost !== undefined) db.cost = p.cost;
  if (p.stock !== undefined) db.stock = p.stock;
  if (p.minStock !== undefined) db.min_stock = p.minStock;
  if (p.unit !== undefined) db.unit = p.unit;
  if (p.description !== undefined) db.description = p.description;
  if (p.isActive !== undefined) db.is_active = p.isActive;
  return db;
}

function fromDbProduct(row: Record<string, any>): Product {
  return {
    id: row.id,
    shopId: row.branch_id,
    name: row.name,
    category: row.category || '',
    brand: row.brand,
    price: row.price || 0,
    cost: row.cost || 0,
    stock: row.stock || 0,
    minStock: row.min_stock || 0,
    unit: row.unit || '개',
    description: row.description,
    isActive: row.is_active ?? true,
  };
}

function toDbProductSale(s: Partial<ProductSale>): Record<string, any> {
  const db: Record<string, any> = {};
  if (s.id !== undefined) db.id = s.id;
  if (s.shopId !== undefined) db.branch_id = s.shopId;
  if (s.customerId !== undefined) db.customer_id = s.customerId;
  if (s.customerName !== undefined) db.customer_name = s.customerName;
  if (s.productId !== undefined) db.product_id = s.productId;
  if (s.productName !== undefined) db.product_name = s.productName;
  if (s.quantity !== undefined) db.quantity = s.quantity;
  if (s.unitPrice !== undefined) db.unit_price = s.unitPrice;
  if (s.totalPrice !== undefined) db.total_price = s.totalPrice;
  if (s.paymentMethod !== undefined) db.payment_method = s.paymentMethod;
  if (s.saleDate !== undefined) db.sale_date = s.saleDate;
  if (s.staffName !== undefined) db.staff_name = s.staffName;
  if (s.notes !== undefined) db.notes = s.notes;
  if (s.createdAt !== undefined) db.created_at = s.createdAt;
  return db;
}

function fromDbProductSale(row: Record<string, any>): ProductSale {
  return {
    id: row.id,
    shopId: row.branch_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    productId: row.product_id,
    productName: row.product_name || '',
    quantity: row.quantity || 0,
    unitPrice: row.unit_price || 0,
    totalPrice: row.total_price || 0,
    paymentMethod: row.payment_method || '카드',
    saleDate: row.sale_date || '',
    staffName: row.staff_name,
    notes: row.notes,
    createdAt: row.created_at || now(),
  };
}

function toDbPayment(p: Partial<Payment>): Record<string, any> {
  const db: Record<string, any> = {};
  if (p.id !== undefined) db.id = p.id;
  if (p.shopId !== undefined) db.branch_id = p.shopId;
  if (p.customerId !== undefined) db.customer_id = p.customerId;
  if (p.customerName !== undefined) db.customer_name = p.customerName;
  if (p.paymentDate !== undefined) db.payment_date = p.paymentDate;
  if (p.type !== undefined) db.type = p.type;
  if (p.typeLabel !== undefined) db.type_label = p.typeLabel;
  if (p.referenceId !== undefined) db.reference_id = p.referenceId;
  if (p.amount !== undefined) db.amount = p.amount;
  if (p.paymentMethod !== undefined) db.payment_method = p.paymentMethod;
  if (p.discountAmount !== undefined) db.discount_amount = p.discountAmount;
  if (p.status !== undefined) db.status = p.status;
  if (p.memo !== undefined) db.memo = p.memo;
  if (p.createdAt !== undefined) db.created_at = p.createdAt;
  return db;
}

function fromDbPayment(row: Record<string, any>): Payment {
  return {
    id: row.id,
    shopId: row.branch_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    paymentDate: row.payment_date || '',
    type: row.type || 'other',
    typeLabel: row.type_label || '',
    referenceId: row.reference_id,
    amount: row.amount || 0,
    paymentMethod: row.payment_method || '카드',
    discountAmount: row.discount_amount || 0,
    status: row.status || 'completed',
    memo: row.memo,
    createdAt: row.created_at || now(),
  };
}

function toDbSettings(s: Partial<ShopSettings>): Record<string, any> {
  const db: Record<string, any> = {};
  if (s.id !== undefined) db.id = s.id;
  if (s.name !== undefined) db.name = s.name;
  if (s.type !== undefined) db.type = s.type;
  if (s.phone !== undefined) db.phone = s.phone;
  if (s.address !== undefined) db.address = s.address;
  if (s.businessHours !== undefined) db.business_hours = s.businessHours;
  if (s.holidays !== undefined) db.holidays = s.holidays;
  if (s.naverBooking !== undefined) db.naver_booking = s.naverBooking;
  if (s.kakao !== undefined) db.kakao = s.kakao;
  if (s.smsApiKey !== undefined) db.sms_api_key = s.smsApiKey;
  if (s.smsCallerId !== undefined) db.sms_caller_id = s.smsCallerId;
  if (s.pointRate !== undefined) db.point_rate = s.pointRate;
  if (s.notificationSettings !== undefined) db.notification_settings = s.notificationSettings;
  return db;
}

function fromDbSettings(row: Record<string, any>): ShopSettings {
  return {
    id: row.id,
    name: row.name || '',
    type: row.type || '피부관리실',
    phone: row.phone || '',
    address: row.address || '',
    businessHours: row.business_hours || getDefaultSettings().businessHours,
    holidays: row.holidays || [],
    naverBooking: row.naver_booking || { isConnected: false },
    kakao: row.kakao || { channelConnected: false, openchatConnected: false },
    smsApiKey: row.sms_api_key,
    smsCallerId: row.sms_caller_id,
    pointRate: row.point_rate ?? 1,
    notificationSettings: row.notification_settings || getDefaultSettings().notificationSettings,
  };
}

function toDbMessageTemplate(t: Partial<MessageTemplate> & { shopId?: string }): Record<string, any> {
  const db: Record<string, any> = {};
  if (t.id !== undefined) db.id = t.id;
  if ((t as any).shopId !== undefined) db.branch_id = (t as any).shopId;
  if (t.name !== undefined) db.name = t.name;
  if (t.type !== undefined) db.type = t.type;
  if (t.title !== undefined) db.title = t.title;
  if (t.content !== undefined) db.content = t.content;
  if (t.variables !== undefined) db.variables = t.variables;
  if (t.category !== undefined) db.category = t.category;
  return db;
}

function fromDbMessageTemplate(row: Record<string, any>): MessageTemplate {
  return {
    id: row.id,
    name: row.name || '',
    type: row.type || 'sms',
    title: row.title,
    content: row.content || '',
    variables: row.variables || [],
    category: row.category || '',
  };
}

function toDbMessageHistory(h: Partial<MessageHistory> & { shopId?: string }): Record<string, any> {
  const db: Record<string, any> = {};
  if (h.id !== undefined) db.id = h.id;
  if ((h as any).shopId !== undefined) db.branch_id = (h as any).shopId;
  if (h.type !== undefined) db.type = h.type;
  if (h.templateId !== undefined) db.template_id = h.templateId;
  if (h.templateName !== undefined) db.template_name = h.templateName;
  if (h.title !== undefined) db.title = h.title;
  if (h.content !== undefined) db.content = h.content;
  if (h.recipients !== undefined) db.recipients = h.recipients;
  if (h.successCount !== undefined) db.success_count = h.successCount;
  if (h.failCount !== undefined) db.fail_count = h.failCount;
  if (h.sentAt !== undefined) db.sent_at = h.sentAt;
  if (h.status !== undefined) db.status = h.status;
  if (h.cost !== undefined) db.cost = h.cost;
  return db;
}

function fromDbMessageHistory(row: Record<string, any>): MessageHistory {
  return {
    id: row.id,
    type: row.type || 'sms',
    templateId: row.template_id,
    templateName: row.template_name,
    title: row.title,
    content: row.content || '',
    recipients: row.recipients || 0,
    successCount: row.success_count || 0,
    failCount: row.fail_count || 0,
    sentAt: row.sent_at || now(),
    status: row.status || 'sent',
    cost: row.cost,
  };
}

// ─── 메모리 캐시 ───────────────────────────────────────────────
let _customers: Customer[] | null = null;
let _programs: Program[] | null = null;
let _customerPrograms: CustomerProgram[] | null = null;
let _treatmentLogs: TreatmentLog[] | null = null;
let _products: Product[] | null = null;
let _productSales: ProductSale[] | null = null;
let _payments: Payment[] | null = null;
let _staff: Staff[] | null = null;
let _services: Service[] | null = null;
let _reservations: Reservation[] | null = null;
let _settings: ShopSettings | null = null;
let _messageTemplates: MessageTemplate[] | null = null;
let _messageHistory: MessageHistory[] | null = null;

let _initPromise: Promise<void> | null = null;
let _initialized = false;

// ─── Supabase 데이터 로드 함수들 ────────────────────────────────
async function loadFromSupabase<T>(
  table: string,
  fromDb: (row: Record<string, any>) => T,
): Promise<T[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const branchId = getShopId();
    let query = supabase.from(table).select('*');
    // 슈퍼어드민이거나 branchId가 default_shop이면 전체 조회
    if (branchId !== 'superadmin' && branchId !== 'default_shop') {
      query = query.eq('branch_id', branchId);
    }
    const { data, error } = await query;
    if (error) {
      console.error(`[Store] ${table} 로드 실패:`, error.message);
      return null;
    }
    // 정상 조회된 빈 배열은 운영 지점의 실제 상태다. null로 돌리면 이전 기기의
    // localStorage가 다시 노출되어 삭제된 데이터나 다른 환경의 데이터가 보일 수 있다.
    if (!data) return [];
    return data.map(fromDb);
  } catch (e) {
    console.error(`[Store] ${table} 로드 예외:`, e);
    return null;
  }
}

async function loadSettingsFromSupabase(): Promise<ShopSettings | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const branchId = getShopId();
    let query = supabase.from('shop_settings').select('*');
    if (branchId !== 'superadmin' && branchId !== 'default_shop') {
      query = query.eq('branch_id', branchId);
    }
    const { data, error } = await query.limit(1).single();
    if (error || !data) return null;
    return fromDbSettings(data);
  } catch {
    return null;
  }
}

// ─── 초기화 (앱 시작 시 호출) ──────────────────────────────────
export async function initializeStores(): Promise<void> {
  if (_initialized) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    if (!isSupabaseConfigured) {
      _initialized = true;
      return;
    }

    try {
      const [
        customers, programs, customerPrograms, treatmentLogs,
        products, productSales, payments, staff,
        services, reservations, settings,
        messageTemplates, messageHistory,
      ] = await Promise.all([
        loadFromSupabase('customers', fromDbCustomer),
        loadFromSupabase('programs', fromDbProgram),
        loadFromSupabase('customer_programs', fromDbCustomerProgram),
        loadFromSupabase('treatment_logs', fromDbTreatmentLog),
        loadFromSupabase('products', fromDbProduct),
        loadFromSupabase('product_sales', fromDbProductSale),
        loadFromSupabase('payments', fromDbPayment),
        loadFromSupabase('staff', fromDbStaff),
        loadFromSupabase('services', fromDbService),
        loadFromSupabase('reservations', fromDbReservation),
        loadSettingsFromSupabase(),
        loadFromSupabase('message_templates', fromDbMessageTemplate),
        loadFromSupabase('message_history', fromDbMessageHistory),
      ]);

      if (customers !== null) _customers = customers;
      if (programs !== null) _programs = programs;
      if (customerPrograms !== null) _customerPrograms = customerPrograms;
      if (treatmentLogs !== null) _treatmentLogs = treatmentLogs;
      if (products !== null) _products = products;
      if (productSales !== null) _productSales = productSales;
      if (payments !== null) _payments = payments;
      if (staff !== null) _staff = staff;
      if (services !== null) _services = services;
      if (reservations !== null) _reservations = reservations;
      if (settings !== null) {
        _settings = settings;
        window.dispatchEvent(new CustomEvent('crm:shop-settings-changed', {
          detail: { name: settings.name },
        }));
      }
      if (messageTemplates !== null) _messageTemplates = messageTemplates;
      if (messageHistory !== null) _messageHistory = messageHistory;

      console.log('[Store] Supabase에서 데이터 로드 완료');
      recordSyncTimestamp(); // OfflineBanner "마지막 동기화 N분 전" 갱신
    } catch (e) {
      console.error('[Store] 초기화 실패, localStorage 폴백:', e);
    }

    _initialized = true;
  })();

  return _initPromise;
}

/** 캐시 초기화 (로그아웃/브랜치 전환 시) */
export function resetStoreCache(): void {
  _customers = null;
  _programs = null;
  _customerPrograms = null;
  _treatmentLogs = null;
  _products = null;
  _productSales = null;
  _payments = null;
  _staff = null;
  _services = null;
  _reservations = null;
  _settings = null;
  _messageTemplates = null;
  _messageHistory = null;
  _initialized = false;
  _initPromise = null;
}

// ─── Supabase 비동기 쓰기 헬퍼 (fire-and-forget) ───────────────
function sbInsert(table: string, row: Record<string, any>): void {
  if (!isSupabaseConfigured) return;
  // 슈퍼어드민이면 branch_id를 null로 처리
  const insertRow = isSuperadmin() && row.branch_id === 'superadmin'
    ? { ...row, branch_id: null }
    : row;
  supabase.from(table).insert(insertRow).then(({ error }) => {
    if (error) console.error(`[Store] ${table} insert 실패:`, error.message);
  });
}

function sbUpdate(table: string, id: string, updates: Record<string, any>): void {
  if (!isSupabaseConfigured) return;
  supabase.from(table).update(updates).eq('id', id).then(({ error }) => {
    if (error) console.error(`[Store] ${table} update 실패:`, error.message);
  });
}

function sbDelete(table: string, id: string): void {
  if (!isSupabaseConfigured) return;
  supabase.from(table).delete().eq('id', id).then(({ error }) => {
    if (error) console.error(`[Store] ${table} delete 실패:`, error.message);
  });
}

function sbUpsert(table: string, row: Record<string, any>): void {
  if (!isSupabaseConfigured) return;
  supabase.from(table).upsert(row).then(({ error }) => {
    if (error) console.error(`[Store] ${table} upsert 실패:`, error.message);
  });
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════
export const CustomerStore = {
  getAll(): Customer[] {
    if (_customers !== null) return _customers;
    // 캐시 미로드 → localStorage 폴백
    const stored = getList<Customer>(shopKey('customers'));
    if (stored.length > 0) { _customers = stored; return stored; }
    _customers = [];
    return [];
  },

  getById(id: string): Customer | undefined {
    return this.getAll().find(c => c.id === id);
  },

  save(data: Omit<Customer, 'id' | 'shopId' | 'registeredAt' | 'totalVisits' | 'totalSpent'>): Customer {
    const all = this.getAll().filter(c => !c.id.startsWith('sample_'));
    const customer: Customer = {
      ...data,
      id: genId(),
      shopId: getShopId(),
      totalVisits: 0,
      totalSpent: 0,
      registeredAt: now(),
      tags: data.tags ?? [],
      isActive: data.isActive ?? true,
    };
    const updated = [...all, customer];
    _customers = updated;
    saveList(shopKey('customers'), updated);
    sbInsert('customers', toDbCustomer(customer));
    return customer;
  },

  update(id: string, updates: Partial<Customer>): Customer | null {
    let all = this.getAll();
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    _customers = all;
    saveList(shopKey('customers'), all);
    sbUpdate('customers', id, toDbCustomer(updates));
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(c => c.id !== id);
    _customers = all;
    saveList(shopKey('customers'), all);
    sbDelete('customers', id);
  },

  incrementVisit(id: string, amount: number): void {
    const customer = this.getAll().find(c => c.id === id);
    if (!customer || customer.id.startsWith('sample_')) return;
    this.update(id, {
      totalVisits: (customer.totalVisits || 0) + 1,
      totalSpent: (customer.totalSpent || 0) + amount,
      lastVisitDate: today(),
    });
  },
};

// ═══════════════════════════════════════════════════════════════
// PROGRAMS (시술 프로그램 정의)
// ═══════════════════════════════════════════════════════════════
export const ProgramStore = {
  getAll(): Program[] {
    if (_programs !== null) return _programs;
    const stored = getList<Program>(shopKey('programs'));
    if (stored.length > 0) { _programs = stored; return stored; }
    _programs = [];
    return [];
  },

  getById(id: string): Program | undefined {
    return this.getAll().find(p => p.id === id);
  },

  save(data: Omit<Program, 'id' | 'shopId' | 'createdAt'>): Program {
    const all = this.getAll().filter(p => !p.id.startsWith('sample_'));
    const program: Program = {
      id: genId(),
      shopId: getShopId(),
      createdAt: now(),
      ...data,
    };
    const updated = [...all, program];
    _programs = updated;
    saveList(shopKey('programs'), updated);
    sbInsert('programs', toDbProgram(program));
    return program;
  },

  update(id: string, updates: Partial<Program>): Program | null {
    let all = this.getAll();
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    _programs = all;
    saveList(shopKey('programs'), all);
    sbUpdate('programs', id, toDbProgram(updates));
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(p => p.id !== id);
    _programs = all;
    saveList(shopKey('programs'), all);
    sbDelete('programs', id);
  },
};

// ═══════════════════════════════════════════════════════════════
// CUSTOMER PROGRAMS (고객별 등록 프로그램)
// ═══════════════════════════════════════════════════════════════
export const CustomerProgramStore = {
  getAll(): CustomerProgram[] {
    if (_customerPrograms !== null) return _customerPrograms;
    const stored = getList<CustomerProgram>(shopKey('customer_programs'));
    if (stored.length > 0) { _customerPrograms = stored; return stored; }
    return [];
  },

  getByCustomer(customerId: string): CustomerProgram[] {
    return this.getAll().filter(cp => cp.customerId === customerId);
  },

  getActive(customerId: string): CustomerProgram[] {
    return this.getByCustomer(customerId).filter(cp => !cp.isCompleted);
  },

  getById(id: string): CustomerProgram | undefined {
    return this.getAll().find(cp => cp.id === id);
  },

  save(data: Omit<CustomerProgram, 'id' | 'shopId' | 'usedSessions' | 'isCompleted' | 'createdAt'>): CustomerProgram {
    const all = this.getAll();
    const cp: CustomerProgram = {
      id: genId(),
      shopId: getShopId(),
      usedSessions: 0,
      isCompleted: false,
      createdAt: now(),
      ...data,
    };
    const updated = [...all, cp];
    _customerPrograms = updated;
    saveList(shopKey('customer_programs'), updated);
    sbInsert('customer_programs', toDbCustomerProgram(cp));

    // 결제 기록도 자동 생성
    PaymentStore.save({
      customerId: cp.customerId,
      customerName: cp.customerName,
      paymentDate: cp.purchaseDate,
      type: 'program',
      typeLabel: '프로그램 구매',
      referenceId: cp.id,
      amount: cp.pricePaid,
      paymentMethod: cp.paymentMethod,
      discountAmount: 0,
      status: 'completed',
      memo: cp.programName,
    });

    return cp;
  },

  useSession(id: string, sessionsUsed: number = 1): CustomerProgram | null {
    const all = this.getAll();
    const idx = all.findIndex(cp => cp.id === id);
    if (idx === -1) return null;
    const cp = all[idx];
    // sessionsUsed에 음수를 넘기면 회차 복구(취소/수정 시). 0 미만으로는 내려가지 않음.
    const newUsed = Math.max(0, cp.usedSessions + sessionsUsed);
    const isCompleted = cp.totalSessions !== null && newUsed >= cp.totalSessions;
    all[idx] = { ...cp, usedSessions: newUsed, isCompleted };
    _customerPrograms = all;
    saveList(shopKey('customer_programs'), all);
    sbUpdate('customer_programs', id, { used_sessions: newUsed, is_completed: isCompleted });
    return all[idx];
  },

  update(id: string, updates: Partial<CustomerProgram>): CustomerProgram | null {
    const all = this.getAll();
    const idx = all.findIndex(cp => cp.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    _customerPrograms = all;
    saveList(shopKey('customer_programs'), all);
    sbUpdate('customer_programs', id, toDbCustomerProgram(updates));
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(cp => cp.id !== id);
    _customerPrograms = all;
    saveList(shopKey('customer_programs'), all);
    sbDelete('customer_programs', id);
  },
};

// ═══════════════════════════════════════════════════════════════
// TREATMENT LOGS (시술 기록)
// ═══════════════════════════════════════════════════════════════
export const TreatmentLogStore = {
  getAll(): TreatmentLog[] {
    if (_treatmentLogs !== null) return _treatmentLogs;
    const stored = getList<TreatmentLog>(shopKey('treatment_logs'));
    if (stored.length > 0) { _treatmentLogs = stored; return stored; }
    return [];
  },

  getByCustomer(customerId: string): TreatmentLog[] {
    return this.getAll()
      .filter(t => t.customerId === customerId)
      .sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate));
  },

  getByDate(date: string): TreatmentLog[] {
    return this.getAll().filter(t => t.treatmentDate === date);
  },

  save(data: Omit<TreatmentLog, 'id' | 'shopId' | 'createdAt'>): TreatmentLog {
    const all = this.getAll();
    const log: TreatmentLog = {
      id: genId(),
      shopId: getShopId(),
      createdAt: now(),
      ...data,
    };
    const updated = [...all, log];
    _treatmentLogs = updated;
    saveList(shopKey('treatment_logs'), updated);
    sbInsert('treatment_logs', toDbTreatmentLog(log));

    // 프로그램에서 회차 차감
    if (data.customerProgramId) {
      CustomerProgramStore.useSession(data.customerProgramId, data.sessionsUsed);
    }

    // 고객 방문 횟수 업데이트
    CustomerStore.incrementVisit(data.customerId, 0);

    return log;
  },

  update(id: string, updates: Partial<TreatmentLog>): TreatmentLog | null {
    const all = this.getAll();
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) return null;
    const prev = all[idx];
    const next = { ...prev, ...updates };
    all[idx] = next;
    _treatmentLogs = all;
    saveList(shopKey('treatment_logs'), all);
    sbUpdate('treatment_logs', id, toDbTreatmentLog(updates));

    // 프로그램 회차 정합성: 이전 연결을 되돌리고 새 연결을 차감 (수정 시 회차가 어긋나지 않도록)
    const prevProg = prev.customerProgramId, prevUsed = prev.sessionsUsed || 0;
    const nextProg = next.customerProgramId, nextUsed = next.sessionsUsed || 0;
    if (prevProg === nextProg) {
      const delta = nextUsed - prevUsed;
      if (prevProg && delta !== 0) CustomerProgramStore.useSession(prevProg, delta);
    } else {
      if (prevProg) CustomerProgramStore.useSession(prevProg, -prevUsed);
      if (nextProg) CustomerProgramStore.useSession(nextProg, nextUsed);
    }
    return next;
  },

  delete(id: string): void {
    const target = this.getAll().find(t => t.id === id);
    // 삭제 시 차감했던 프로그램 회차를 복구 (직원 실수 삭제로 고객 회차가 사라지지 않도록)
    if (target?.customerProgramId) {
      CustomerProgramStore.useSession(target.customerProgramId, -(target.sessionsUsed || 0));
    }
    const all = this.getAll().filter(t => t.id !== id);
    _treatmentLogs = all;
    saveList(shopKey('treatment_logs'), all);
    sbDelete('treatment_logs', id);
  },
};

// ═══════════════════════════════════════════════════════════════
// PRODUCTS (제품)
// ═══════════════════════════════════════════════════════════════
export const ProductStore = {
  getAll(): Product[] {
    if (_products !== null) return _products;
    const stored = getList<Product>(shopKey('products'));
    if (stored.length > 0) { _products = stored; return stored; }
    _products = [];
    return [];
  },

  getById(id: string): Product | undefined {
    return this.getAll().find(p => p.id === id);
  },

  save(data: Omit<Product, 'id' | 'shopId'>): Product {
    const all = this.getAll().filter(p => !p.id.startsWith('sample_'));
    const product: Product = {
      id: genId(),
      shopId: getShopId(),
      ...data,
    };
    const updated = [...all, product];
    _products = updated;
    saveList(shopKey('products'), updated);
    sbInsert('products', toDbProduct(product));
    return product;
  },

  update(id: string, updates: Partial<Product>): Product | null {
    let all = this.getAll();
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    _products = all;
    saveList(shopKey('products'), all);
    sbUpdate('products', id, toDbProduct(updates));
    return all[idx];
  },

  adjustStock(id: string, quantity: number): void {
    const product = this.getAll().find(p => p.id === id);
    if (!product || product.id.startsWith('sample_')) return;
    this.update(id, { stock: Math.max(0, product.stock - quantity) });
  },

  delete(id: string): void {
    const all = this.getAll().filter(p => p.id !== id);
    _products = all;
    saveList(shopKey('products'), all);
    sbDelete('products', id);
  },
};

// ═══════════════════════════════════════════════════════════════
// PRODUCT SALES (제품 판매)
// ═══════════════════════════════════════════════════════════════
export const ProductSaleStore = {
  getAll(): ProductSale[] {
    if (_productSales !== null) return _productSales;
    const stored = getList<ProductSale>(shopKey('product_sales'));
    if (stored.length > 0) { _productSales = stored; return stored; }
    _productSales = [];
    return [];
  },

  getByDate(date: string): ProductSale[] {
    return this.getAll().filter(s => s.saleDate === date);
  },

  getByMonth(yearMonth: string): ProductSale[] {
    return this.getAll().filter(s => s.saleDate.startsWith(yearMonth));
  },

  save(data: Omit<ProductSale, 'id' | 'shopId' | 'createdAt'>): ProductSale {
    const all = this.getAll();
    const sale: ProductSale = {
      id: genId(),
      shopId: getShopId(),
      createdAt: now(),
      ...data,
    };
    const updated = [...all, sale];
    _productSales = updated;
    saveList(shopKey('product_sales'), updated);
    sbInsert('product_sales', toDbProductSale(sale));

    // 재고 차감
    if (data.productId) {
      ProductStore.adjustStock(data.productId, data.quantity);
    }

    // 결제 기록 자동 생성
    PaymentStore.save({
      customerId: data.customerId,
      customerName: data.customerName,
      paymentDate: data.saleDate,
      type: 'product',
      typeLabel: '제품 판매',
      referenceId: sale.id,
      amount: data.totalPrice,
      paymentMethod: data.paymentMethod,
      discountAmount: 0,
      status: 'completed',
      memo: `${data.productName} x${data.quantity}`,
    });

    return sale;
  },

  delete(id: string): void {
    const sale = this.getAll().find(item => item.id === id);
    if (sale?.productId) {
      // 판매 취소 시 차감했던 재고를 복구한다. adjustStock은 전달 수량을 빼므로 음수로 전달.
      ProductStore.adjustStock(sale.productId, -sale.quantity);
    }
    const linkedPayments = PaymentStore.getAll().filter(payment => payment.referenceId === id);
    linkedPayments.forEach(payment => PaymentStore.delete(payment.id));
    const all = this.getAll().filter(s => s.id !== id);
    _productSales = all;
    saveList(shopKey('product_sales'), all);
    sbDelete('product_sales', id);
  },
};

// ═══════════════════════════════════════════════════════════════
// PAYMENTS (통합 결제 기록)
// ═══════════════════════════════════════════════════════════════
export const PaymentStore = {
  getAll(): Payment[] {
    if (_payments !== null) return _payments;
    const stored = getList<Payment>(shopKey('payments'));
    if (stored.length > 0) { _payments = stored; return stored; }
    _payments = [];
    return [];
  },

  getByDate(date: string): Payment[] {
    return this.getAll().filter(p => p.paymentDate === date);
  },

  getByMonth(yearMonth: string): Payment[] {
    return this.getAll().filter(p => p.paymentDate.startsWith(yearMonth));
  },

  getByDateRange(start: string, end: string): Payment[] {
    return this.getAll().filter(p => p.paymentDate >= start && p.paymentDate <= end);
  },

  save(data: Omit<Payment, 'id' | 'shopId' | 'createdAt'>): Payment {
    const all = this.getAll().filter(p => !p.id.startsWith('sample_'));
    const payment: Payment = {
      id: genId(),
      shopId: getShopId(),
      createdAt: now(),
      ...data,
    };
    const updated = [...all, payment];
    _payments = updated;
    saveList(shopKey('payments'), updated);
    sbInsert('payments', toDbPayment(payment));

    // Update customer totalSpent
    if (data.customerId && data.status === 'completed') {
      const customer = CustomerStore.getById(data.customerId);
      if (customer && !customer.id.startsWith('sample_')) {
        CustomerStore.update(data.customerId, {
          totalSpent: (customer.totalSpent || 0) + data.amount,
        });
      }
    }

    return payment;
  },

  update(id: string, updates: Partial<Payment>): Payment | null {
    const all = this.getAll();
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const prev = all[idx];
    const next = { ...prev, ...updates };
    all[idx] = next;
    _payments = all;
    saveList(shopKey('payments'), all);
    sbUpdate('payments', id, toDbPayment(updates));

    // 고객 누적 결제액 정합성: 이전 기여분 빼고 새 기여분 더함 (금액/상태/고객 변경 반영)
    const adjust = (customerId: string | undefined, amt: number) => {
      if (!customerId || amt === 0) return;
      const customer = CustomerStore.getById(customerId);
      if (customer && !customer.id.startsWith('sample_')) {
        CustomerStore.update(customerId, { totalSpent: Math.max(0, (customer.totalSpent || 0) + amt) });
      }
    };
    const prevContrib = prev.status === 'completed' ? prev.amount : 0;
    const nextContrib = next.status === 'completed' ? next.amount : 0;
    if (prev.customerId === next.customerId) {
      adjust(next.customerId, nextContrib - prevContrib);
    } else {
      adjust(prev.customerId, -prevContrib);
      adjust(next.customerId, nextContrib);
    }
    return next;
  },

  delete(id: string): void {
    const target = this.getAll().find(p => p.id === id);
    // 완료 결제를 삭제하면 고객 누적 결제액에서 차감(save의 역연산으로 정합성 유지)
    if (target && target.customerId && target.status === 'completed') {
      const customer = CustomerStore.getById(target.customerId);
      if (customer && !customer.id.startsWith('sample_')) {
        CustomerStore.update(target.customerId, {
          totalSpent: Math.max(0, (customer.totalSpent || 0) - target.amount),
        });
      }
    }
    const all = this.getAll().filter(p => p.id !== id);
    _payments = all;
    saveList(shopKey('payments'), all);
    sbDelete('payments', id);
  },

  /** 기간별 매출 집계 */
  summarize(start: string, end: string) {
    const payments = this.getByDateRange(start, end).filter(p => p.status === 'completed');
    const treatmentRevenue = payments
      .filter(p => p.type === 'program' || p.type === 'single_treatment')
      .reduce((sum, p) => sum + p.amount, 0);
    const productRevenue = payments
      .filter(p => p.type === 'product')
      .reduce((sum, p) => sum + p.amount, 0);
    return {
      treatmentRevenue,
      productRevenue,
      totalRevenue: treatmentRevenue + productRevenue,
      paymentCount: payments.length,
    };
  },

  /** 일별 집계 (최근 N일) */
  getDailyData(days: number = 30) {
    const result: { date: string; treatment: number; product: number; total: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayPayments = this.getByDate(dateStr).filter(p => p.status === 'completed');
      result.push({
        date: dateStr,
        treatment: dayPayments.filter(p => p.type === 'program' || p.type === 'single_treatment').reduce((s, p) => s + p.amount, 0),
        product: dayPayments.filter(p => p.type === 'product').reduce((s, p) => s + p.amount, 0),
        total: dayPayments.reduce((s, p) => s + p.amount, 0),
      });
    }
    return result;
  },
};

// ═══════════════════════════════════════════════════════════════
// STAFF
// ═══════════════════════════════════════════════════════════════
export const StaffStore = {
  getAll(): Staff[] {
    if (_staff !== null) return _staff;
    const stored = getList<Staff>(shopKey('staff'));
    if (stored.length > 0) { _staff = stored; return stored; }
    _staff = [];
    return [];
  },

  save(data: Omit<Staff, 'id' | 'shopId'>): Staff {
    const all = this.getAll().filter(s => !s.id.startsWith('sample_'));
    const staff: Staff = { id: genId(), shopId: getShopId(), ...data };
    const updated = [...all, staff];
    _staff = updated;
    saveList(shopKey('staff'), updated);
    sbInsert('staff', toDbStaff(staff));
    return staff;
  },

  update(id: string, updates: Partial<Staff>): Staff | null {
    const all = this.getAll();
    const idx = all.findIndex(s => s.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    _staff = all;
    saveList(shopKey('staff'), all);
    sbUpdate('staff', id, toDbStaff(updates));
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(s => s.id !== id);
    _staff = all;
    saveList(shopKey('staff'), all);
    sbDelete('staff', id);
  },
};

// ═══════════════════════════════════════════════════════════════
// SERVICES (시술 항목)
// ═══════════════════════════════════════════════════════════════
export const ServiceStore = {
  getAll(): Service[] {
    if (_services !== null) return _services;
    const stored = getList<Service>(shopKey('services'));
    if (stored.length > 0) { _services = stored; return stored; }
    _services = [];
    return [];
  },

  getById(id: string): Service | undefined {
    return this.getAll().find(s => s.id === id);
  },

  save(data: Omit<Service, 'id'>): Service {
    const all = this.getAll().filter(s => !s.id.startsWith('sample_'));
    const service: Service = { id: genId(), ...data };
    const updated = [...all, service];
    _services = updated;
    saveList(shopKey('services'), updated);
    sbInsert('services', toDbService({ ...service, shopId: getShopId() } as any));
    return service;
  },

  update(id: string, updates: Partial<Service>): Service | null {
    const all = this.getAll();
    const idx = all.findIndex(s => s.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    _services = all;
    saveList(shopKey('services'), all);
    sbUpdate('services', id, toDbService(updates));
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(s => s.id !== id);
    _services = all;
    saveList(shopKey('services'), all);
    sbDelete('services', id);
  },
};

// ═══════════════════════════════════════════════════════════════
// RESERVATIONS (예약)
// ═══════════════════════════════════════════════════════════════
export const ReservationStore = {
  getAll(): Reservation[] {
    if (_reservations !== null) return _reservations;
    const stored = getList<Reservation>(shopKey('reservations'));
    if (stored.length > 0) { _reservations = stored; return stored; }
    _reservations = [];
    return [];
  },

  getByDate(date: string): Reservation[] {
    return this.getAll().filter(r => r.date === date);
  },

  getByDateRange(start: string, end: string): Reservation[] {
    return this.getAll().filter(r => r.date >= start && r.date <= end);
  },

  save(data: Omit<Reservation, 'id'>): Reservation {
    const all = this.getAll().filter(r => !r.id.startsWith('sample_'));
    const reservation: Reservation = { id: genId(), ...data };
    const updated = [...all, reservation];
    _reservations = updated;
    saveList(shopKey('reservations'), updated);
    sbInsert('reservations', toDbReservation({ ...reservation, shopId: getShopId() } as any));
    return reservation;
  },

  update(id: string, updates: Partial<Reservation>): Reservation | null {
    const all = this.getAll();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    _reservations = all;
    saveList(shopKey('reservations'), all);
    sbUpdate('reservations', id, toDbReservation(updates));
    return all[idx];
  },

  updateStatus(id: string, status: Reservation['status']): Reservation | null {
    const reservation = this.getAll().find(r => r.id === id);
    const previousStatus = reservation?.status;
    const result = this.update(id, { status });

    // 완료 상태를 반복 저장해도 방문 수가 중복 증가하지 않도록 상태 전환 때만 반영한다.
    if (reservation?.customerId && previousStatus !== status) {
      const customer = CustomerStore.getById(reservation.customerId);
      if (customer && !customer.id.startsWith('sample_')) {
        if (status === 'completed') {
          CustomerStore.update(reservation.customerId, {
            lastVisitDate: !customer.lastVisitDate || reservation.date > customer.lastVisitDate
              ? reservation.date
              : customer.lastVisitDate,
            totalVisits: (customer.totalVisits || 0) + 1,
          });
        } else if (previousStatus === 'completed') {
          CustomerStore.update(reservation.customerId, {
            totalVisits: Math.max(0, (customer.totalVisits || 0) - 1),
          });
        }
      }
    }

    return result;
  },

  delete(id: string): void {
    const reservation = this.getAll().find(r => r.id === id);
    if (reservation?.status === 'completed' && reservation.customerId) {
      const customer = CustomerStore.getById(reservation.customerId);
      if (customer && !customer.id.startsWith('sample_')) {
        CustomerStore.update(reservation.customerId, {
          totalVisits: Math.max(0, (customer.totalVisits || 0) - 1),
        });
      }
    }
    const all = this.getAll().filter(r => r.id !== id);
    _reservations = all;
    saveList(shopKey('reservations'), all);
    sbDelete('reservations', id);
  },
};

// ═══════════════════════════════════════════════════════════════
// SETTINGS (매장 설정)
// ═══════════════════════════════════════════════════════════════
export const SettingsStore = {
  get(): ShopSettings {
    if (_settings !== null) return _settings;
    try {
      const raw = localStorage.getItem(shopKey('settings'));
      if (raw) {
        const parsed = JSON.parse(raw);
        _settings = parsed;
        return parsed;
      }
    } catch {}
    const defaults = getDefaultSettings();
    _settings = defaults;
    return defaults;
  },

  save(updates: Partial<ShopSettings>): ShopSettings {
    const current = this.get();
    const updated = { ...current, ...updates };
    _settings = updated;
    safeSetItem(shopKey('settings'), JSON.stringify(updated));

    if (isSupabaseConfigured) {
      const dbRow = { ...toDbSettings(updated), branch_id: getShopId() };
      sbUpsert('shop_settings', dbRow);
    }

    window.dispatchEvent(new CustomEvent('crm:shop-settings-changed', {
      detail: { name: updated.name },
    }));

    return updated;
  },
};

// ═══════════════════════════════════════════════════════════════
// MESSAGE TEMPLATES (메시지 템플릿)
// ═══════════════════════════════════════════════════════════════
export const MessageTemplateStore = {
  getAll(): MessageTemplate[] {
    if (_messageTemplates !== null) return _messageTemplates;
    const stored = getList<MessageTemplate>(shopKey('msg_templates'));
    if (stored.length > 0) { _messageTemplates = stored; return stored; }
    _messageTemplates = [];
    return [];
  },

  save(data: Omit<MessageTemplate, 'id'>): MessageTemplate {
    const all = this.getAll().filter(t => !t.id.startsWith('sample_'));
    const template: MessageTemplate = { id: genId(), ...data };
    const updated = [...all, template];
    _messageTemplates = updated;
    saveList(shopKey('msg_templates'), updated);
    sbInsert('message_templates', toDbMessageTemplate({ ...template, shopId: getShopId() } as any));
    return template;
  },

  update(id: string, updates: Partial<MessageTemplate>): MessageTemplate | null {
    const all = this.getAll();
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    _messageTemplates = all;
    saveList(shopKey('msg_templates'), all);
    sbUpdate('message_templates', id, toDbMessageTemplate(updates));
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(t => t.id !== id);
    _messageTemplates = all;
    saveList(shopKey('msg_templates'), all);
    sbDelete('message_templates', id);
  },
};

// ═══════════════════════════════════════════════════════════════
// MESSAGE HISTORY (발송 이력)
// ═══════════════════════════════════════════════════════════════
export const MessageHistoryStore = {
  getAll(): MessageHistory[] {
    if (_messageHistory !== null) return _messageHistory;
    const stored = getList<MessageHistory>(shopKey('msg_history'));
    if (stored.length > 0) { _messageHistory = stored; return stored; }
    _messageHistory = [];
    return [];
  },

  save(data: Omit<MessageHistory, 'id'>): MessageHistory {
    const all = this.getAll();
    const history: MessageHistory = { id: genId(), ...data };
    const updated = [history, ...all];
    _messageHistory = updated;
    saveList(shopKey('msg_history'), updated);
    sbInsert('message_history', toDbMessageHistory({ ...history, shopId: getShopId() } as any));
    return history;
  },
};

// ═══════════════════════════════════════════════════════════════
// 샘플 데이터 (처음 시작할 때 보여주는 예시 데이터)
// ═══════════════════════════════════════════════════════════════
function getSampleCustomers(): Customer[] {
  const shopId = getShopId();
  return [
    { id: 'sample_c1', shopId, name: '김지수', phone: '010-1234-5678', gender: '여성', grade: 'VIP', skinType: '건성', totalVisits: 24, totalSpent: 2400000, lastVisitDate: today(), registeredAt: '2024-01-15T00:00:00Z', tags: ['VIP', '단골'], isActive: true, referralSource: '네이버' },
    { id: 'sample_c2', shopId, name: '이민지', phone: '010-2345-6789', gender: '여성', grade: '골드', skinType: '복합성', totalVisits: 12, totalSpent: 1200000, lastVisitDate: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0], registeredAt: '2024-03-10T00:00:00Z', tags: ['단골'], isActive: true },
    { id: 'sample_c3', shopId, name: '박서연', phone: '010-3456-7890', gender: '여성', grade: '일반', skinType: '지성', totalVisits: 5, totalSpent: 500000, lastVisitDate: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0], registeredAt: '2024-06-01T00:00:00Z', tags: [], isActive: true },
    { id: 'sample_c4', shopId, name: '최예은', phone: '010-4567-8901', gender: '여성', grade: '신규', skinType: '민감성', totalVisits: 1, totalSpent: 120000, lastVisitDate: today(), registeredAt: new Date().toISOString(), tags: ['신규'], isActive: true, referralSource: '지인 소개' },
  ];
}

function getSamplePrograms(): Program[] {
  const shopId = getShopId();
  return [
    { id: 'sample_p1', shopId, name: '기본 피부관리 10회권', category: '피부관리', totalSessions: 10, validityDays: 180, price: 800000, costPrice: 300000, description: '기본 피부 클렌징 + 관리', color: '#1a3a8f', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sample_p2', shopId, name: '프리미엄 피부관리 10회권', category: '피부관리', totalSessions: 10, validityDays: 180, price: 1200000, costPrice: 450000, description: '프리미엄 케어 + 앰플 포함', color: '#7c3aed', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sample_p3', shopId, name: '젤네일 10회권', category: '네일', totalSessions: 10, validityDays: 365, price: 350000, costPrice: 120000, description: '젤네일 손 10회', color: '#dc2626', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
    { id: 'sample_p4', shopId, name: '림프 마사지 5회권', category: '마사지', totalSessions: 5, validityDays: 90, price: 300000, costPrice: 100000, color: '#059669', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
  ];
}

function getSampleProducts(): Product[] {
  const shopId = getShopId();
  return [
    { id: 'sample_pr1', shopId, name: '히알루론산 세럼 50ml', category: '세럼', brand: '트로이아르케', price: 65000, cost: 25000, stock: 15, minStock: 5, unit: '개', isActive: true },
    { id: 'sample_pr2', shopId, name: '수분 크림 50ml', category: '크림', brand: '트로이아르케', price: 78000, cost: 30000, stock: 8, minStock: 5, unit: '개', isActive: true },
    { id: 'sample_pr3', shopId, name: '폼 클렌저 150ml', category: '클렌저', brand: '트로이아르케', price: 42000, cost: 15000, stock: 3, minStock: 5, unit: '개', isActive: true },
    { id: 'sample_pr4', shopId, name: 'SPF50 선크림 50ml', category: '선케어', brand: '트로이아르케', price: 55000, cost: 20000, stock: 12, minStock: 5, unit: '개', isActive: true },
  ];
}

function getSampleStaff(): Staff[] {
  const shopId = getShopId();
  return [
    { id: 'sample_s1', shopId, name: '김원장', role: '원장', phone: '010-1111-2222', specialty: ['피부관리', '마사지'], color: '#1a3a8f', isActive: true, hireDate: '2020-01-01' },
    { id: 'sample_s2', shopId, name: '이소희', role: '직원', phone: '010-3333-4444', specialty: ['네일', '피부관리'], color: '#7c3aed', isActive: true, hireDate: '2022-03-01' },
  ];
}

function getSamplePayments(): Payment[] {
  const shopId = getShopId();
  const payments: Payment[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0) continue;

    const count = Math.floor(Math.random() * 4) + 1;
    for (let j = 0; j < count; j++) {
      const isProduct = Math.random() < 0.2;
      payments.push({
        id: `sample_pay_${i}_${j}`,
        shopId,
        customerId: `sample_c${(j % 4) + 1}`,
        customerName: ['김지수', '이민지', '박서연', '최예은'][j % 4],
        paymentDate: dateStr,
        type: isProduct ? 'product' : 'program',
        typeLabel: isProduct ? '제품 판매' : '프로그램 구매',
        amount: isProduct ? [42000, 65000, 78000][Math.floor(Math.random() * 3)] : [80000, 120000, 60000][Math.floor(Math.random() * 3)],
        paymentMethod: ['카드', '현금', '계좌이체'][Math.floor(Math.random() * 3)] as Payment['paymentMethod'],
        discountAmount: 0,
        status: 'completed',
        createdAt: d.toISOString(),
      });
    }
  }
  return payments;
}

function getSampleServices(): Service[] {
  return [
    { id: 'sample_sv1', name: '기본 피부관리', category: '피부관리', duration: 90, price: 80000, description: '클렌징 + 각질 + 수분케어', isActive: true },
    { id: 'sample_sv2', name: '프리미엄 피부관리', category: '피부관리', duration: 120, price: 120000, description: '기본관리 + 앰플 + 마스크팩', isActive: true },
    { id: 'sample_sv3', name: '메디컬 스킨케어', category: '피부관리', duration: 90, price: 150000, description: '의료기기 활용 피부케어', isActive: true },
    { id: 'sample_sv4', name: '림프 마사지', category: '마사지', duration: 60, price: 70000, isActive: true },
    { id: 'sample_sv5', name: '등·어깨 마사지', category: '마사지', duration: 60, price: 65000, isActive: true },
    { id: 'sample_sv6', name: '젤네일 (손)', category: '네일', duration: 60, price: 45000, isActive: true },
    { id: 'sample_sv7', name: '젤네일 (발)', category: '네일', duration: 60, price: 40000, isActive: true },
    { id: 'sample_sv8', name: '네일아트 추가', category: '네일', duration: 30, price: 15000, isActive: true },
    { id: 'sample_sv9', name: '왁싱 (눈썹)', category: '왁싱', duration: 30, price: 20000, isActive: true },
    { id: 'sample_sv10', name: '왁싱 (팔/다리)', category: '왁싱', duration: 45, price: 35000, isActive: true },
  ];
}

function getSampleReservations(): Reservation[] {
  const staff = getSampleStaff();
  const customers = getSampleCustomers();
  const services = getSampleServices();
  const todayStr = today();
  const d = new Date();
  const tomorrowStr = new Date(d.getTime() + 86400000).toISOString().split('T')[0];

  return [
    { id: 'sample_r1', customerId: customers[0].id, customerName: customers[0].name, customerPhone: customers[0].phone, staffId: staff[0].id, staffName: staff[0].name, services: [{ serviceId: services[1].id, serviceName: services[1].name, price: services[1].price, duration: services[1].duration }], date: todayStr, startTime: '10:00', endTime: '12:00', status: 'confirmed', source: 'naver', totalPrice: 120000 },
    { id: 'sample_r2', customerId: customers[1].id, customerName: customers[1].name, customerPhone: customers[1].phone, staffId: staff[1].id, staffName: staff[1].name, services: [{ serviceId: services[2].id, serviceName: services[2].name, price: services[2].price, duration: services[2].duration }], date: todayStr, startTime: '11:00', endTime: '12:30', status: 'confirmed', source: 'manual', totalPrice: 150000 },
    { id: 'sample_r3', customerId: customers[2].id, customerName: customers[2].name, customerPhone: customers[2].phone, staffId: staff[0].id, staffName: staff[0].name, services: [{ serviceId: services[5].id, serviceName: services[5].name, price: services[5].price, duration: services[5].duration }], date: todayStr, startTime: '13:00', endTime: '14:00', status: 'pending', source: 'kakao', totalPrice: 45000 },
    { id: 'sample_r4', customerId: customers[3].id, customerName: customers[3].name, customerPhone: customers[3].phone, staffId: staff[1].id, staffName: staff[1].name, services: [{ serviceId: services[0].id, serviceName: services[0].name, price: services[0].price, duration: services[0].duration }], date: todayStr, startTime: '14:00', endTime: '15:30', status: 'confirmed', source: 'phone', totalPrice: 80000 },
    { id: 'sample_r5', customerId: customers[0].id, customerName: customers[0].name, customerPhone: customers[0].phone, staffId: staff[1].id, staffName: staff[1].name, services: [{ serviceId: services[3].id, serviceName: services[3].name, price: services[3].price, duration: services[3].duration }], date: tomorrowStr, startTime: '10:00', endTime: '11:00', status: 'confirmed', source: 'naver', totalPrice: 70000 },
    { id: 'sample_r6', customerId: customers[2].id, customerName: customers[2].name, customerPhone: customers[2].phone, staffId: staff[0].id, staffName: staff[0].name, services: [{ serviceId: services[0].id, serviceName: services[0].name, price: services[0].price, duration: services[0].duration }], date: tomorrowStr, startTime: '13:00', endTime: '14:30', status: 'confirmed', source: 'manual', totalPrice: 80000 },
  ];
}

function getDefaultSettings(): ShopSettings {
  return {
    id: 'default',
    name: '내 에스테틱 샵',
    type: '피부관리실',
    phone: '',
    address: '',
    businessHours: {
      월: { open: '10:00', close: '20:00', isOff: false },
      화: { open: '10:00', close: '20:00', isOff: false },
      수: { open: '10:00', close: '20:00', isOff: false },
      목: { open: '10:00', close: '20:00', isOff: false },
      금: { open: '10:00', close: '21:00', isOff: false },
      토: { open: '10:00', close: '18:00', isOff: false },
      일: { open: '10:00', close: '18:00', isOff: true },
    },
    holidays: [],
    naverBooking: { isConnected: false },
    kakao: { channelConnected: false, openchatConnected: false },
    pointRate: 1,
    notificationSettings: {
      reservationConfirm: true,
      reservationReminder: true,
      birthdayMessage: false,
      novisitMessage: false,
    },
  };
}

function getSampleMessageTemplates(): MessageTemplate[] {
  return [
    { id: 'sample_mt1', name: '예약 확인', type: 'sms', content: '[뷰티샵] {고객명}님, {날짜} {시간} 예약이 확인되었습니다. 문의: {전화번호}', variables: ['고객명', '날짜', '시간', '전화번호'], category: '예약' },
    { id: 'sample_mt2', name: '예약 리마인더', type: 'sms', content: '[뷰티샵] {고객명}님, 내일 {시간} 예약 잊지 마세요! 변경/취소: {전화번호}', variables: ['고객명', '시간', '전화번호'], category: '예약' },
    { id: 'sample_mt3', name: '생일 축하', type: 'kakao-channel', content: '{고객명}님, 생일을 진심으로 축하드립니다!\n이번 달 방문 시 10% 할인 혜택을 드립니다.', variables: ['고객명'], category: '이벤트' },
    { id: 'sample_mt4', name: '미방문 고객 케어', type: 'kakao-channel', content: '{고객명}님, 마지막 방문 후 {기간}이 지났네요.\n다시 뵙고 싶습니다! 재방문 시 5,000포인트 드립니다.', variables: ['고객명', '기간'], category: '리텐션' },
    { id: 'sample_mt5', name: '시술 후 케어 안내', type: 'sms', content: '[뷰티샵] {고객명}님, 오늘 시술 감사합니다. 귀가 후 수분크림을 충분히 발라주세요.', variables: ['고객명'], category: '케어' },
  ];
}
