// PilotMetricsPanel — 어드민 대시보드 "파일럿 지표"(초기 설정 완료율·활용률·활동 상태) (비코어, 164, PHASE 6, docs/PILOT-CHECKLIST.md 7절)
// 자료는 서버 /api/admin/overview 의 지점별 컬렉션 건수(서버 집계), 비율·등급은 순수 pilotMetricsRule. 승인 대기·거부 신청자 지점은 뺀다(어드민 다른 화면과 같은 기준).
import { useEffect, useState } from 'react';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { isAuthApiConfigured, adminListUsers } from '../../lib/authApi';
import { fetchAdminOverview } from '../../lib/adminApi';
import { approvedBranchUsers } from '../../lib/adminBranches';
import { formatDateTime } from '../../lib/format';
import { pilotSummary, ACTIVITY_LABEL, type PilotSummary, type ActivityLevel } from '../../lib/pilotMetricsRule';

const ACTIVITY_CLASS: Record<ActivityLevel, string> = {
  active: 'bg-emerald-500/15 text-emerald-300', idle: 'bg-amber-500/15 text-amber-300', dormant: 'bg-red-500/15 text-red-300', none: 'bg-slate-700 text-slate-300',
};

export default function PilotMetricsPanel() {
  const [summary, setSummary] = useState<PilotSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    if (!isAuthApiConfigured) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [{ branches }, users] = await Promise.all([fetchAdminOverview(), adminListUsers()]);
      const approved = new Map<string, string>();
      for (const u of approvedBranchUsers(users)) if (u.branchId && !approved.has(u.branchId)) approved.set(u.branchId, u.branchName || u.shopName || u.branchId);
      const rows = branches.filter(b => approved.has(b.branchId)).map(b => ({
        branchId: b.branchId, name: approved.get(b.branchId) || b.branchName || b.branchId,
        counts: { recordCounts: b.recordCounts || {}, photoCount: b.photoCount || 0, messageCount: b.messageCount || 0, lastActivity: b.lastActivity },
      }));
      setSummary(pilotSummary(rows, new Date()));
    } catch (e: unknown) {
      setSummary(null);
      setError(`파일럿 지표를 불러오지 못했습니다: ${e instanceof Error ? e.message : '서버 오류'}`);
    }
    setLoading(false);
  }

  if (!isAuthApiConfigured) return null; // 로컬 모드에는 지점 집계가 없다

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden mb-8" data-testid="pilot-metrics">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2"><ClipboardCheck size={15} className="text-emerald-400" /> 파일럿 지표</h2>
          <p className="text-xs text-slate-500 mt-0.5">초기 설정 6단계 완료율 · 활용 7영역 비율 · 마지막 활동(7일/30일). 서버 집계 건수 기준 — 정의는 PILOT-CHECKLIST 7절</p>
        </div>
        <button type="button" onClick={() => void load()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-200 bg-slate-800 rounded-lg hover:bg-slate-700"><RefreshCw size={12} /> 다시 불러오기</button>
      </div>
      {error && <p className="px-5 py-3 text-xs text-red-300">{error} <button type="button" onClick={() => void load()} className="underline ml-1">다시 시도</button></p>}
      {loading && !summary && !error && <p className="px-5 py-4 text-xs text-slate-500">불러오는 중…</p>}
      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-5 py-4">
            {[
              { label: '지점', value: String(summary.branches) },
              { label: '평균 초기 설정 완료율', value: summary.avgSetupPct === null ? '-' : `${summary.avgSetupPct}%` },
              { label: '평균 활용률', value: summary.avgUtilizationPct === null ? '-' : `${summary.avgUtilizationPct}%` },
              { label: '활동 중 / 뜸함 / 휴면·기록 없음', value: `${summary.byActivity.active} / ${summary.byActivity.idle} / ${summary.byActivity.dormant + summary.byActivity.none}` }, // 기록 없는 신규 지점을 휴면으로 읽지 않게 (170 리뷰 L-7)
            ].map(c => (
              <div key={c.label} data-testid={`pilot-stat-${c.label}`} className="bg-slate-800/60 rounded-xl px-4 py-3">
                <p className="text-lg font-bold text-white">{c.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-400"><tr><th className="text-left px-5 py-2">지점</th><th className="text-right px-3 py-2">초기 설정</th><th className="text-left px-3 py-2">남은 단계</th><th className="text-right px-3 py-2">활용률</th><th className="text-left px-3 py-2">활동</th><th className="text-left px-3 py-2">마지막 활동</th></tr></thead>
              <tbody>
                {summary.rows.length === 0 && <tr><td colSpan={6} className="px-5 py-5 text-center text-slate-500">승인된 지점이 없습니다.</td></tr>}
                {summary.rows.map(r => (
                  <tr key={r.branchId} className="border-t border-slate-800 text-slate-200" data-testid="pilot-row">
                    <td className="px-5 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-right"><span className={clsx(r.setupPct === 100 ? 'text-emerald-300' : r.setupPct >= 50 ? 'text-amber-300' : 'text-red-300')}>{r.setupPct}%</span></td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{r.missing.length ? r.missing.join(' · ') : '완료'}</td>
                    <td className="px-3 py-2.5 text-right">{r.utilizationPct}%</td>
                    <td className="px-3 py-2.5"><span className={clsx('text-xs px-2 py-0.5 rounded-full', ACTIVITY_CLASS[r.activity])}>{ACTIVITY_LABEL[r.activity]}</span></td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{r.lastActivity ? formatDateTime(r.lastActivity) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
