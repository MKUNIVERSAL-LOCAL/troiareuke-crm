// AiService — 어드민 "AI 서비스 관리" (/admin/subscriptions?view=ai, 비코어, 162, docs/AI-GATEWAY-ARCHITECTURE.md 6절)
// 라우트는 코어 App.tsx 를 건드리지 않기 위해 구독 화면의 쿼리 뷰로 붙인다(통계 ?view=data 방식).
// 서버 모듈(161)이 없으면(404) "미배포" 상태를 그대로 보여준다 — 가짜 숫자 금지. 카탈로그 배포는 기존 플래그 경로라 지금도 동작한다.
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, RefreshCw, Coins, Save, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { notify } from '../../lib/notify';
import { isAuthApiConfigured } from '../../lib/authApi';
import { formatDateTime, todayISO } from '../../lib/format';
import AdminDialog from '../../components/admin/AdminDialog';
import { fetchAdminAiSummary, fetchAdminAiBranches, adminGrantAiCredits, fetchAiCatalogFlag, saveAiCatalogFlag, AiModuleNotDeployed, type AdminAiSummary, type AdminAiBranchRow } from '../../lib/adminAi';
import { DEFAULT_CATALOG, isAiModel, type AiModel } from '../../lib/ai/catalog';
import { DEFAULT_FX_KRW_PER_USD } from '../../lib/ai/creditLedgerRule';
import type { AiProvider } from '../../lib/ai/types';

const NAS_MODE = isAuthApiConfigured;
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const num = (n: number) => n.toLocaleString('ko-KR');

export default function AdminAiService() {
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [summary, setSummary] = useState<AdminAiSummary | null>(null);
  const [branches, setBranches] = useState<AdminAiBranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notDeployed, setNotDeployed] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [grantFor, setGrantFor] = useState<AdminAiBranchRow | null>(null);

  useEffect(() => { void load(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    if (!NAS_MODE) { setLoading(false); return; }
    setLoading(true); setLoadError(''); setNotDeployed(false);
    try {
      const [s, b] = await Promise.all([fetchAdminAiSummary(month), fetchAdminAiBranches(month)]);
      setSummary(s); setBranches(b);
    } catch (e: unknown) {
      setSummary(null); setBranches([]);
      if (e instanceof AiModuleNotDeployed) setNotDeployed(true);
      else setLoadError(`AI 사용 현황을 불러오지 못했습니다: ${e instanceof Error ? e.message : '서버 오류'}`);
    }
    setLoading(false);
  }

  // 마진 [추정] — 크레딧 1 = 1원 가설(creditLedgerRule), 원가 = USD × 기본 환율
  const costKrw = summary ? summary.usd * DEFAULT_FX_KRW_PER_USD : 0;
  const marginKrw = summary ? summary.credits - costKrw : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8" data-testid="admin-ai-service">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Sparkles size={22} className="text-amber-400" /> AI 서비스 관리</h1>
          <p className="text-slate-400 text-sm mt-1">본사 Managed AI 의 사용량·원가·크레딧과 지점 배포 모델 카탈로그. 숫자는 서버가 계측한 값이며 원가·마진은 [추정]입니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="ai-month" className="text-xs text-slate-400">기준 월</label>
          <input id="ai-month" type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2" />
          <button type="button" onClick={() => void load()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 rounded-xl hover:bg-slate-700"><RefreshCw size={14} /> 다시 불러오기</button>
        </div>
      </div>

      {!NAS_MODE && <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-6">NAS 중앙 서버 모드에서만 사용할 수 있습니다.</p>}
      {NAS_MODE && notDeployed && (
        <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-6" data-testid="ai-not-deployed">
          <p className="font-semibold">서버 AI 게이트웨이 모듈이 아직 배포되지 않았습니다.</p>
          <p className="text-amber-200/80 mt-1">사용량·원가·크레딧은 승인 B-2(서버 배포)·C-7(공식 API 프로젝트) 뒤 161 묶음에서 켜집니다(설계: docs/AI-GATEWAY-ARCHITECTURE.md). 지금은 지점이 자기 키로 쓰는 BYOK 와 기존 /api/ai 중계(월 300회)가 동작합니다. 아래 모델 카탈로그 배포는 지금도 됩니다.</p>
          <button type="button" onClick={() => void load()} className="mt-2 px-3 py-1.5 text-xs font-medium text-amber-100 bg-amber-500/20 rounded-lg hover:bg-amber-500/30">다시 시도</button>
        </div>
      )}
      {NAS_MODE && loadError && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6">
          {loadError} <button type="button" onClick={() => void load()} className="ml-2 underline">다시 시도</button>
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {[
              { label: '이달 호출', value: num(summary.calls), sub: `활성 지점 ${summary.activeBranches}곳` },
              { label: '토큰(입력/출력)', value: `${num(summary.inputTokens)} / ${num(summary.outputTokens)}`, sub: '서버 계측' },
              { label: '추정 원가', value: `$${summary.usd.toFixed(2)}`, sub: `≈ ${won(costKrw)} [추정, 환율 ${num(DEFAULT_FX_KRW_PER_USD)}]` },
              { label: '크레딧 차감 · 마진', value: `${num(summary.credits)}`, sub: `마진 [추정] ${won(marginKrw)} · 실패 ${summary.failRate === null ? '-' : `${summary.failRate}%`} · 폴백 ${summary.fallbackRate === null ? '-' : `${summary.fallbackRate}%`}` },
            ].map(c => (
              <div key={c.label} data-testid={`ai-stat-${c.label}`} className="bg-slate-900 border border-slate-700/50 rounded-2xl px-5 py-4">
                <p className="text-xl font-bold text-white break-all">{c.value}</p>
                <p className="text-xs text-slate-400 mt-1">{c.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between"><h2 className="text-sm font-bold text-white">지점별 사용·크레딧</h2><span className="text-xs text-slate-500">{branches.length}곳</span></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-400"><tr><th className="text-left px-5 py-2">지점</th><th className="text-left px-3 py-2">플랜</th><th className="text-right px-3 py-2">호출</th><th className="text-right px-3 py-2">토큰</th><th className="text-right px-3 py-2">원가</th><th className="text-right px-3 py-2">크레딧 사용/잔액</th><th className="text-left px-3 py-2">마지막 호출</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>
                  {branches.length === 0 && <tr><td colSpan={8} className="px-5 py-6 text-center text-slate-500">이달 AI 를 쓴 지점이 없습니다.</td></tr>}
                  {branches.map(b => (
                    <tr key={b.branchId} className="border-t border-slate-800 text-slate-200" data-testid="ai-branch-row">
                      <td className="px-5 py-2.5 font-medium">{b.branchName || b.branchId}</td>
                      <td className="px-3 py-2.5 text-slate-400">{b.plan}</td>
                      <td className="px-3 py-2.5 text-right">{num(b.calls)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-400">{num(b.inputTokens + b.outputTokens)}</td>
                      <td className="px-3 py-2.5 text-right">${b.usd.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right">{num(b.creditsUsed)} / <span className={b.creditsBalance < 200 ? 'text-amber-300' : ''}>{num(b.creditsBalance)}</span></td>
                      <td className="px-3 py-2.5 text-slate-400">{b.lastCallAt ? formatDateTime(b.lastCallAt) : '-'}</td>
                      <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => setGrantFor(b)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-200 bg-amber-500/15 rounded-lg hover:bg-amber-500/25" aria-label={`${b.branchName || b.branchId} 크레딧 지급`}><Coins size={12} /> 크레딧 지급</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {summary.byModel.length > 0 && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5 mb-6">
              <h2 className="text-sm font-bold text-white mb-3">모델별 호출·원가</h2>
              <div className="flex flex-wrap gap-2">
                {summary.byModel.map(m => (
                  <span key={`${m.provider}:${m.model}`} className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-200">{m.provider} · {m.model} · {num(m.calls)}회 · ${m.usd.toFixed(2)}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {NAS_MODE && loading && !summary && <p className="text-sm text-slate-500 mb-6">불러오는 중…</p>}

      {NAS_MODE && <CatalogEditor />}

      {grantFor && <GrantDialog row={grantFor} onClose={() => setGrantFor(null)} onDone={() => { setGrantFor(null); void load(); }} />}
    </div>
  );
}

function GrantDialog({ row, onClose, onDone }: { row: AdminAiBranchRow; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('500');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const n = parseInt(amount.replace(/[^\d]/g, ''), 10);
    if (!Number.isInteger(n) || n <= 0 || n > 1_000_000) { notify.error('1 ~ 1,000,000 크레딧 사이 정수로 입력해주세요.'); return; }
    if (!note.trim()) { notify.error('지급 사유를 입력해주세요(감사 기록).'); return; }
    setBusy(true);
    try {
      const r = await adminGrantAiCredits({ branchId: row.branchId, amount: n, note: note.trim() });
      notify.success(`${row.branchName || row.branchId}에 ${n.toLocaleString('ko-KR')} 크레딧을 지급했습니다. 잔액 ${r.balance.toLocaleString('ko-KR')}.`);
      onDone();
    } catch (e: unknown) {
      notify.error(`크레딧 지급 실패: ${e instanceof Error ? e.message : '서버 오류'}`);
    }
    setBusy(false);
  };
  return (
    <AdminDialog title={`크레딧 지급 — ${row.branchName || row.branchId}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-400">현재 잔액 {row.creditsBalance.toLocaleString('ko-KR')} 크레딧. 지급은 원장에 grant 행으로 남고 되돌릴 수 없습니다(차감은 서버가 호출마다).</p>
        <div><label htmlFor="grant-amount" className="block text-xs text-slate-400 mb-1">지급 크레딧</label><input id="grant-amount" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl px-3 py-2" /></div>
        <div><label htmlFor="grant-note" className="block text-xs text-slate-400 mb-1">사유</label><input id="grant-note" value={note} onChange={e => setNote(e.target.value)} placeholder="예: 파일럿 보상, 장애 보상" className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-xl px-3 py-2" /></div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 text-sm text-slate-300 bg-slate-800 rounded-xl">취소</button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="flex-1 py-2 text-sm font-medium text-white bg-amber-600 rounded-xl disabled:opacity-50" data-testid="grant-submit">{busy ? '지급 중…' : '지급'}</button>
        </div>
      </div>
    </AdminDialog>
  );
}

/** 지점 배포 모델 카탈로그 — 기능 플래그 'ai.catalog' payload. 저장하면 지점 앱이 다음 로드에 반영(150·154) */
function CatalogEditor() {
  const [rows, setRows] = useState<AiModel[]>(DEFAULT_CATALOG);
  const [remote, setRemote] = useState<AiModel[] | null | undefined>(undefined); // undefined = 아직 안 읽음
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetchAiCatalogFlag().then(c => { setRemote(c); if (c) setRows(c); }).catch((e: unknown) => setError(`카탈로그를 불러오지 못했습니다: ${e instanceof Error ? e.message : '서버 오류'}`));
  }, []);
  const invalid = useMemo(() => rows.map((r, i) => (isAiModel(r) ? null : i + 1)).filter((x): x is number => x !== null), [rows]);
  const set = (i: number, patch: Partial<AiModel>) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const save = async () => {
    if (invalid.length) { notify.error(`${invalid.join(', ')}행의 값을 확인해주세요(제공사·id·가격 ≥ 0).`); return; }
    const providers = new Set(rows.map(r => r.provider));
    if (providers.size < 1) { notify.error('모델이 최소 1개 필요합니다.'); return; }
    setSaving(true);
    try { await saveAiCatalogFlag(rows); setRemote(rows); notify.success('모델 카탈로그를 배포했습니다. 지점 앱은 다음 실행(플래그 갱신) 때 반영합니다.'); }
    catch (e: unknown) { notify.error(`배포 실패: ${e instanceof Error ? e.message : '서버 오류'}`); }
    setSaving(false);
  };
  const reset = async () => {
    setSaving(true);
    try { await saveAiCatalogFlag(null); setRemote(null); setRows(DEFAULT_CATALOG); notify.success('기본 카탈로그로 되돌렸습니다.'); }
    catch (e: unknown) { notify.error(`되돌리기 실패: ${e instanceof Error ? e.message : '서버 오류'}`); }
    setSaving(false);
  };
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden" data-testid="ai-catalog-editor">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div><h2 className="text-sm font-bold text-white">지점 배포 모델 카탈로그</h2><p className="text-xs text-slate-500 mt-0.5">가격은 USD/100만 토큰 참고값(지점 화면 "추정" 표시용). {remote === undefined ? '불러오는 중…' : remote ? '본사 배포본 사용 중' : '기본값 사용 중(배포본 없음)'}</p></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRows(rs => [...rs, { provider: 'openai', id: '', label: '', inputPer1M: 0, outputPer1M: 0, contextK: 128, vision: false }])} className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-200 bg-slate-800 rounded-lg hover:bg-slate-700"><Plus size={12} /> 모델 추가</button>
          <button type="button" onClick={() => void reset()} disabled={saving || remote === undefined} className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-200 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-50"><RotateCcw size={12} /> 기본값으로</button>
          <button type="button" onClick={() => void save()} disabled={saving || remote === undefined || invalid.length > 0} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-500 disabled:opacity-50" data-testid="ai-catalog-save"><Save size={12} /> {saving ? '배포 중…' : '배포'}</button>
        </div>
      </div>
      {error && <p className="px-5 py-3 text-xs text-red-300">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-400"><tr><th className="text-left px-4 py-2">제공사</th><th className="text-left px-2 py-2">모델 id</th><th className="text-left px-2 py-2">표시명</th><th className="text-right px-2 py-2">입력 $/1M</th><th className="text-right px-2 py-2">출력 $/1M</th><th className="text-right px-2 py-2">컨텍스트(K)</th><th className="px-2 py-2">비전</th><th className="px-2 py-2">기본</th><th className="px-2 py-2"></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-t border-slate-800 text-slate-200 ${invalid.includes(i + 1) ? 'bg-red-500/5' : ''}`}>
                <td className="px-4 py-1.5"><select value={r.provider} onChange={e => set(i, { provider: e.target.value as AiProvider })} aria-label={`${i + 1}행 제공사`} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1"><option value="claude">claude</option><option value="openai">openai</option><option value="gemini">gemini</option></select></td>
                <td className="px-2 py-1.5"><input value={r.id} onChange={e => set(i, { id: e.target.value.trim() })} aria-label={`${i + 1}행 모델 id`} className="w-44 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1" /></td>
                <td className="px-2 py-1.5"><input value={r.label} onChange={e => set(i, { label: e.target.value })} aria-label={`${i + 1}행 표시명`} className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1" /></td>
                <td className="px-2 py-1.5 text-right"><input type="number" min={0} step="0.001" value={r.inputPer1M} onChange={e => set(i, { inputPer1M: Number(e.target.value) })} aria-label={`${i + 1}행 입력 가격`} className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-right" /></td>
                <td className="px-2 py-1.5 text-right"><input type="number" min={0} step="0.001" value={r.outputPer1M} onChange={e => set(i, { outputPer1M: Number(e.target.value) })} aria-label={`${i + 1}행 출력 가격`} className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-right" /></td>
                <td className="px-2 py-1.5 text-right"><input type="number" min={1} value={r.contextK} onChange={e => set(i, { contextK: Number(e.target.value) })} aria-label={`${i + 1}행 컨텍스트`} className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-right" /></td>
                <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={r.vision} onChange={e => set(i, { vision: e.target.checked })} aria-label={`${i + 1}행 비전`} /></td>
                <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={!!r.default} onChange={e => set(i, { default: e.target.checked || undefined })} aria-label={`${i + 1}행 기본 모델`} /></td>
                <td className="px-2 py-1.5 text-right"><button type="button" onClick={() => setRows(rs => rs.filter((_, k) => k !== i))} className="p-1 text-slate-500 hover:text-red-400" aria-label={`${i + 1}행 삭제`}><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
