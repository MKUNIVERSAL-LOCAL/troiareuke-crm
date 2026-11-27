// CampaignsCard — 문자/카카오 발송 > 자동 발송(캠페인) 목록 (비코어, 156, GAP M-3). 옛 "자동 발송 준비 중" 장식 블록을 대체
import { useMemo, useState } from 'react';
import { describePrefLoss, describePrefRemovalLoss } from '../../lib/prefLandedRule'; // 저장이 정말 남았는지 (296·297)
import { prefSaveMode } from '../../lib/prefSaveMode';
import { Zap, Pencil, Trash2, Plus, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useDataRefreshed } from '../../hooks/useDataRefreshed'; // 요약 줄 갱신 (270, 리뷰 M-2)
import { canDo } from '../../lib/permissions';
import { askConfirm } from '../../lib/confirmDialog';
import { notify } from '../../lib/notify';
import { formatDateTime, formatPrice } from '../../lib/format';
import { listCampaigns, deleteCampaign, setCampaignEnabled, lastRunOf, sendsOf, addMissingPresets } from '../../lib/campaignStore';
import { ReservationStore, PaymentStore } from '../../lib/store';
import { estimatePerformance, describePerformance } from '../../lib/campaignPerformanceRule';
import { campaignPerformanceDrill } from '../../lib/messagePerformance'; // 성과 근거 목록 (267, GAP M-6)
import MetricDetailModal from '../MetricDetailModal';
import type { DrillResult } from '../../lib/revenueDrilldownRule';
import { CAMPAIGN_PRESETS, missingPresets } from '../../lib/campaignPresets';
import { listSavedSegments } from '../../lib/savedSegments';
import { describeTrigger, REPEAT_LABELS, type Campaign } from '../../lib/campaignRule';
import CampaignEditModal from './CampaignEditModal';
import CampaignRunModal from './CampaignRunModal';

export default function CampaignsCard({ onSent }: { onSent: () => void }) {
  const { user } = useAuth();
  const canManage = canDo(user?.role, 'campaign.manage');
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => listCampaigns());
  const [editing, setEditing] = useState<Campaign | null | 'new'>(null);
  const [running, setRunning] = useState<Campaign | null>(null);
  const [perfDrill, setPerfDrill] = useState<{ title: string; result: DrillResult } | null>(null); // 성과 근거 (267)
  // 다른 창·다른 탭에서 예약·결제가 생기면 요약 줄도 다시 계산한다 — 근거 창은 클릭 시 실시간이라
  // 구독이 없으면 둘이 어긋난다 (270, 리뷰 M-2)
  const [perfTick, setPerfTick] = useState(0);
  useDataRefreshed(() => { setCampaigns(listCampaigns()); setPerfTick(t => t + 1); });
  const refresh = () => setCampaigns(listCampaigns());
  const missing = missingPresets(campaigns.map(c => c.name)).length;
  const segmentNames = useMemo(() => new Map(listSavedSegments().map(sg => [sg.id, sg.name])), [campaigns]); // 행에 세그먼트 이름 (167) // eslint-disable-line react-hooks/exhaustive-deps
  const addPresets = () => {
    const { added, landed } = addMissingPresets();
    refresh();
    const lost = describePrefLoss(landed, '기본 시나리오', prefSaveMode()); // 296
    if (lost) notify.error(lost);
    else notify.success(added ? `기본 시나리오 ${added}개를 추가했습니다. 문구와 일수는 수정에서 바꿀 수 있어요.` : '기본 시나리오가 모두 들어 있습니다.');
  };
  // 성과 추정 — 이 기기의 발송 성공 기록 기준, 14일 창 (157, GAP M-6, ANALYTICS-DEFINITIONS). 목록이 바뀔 때만 다시 계산 (159 리뷰 L-7)
  const perfs = useMemo(() => {
    const resv = ReservationStore.getAll(), pays = PaymentStore.getAll();
    const money = canDo(user?.role, 'sales.view'); // 매출 권한 없으면 요약 줄도 사람 수만 (270, 리뷰 M-1)
    return new Map(campaigns.map(c => [c.id, describePerformance(estimatePerformance(sendsOf(c.id), resv, pays), formatPrice, money)]));
  }, [campaigns, perfTick]);

  const remove = async (c: Campaign) => {
    if (!(await askConfirm({ title: '캠페인 삭제', message: `"${c.name}" 캠페인을 삭제할까요? 발송 기록은 남습니다.`, confirmLabel: '삭제', danger: true }))) return;
    const lostDelete = describePrefRemovalLoss(deleteCampaign(c.id), '캠페인', prefSaveMode()); // 296·297(리뷰 M-3)
    refresh();
    if (lostDelete) notify.error(lostDelete); else notify.success('캠페인을 삭제했습니다.');
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" data-testid="campaigns-card">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-gray-900">자동 발송(캠페인)</h3>
          <p className="text-xs text-gray-400 mt-0.5">조건에 맞는 고객을 모아 보여주고, 직원이 확인한 뒤 발송합니다. 같은 고객·같은 회차에 두 번 나가지 않습니다(이 PC 의 발송 기록 기준 — 다른 PC 와 공유는 서버 보관 승인 뒤).</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 flex-wrap">
            {missing > 0 && (
              <button type="button" onClick={addPresets} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1a3a8f] bg-blue-50 rounded-xl hover:bg-blue-100" data-testid="campaign-presets">
                <Sparkles size={14} /> 기본 시나리오 {missing === CAMPAIGN_PRESETS.length ? CAMPAIGN_PRESETS.length : `${missing}개 더`} 추가
              </button>
            )}
            <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#15306e]">
              <Plus size={14} /> 캠페인 추가
            </button>
          </div>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {campaigns.length === 0 && <p className="px-6 py-8 text-sm text-gray-500 text-center">아직 캠페인이 없습니다. "기본 시나리오 {CAMPAIGN_PRESETS.length} 추가"로 예약·케어·리텐션·회차권·이벤트 시나리오를 한 번에 넣거나, "캠페인 추가"로 직접 만들어보세요.</p>}
        {campaigns.map(c => {
          const last = lastRunOf(c.id);
          const perf = perfs.get(c.id) ?? null;
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 px-6 py-4 flex-wrap" data-testid="campaign-row">
              <div className="flex items-start gap-3 min-w-0">
                <Zap size={16} className={clsx('mt-0.5 flex-shrink-0', c.enabled ? 'text-amber-500' : 'text-gray-300')} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                    {c.name}
                    <span className={clsx('px-1.5 py-0.5 rounded text-xs font-medium', c.channel === 'sms' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700')}>{c.channel === 'sms' ? 'SMS' : '카카오 채널'}</span>
                    {c.isAd && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">광고</span>}
                    {!c.enabled && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">꺼짐</span>}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{describeTrigger(c)} · {REPEAT_LABELS[c.repeat]}{c.segmentId ? ` · 세그먼트 ${segmentNames.get(c.segmentId) ?? '삭제됨(아무에게도 안 감)'}` : ''}{last ? ` · 마지막 발송 ${formatDateTime(last)}` : ''}</p>
                  {perf && (
                    <p className="text-xs text-gray-600 mt-0.5 flex flex-wrap items-center gap-2" data-testid="campaign-perf">
                      {perf}
                      {/* 숫자만 주면 "이 캠페인 덕" 인지 확인할 수 없다 — 세어진 고객을 그대로 보여 준다 (267, GAP M-6) */}
                      <button type="button" data-testid="campaign-perf-rows"
                        onClick={() => setPerfDrill({
                          title: `${c.name} 성과 근거`,
                          result: campaignPerformanceDrill(sendsOf(c.id).map(r => ({ customerId: r.customerId, at: r.at })), { showMoney: canDo(user?.role, 'sales.view') }),
                        })}
                        className="px-2 py-1 min-h-[32px] rounded-lg text-xs font-medium text-[#1a3a8f] bg-blue-50 hover:bg-blue-100">
                        누가 세어졌나
                      </button>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {canManage && (
                  <label className="text-xs text-gray-600 flex items-center gap-1 mr-1"><input type="checkbox" checked={c.enabled} onChange={e => { const lostToggle = describePrefLoss(setCampaignEnabled(c.id, e.target.checked), e.target.checked ? '캠페인 사용' : '캠페인 중지', prefSaveMode()); refresh(); if (lostToggle) notify.error(lostToggle); }} className="rounded" aria-label={`${c.name} 사용`} />사용</label>
                )}
                <button type="button" onClick={() => setRunning(c)} disabled={!c.enabled} className="px-3 py-1.5 text-xs font-medium text-[#1a3a8f] bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed">대상 확인·발송</button>
                {canManage && (
                  <>
                    <button type="button" onClick={() => setEditing(c)} className="p-1.5 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100" aria-label={`${c.name} 수정`}><Pencil size={14} /></button>
                    <button type="button" onClick={() => remove(c)} className="p-1.5 text-gray-500 hover:text-red-700 rounded-lg hover:bg-gray-100" aria-label={`${c.name} 삭제`}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {editing !== null && <CampaignEditModal campaign={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {running && <CampaignRunModal campaign={running} onClose={() => setRunning(null)} onSent={() => { refresh(); onSent(); }} />}
      {perfDrill && (
        <MetricDetailModal
          title={perfDrill.title}
          note="이 캠페인으로 문자가 나간 고객 전원입니다 — 예약·결제가 없던 분도 함께 보여 줍니다."
          result={perfDrill.result}
          onClose={() => setPerfDrill(null)}
        />
      )}
    </div>
  );
}
