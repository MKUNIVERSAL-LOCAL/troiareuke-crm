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

// ── NAS 동기화 dirty 추적 ─────────────────────────────────────
// 푸시가 실패한(오프라인 등) 엔티티는 dirty로 표시한다. dirty인 동안에는
// 서버본이 로컬을 덮어쓰지 못하고(사진 유실 방지), 재푸시로 해소된다.
const DIRTY_KEY = 'troiareuke_photos_dirty';

function getDirtyKeys(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DIRTY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setDirty(entityKey: string, dirty: boolean): void {
  try {
    const keys = new Set(getDirtyKeys());
    if (dirty) keys.add(entityKey);
    else keys.delete(entityKey);
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...keys]));
  } catch { /* noop */ }
}

// NAS 중앙 서버로 사진 백업. 실패 시 dirty로 표시해 다음 sync에서 재푸시.
function pushToNas(entityKey: string, photos: PhotoEntry[]): void {
  if (!isAuthApiConfigured) return;
  apiRequest(`/api/photos/${encodeURIComponent(entityKey)}`, {
    method: 'PUT',
    body: JSON.stringify({ photos }),
  })
    .then(() => setDirty(entityKey, false))
    .catch(e => {
      setDirty(entityKey, true);
      console.error(`[NAS] 사진 동기화 실패 (${entityKey}):`, e);
    });
}

/**
 * NAS에서 사진을 내려받아 로컬 캐시를 갱신한다 (다른 기기에서 올린 사진 반영).
 * 규칙:
 *  - dirty(푸시 실패분 보유) 키 → 로컬이 정본, 서버로 재푸시
 *  - 서버에 행이 있으면(빈 배열 = 삭제 tombstone 포함) 서버가 정본
 *  - 서버에 행이 없고 로컬에 사진이 있으면 로컬을 올린다 (최초 마이그레이션)
 * @returns 로컬 캐시가 바뀌었으면 true
 */
export async function syncPhotosFromNas(entityKeys: string[]): Promise<boolean> {
  if (!isAuthApiConfigured || entityKeys.length === 0) return false;

  const dirty = new Set(getDirtyKeys());
  for (const key of entityKeys) {
    if (dirty.has(key)) pushToNas(key, getPhotos(key));
  }
  const cleanKeys = entityKeys.filter(k => !dirty.has(k));
  if (cleanKeys.length === 0) return false;

  let changed = false;
  const changedKeys: string[] = [];

  // 배치 조회 (500키 단위) — 시술기록 수백 건에서 왕복 폭주 방지
  for (let i = 0; i < cleanKeys.length; i += 500) {
    const chunk = cleanKeys.slice(i, i + 500);
    let entries: Record<string, PhotoEntry[]>;
    try {
      const response = await apiRequest<{ entries: Record<string, PhotoEntry[]> }>(
        '/api/photos/batch',
        { method: 'POST', body: JSON.stringify({ keys: chunk }) },
      );
      entries = response.entries;
    } catch {
      continue; // 네트워크 실패 — 로컬 캐시 그대로 사용
    }

    for (const entityKey of chunk) {
      const remote = entries[entityKey]; // undefined = 서버에 행 없음
      const local = getPhotos(entityKey);
      if (remote !== undefined) {
        if (JSON.stringify(remote) !== JSON.stringify(local)) {
          try {
            if (remote.length === 0) localStorage.removeItem(storageKey(entityKey));
            else localStorage.setItem(storageKey(entityKey), JSON.stringify(remote));
            changed = true;
            changedKeys.push(entityKey);
          } catch { /* 로컬 캐시 용량 초과 — 서버본은 남아 있으므로 무시 */ }
        }
      } else if (local.length > 0) {
        pushToNas(entityKey, local);
      }
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
