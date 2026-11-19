import { useMemo, useRef, useState } from 'react';
import { Download, Upload, AlertTriangle } from 'lucide-react';
import { buildBackup, summarizeBackup, saveBackupFile, parseBackup, restoreBackup, RESTORE_ALLOWED, type BackupFile } from '../../lib/fullBackup';
import { SettingsStore } from '../../lib/store';
import { notify } from '../../lib/notify';

/**
 * 설정 > 데이터 백업 — 전체 백업 파일 저장·복원 (2026-11-18)
 * PC(다운로드)·모바일(공유 시트) 공용. 복원은 로컬 모드 전용, 미리보기 → confirm → 덮어쓰기 → 새로고침(성공 시 자동, 실패(롤백)는 이유를 보여 주고 [새로고침] 버튼 — 스토어 캐시를 남기지 않기 위해).
 */
export default function BackupRestoreCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ file: BackupFile; name: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  // 마운트 때 한 번만 — 설정 화면의 다른 입력이 바뀔 때마다 전 테이블을 파싱하지 않게
  const current = useMemo(() => summarizeBackup(buildBackup(__APP_VERSION__, SettingsStore.get().name)), []);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await saveBackupFile(buildBackup(__APP_VERSION__, SettingsStore.get().name));
      (result === 'cancelled' ? notify.info : notify)(result === 'shared' ? '백업 파일을 공유 시트로 전달했습니다.' : result === 'cancelled' ? '공유를 취소했습니다 — 백업 파일은 저장되지 않았습니다.' : '백업 파일을 다운로드했습니다.');
    } catch (e) {
      notify(e instanceof Error ? e.message : '백업 파일을 만들지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const parsed = parseBackup(await f.text());
      setPending({ file: parsed, name: f.name });
    } catch (err) {
      notify(err instanceof Error ? err.message : '백업 파일을 읽지 못했습니다.');
    }
  }

  function handleRestore() {
    if (!pending) return;
    const summary = summarizeBackup(pending.file).slice(0, 4).map(s => `${s.label} ${s.count}`).join(', ');
    if (!window.confirm(`지금 이 기기의 매장 데이터를 모두 지우고 백업 파일(${pending.name})로 바꿀까요?\n${summary}\n되돌릴 수 없습니다. 복원 뒤 화면이 새로고침됩니다.`)) return;
    setRestoring(true);
    setRestoreError('');
    try {
      const { written, skipped } = restoreBackup(pending.file);
      notify(`${written}개 테이블을 복원했습니다.${skipped ? ` (이름이 올바르지 않은 ${skipped}개 건너뜀)` : ''} 새로고침합니다.`);
      // 메모리 캐시가 localStorage와 어긋나 있을 수 있어 반드시 새로 읽는다
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      // 실패(롤백 완료)도 캐시를 다시 읽어야 하지만, 자동 새로고침은 이유를 담은 토스트를 지워 버린다 — 이유를 남기고 [새로고침]은 사용자가 (UX 점검 2026-11-19)
      setRestoreError(err instanceof Error ? err.message : '복원에 실패했습니다.');
      setRestoring(false);
    }
  }

  const pendingSummary = pending ? summarizeBackup(pending.file) : [];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="backup-restore-card">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">전체 백업 파일 저장·복원</h3>
      </div>
      <div className="px-6 py-5 space-y-4">
        <p className="text-sm text-gray-500">
          고객·예약·시술·결제·프로그램·설정 등 이 매장의 모든 데이터를 JSON 파일 하나로 저장합니다. PC 교체·포맷 전, 그리고 주 1회 저장을 권장합니다.
          사진과 문자 발송 API 키는 포함되지 않습니다. 새 기기에서는 먼저 가입·로그인한 뒤 복원하세요.
        </p>
        {restoreError && (
          <div role="alert" className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
            <span>복원 실패: {restoreError} 이전 데이터로 되돌렸습니다. 화면을 새로고침해 저장소를 다시 읽어주세요.</span>
            <button type="button" onClick={() => window.location.reload()} className="ml-auto px-3 py-1.5 rounded-lg bg-white border border-rose-300 text-xs font-medium hover:bg-rose-100">새로고침</button>
          </div>
        )}
        {current.length > 0 && (
          <p className="text-xs text-gray-400">지금 이 기기: {current.slice(0, 5).map(s => `${s.label} ${s.count}`).join(' · ')}</p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 min-h-[44px] bg-[#1a3a8f] text-white text-sm font-medium rounded-xl hover:bg-[#15306e] disabled:opacity-50">
            <Download size={16} />{saving ? '만드는 중...' : '백업 파일 저장'}
          </button>
          {RESTORE_ALLOWED && (
            <>
              <input ref={fileRef} type="file" accept=".json,application/json,application/octet-stream" onChange={handlePick} className="hidden" aria-label="백업 파일 선택" />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2.5 min-h-[44px] bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200">
                <Upload size={16} />백업 파일에서 복원
              </button>
            </>
          )}
        </div>
        {!RESTORE_ALLOWED && (
          <p className="text-xs text-gray-400">서버 연동 매장은 서버가 데이터의 정본이라 이 기기에서 복원하지 않습니다. 기기를 바꾸면 로그인만 하면 됩니다. 이 파일은 <b>이 기기 캐시의 사본</b>이라 다른 기기에서 쓴 기록이 빠지거나 오래됐을 수 있습니다 — 서버 백업은 어드민 콘솔에서.</p>
        )}
        {pending && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2" data-testid="restore-preview" role="status" aria-live="polite">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5"><AlertTriangle size={14} />복원 미리보기 — {pending.name}</p>
            <p className="text-xs text-amber-800">
              만든 날짜 {pending.file.createdAt.slice(0, 10)} · 앱 v{pending.file.appVersion}{pending.file.shopName ? ` · ${pending.file.shopName}` : ''}
            </p>
            <p className="text-xs text-amber-800">{pendingSummary.map(s => `${s.label} ${s.count}`).join(' · ') || '테이블 없음'}</p>
            <p className="text-xs text-amber-700">지금 이 기기의 매장 데이터는 전부 이 파일로 바뀝니다. 먼저 위 [백업 파일 저장]으로 현재 상태를 남겨 두세요. 구글 캘린더를 연동했다면 복원 뒤 기존 일정이 한 번 더 만들어질 수 있습니다.</p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setPending(null)} disabled={restoring} className="px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 bg-white disabled:opacity-50">취소</button>
              <button type="button" onClick={handleRestore} disabled={restoring}
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
                {restoring ? '복원 중...' : '복원 실행'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
