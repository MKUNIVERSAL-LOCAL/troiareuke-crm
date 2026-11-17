// ═══════════════════════════════════════════════════════════════
// fullBackup — 전체 백업 파일(JSON) 저장·복원 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 로컬 모드 매장은 이 기기의 localStorage가 유일한 저장소다(PC 교체·포맷·브라우저 데이터 삭제 = 전부 소실).
// 이 모듈은 현재 매장의 모든 테이블(crm_<shopId>_*)을 JSON 한 파일로 내보내고, 같은 파일을 다른 기기/새 계정에서 복원한다.
// 복원은 현재 로그인한 매장 id로 다시 매핑한다(로컬 모드는 가입마다 id가 새로 생기므로).
// 서버(NAS) 모드에서는 서버가 정본이라 복원을 막는다 — 로컬에 직접 쓰면 outbox를 거치지 않아 서버와 어긋난다.
// 사진(IndexedDB)은 포함하지 않는다 — 파일이 수백 MB가 될 수 있어 Electron 자동 백업·NAS 동기가 맡는다.
// ═══════════════════════════════════════════════════════════════

import { getShopId } from './store';
import { isAuthApiConfigured } from './authApi';
import { exportFile } from './mobileBridge';
import { todayISO } from './format';

export const BACKUP_FORMAT = 'troiareuke-crm-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  appVersion: string;
  shopId: string;
  shopName?: string;
  createdAt: string;
  /** 테이블명 → 저장된 JSON 값(파싱본). 배열이 아닌 테이블(settings 등)도 그대로 */
  tables: Record<string, unknown>;
}

const TABLE_LABELS: Record<string, string> = {
  customers: '고객', reservations: '예약', treatment_logs: '시술 기록', customer_programs: '고객 프로그램', programs: '프로그램',
  payments: '결제', product_sales: '제품 판매', products: '제품', services: '시술 메뉴', staff: '직원', consultations: '피부 상담',
  expenses: '지출', settings: '샵 설정', message_templates: '메시지 템플릿', message_history: '발송 이력',
};

export const RESTORE_ALLOWED = !isAuthApiConfigured;

function prefix(): string {
  return `crm_${getShopId()}_`;
}

/** 현재 매장의 모든 테이블을 모아 백업 객체를 만든다 */
export function buildBackup(appVersion: string, shopName?: string): BackupFile {
  const p = prefix();
  const tables: Record<string, unknown> = {};
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(p)) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try { tables[key.slice(p.length)] = JSON.parse(raw); } catch { tables[key.slice(p.length)] = raw; }
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion, shopId: getShopId(), shopName, createdAt: new Date().toISOString(), tables };
}

/** 사람이 읽는 요약 — "고객 123명 · 예약 456건 …" */
export function summarizeBackup(b: BackupFile): { label: string; count: number }[] {
  return Object.entries(b.tables)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => ({ label: TABLE_LABELS[k] ?? k, count: (v as unknown[]).length }))
    .sort((a, b) => b.count - a.count);
}

export async function saveBackupFile(b: BackupFile): Promise<'shared' | 'saved' | 'downloaded'> {
  const safeName = (b.shopName || 'CRM').replace(/[\\/:*?"<>|]/g, '');
  const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
  return exportFile(`${safeName}_전체백업_${todayISO()}.json`, blob);
}

/** 파일 내용을 검증해 백업 객체로. 형식이 아니면 Error */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('JSON 파일이 아닙니다.'); }
  const b = parsed as Partial<BackupFile>;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.tables !== 'object' || b.tables === null) throw new Error('트로이아르케 CRM 백업 파일이 아닙니다.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new Error('이 앱보다 새로운 백업 형식입니다. 앱을 업데이트한 뒤 복원하세요.');
  return b as BackupFile;
}

/**
 * 현재 매장 테이블을 백업으로 덮어쓴다. 되돌릴 수 없다 — 호출 쪽이 confirm을 받고, 끝나면 새로고침해 스토어 캐시를 비운다.
 * @returns 쓴 테이블 수
 */
export function restoreBackup(b: BackupFile): number {
  if (!RESTORE_ALLOWED) throw new Error('서버 연동 모드에서는 복원할 수 없습니다. 서버의 데이터가 정본입니다.');
  const p = prefix();
  for (const key of Object.keys(localStorage)) if (key.startsWith(p)) localStorage.removeItem(key);
  let n = 0;
  for (const [table, value] of Object.entries(b.tables)) {
    localStorage.setItem(p + table, typeof value === 'string' ? value : JSON.stringify(value));
    n++;
  }
  return n;
}
