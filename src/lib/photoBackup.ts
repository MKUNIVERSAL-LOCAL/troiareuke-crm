// ═══════════════════════════════════════════════════════════════
// photoBackup — 전/후 사진 내보내기·가져오기 (228, GAP C-3 "백업에 사진 미포함")
// ───────────────────────────────────────────────────────────────
// 왜 따로 두는가:
//  - 사진은 이 기기 IndexedDB(폴백 localStorage)에만 있고 전체 백업 파일(fullBackup)에는 들어가지 않는다.
//    서버(NAS) 연동 매장은 서버가 정본이지만, 로컬 모드 매장은 PC 교체·포맷·브라우저 데이터 삭제로 사진이 영구 소실된다.
//  - 사진을 전체 백업에 섞으면 파일이 수백 MB가 되어 JSON 백업 자체가 실패한다 → 사진만 따로, 용량대로 여러 파일로 나눈다.
// 설계:
//  - 한 기록(entityKey)의 사진 묶음은 쪼개지 않는다 — 파일 하나를 잃어도 남은 기록은 온전하게 복원된다.
//  - 가져오기는 덮어쓰지 않고 합친다(같은 사진 id 는 이 기기 값 유지) → 두 PC 의 사진을 한 곳으로 모을 수 있다.
//  - 저장 결과는 다시 읽어 확인한다(IndexedDB 쓰기는 비동기·용량 초과로 조용히 실패할 수 있다 — 가짜 성공 금지).
//  - 순수 규칙(planPhotoChunks·mergePhotoEntries·parsePhotoBackup)은 lib-units 스펙이 고정한다.
// ═══════════════════════════════════════════════════════════════

import { getShopId } from './store';
import { allPhotoEntityKeys, getPhotosAsync, setPhotos, type PhotoEntry } from './photoStore';
import { exportFile } from './mobileBridge';
import {
  PHOTO_BACKUP_FORMAT, PHOTO_BACKUP_VERSION, PHOTO_PART_MAX_BYTES,
  photoBytes, sumInventory, planPhotoChunks, mergePhotoEntries,
  type PhotoBackupFile, type PhotoBackupItem, type PhotoInventoryEntry,
} from './photoBackupRule';

// 순수 규칙은 photoBackupRule.ts — 쓰는 쪽이 한 곳만 import 하도록 다시 내보낸다
export {
  PHOTO_BACKUP_FORMAT, PHOTO_BACKUP_VERSION, PHOTO_PART_MAX_BYTES,
  photoBytes, sumInventory, planPhotoChunks, mergePhotoEntries, parsePhotoBackup, formatBytes,
} from './photoBackupRule';
export type { PhotoBackupFile, PhotoBackupItem, PhotoInventoryEntry } from './photoBackupRule';

/** 이 기기에 있는 사진 전수 조사 — 기록별 장수·용량 (키 순서 고정) */
export async function collectPhotoInventory(): Promise<PhotoInventoryEntry[]> {
  const keys = (await allPhotoEntityKeys()).slice().sort((a, b) => a.localeCompare(b));
  const out: PhotoInventoryEntry[] = [];
  for (const entityKey of keys) {
    const photos = await getPhotosAsync(entityKey);
    if (!photos || photos.length === 0) continue; // 빈 묶음·읽기 실패는 내보낼 것이 없다
    out.push({ entityKey, count: photos.length, bytes: photoBytes(photos) });
  }
  return out;
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export interface PhotoExportResult { parts: number; entities: number; photos: number; bytes: number; shared: boolean; cancelled: boolean }

/**
 * 사진 전체를 파일로 내보낸다(용량에 따라 여러 파일). 모바일은 파일마다 공유 시트.
 * 사진이 없으면 throw — "저장했다"고 하지 않는다.
 */
export async function savePhotoBackup(appVersion: string, shopName?: string, maxBytes = PHOTO_PART_MAX_BYTES): Promise<PhotoExportResult> {
  const inv = await collectPhotoInventory();
  const total = sumInventory(inv);
  if (total.photos === 0) throw new Error('이 기기에 저장된 사진이 없습니다.');
  const plan = planPhotoChunks(inv, maxBytes);
  const base = stamp();
  const shopId = getShopId();
  let shared = false;
  let cancelled = false;
  for (let i = 0; i < plan.length; i += 1) {
    const items: PhotoBackupItem[] = [];
    for (const entityKey of plan[i]) {
      const photos = await getPhotosAsync(entityKey);
      if (photos && photos.length > 0) items.push({ entityKey, photos });
    }
    if (items.length === 0) continue;
    const file: PhotoBackupFile = {
      format: PHOTO_BACKUP_FORMAT,
      version: PHOTO_BACKUP_VERSION,
      appVersion,
      shopId,
      shopName,
      createdAt: new Date().toISOString(),
      part: i + 1,
      parts: plan.length,
      items,
    };
    const name = plan.length > 1 ? `dermasolution-photos-${base}-${i + 1}of${plan.length}.json` : `dermasolution-photos-${base}.json`;
    const result = await exportFile(name, new Blob([JSON.stringify(file)], { type: 'application/json' }));
    if (result === 'shared') shared = true;
    if (result === 'cancelled') { cancelled = true; break; } // 공유를 취소하면 나머지 파일도 묻지 않는다
  }
  return { parts: plan.length, entities: total.entities, photos: total.photos, bytes: total.bytes, shared, cancelled };
}

export interface PhotoImportResult {
  entities: number;
  added: number;
  duplicates: number;
  /** 저장을 다시 읽어 확인한 장수 — added 보다 적으면 저장이 실패한 것 */
  verified: number;
  failedKeys: string[];
}

/** 저장이 실제로 남았는지 다시 읽어 확인한다(IndexedDB 쓰기는 비동기 — 용량 초과는 콘솔로만 났다) */
async function verifyStored(entityKey: string, expectIds: string[], attempts = 10): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    const now = await getPhotosAsync(entityKey);
    if (now && expectIds.every(id => now.some(p => p.id === id))) return true;
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

/**
 * 사진 백업 파일(여러 개 가능)을 이 기기에 합친다. 같은 사진 id 는 그대로 두고 없는 것만 더한다.
 * 저장 결과를 다시 읽어 확인하고, 실패한 기록은 목록으로 돌려준다(호출 측이 사용자에게 알린다).
 */
export async function importPhotoBackup(files: PhotoBackupFile[]): Promise<PhotoImportResult> {
  // 같은 기록이 여러 파일에 있을 수 있다 — 기록별로 모아 한 번만 쓴다
  const byKey = new Map<string, PhotoEntry[]>();
  for (const f of files) {
    for (const item of f.items) {
      const list = byKey.get(item.entityKey);
      if (list) list.push(...item.photos);
      else byKey.set(item.entityKey, item.photos.slice());
    }
  }
  let added = 0;
  let duplicates = 0;
  let verified = 0;
  const failedKeys: string[] = [];
  let touched = 0;
  for (const [entityKey, incoming] of byKey) {
    const existing = (await getPhotosAsync(entityKey)) || [];
    const m = mergePhotoEntries(existing, incoming);
    duplicates += m.duplicates;
    if (m.added === 0) continue; // 더할 것이 없으면 쓰지 않는다(서버 재업로드도 피한다)
    const newIds = m.merged.filter(p => !existing.some(e => e.id === p.id)).map(p => p.id);
    try {
      setPhotos(entityKey, m.merged);
    } catch (e) {
      failedKeys.push(entityKey);
      console.error('[photoBackup] 사진 저장 실패:', entityKey, e);
      continue;
    }
    touched += 1;
    added += m.added;
    if (await verifyStored(entityKey, newIds)) verified += m.added;
    else failedKeys.push(entityKey);
  }
  return { entities: touched, added, duplicates, verified, failedKeys };
}
