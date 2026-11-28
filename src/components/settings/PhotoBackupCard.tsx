import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, Image as ImageIcon } from 'lucide-react';
import { askConfirm } from '../../lib/confirmDialog';
import { notify } from '../../lib/notify';
import { SettingsStore } from '../../lib/store';
import { isAuthApiConfigured } from '../../lib/authApi';
import {
  collectPhotoInventory, sumInventory, formatBytes, parsePhotoBackup, savePhotoBackup, importPhotoBackup,
  PHOTO_PART_MAX_BYTES, type PhotoBackupFile,
} from '../../lib/photoBackup';
import { formatDateTime } from '../../lib/format';

/**
 * 설정 > 백업·보안 — 전/후 사진 내보내기·가져오기 (228, GAP C-3)
 * 사진은 전체 백업 파일에 들어가지 않는다(용량). 로컬 모드 매장에서는 이 기기가 사진의 유일한 보관처라
 * PC 교체·포맷 전에 반드시 따로 내보내야 한다. 용량이 크면 40MB 단위로 여러 파일로 나눠 저장한다.
 */
export default function PhotoBackupCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [inv, setInv] = useState<{ entities: number; photos: number; bytes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ files: PhotoBackupFile[]; names: string[]; photos: number } | null>(null);

  const refresh = useCallback(() => {
    let alive = true;
    void collectPhotoInventory()
      .then(list => { if (alive) setInv(sumInventory(list)); })
      .catch(() => { if (alive) setInv(null); });
    return () => { alive = false; };
  }, []);

  useEffect(() => refresh(), [refresh]);

  async function handleExport() {
    setBusy(true);
    try {
      const r = await savePhotoBackup(__APP_VERSION__, SettingsStore.get().name, PHOTO_PART_MAX_BYTES);
      if (r.cancelled) notify.info('공유를 취소했습니다 — 사진 파일은 저장되지 않았습니다.');
      else notify(`사진 ${r.photos}장(${formatBytes(r.bytes)})을 파일 ${r.parts}개로 ${r.shared ? '공유했습니다' : '저장했습니다'}.${r.parts > 1 ? ' 파일 전부를 같은 곳에 보관하세요.' : ''}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : '사진을 내보내지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;
    const files: PhotoBackupFile[] = [];
    const names: string[] = [];
    const failed: string[] = [];
    for (const f of picked) {
      try {
        files.push(parsePhotoBackup(await f.text()));
        names.push(f.name);
      } catch (err) {
        failed.push(`${f.name}: ${err instanceof Error ? err.message : '읽지 못했습니다'}`);
      }
    }
    if (failed.length > 0) notify(failed.join('\n'));
    if (files.length === 0) return;
    setPending({ files, names, photos: files.reduce((s, f) => s + f.items.reduce((n, i) => n + i.photos.length, 0), 0) });
  }

  async function handleImport() {
    if (!pending) return;
    if (!(await askConfirm({
      title: '사진 가져오기',
      message: `파일 ${pending.names.length}개의 사진 ${pending.photos}장을 이 기기에 추가할까요?\n이미 있는 사진은 그대로 두고 없는 것만 더합니다.${isAuthApiConfigured ? '\n서버 연동 매장이라 추가된 사진은 서버에도 올라갑니다.' : ''}`,
      confirmLabel: '가져오기',
      cancelLabel: '닫기',
    }))) return;
    setBusy(true);
    try {
      const r = await importPhotoBackup(pending.files);
      const parts = [`사진 ${r.verified}장을 ${r.entities}개 기록에 추가했습니다`];
      if (r.duplicates > 0) parts.push(`이미 있던 ${r.duplicates}장은 건너뜀`);
      if (r.failedKeys.length > 0 || r.verified < r.added) {
        notify(`${parts.join(' · ')}. 다만 ${Math.max(r.added - r.verified, r.failedKeys.length)}장은 저장 공간 부족으로 저장되지 않았습니다 — 저장소를 정리한 뒤 같은 파일로 다시 시도하세요.`);
      } else {
        notify(`${parts.join(' · ')}.`);
      }
      setPending(null);
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : '사진을 가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="photo-backup-card">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><ImageIcon size={14} />전/후 사진 내보내기·가져오기</h3>
      </div>
      <div className="px-6 py-5 space-y-4">
        <p className="text-sm text-gray-500">
          사진은 용량이 커서 위 전체 백업 파일에 들어가지 않습니다. {isAuthApiConfigured
            ? '서버 연동 매장은 사진이 서버에 보관되지만, 이 파일로도 따로 보관해 둘 수 있습니다.'
            : '이 기기가 사진의 유일한 보관처이므로 PC 교체·포맷 전에 반드시 내보내 두세요.'}
          {' '}용량이 크면 40MB 단위로 여러 파일로 나뉩니다. 고객 얼굴 사진이 담긴 파일이므로 외부 공유를 금지하고 안전한 곳에 보관하세요.
        </p>
        <p className="text-xs text-gray-400" data-testid="photo-backup-inventory">
          {inv === null ? '사진을 세는 중...' : inv.photos === 0 ? '이 기기에 저장된 사진이 없습니다.' : `지금 이 기기: 사진 ${inv.photos}장 · 기록 ${inv.entities}건 · 약 ${formatBytes(inv.bytes)}`}
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleExport} disabled={busy || !inv || inv.photos === 0}
            className="flex items-center gap-2 px-5 py-2.5 min-h-[44px] bg-[#1a3a8f] text-white text-sm font-medium rounded-xl hover:bg-[#15306e] disabled:opacity-50">
            <Download size={16} />{busy ? '처리 중...' : '사진 파일 저장'}
          </button>
          <input ref={fileRef} type="file" multiple accept=".json,application/json,application/octet-stream" onChange={handlePick} className="hidden" aria-label="사진 백업 파일 선택" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
            className="flex items-center gap-2 px-5 py-2.5 min-h-[44px] bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 disabled:opacity-50">
            <Upload size={16} />사진 파일에서 가져오기
          </button>
        </div>
        {pending && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2" data-testid="photo-import-preview" role="status" aria-live="polite">
            <p className="text-sm font-semibold text-blue-900">가져오기 미리보기 — 파일 {pending.names.length}개 · 사진 {pending.photos}장</p>
            <p className="text-xs text-blue-800">
              {pending.names.slice(0, 3).join(', ')}{pending.names.length > 3 ? ` 외 ${pending.names.length - 3}개` : ''}
              {pending.files[0]?.createdAt ? ` · 만든 시각 ${formatDateTime(pending.files[0].createdAt)}` : ''}
              {pending.files[0]?.parts && pending.files[0].parts > 1 ? ` · 전체 ${pending.files[0].parts}개 중 ${pending.files.length}개 선택` : ''}
            </p>
            <p className="text-xs text-blue-700">이미 있는 사진은 그대로 두고 파일에만 있는 사진을 더합니다. 기존 사진이 지워지지 않습니다.</p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setPending(null)} disabled={busy} className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 bg-white disabled:opacity-50">취소</button>
              <button type="button" onClick={handleImport} disabled={busy}
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-[#1a3a8f] text-white hover:bg-[#15306e] disabled:opacity-50">
                {busy ? '가져오는 중...' : '가져오기 실행'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
