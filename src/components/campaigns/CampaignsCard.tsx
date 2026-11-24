// CampaignsCard — 문자/카카오 발송 > 자동 발송(캠페인) 목록 (비코어, 156, GAP M-3). 옛 "자동 발송 준비 중" 장식 블록을 대체
import { useMemo, useState } from 'react';
import { Zap, Pencil, Trash2, Plus, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { canDo } from '../../lib/permissions';
import { askConfirm } from '../../lib/confirmDialog';
import { notify } from '../../lib/notify';
import { formatDateTime, formatPrice } from '../../lib/format';
import { listCampaigns, deleteCampaign, setCampaignEnabled, lastRunOf, sendsOf, addMissingPresets } from '../../lib/campaignStore';
import { ReservationStore, PaymentStore } from '../../lib/store';
import { estimatePerformance, describePerformance } from '../../lib/campaignPerformanceRule';
import { CAMPAIGN_PRESETS, missingPresets } from '../../lib/campaignPresets';
import { describeTrigger, REPEAT_LABELS, type Campaign } from '../../lib/campaignRule';
import CampaignEditModal from './CampaignEditModal';
import CampaignRunModal from './CampaignRunModal';

export default function CampaignsCard({ onSent }: { onSent: () => void }) {
  const { user } = useAuth();
  const canManage = canDo(user?.role, 'campaign.manage');
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => listCampaigns());
  const [editing, setEditing] = useState<Campaign | null | 'new'>(null);
  const [running, setRunning] = useState<Campaign | null>(null);
  const refresh = () => setCampaigns(listCampaigns());
  const missing = missingPresets(campaigns.map(c => c.name)).length;
  const addPresets = () => {
    const n = addMissingPresets();
    refresh();
    notify.success(n ? `기본 시나리오 ${n}개를 추가했습니다. 문구와 일수는 수정에서 바꿀 수 있어요.` : '기본 시나리오가 모두 들어 있습니다.');
  };
  // 성과 추정 — 이 기기의 발송 성공 기록 기준, 14일 창 (157, GAP M-6, ANALYTICS-DEFINITIONS). 목록이 바뀔 때만 다시 계산 (159 리뷰 L-7)
  const perfs = useMemo(() => {
    const resv = ReservationStore.getAll(), pays = PaymentStore.getAll();
    return new Map(campaigns.map(c => [c.id, describePerformance(estimatePerformance(sendsOf(c.id), resv, pays), formatPrice)]));
  }, [campaigns]);

  const remove = async (c: Campaign) => {
    if (!(await askConfirm({ title: '캠페인 삭제', message: `"${c.name}" 캠페인을 삭제할까요? 발송 기록은 남습니다.`, confirmLabel: '삭제', danger: true }))) return;
    deleteCampaign(c.id); refresh(); notify.success('캠페인을 삭제했습니다.');
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
                  <p className="text-xs text-gray-500 mt-0.5">{describeTrigger(c)} · {REPEAT_LABELS[c.repeat]}{last ? ` · 마지막 발송 ${formatDateTime(last)}` : ''}</p>
                  {perf && <p className="text-xs text-gray-600 mt-0.5" data-testid="campaign-perf">{perf}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {canManage && (
                  <label className="text-xs text-gray-600 flex items-center gap-1 mr-1"><input type="checkbox" checked={c.enabled} onChange={e => { setCampaignEnabled(c.id, e.target.checked); refresh(); }} className="rounded" aria-label={`${c.name} 사용`} />사용</label>
                )}
                <button type="button" onClick={() => setRunning(c)} disabled={!c.enabled} className="px-3 py-1.5 text-xs font-medium text-[#1a3a8f] bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed">대상 확인·발송</button>
                {canManage && (
                  <>
                    <button type="button" onClick={() => setEditing(c)} className="p-1.5 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100" aria-label={`${c.name} 수정`}><Pencil size={14} /></button>
                    <button type="button" onClick={() => remove(c)} className="p-1.5 text-gray-500 hover:text-red-600 rounded-lg hover:bg-gray-100" aria-label={`${c.name} 삭제`}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {editing !== null && <CampaignEditModal campaign={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {running && <CampaignRunModal campaign={running} onClose={() => setRunning(null)} onSent={() => { refresh(); onSent(); }} />}
    </div>
  );
}
