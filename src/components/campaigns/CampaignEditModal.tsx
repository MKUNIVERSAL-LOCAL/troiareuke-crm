// CampaignEditModal — 캠페인 추가·수정 (비코어, 156, GAP M-3)
import { useState } from 'react';
import Modal from '../ui/Modal';
import { notify } from '../../lib/notify';
import { saveCampaign, newCampaignDraft, type CampaignInput } from '../../lib/campaignStore';
import { TRIGGER_LABELS, TRIGGER_DAYS, TRIGGER_DEFAULT_REPEAT, REPEAT_LABELS, CAMPAIGN_VARS, describeTrigger, validateCampaign, type Campaign, type CampaignTrigger, type CampaignRepeat } from '../../lib/campaignRule';
import { CAMPAIGN_PRESETS } from '../../lib/campaignPresets';

const TRIGGERS = Object.keys(TRIGGER_LABELS) as CampaignTrigger[];

export default function CampaignEditModal({ campaign, onClose, onSaved }: { campaign: Campaign | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<CampaignInput>(() => (campaign ? { ...campaign } : newCampaignDraft('reservation_tomorrow')));
  const daysSpec = TRIGGER_DAYS[draft.trigger];
  const set = <K extends keyof CampaignInput>(k: K, v: CampaignInput[K]) => setDraft(d => ({ ...d, [k]: v }));
  const applyPreset = (key: string) => {
    const p = CAMPAIGN_PRESETS.find(x => x.key === key);
    if (!p) return;
    const { key: _k, group: _g, ...rest } = p;
    setDraft(d => ({ ...d, ...rest, name: d.name.trim() ? d.name : rest.name }));
  };
  const changeTrigger = (t: CampaignTrigger) => setDraft(d => ({ ...d, trigger: t, days: TRIGGER_DAYS[t]?.defaultDays ?? 0, repeat: TRIGGER_DEFAULT_REPEAT[t] }));
  const submit = () => {
    const errs = validateCampaign(draft);
    if (errs.length) { notify.error(errs[0]); return; }
    saveCampaign({ ...draft, name: draft.name.trim(), content: draft.content.trim() }, campaign?.id);
    notify.success(campaign ? '캠페인을 수정했습니다.' : '캠페인을 추가했습니다. 실행은 "대상 확인·발송"에서 직원이 확인한 뒤 나갑니다.');
    onSaved();
  };
  return (
    <Modal isOpen={true} onClose={onClose} title={campaign ? '캠페인 수정' : '캠페인 추가'} size="lg">
      <div className="space-y-4">
        {!campaign && (
          <div>
            <label htmlFor="cp-preset" className="block text-xs font-medium text-gray-600 mb-1">시나리오에서 불러오기(선택)</label>
            <select id="cp-preset" defaultValue="" onChange={e => applyPreset(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white">
              <option value="">직접 작성</option>
              {CAMPAIGN_PRESETS.map(p => <option key={p.key} value={p.key}>[{p.group}] {p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="cp-name" className="block text-xs font-medium text-gray-600 mb-1">캠페인 이름</label>
          <input id="cp-name" value={draft.name} onChange={e => set('name', e.target.value)} placeholder="예: 예약 전날 안내" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="cp-trigger" className="block text-xs font-medium text-gray-600 mb-1">언제(트리거)</label>
            <select id="cp-trigger" value={draft.trigger} onChange={e => changeTrigger(e.target.value as CampaignTrigger)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white">
              {TRIGGERS.map(t => <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>)}
            </select>
          </div>
          {daysSpec && (
            <div>
              <label htmlFor="cp-days" className="block text-xs font-medium text-gray-600 mb-1">{daysSpec.label}</label>
              <input id="cp-days" type="number" min={daysSpec.min} max={daysSpec.max} value={draft.days} onChange={e => set('days', parseInt(e.target.value, 10) || 0)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
            </div>
          )}
          <div>
            <label htmlFor="cp-channel" className="block text-xs font-medium text-gray-600 mb-1">채널</label>
            <select id="cp-channel" value={draft.channel} onChange={e => set('channel', e.target.value as CampaignInput['channel'])} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white">
              <option value="sms">문자(SMS/LMS)</option>
              <option value="kakao-channel">카카오 채널</option>
            </select>
          </div>
          <div>
            <label htmlFor="cp-repeat" className="block text-xs font-medium text-gray-600 mb-1">반복</label>
            <select id="cp-repeat" value={draft.repeat} onChange={e => set('repeat', e.target.value as CampaignRepeat)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white">
              {(Object.keys(REPEAT_LABELS) as CampaignRepeat[]).map(r => <option key={r} value={r}>{REPEAT_LABELS[r]}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2">{describeTrigger(draft)} · {REPEAT_LABELS[draft.repeat]} · 같은 고객·같은 회차에 두 번 나가지 않습니다.</p>
        <div>
          <label htmlFor="cp-content" className="block text-xs font-medium text-gray-600 mb-1">메시지 내용</label>
          <textarea id="cp-content" value={draft.content} onChange={e => set('content', e.target.value)} rows={4} placeholder="{고객명}님, 내일 {예약일시} 예약을 기다리고 있어요. — {매장명}" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none" />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {CAMPAIGN_VARS.map(v => (
              <button key={v} type="button" onClick={() => set('content', draft.content + v)} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200">{v}</button>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={draft.isAd} onChange={e => set('isAd', e.target.checked)} className="rounded mt-0.5" aria-label="광고성 캠페인" />
          <span>광고성(이벤트·할인·홍보) — 수신 동의 고객에게만 가고 (광고)·무료수신거부 080 이 자동으로 붙으며 21시~익일 8시에는 보낼 수 없습니다. 예약 확인·회차권 안내 같은 거래 안내는 끄세요.</span>
        </label>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">취소</button>
          <button type="button" onClick={submit} className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#15306e]">{campaign ? '저장' : '추가'}</button>
        </div>
      </div>
    </Modal>
  );
}
