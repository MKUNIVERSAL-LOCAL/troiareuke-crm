/**
 * 트로이아르케 CRM — 데이터 저장소 (localStorage 기반)
 *
 * Supabase 연동 시 각 함수를 Supabase 쿼리로 교체하세요.
 * 모든 데이터는 shopId 기준으로 분리됩니다.
 */

import type {
  Customer, Program, CustomerProgram, TreatmentLog,
  Product, ProductSale, Payment, Staff,
  Service, Reservation, ShopSettings, MessageTemplate, MessageHistory
} from '../types';

// ─── 현재 샵 ID 가져오기 ───────────────────────────────────────
export function getShopId(): string {
  try {
    const auth = localStorage.getItem('troiareuke_auth_user');
    if (auth) {
      const user = JSON.parse(auth);
      return user.id || 'default_shop';
    }
  } catch {}
  return 'default_shop';
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

function saveList<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function shopKey(table: string): string {
  return `crm_${getShopId()}_${table}`;
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════
export const CustomerStore = {
  getAll(): Customer[] {
    const stored = getList<Customer>(shopKey('customers'));
    // 저장된 데이터가 없으면 샘플 데이터 반환
    if (stored.length === 0) return getSampleCustomers();
    return stored;
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
    saveList(shopKey('customers'), [...all, customer]);
    return customer;
  },

  update(id: string, updates: Partial<Customer>): Customer | null {
    let all = this.getAll().filter(c => !c.id.startsWith('sample_'));
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    saveList(shopKey('customers'), all);
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(c => c.id !== id && !c.id.startsWith('sample_'));
    saveList(shopKey('customers'), all);
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
    const stored = getList<Program>(shopKey('programs'));
    if (stored.length === 0) return getSamplePrograms();
    return stored;
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
    saveList(shopKey('programs'), [...all, program]);
    return program;
  },

  update(id: string, updates: Partial<Program>): Program | null {
    let all = this.getAll().filter(p => !p.id.startsWith('sample_'));
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    saveList(shopKey('programs'), all);
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(p => p.id !== id && !p.id.startsWith('sample_'));
    saveList(shopKey('programs'), all);
  },
};

// ═══════════════════════════════════════════════════════════════
// CUSTOMER PROGRAMS (고객별 등록 프로그램)
// ═══════════════════════════════════════════════════════════════
export const CustomerProgramStore = {
  getAll(): CustomerProgram[] {
    return getList<CustomerProgram>(shopKey('customer_programs'));
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
    saveList(shopKey('customer_programs'), [...all, cp]);

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
    const newUsed = cp.usedSessions + sessionsUsed;
    const isCompleted = cp.totalSessions !== null && newUsed >= cp.totalSessions;
    all[idx] = { ...cp, usedSessions: newUsed, isCompleted };
    saveList(shopKey('customer_programs'), all);
    return all[idx];
  },

  update(id: string, updates: Partial<CustomerProgram>): CustomerProgram | null {
    const all = this.getAll();
    const idx = all.findIndex(cp => cp.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    saveList(shopKey('customer_programs'), all);
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(cp => cp.id !== id);
    saveList(shopKey('customer_programs'), all);
  },
};

// ═══════════════════════════════════════════════════════════════
// TREATMENT LOGS (시술 기록)
// ═══════════════════════════════════════════════════════════════
export const TreatmentLogStore = {
  getAll(): TreatmentLog[] {
    return getList<TreatmentLog>(shopKey('treatment_logs'));
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
    saveList(shopKey('treatment_logs'), [...all, log]);

    // 프로그램에서 회차 차감
    if (data.customerProgramId) {
      CustomerProgramStore.useSession(data.customerProgramId, data.sessionsUsed);
    }

    // 고객 방문 횟수 업데이트
    CustomerStore.incrementVisit(data.customerId, 0);

    return log;
  },

  delete(id: string): void {
    const all = this.getAll().filter(t => t.id !== id);
    saveList(shopKey('treatment_logs'), all);
  },
};

// ═══════════════════════════════════════════════════════════════
// PRODUCTS (제품)
// ═══════════════════════════════════════════════════════════════
export const ProductStore = {
  getAll(): Product[] {
    const stored = getList<Product>(shopKey('products'));
    if (stored.length === 0) return getSampleProducts();
    return stored;
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
    saveList(shopKey('products'), [...all, product]);
    return product;
  },

  update(id: string, updates: Partial<Product>): Product | null {
    let all = this.getAll().filter(p => !p.id.startsWith('sample_'));
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    saveList(shopKey('products'), all);
    return all[idx];
  },

  adjustStock(id: string, quantity: number): void {
    const product = this.getAll().find(p => p.id === id);
    if (!product || product.id.startsWith('sample_')) return;
    this.update(id, { stock: Math.max(0, product.stock - quantity) });
  },

  delete(id: string): void {
    const all = this.getAll().filter(p => p.id !== id && !p.id.startsWith('sample_'));
    saveList(shopKey('products'), all);
  },
};

// ═══════════════════════════════════════════════════════════════
// PRODUCT SALES (제품 판매)
// ═══════════════════════════════════════════════════════════════
export const ProductSaleStore = {
  getAll(): ProductSale[] {
    return getList<ProductSale>(shopKey('product_sales'));
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
    saveList(shopKey('product_sales'), [...all, sale]);

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
    const all = this.getAll().filter(s => s.id !== id);
    saveList(shopKey('product_sales'), all);
  },
};

// ═══════════════════════════════════════════════════════════════
// PAYMENTS (통합 결제 기록)
// ═══════════════════════════════════════════════════════════════
export const PaymentStore = {
  getAll(): Payment[] {
    const stored = getList<Payment>(shopKey('payments'));
    if (stored.length === 0) return getSamplePayments();
    return stored;
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
    saveList(shopKey('payments'), [...all, payment]);
    return payment;
  },

  update(id: string, updates: Partial<Payment>): Payment | null {
    const all = this.getAll().filter(p => !p.id.startsWith('sample_'));
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    saveList(shopKey('payments'), all);
    return all[idx];
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
    const stored = getList<Staff>(shopKey('staff'));
    if (stored.length === 0) return getSampleStaff();
    return stored;
  },

  save(data: Omit<Staff, 'id' | 'shopId'>): Staff {
    const all = this.getAll().filter(s => !s.id.startsWith('sample_'));
    const staff: Staff = { id: genId(), shopId: getShopId(), ...data };
    saveList(shopKey('staff'), [...all, staff]);
    return staff;
  },

  update(id: string, updates: Partial<Staff>): Staff | null {
    const all = this.getAll().filter(s => !s.id.startsWith('sample_'));
    const idx = all.findIndex(s => s.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    saveList(shopKey('staff'), all);
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(s => s.id !== id && !s.id.startsWith('sample_'));
    saveList(shopKey('staff'), all);
  },
};

// ═══════════════════════════════════════════════════════════════
// SERVICES (시술 항목)
// ═══════════════════════════════════════════════════════════════
export const ServiceStore = {
  getAll(): Service[] {
    const stored = getList<Service>(shopKey('services'));
    if (stored.length === 0) return getSampleServices();
    return stored;
  },

  getById(id: string): Service | undefined {
    return this.getAll().find(s => s.id === id);
  },

  save(data: Omit<Service, 'id'>): Service {
    const all = this.getAll().filter(s => !s.id.startsWith('sample_'));
    const service: Service = { id: genId(), ...data };
    saveList(shopKey('services'), [...all, service]);
    return service;
  },

  update(id: string, updates: Partial<Service>): Service | null {
    const all = this.getAll().filter(s => !s.id.startsWith('sample_'));
    const idx = all.findIndex(s => s.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    saveList(shopKey('services'), all);
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(s => s.id !== id && !s.id.startsWith('sample_'));
    saveList(shopKey('services'), all);
  },
};

// ═══════════════════════════════════════════════════════════════
// RESERVATIONS (예약)
// ═══════════════════════════════════════════════════════════════
export const ReservationStore = {
  getAll(): Reservation[] {
    const stored = getList<Reservation>(shopKey('reservations'));
    if (stored.length === 0) return getSampleReservations();
    return stored;
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
    saveList(shopKey('reservations'), [...all, reservation]);
    return reservation;
  },

  update(id: string, updates: Partial<Reservation>): Reservation | null {
    const all = this.getAll().filter(r => !r.id.startsWith('sample_'));
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    saveList(shopKey('reservations'), all);
    return all[idx];
  },

  updateStatus(id: string, status: Reservation['status']): Reservation | null {
    return this.update(id, { status });
  },

  delete(id: string): void {
    const all = this.getAll().filter(r => r.id !== id && !r.id.startsWith('sample_'));
    saveList(shopKey('reservations'), all);
  },
};

// ═══════════════════════════════════════════════════════════════
// SETTINGS (매장 설정)
// ═══════════════════════════════════════════════════════════════
export const SettingsStore = {
  get(): ShopSettings {
    try {
      const raw = localStorage.getItem(shopKey('settings'));
      if (raw) return JSON.parse(raw);
    } catch {}
    return getDefaultSettings();
  },

  save(updates: Partial<ShopSettings>): ShopSettings {
    const current = this.get();
    const updated = { ...current, ...updates };
    localStorage.setItem(shopKey('settings'), JSON.stringify(updated));
    return updated;
  },
};

// ═══════════════════════════════════════════════════════════════
// MESSAGE TEMPLATES (메시지 템플릿)
// ═══════════════════════════════════════════════════════════════
export const MessageTemplateStore = {
  getAll(): MessageTemplate[] {
    const stored = getList<MessageTemplate>(shopKey('msg_templates'));
    if (stored.length === 0) return getSampleMessageTemplates();
    return stored;
  },

  save(data: Omit<MessageTemplate, 'id'>): MessageTemplate {
    const all = this.getAll().filter(t => !t.id.startsWith('sample_'));
    const template: MessageTemplate = { id: genId(), ...data };
    saveList(shopKey('msg_templates'), [...all, template]);
    return template;
  },

  update(id: string, updates: Partial<MessageTemplate>): MessageTemplate | null {
    const all = this.getAll().filter(t => !t.id.startsWith('sample_'));
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    saveList(shopKey('msg_templates'), all);
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(t => t.id !== id && !t.id.startsWith('sample_'));
    saveList(shopKey('msg_templates'), all);
  },
};

// ═══════════════════════════════════════════════════════════════
// MESSAGE HISTORY (발송 이력)
// ═══════════════════════════════════════════════════════════════
export const MessageHistoryStore = {
  getAll(): MessageHistory[] {
    return getList<MessageHistory>(shopKey('msg_history'));
  },

  save(data: Omit<MessageHistory, 'id'>): MessageHistory {
    const all = this.getAll();
    const history: MessageHistory = { id: genId(), ...data };
    saveList(shopKey('msg_history'), [history, ...all]);
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
  // 최근 30일 샘플 매출 데이터
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0) continue; // 일요일 제외

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
