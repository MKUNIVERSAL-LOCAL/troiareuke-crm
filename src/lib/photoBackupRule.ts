// ═══════════════════════════════════════════════════════════════
// photoBackupRule — 사진 백업의 순수 규칙 (228, GAP C-3)
// 저장소·네트워크를 쓰지 않는 부분만 모았다 — lib-units 스펙이 공식을 고정한다
// (스펙은 Node 에서 이 모듈을 직접 import 하므로 store·IndexedDB 를 끌고 오면 안 된다).
// 쓰는 쪽: photoBackup.ts(실제 내보내기·가져오기), 설정 > 백업·보안 카드.
// ═══════════════════════════════════════════════════════════════

import type { PhotoEntry } from './photoTypes';

export const PHOTO_BACKUP_FORMAT = 'troiareuke-crm-photos';
export const PHOTO_BACKUP_VERSION = 1;
/** 파일 하나 상한(약 40MB) — 메일 첨부·클라우드 업로드 한도와 브라우저 Blob 안정권 */
export const PHOTO_PART_MAX_BYTES = 40 * 1024 * 1024;
/** 엔티티 키 규칙: `treatment:<id>`, `customer:<id>`, `consultation:<id>` 등 */
const ENTITY_KEY_RE = /^[a-z][a-z0-9_]{0,30}:[A-Za-z0-9_.:-]{1,80}$/;

export interface PhotoBackupItem { entityKey: string; photos: PhotoEntry[] }

export interface PhotoBackupFile {
  format: typeof PHOTO_BACKUP_FORMAT;
  version: number;
  appVersion: string;
  shopId: string;
  shopName?: string;
  createdAt: string;
  /** 1부터 — 파일을 나눠 저장할 때 몇 번째인지 */
  part: number;
  parts: number;
  items: PhotoBackupItem[];
}

export interface PhotoInventoryEntry { entityKey: string; count: number; bytes: number }

/** 사진 묶음의 대략 용량(base64 글자 수 합 — 파일 크기와 거의 같다) */
export function photoBytes(photos: PhotoEntry[]): number {
  return photos.reduce((sum, p) => sum + (typeof p?.dataUrl === 'string' ? p.dataUrl.length : 0), 0);
}

export function sumInventory(inv: PhotoInventoryEntry[]): { entities: number; photos: number; bytes: number } {
  return {
    entities: inv.length,
    photos: inv.reduce((s, e) => s + e.count, 0),
    bytes: inv.reduce((s, e) => s + e.bytes, 0),
  };
}

/**
 * 파일 분할 계획 — 기록 하나는 쪼개지 않는다(사진 묶음이 두 파일로 갈리면 한 파일만 잃어도 그 기록이 반쪽이 된다).
 * 상한보다 큰 기록은 혼자 한 파일로 나간다(빠뜨리지 않는다).
 */
export function planPhotoChunks(inv: PhotoInventoryEntry[], maxBytes = PHOTO_PART_MAX_BYTES): string[][] {
  const parts: string[][] = [];
  let current: string[] = [];
  let currentBytes = 0;
  for (const entry of inv) {
    if (current.length > 0 && currentBytes + entry.bytes > maxBytes) {
      parts.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(entry.entityKey);
    currentBytes += entry.bytes;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/** 사람이 읽는 용량 표기 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)}MB`;
}

/** 가져오기 병합 — 같은 사진 id 는 이 기기 값을 유지하고 없는 것만 더한다(촬영 시각 순) */
export function mergePhotoEntries(existing: PhotoEntry[], incoming: PhotoEntry[]): { merged: PhotoEntry[]; added: number; duplicates: number } {
  const have = new Set(existing.map(p => p.id));
  const merged = existing.slice();
  let added = 0;
  let duplicates = 0;
  for (const p of incoming) {
    if (!p || typeof p.id !== 'string' || typeof p.dataUrl !== 'string' || !p.dataUrl.startsWith('data:')) continue; // 깨진 항목은 버린다
    if (have.has(p.id)) { duplicates += 1; continue; }
    have.add(p.id);
    merged.push(p);
    added += 1;
  }
  merged.sort((a, b) => String(a.takenAt || '').localeCompare(String(b.takenAt || '')));
  return { merged, added, duplicates };
}

function isPhotoEntry(v: unknown): v is PhotoEntry {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:');
}

/** 파일 본문 → 사진 백업 파일. 모양이 아니면 사유를 담아 throw (가져오기 전 미리보기용) */
export function parsePhotoBackup(text: string): PhotoBackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('사진 백업 파일이 아닙니다(JSON 형식이 아님).');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('사진 백업 파일이 아닙니다.');
  const f = raw as Record<string, unknown>;
  if (f.format !== PHOTO_BACKUP_FORMAT) throw new Error('이 프로그램의 사진 백업 파일이 아닙니다.');
  if (typeof f.version !== 'number' || f.version > PHOTO_BACKUP_VERSION) throw new Error('더 새 버전에서 만든 사진 백업 파일입니다. 프로그램을 업데이트해주세요.');
  if (!Array.isArray(f.items)) throw new Error('사진 목록이 없는 파일입니다.');
  const items: PhotoBackupItem[] = [];
  for (const it of f.items) {
    if (!it || typeof it !== 'object') continue;
    const row = it as Record<string, unknown>;
    const entityKey = typeof row.entityKey === 'string' ? row.entityKey : '';
    if (!ENTITY_KEY_RE.test(entityKey)) continue; // 기록 키 규칙에 맞지 않으면 건너뛴다(엉뚱한 키로 쓰지 않는다)
    const photos = Array.isArray(row.photos) ? row.photos.filter(isPhotoEntry) : [];
    if (photos.length === 0) continue;
    items.push({ entityKey, photos });
  }
  if (items.length === 0) throw new Error('파일에 복원할 사진이 없습니다.');
  return {
    format: PHOTO_BACKUP_FORMAT,
    version: f.version,
    appVersion: typeof f.appVersion === 'string' ? f.appVersion : '',
    shopId: typeof f.shopId === 'string' ? f.shopId : '',
    shopName: typeof f.shopName === 'string' ? f.shopName : undefined,
    createdAt: typeof f.createdAt === 'string' ? f.createdAt : '',
    part: typeof f.part === 'number' ? f.part : 1,
    parts: typeof f.parts === 'number' ? f.parts : 1,
    items,
  };
}

