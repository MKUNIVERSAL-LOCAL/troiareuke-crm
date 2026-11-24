// ═══════════════════════════════════════════════════════════════
// fullBackup — 전체 백업 파일(JSON) 저장·복원 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// 로컬 모드 매장은 이 기기의 localStorage가 유일한 저장소다(PC 교체·포맷·브라우저 데이터 삭제 = 전부 소실).
// 이 모듈은 현재 매장의 모든 테이블(crm_<shopId>_*)을 JSON 한 파일로 내보내고, 같은 파일을 다른 기기/새 계정에서 복원한다.
// 복원은 현재 로그인한 매장 id로 다시 매핑한다(로컬 모드는 가입마다 id가 새로 생기므로).
// 서버(NAS) 모드에서는 서버가 정본이라 복원을 막는다 — 로컬에 직접 쓰면 outbox를 거치지 않아 서버와 어긋난다.
// 사진(IndexedDB)은 포함하지 않는다 — 파일이 수백 MB가 될 수 있어 Electron 자동 백업·NAS 동기가 맡는다.
// 비밀값(문자 API 키)은 파일에 넣지 않는다 — 공유 시트·메일로 흘러가는 파일이라서. 복원 때는 이 기기 값을 유지한다.
// 복원은 트랜잭션처럼: 기존 값을 스냅샷 → 쓰기 → 실패(용량 초과 등) 시 전부 되돌린다.
// ═══════════════════════════════════════════════════════════════

import { getShopId } from './store';
import { isAuthApiConfigured } from './authApi';
import { exportFile } from './mobileBridge';
import { todayISO } from './format';
import { IS_MOBILE_APP } from './platform';
import { SETTINGS_SECRET_FIELDS, isRecord, stripSettingsSecrets } from './backupSanitize';
import { containsKeyLike, scrubKeyLike } from './ai/keyLeak';

export const BACKUP_FORMAT = 'troiareuke-crm-backup';
export const BACKUP_VERSION = 1;
/** 모바일 WebView localStorage 한도(대개 5MB) 아래 — 그보다 큰 파일은 쓰다가 터지므로 미리 거른다 */
const MOBILE_MAX_BYTES = 4.5 * 1024 * 1024;
const TABLE_NAME_RE = /^[a-z][a-z0-9_]{0,40}$/;
/** JSON으로 파싱되지 않는 원문 값을 담는 표식 — 복원 때 그대로 되돌린다 */
const RAW_MARK = '__raw';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  appVersion: string;
  shopId: string;
  shopName?: string;
  createdAt: string;
  /** 테이블명 → 저장된 JSON 값(파싱본). 파싱 불가 원문은 { __raw: string } */
  tables: Record<string, unknown>;
}

const TABLE_LABELS: Record<string, string> = {
  customers: '고객', reservations: '예약', treatment_logs: '시술 기록', customer_programs: '고객 프로그램', programs: '프로그램',
  payments: '결제', product_sales: '제품 판매', products: '제품', services: '시술 메뉴', staff: '직원', consultations: '피부 상담',
  expenses: '지출', settings: '매장 설정', msg_templates: '메시지 템플릿', msg_history: '발송 이력',
};

export const RESTORE_ALLOWED = !isAuthApiConfigured;

function prefix(): string {
  return `crm_${getShopId()}_`;
}

/** 현재 매장의 모든 테이블을 모아 백업 객체를 만든다 (비밀값 제외) */
export function buildBackup(appVersion: string, shopName?: string): BackupFile {
  const p = prefix();
  const tables: Record<string, unknown> = {};
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(p)) continue;
    const table = key.slice(p.length);
    if (!TABLE_NAME_RE.test(table)) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { value = { [RAW_MARK]: raw }; }
    if (table === 'settings' && isRecord(value)) value = stripSettingsSecrets(value);
    if (typeof value === 'string' && containsKeyLike(value)) value = scrubKeyLike(value); // 자유 텍스트에 붙여넣은 키도 백업으로 새지 않게 (154 리뷰 M-3)
    tables[table] = value;
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion, shopId: getShopId(), shopName, createdAt: new Date().toISOString(), tables };
}

/** 사람이 읽는 요약 — "고객 123 · 예약 456 …" */
export function summarizeBackup(b: BackupFile): { label: string; count: number }[] {
  return Object.entries(b.tables)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => ({ label: Object.prototype.hasOwnProperty.call(TABLE_LABELS, k) ? TABLE_LABELS[k] : k, count: (v as unknown[]).length }))
    .sort((a, b) => b.count - a.count);
}

export async function saveBackupFile(b: BackupFile): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const safeName = (b.shopName || 'CRM').replace(/[\\/:*?"<>|]/g, '');
  const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
  return exportFile(`${safeName}_전체백업_${todayISO()}.json`, blob);
}

/** 파일 내용을 검증해 백업 객체로. 형식이 아니면 Error */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('JSON 파일이 아닙니다.'); }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT || !isRecord(parsed.tables)) throw new Error('트로이아르케 CRM 백업 파일이 아닙니다.');
  const v = parsed.version;
  if (!Number.isInteger(v) || (v as number) < 1) throw new Error('백업 파일 버전 정보가 올바르지 않습니다.');
  if ((v as number) > BACKUP_VERSION) throw new Error('이 앱보다 새로운 백업 형식입니다. 앱을 업데이트한 뒤 복원하세요.');
  if (IS_MOBILE_APP && text.length > MOBILE_MAX_BYTES) throw new Error('파일이 이 기기의 저장 공간 한도보다 큽니다. PC 앱에서 복원하세요.');
  // 테이블 값의 모양도 본다 — 손상된 파일의 {} 나 문자열을 그대로 복원하면 첫 화면의 .filter 에서 죽고 서버 모드에선 되돌릴 UI 도 없다 (14차 #M5)
  for (const [table, value] of Object.entries(parsed.tables)) {
    const rawWrapped = isRecord(value) && typeof value[RAW_MARK] === 'string' && Object.keys(value).length === 1;
    const ok = table === 'settings' ? (isRecord(value) || rawWrapped) : (Array.isArray(value) || rawWrapped);
    if (!ok) throw new Error(`백업 파일의 '${Object.prototype.hasOwnProperty.call(TABLE_LABELS, table) ? TABLE_LABELS[table] : table}' 데이터가 손상됐습니다. 다른 백업 파일을 사용하세요.`);
  }
  return parsed as unknown as BackupFile;
}

function serialize(value: unknown): string {
  if (isRecord(value) && typeof value[RAW_MARK] === 'string' && Object.keys(value).length === 1) return value[RAW_MARK] as string;
  return JSON.stringify(value);
}

/**
 * 현재 매장 테이블을 백업으로 덮어쓴다. 되돌릴 수 없다 — 호출 쪽이 confirm을 받고, 끝나면(성공·실패 모두) 새로고침해 스토어 캐시를 비운다.
 * 쓰기 도중 실패하면(용량 초과 등) 이전 상태로 전부 되돌리고 throw.
 * @returns { written: 쓴 테이블 수, skipped: 이름이 올바르지 않아 건너뛴 수 }
 */
export function restoreBackup(b: BackupFile): { written: number; skipped: number } {
  if (!RESTORE_ALLOWED) throw new Error('서버 연동 모드에서는 복원할 수 없습니다. 서버의 데이터가 정본입니다.');
  const p = prefix();
  // 1) 스냅샷
  const before = new Map<string, string>();
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(p)) continue;
    const v = localStorage.getItem(key);
    if (v !== null) before.set(key, v);
  }
  // 2) 비밀값은 이 기기 값 유지(파일엔 없음)
  const tables: Record<string, unknown> = { ...b.tables };
  const curSettingsRaw = before.get(p + 'settings');
  if (curSettingsRaw && isRecord(tables.settings)) {
    try {
      const cur = JSON.parse(curSettingsRaw);
      const merged = { ...(tables.settings as Record<string, unknown>) };
      for (const f of SETTINGS_SECRET_FIELDS) if (isRecord(cur) && cur[f] !== undefined && merged[f] === undefined) merged[f] = cur[f];
      tables.settings = merged;
    } catch { /* 현재 settings가 깨져 있으면 파일 값 그대로 */ }
  }
  // 3) 쓰기 — 실패 시 롤백
  const writtenKeys: string[] = [];
  let skipped = 0;
  try {
    for (const key of before.keys()) localStorage.removeItem(key);
    for (const [table, value] of Object.entries(tables)) {
      if (!TABLE_NAME_RE.test(table)) { skipped++; continue; }
      localStorage.setItem(p + table, serialize(value));
      writtenKeys.push(p + table);
    }
  } catch (e) {
    for (const key of writtenKeys) localStorage.removeItem(key);
    for (const [key, v] of before) { try { localStorage.setItem(key, v); } catch { /* 되돌리기도 실패 — 아래 메시지로 안내 */ } }
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    throw new Error(quota ? '파일이 이 기기 저장 공간보다 커서 복원하지 못했습니다. 이전 데이터는 그대로 두었습니다.' : '복원 중 오류가 나서 이전 데이터로 되돌렸습니다.');
  }
  // 4) 사진 장수 캐시는 기록 id 기준이라 다른 데이터 위에 복원하면 어긋난다 — 비우면 다음 열람 때 다시 센다
  try { localStorage.removeItem('crm_photo_counts'); } catch { /* noop */ }
  return { written: writtenKeys.length, skipped };
}
