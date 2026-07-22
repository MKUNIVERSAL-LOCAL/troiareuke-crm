/**
 * 트로이아르케 CRM — 고객 피부상담(Consultation) 저장소
 *
 * store.ts(코어)와 동일한 dual-write 패턴:
 *   localStorage(즉시 캐시) + Supabase(consultations 테이블) 동시 저장.
 * Supabase 미설정/테이블 미생성 시에도 localStorage로 안전 폴백한다.
 *   (consultations 테이블은 repo 루트 consultations-table.sql 참고)
 *
 * 코어 잠금 회피를 위해 별도 파일로 분리하되, getShopId/safeSetItem 등
 * 공개 유틸은 store.ts 에서 재사용한다.
 */
import type { Consultation, BeaconMetrics } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';
import { getShopId, safeSetItem } from './store';
import { isNasDataConfigured, nasLoad, nasUpsert, nasUpdate, nasDelete } from './nasData';

function genId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
function now(): string {
  return new Date().toISOString();
}
function shopKey(table: string): string {
  return `crm_${getShopId()}_${table}`;
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
  safeSetItem(key, JSON.stringify(data));
}

// ─── Supabase ↔ App 필드 매핑 ──────────────────────────────────
function toDbConsultation(c: Partial<Consultation>): Record<string, any> {
  const db: Record<string, any> = {};
  if (c.id !== undefined) db.id = c.id;
  if (c.shopId !== undefined) db.branch_id = c.shopId;
  if (c.customerId !== undefined) db.customer_id = c.customerId;
  if (c.customerName !== undefined) db.customer_name = c.customerName;
  if (c.consultDate !== undefined) db.consult_date = c.consultDate;
  if (c.staffName !== undefined) db.staff_name = c.staffName;
  if (c.concerns !== undefined) db.concerns = c.concerns;
  if (c.beaconMetrics !== undefined) db.beacon_metrics = c.beaconMetrics;
  if (c.skinTypeResult !== undefined) db.skin_type_result = c.skinTypeResult;
  if (c.managerNote !== undefined) db.manager_note = c.managerNote;
  if (c.recommendedSolution !== undefined) db.recommended_solution = c.recommendedSolution;
  if (c.recommendedProducts !== undefined) db.recommended_products = c.recommendedProducts;
  if (c.nextConsultDate !== undefined) db.next_consult_date = c.nextConsultDate;
  if (c.photos !== undefined) db.photos = c.photos;
  return db;
}

function fromDbConsultation(row: Record<string, any>): Consultation {
  return {
    id: row.id,
    shopId: row.branch_id,
    customerId: row.customer_id || '',
    customerName: row.customer_name || '',
    consultDate: row.consult_date || '',
    staffName: row.staff_name,
    concerns: row.concerns || [],
    beaconMetrics: (row.beacon_metrics || {}) as BeaconMetrics,
    skinTypeResult: row.skin_type_result,
    managerNote: row.manager_note,
    recommendedSolution: row.recommended_solution,
    recommendedProducts: row.recommended_products || [],
    nextConsultDate: row.next_consult_date,
    photos: row.photos || [],
    createdAt: row.created_at || now(),
  };
}

// ─── 메모리 캐시 ───────────────────────────────────────────────
let _consultations: Consultation[] | null = null;

/** 앱 시작/고객 진입 시 1회 서버 로드 — NAS 우선, Supabase 폴백 (실패 시 localStorage 유지) */
export async function loadConsultations(): Promise<void> {
  // NAS 중앙 서버 모드: crm_records('consultations')에서 로드
  if (isNasDataConfigured) {
    const rows = await nasLoad('consultations');
    if (rows) {
      _consultations = rows.map(fromDbConsultation);
      saveList(shopKey('consultations'), _consultations);
    }
    return;
  }
  if (!isSupabaseConfigured) return;
  try {
    const branchId = getShopId();
    let query = supabase.from('consultations').select('*');
    if (branchId !== 'superadmin' && branchId !== 'default_shop') {
      query = query.eq('branch_id', branchId);
    }
    const { data, error } = await query;
    if (error) {
      // 테이블 미생성 등 — localStorage 폴백 유지
      console.warn('[Consultation] 로드 실패(폴백):', error.message);
      return;
    }
    if (data && data.length > 0) {
      _consultations = data.map(fromDbConsultation);
      saveList(shopKey('consultations'), _consultations);
    }
  } catch (e) {
    console.warn('[Consultation] 로드 예외(폴백):', e);
  }
}

// ─── 진단 보조 로직 (관리사가 수정 가능한 "제안값") ──────────────
// ⚠️ 의료 진단·치료가 아니라 피부 관리 상담을 위한 참고 제안이다.

/** 비컨 측정값으로 종합 피부타입을 추정 */
export function deriveSkinType(m: BeaconMetrics): string {
  const { moisture, oil, sensitivity, redness } = m;
  if ((sensitivity ?? 0) >= 60 || (redness ?? 0) >= 60) return '민감성';
  if (moisture == null && oil == null) return '';
  const dry = (moisture ?? 50) < 45;
  const oily = (oil ?? 50) >= 60;
  if (oily && dry) return '복합성';
  if (oily) return '지성';
  if (dry) return '건성';
  if ((oil ?? 50) >= 45 && (moisture ?? 50) >= 50) return '복합성';
  return '중성';
}

/** 측정값+고민으로 1:1 맞춤 솔루션 초안을 생성 (관리사가 다듬어 사용) */
export function buildSolutionDraft(m: BeaconMetrics, concerns: string[]): string {
  const lines: string[] = [];
  const low: [keyof BeaconMetrics, string, string][] = [
    ['moisture', '수분', '수분 충전 케어(히알루론산·보습 앰플) 집중'],
    ['elasticity', '탄력', '탄력·리프팅 관리(콜라겐·고주파 등) 권장'],
  ];
  const high: [keyof BeaconMetrics, string, string][] = [
    ['oil', '유분', '피지·모공 밸런스 케어'],
    ['pigmentation', '색소침착', '브라이트닝·톤업 집중 관리'],
    ['pore', '모공', '모공 타이트닝 케어'],
    ['wrinkle', '주름', '주름 개선 안티에이징 케어'],
    ['redness', '홍조', '진정·장벽 강화 케어'],
    ['sensitivity', '민감도', '저자극 진정 케어(장벽 회복) 우선'],
  ];
  for (const [k, label, rec] of low) {
    const v = m[k];
    if (v != null && v < 45) lines.push(`· ${label} 부족(${v}점) → ${rec}`);
  }
  for (const [k, label, rec] of high) {
    const v = m[k];
    if (v != null && v >= 60) lines.push(`· ${label} 높음(${v}점) → ${rec}`);
  }
  if (concerns.length) lines.push(`· 고객 고민: ${concerns.join(', ')} 반영`);
  const type = deriveSkinType(m);
  const head = type
    ? `[${type} 피부] 비컨 분석 데이터 기반 1:1 맞춤 제안`
    : '비컨 분석 데이터 기반 1:1 맞춤 제안';
  return lines.length ? `${head}\n${lines.join('\n')}` : head;
}

export const ConsultationStore = {
  getAll(): Consultation[] {
    if (_consultations !== null) return _consultations;
    const stored = getList<Consultation>(shopKey('consultations'));
    _consultations = stored;
    return stored;
  },

  getByCustomer(customerId: string): Consultation[] {
    return this.getAll()
      .filter(c => c.customerId === customerId)
      .sort((a, b) => (b.consultDate || '').localeCompare(a.consultDate || ''));
  },

  getById(id: string): Consultation | undefined {
    return this.getAll().find(c => c.id === id);
  },

  save(data: Omit<Consultation, 'id' | 'shopId' | 'createdAt'>): Consultation {
    const all = this.getAll();
    const consultation: Consultation = {
      id: genId(),
      shopId: getShopId(),
      createdAt: now(),
      ...data,
    };
    const updated = [...all, consultation];
    _consultations = updated;
    saveList(shopKey('consultations'), updated);
    if (isNasDataConfigured) {
      nasUpsert('consultations', toDbConsultation(consultation));
      return consultation;
    }
    if (isSupabaseConfigured) {
      supabase.from('consultations').insert(toDbConsultation(consultation)).then(({ error }) => {
        if (error) console.warn('[Consultation] insert 실패(로컬 보존):', error.message);
      });
    }
    return consultation;
  },

  update(id: string, updates: Partial<Consultation>): Consultation | null {
    const all = this.getAll();
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    _consultations = all;
    saveList(shopKey('consultations'), all);
    if (isNasDataConfigured) {
      nasUpdate('consultations', id, toDbConsultation(updates));
      return all[idx];
    }
    if (isSupabaseConfigured) {
      supabase.from('consultations').update(toDbConsultation(updates)).eq('id', id).then(({ error }) => {
        if (error) console.warn('[Consultation] update 실패:', error.message);
      });
    }
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter(c => c.id !== id);
    _consultations = all;
    saveList(shopKey('consultations'), all);
    if (isNasDataConfigured) {
      nasDelete('consultations', id);
      return;
    }
    if (isSupabaseConfigured) {
      supabase.from('consultations').delete().eq('id', id).then(({ error }) => {
        if (error) console.warn('[Consultation] delete 실패:', error.message);
      });
    }
  },
};
