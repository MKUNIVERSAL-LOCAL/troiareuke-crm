import { useState } from 'react';
import { AlertTriangle, RotateCcw, CheckCircle, Camera } from 'lucide-react';
import type { AdminBranchOverview, AdminBackupEntry } from '../../lib/adminApi';

/**
 * 어드민 > 전체 데이터 > 백업·복원 탭
 * - NAS의 일일 백업과 자동 스냅샷(복원·삭제 직전) 목록을 보여준다.
 * - [이 백업으로 복원] → 타이핑 확인("복원") → 서버가 복원 직전 스냅샷을 남기고 컬렉션을 통째로 되돌린다.
 * - 복원 후 지점 PC의 프로그램은 다시 시작해야 새 데이터를 읽는다(로컬 캐시).
 */

const LABELS: Record<string, string> = {
  customers: '고객', programs: '프로그램', customer_programs: '회권', treatment_logs: '시술기록', products: '제품',
  product_sales: '제품판매', payments: '결제', staff: '직원', services: '시술메뉴', reservations: '예약',
  shop_settings: '샵설정', message_templates: '템플릿', message_history: '메시지이력', consultations: '상담', expenses: '지출',
};

interface Props {
  branch: AdminBranchOverview;
  backups: AdminBackupEntry[];
  backupDirConfigured: boolean;
  onRestore: (payload: { branchId: string; label: string; collections?: string[]; includePhotos: boolean }) =>
    Promise<{ restored: Record<string, number>; photos: number; snapshot: string | null }>;
}

export default function BackupRestoreView({ branch, backups, backupDirConfigured, onRestore }: Props) {
  const [target, setTarget] = useState<AdminBackupEntry | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includePhotos, setIncludePhotos] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  function openRestore(b: AdminBackupEntry) {
    setTarget(b);
    setSelected(new Set(b.collections));
    setIncludePhotos(b.hasPhotos);
    setConfirmText('');
    setResult('');
    setError('');
  }

  async function runRestore() {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      const r = await onRestore({
        branchId: branch.branchId,
        label: target.label,
        collections: selected.size === target.collections.length ? undefined : [...selected],
        includePhotos,
      });
      const total = Object.values(r.restored).reduce((a, n) => a + n, 0);
      setResult(`복원 완료 — 레코드 ${total.toLocaleString()}건, 사진 묶음 ${r.photos}개. 복원 직전 상태는 스냅샷 "${r.snapshot}"으로 남겼습니다. 지점 PC의 프로그램을 다시 시작하면 반영됩니다.`);
      setTarget(null);
    } catch (e: any) {
      setError(e?.message || '복원에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR') : '');

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 text-sm text-amber-200 flex gap-3">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">복원은 선택한 항목을 백업 시점으로 통째로 되돌립니다.</p>
          <p className="text-xs text-amber-200/80">
            그 이후 입력된 데이터는 사라지지만, 서버가 복원 직전 상태를 자동 스냅샷으로 남기므로 되돌리기가 가능합니다.
            복원 후에는 해당 지점 PC에서 프로그램을 닫고 다시 켜 주세요. 일일 백업은 매일 새벽 4시에 만들어지고 {`${branch.branchName || branch.branchId}`} 지점 폴더에 14일 보관됩니다.
          </p>
        </div>
      </div>

      {result && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-5 py-3 text-sm text-emerald-300 flex gap-2">
          <CheckCircle size={16} className="shrink-0 mt-0.5" /> {result}
        </div>
      )}

      {!backupDirConfigured ? (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-8 text-center text-sm text-slate-500">
          서버에 백업 폴더(BACKUP_DIR)가 설정되어 있지 않습니다.
        </div>
      ) : backups.length === 0 ? (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-8 text-center text-sm text-slate-500">
          이 지점의 백업이 아직 없습니다. 대시보드의 [지금 서버 백업]으로 첫 백업을 만들 수 있습니다.
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5 font-medium">백업</th>
                <th className="px-4 py-2.5 font-medium">종류</th>
                <th className="px-4 py-2.5 font-medium">포함 데이터</th>
                <th className="px-4 py-2.5 font-medium w-44">생성 시각</th>
                <th className="px-4 py-2.5 font-medium w-32"></th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.label} className="border-b border-slate-800/60">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{b.label}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {b.kind === 'daily'
                      ? <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300">일일 백업</span>
                      : <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 flex items-center gap-1 w-fit"><Camera size={10} /> 자동 스냅샷</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {b.collections.map(c => LABELS[c] || c).join(' · ') || '—'}{b.hasPhotos ? ' · 사진' : ''}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{fmt(b.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => openRestore(b)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 transition-colors"
                    >
                      <RotateCcw size={12} /> 이 백업으로 복원
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {target && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => !busy && setTarget(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <RotateCcw size={16} className="text-amber-400" /> "{target.label}" 백업으로 복원
            </h3>
            <p className="text-xs text-slate-400">지점: <span className="text-slate-200">{branch.branchName || branch.branchId}</span></p>

            <div>
              <p className="text-xs font-bold text-slate-300 mb-2">복원할 항목</p>
              <div className="flex flex-wrap gap-1.5">
                {target.collections.map(c => {
                  const on = selected.has(c);
                  return (
                    <button
                      key={c}
                      onClick={() => setSelected(prev => { const next = new Set(prev); if (next.has(c)) next.delete(c); else next.add(c); return next; })}
                      className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${on ? 'bg-amber-600/20 border-amber-500/40 text-amber-200' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                    >
                      {LABELS[c] || c}
                    </button>
                  );
                })}
                {target.hasPhotos && (
                  <button
                    onClick={() => setIncludePhotos(v => !v)}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${includePhotos ? 'bg-amber-600/20 border-amber-500/40 text-amber-200' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                  >
                    시술 사진
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">선택한 항목은 현재 데이터를 지우고 백업 시점 데이터로 교체됩니다. 선택하지 않은 항목은 그대로 유지됩니다.</p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300">확인을 위해 <span className="text-amber-300">복원</span> 이라고 입력하세요</label>
              <input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                className="mt-1.5 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                placeholder="복원"
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setTarget(null)} disabled={busy} className="px-4 py-2 text-sm rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50">취소</button>
              <button
                onClick={runRestore}
                disabled={busy || confirmText.trim() !== '복원' || (selected.size === 0 && !includePhotos)}
                className="px-4 py-2 text-sm font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40"
              >
                {busy ? '복원 중…' : '복원 실행'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
