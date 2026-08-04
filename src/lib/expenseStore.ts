/**
 * 트로이아르케 CRM — 지출(매입·비용) 저장소
 *
 * consultationStore.ts와 동일한 비코어 스토어 패턴:
 *   localStorage(즉시 캐시) + NAS crm_records('expenses') 동기화.
 * NAS 미설정(로컬 모드) 시 localStorage 단독으로 안전 동작한다.
 * Supabase 경로는 만들지 않는다 — expenses 테이블이 없고 Supabase는 철거 예정.
 *
 * 코어 잠금 회피를 위해 별도 파일로 분리하되, getShopId/safeSetItem 등
 * 공개 유틸은 store.ts 에서 재사용한다.
 */
import type { Expense } from '../types';
import { getShopId, safeSetItem } from './store';
import { isNasDataConfigured, nasLoad, nasUpsert, nasDelete } from './nasData';

function genId(): string {
  return globalThis.crypto?.randomUUID?.()
    || Math.random().toString(36).substring(2) + Date.now().toString(36);
}
function now(): string {
  return new Date().toISOString();
}
function shopKey(): string {
  return `crm_${getShopId()}_expenses`;
}
function getList(key: string): Expense[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveList(key: string, data: Expense[]): void {
  safeSetItem(key, JSON.stringify(data));
}

// ─── NAS(crm_records) ↔ App 필드 매핑 ──────────────────────────
// 서버는 행 전체를 JSONB로 통짜 저장하므로(컬럼 스키마 없음) 필드 추가는 안전.
function toDbExpense(e: Partial<Expense>): Record<string, any> {
  const db: Record<string, any> = {};
  if (e.id !== undefined) db.id = e.id;
  if (e.shopId !== undefined) db.branch_id = e.shopId;
  if (e.expenseDate !== undefined) db.expense_date = e.expenseDate;
  if (e.category !== undefined) db.category = e.category;
  if (e.vendor !== undefined) db.vendor = e.vendor;
  if (e.description !== undefined) db.description = e.description;
  if (e.amount !== undefined) db.amount = e.amount;
  if (e.paymentMethod !== undefined) db.payment_method = e.paymentMethod;
  if (e.memo !== undefined) db.memo = e.memo;
  // created_at 미포함 시 NAS 왕복마다 생성일이 바뀌므로 포함 (consultationStore와 동일)
  if (e.createdAt !== undefined) db.created_at = e.createdAt;
  return db;
}

function fromDbExpense(row: Record<string, any>): Expense {
  return {
    id: row.id,
    shopId: row.branch_id,
    expenseDate: row.expense_date || '',
    category: row.category || '기타',
    vendor: row.vendor,
    description: row.description || '',
    amount: Number(row.amount) || 0,
    paymentMethod: row.payment_method || '카드',
    memo: row.memo,
    createdAt: row.created_at || now(),
  };
}

// ─── 메모리 캐시 ───────────────────────────────────────────────
// 지점(shopId)을 키로 함께 들고 있어야 한다. 앱 재시작 없이 계정을 바꾸면
// 이전 지점 데이터가 그대로 보이고, 그 상태로 저장하면 새 지점 키에 기록되어 오염된다.
let _expenses: Expense[] | null = null;
let _expensesShopId: string | null = null;

function cacheFor(shopId: string): Expense[] | null {
  return _expenses !== null && _expensesShopId === shopId ? _expenses : null;
}

function setCache(shopId: string, rows: Expense[]): void {
  _expenses = rows;
  _expensesShopId = shopId;
}

/** 페이지 진입 시 1회 서버 로드 — NAS 우선 (실패 시 localStorage 유지) */
export async function loadExpenses(): Promise<void> {
  if (!isNasDataConfigured) return;
  const rows = await nasLoad('expenses');
  if (rows) {
    const shopId = getShopId();
    const parsed = rows.map(fromDbExpense);
    setCache(shopId, parsed);
    saveList(shopKey(), parsed);
  }
}

export const ExpenseStore = {
  getAll(): Expense[] {
    const shopId = getShopId();
    const cached = cacheFor(shopId);
    if (cached !== null) return cached;
    const stored = getList(shopKey());
    setCache(shopId, stored);
    return stored;
  },

  getById(id: string): Expense | undefined {
    return this.getAll().find(e => e.id === id);
  },

  save(data: Omit<Expense, 'id' | 'shopId' | 'createdAt'>): Expense {
    const all = this.getAll();
    const shopId = getShopId();
    const expense: Expense = {
      id: genId(),
      shopId,
      createdAt: now(),
      ...data,
    };
    const updated = [...all, expense];
    setCache(shopId, updated);
    saveList(shopKey(), updated);
    if (isNasDataConfigured) {
      nasUpsert('expenses', toDbExpense(expense));
    }
    return expense;
  },

  update(id: string, updates: Partial<Expense>): Expense | null {
    const all = this.getAll();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return null;
    // store.ts 규칙과 동일 — 기존 배열을 변형하지 않고 새 배열로 교체
    const next = [...all];
    next[idx] = { ...all[idx], ...updates };
    setCache(getShopId(), next);
    saveList(shopKey(), next);
    if (isNasDataConfigured) {
      // PATCH는 서버에서 기존 행과 병합되므로, 거래처·메모를 비운 수정이 반영되지 않고
      // 다시 로드하면 지운 값이 되살아난다. 행 전체를 upsert해 지운 필드를 확정 반영한다.
      nasUpsert('expenses', toDbExpense(next[idx]));
    }
    return next[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(e => e.id !== id);
    setCache(getShopId(), all);
    saveList(shopKey(), all);
    if (isNasDataConfigured) {
      nasDelete('expenses', id);
    }
  },
};
