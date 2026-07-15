// ═══════════════════════════════════════════════════════════════
// photoStore — 시술 전/후 사진 등 이미지 로컬 저장소 (비코어)
// ───────────────────────────────────────────────────────────────
// 설계 의도:
//  - 사진은 용량이 커서 Supabase 레코드(treatment_logs 등)에 섞으면
//    DB 컬럼 부재/동기화 폭주 문제가 생김. 그래서 코어 store.ts / DB와
//    완전히 분리해 localStorage에 base64로 보관한다(기기별).
//  - 업로드 시 클라이언트에서 리사이즈/압축하여 용량을 억제한다.
//  - ⚠️ NAS 백엔드 준비 시: 아래 getPhotos/setPhotos의 저장 계층만
//    회사 NAS 파일서버(또는 Supabase Storage 버킷) 호출로 교체하면 됨.
//    나머지 UI/호출부는 그대로 재사용 가능 (연동 지점 = 이 파일).
// ═══════════════════════════════════════════════════════════════

import { apiRequest, isAuthApiConfigured } from './authApi';

const PREFIX = 'troiareuke_photos_';

/** 사진이 NAS에서 갱신됐을 때 발생 (detail: { entityKeys: string[] }) */
export const PHOTOS_CHANGED_EVENT = 'crm:photos-changed';

/** 엔티티 키 규칙: `treatment:<logId>`, `customer:<customerId>` 등 */
function storageKey(entityKey: string): string {
  return `${PREFIX}${entityKey}`;
}

// NAS 중앙 서버로 사진 백업 (fire-and-forget — 실패해도 로컬 저장은 유지)
function pushToNas(entityKey: string, photos: PhotoEntry[]): void {
  if (!isAuthApiConfigured) return;
  apiRequest(`/api/photos/${encodeURIComponent(entityKey)}`, {
    method: 'PUT',
    body: JSON.stringify({ photos }),
  }).catch(e => console.error(`[NAS] 사진 동기화 실패 (${entityKey}):`, e));
}

/**
 * NAS에서 사진을 내려받아 로컬 캐시를 갱신한다 (다른 기기에서 올린 사진 반영).
 * 규칙: 서버에 행이 있으면 서버가 정본(로컬 덮어씀), 서버가 비어 있고
 * 로컬에 사진이 있으면 로컬을 서버로 올린다(최초 마이그레이션).
 * @returns 로컬 캐시가 바뀌었으면 true
 */
export async function syncPhotosFromNas(entityKeys: string[]): Promise<boolean> {
  if (!isAuthApiConfigured || entityKeys.length === 0) return false;
  let changed = false;
  const changedKeys: string[] = [];

  for (const entityKey of entityKeys) {
    try {
      const { photos: remote } = await apiRequest<{ photos: PhotoEntry[] }>(
        `/api/photos/${encodeURIComponent(entityKey)}`,
      );
      const local = getPhotos(entityKey);
      if (remote.length > 0) {
        if (JSON.stringify(remote) !== JSON.stringify(local)) {
          try {
            localStorage.setItem(storageKey(entityKey), JSON.stringify(remote));
            changed = true;
            changedKeys.push(entityKey);
          } catch { /* 로컬 캐시 용량 초과 — 서버본은 남아 있으므로 무시 */ }
        }
      } else if (local.length > 0) {
        pushToNas(entityKey, local);
      }
    } catch {
      // 네트워크 실패 — 로컬 캐시 그대로 사용
    }
  }

  if (changed) {
    window.dispatchEvent(new CustomEvent(PHOTOS_CHANGED_EVENT, { detail: { entityKeys: changedKeys } }));
  }
  return changed;
}

/** 해당 엔티티에 저장된 사진(base64 data URL) 목록 반환 */
export function getPhotos(entityKey: string): PhotoEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(entityKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 사진 목록 저장(덮어쓰기) — NAS 설정 시 서버에도 백업 */
export function setPhotos(entityKey: string, photos: PhotoEntry[]): void {
  try {
    if (photos.length === 0) {
      localStorage.removeItem(storageKey(entityKey));
    } else {
      localStorage.setItem(storageKey(entityKey), JSON.stringify(photos));
    }
  } catch (e) {
    // 용량 초과(QuotaExceeded) 등 — 조용히 실패하지 않고 상위에서 처리하도록 throw
    // (NAS 백업은 아래에서 계속 시도)
    pushToNas(entityKey, photos);
    throw e;
  }
  pushToNas(entityKey, photos);
}

/** 사진 1장 추가 후 갱신된 목록 반환 */
export function addPhoto(entityKey: string, photo: PhotoEntry): PhotoEntry[] {
  const next = [...getPhotos(entityKey), photo];
  setPhotos(entityKey, next);
  return next;
}

/** 특정 사진 삭제 후 갱신된 목록 반환 */
export function removePhoto(entityKey: string, photoId: string): PhotoEntry[] {
  const next = getPhotos(entityKey).filter(p => p.id !== photoId);
  setPhotos(entityKey, next);
  return next;
}

/** 엔티티의 모든 사진 삭제 (레코드 삭제 시 정리용) — NAS에서도 삭제 */
export function clearPhotos(entityKey: string): void {
  try { localStorage.removeItem(storageKey(entityKey)); } catch { /* noop */ }
  pushToNas(entityKey, []);
}

export interface PhotoEntry {
  id: string;
  dataUrl: string;   // base64 data URL (리사이즈됨)
  label?: 'before' | 'after' | string;
  takenAt: string;   // ISO 날짜 (촬영/업로드 시각)
}

/**
 * 이미지 파일을 최대 maxDim 픽셀로 리사이즈하고 JPEG로 압축해 base64 반환.
 * 원본이 세로/가로 어느 쪽이든 긴 변을 maxDim에 맞춘다.
 */
export function resizeImageFile(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('이미지 파일이 아닙니다.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('캔버스를 생성할 수 없습니다.')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** 간단한 사진 ID 생성기 (Date.now 회피 불필요 — 런타임 UI 전용) */
export function makePhotoId(): string {
  return `ph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
