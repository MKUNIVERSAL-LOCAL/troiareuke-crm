// SegmentEditorModal — 저장 세그먼트(조건 조합) 만들기·수정 (비코어, 166, GAP C-6·M-2). 규칙 segmentFilterRule, 보관 savedSegments
import { useMemo, useState } from 'react';
import { describePrefLoss, describePrefRemovalLoss } from '../lib/prefLandedRule'; // 저장이 정말 남았는지 (296·297)
import { prefSaveMode } from '../lib/prefSaveMode';
import Modal from './ui/Modal';
import { notify } from '../lib/notify';
import { askConfirm } from '../lib/confirmDialog';
import { saveSegment, deleteSegment, segmentIds } from '../lib/savedSegments';
import { validateSegment, describeSegment, DEFAULT_RECENT_SPEND_DAYS, type SavedSegment, type SegmentCondition, type CustomerFacts } from '../lib/segmentFilterRule';
import type { CustomerGrade } from '../types';
import type { RfmSegment } from '../lib/rfmRule';
import type { ChurnLevel } from '../lib/churnRule';

const GRADES: CustomerGrade[] = ['VIP', '골드', '일반', '신규'];
const RFM: RfmSegment[] = ['신규', '충성', '우수', '일반', '이탈 우려', '휴면', '미방문'];
const CHURN: { v: ChurnLevel; label: string }[] = [{ v: 'high', label: '높음' }, { v: 'medium', label: '주의' }, { v: 'low', label: '낮음' }];

export default function SegmentEditorModal({ segment, facts, tagOptions, onClose, onSaved }: { segment: SavedSegment | null; facts: Map<string, CustomerFacts>; tagOptions: string[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(segment?.name ?? '');
  const [c, setC] = useState<SegmentCondition>(() => ({ ...(segment?.condition ?? {}) }));
  const count = useMemo(() => segmentIds(c, facts).size, [c, facts]);
  const toggle = <T,>(key: keyof SegmentCondition, v: T) => setC(prev => {
    const cur = (prev[key] as unknown as T[] | undefined) ?? [];
    const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
    return { ...prev, [key]: next.length ? next : undefined };
  });
  const setNum = (key: keyof SegmentCondition, raw: string) => setC(prev => { const digits = raw.replace(/[^\d]/g, ''); return { ...prev, [key]: digits === '' ? undefined : Number(digits) }; }); // 'a' → 0 이 되어 빈 조건 거절을 우회하던 것 (170 리뷰 L-3)
  const numVal = (v: number | undefined) => (v === undefined ? '' : String(v));
  const submit = () => {
    const errs = validateSegment(name, c);
    if (errs.length) { notify.error(errs[0]); return; }
    const { landed } = saveSegment(name, c, segment?.id);
    // 296: 세그먼트는 발송 대상이다 — 안 남았는데 "저장했습니다" 라고 말하면 다음 발송이 0명이 된다
    const lost = describePrefLoss(landed, '세그먼트', prefSaveMode());
    if (lost) notify.error(lost);
    else notify.success(segment ? '세그먼트를 수정했습니다.' : `세그먼트를 저장했습니다. 지금 ${count}명이 해당됩니다.`);
    onSaved();
  };
  const remove = async () => {
    if (!segment) return;
    if (!(await askConfirm({ title: '세그먼트 삭제', message: `"${segment.name}" 세그먼트를 삭제할까요? 고객 자료는 그대로입니다.`, confirmLabel: '삭제', danger: true }))) return;
    const lostDelete = describePrefRemovalLoss(deleteSegment(segment.id), '세그먼트', prefSaveMode()); // 296·297(리뷰 M-3)
    if (lostDelete) notify.error(lostDelete); else notify.success('세그먼트를 삭제했습니다.');
    onSaved();
  };
  const chip = (on: boolean) => `text-xs px-2.5 py-1 rounded-full border ${on ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`;
  const input = 'w-28 px-2 py-1.5 text-sm border border-gray-200 rounded-lg';
  return (
    <Modal isOpen={true} onClose={onClose} title={segment ? '세그먼트 수정' : '세그먼트 만들기'} size="lg">
      <div className="space-y-4" data-testid="segment-editor">
        <div>
          <label htmlFor="sg-name" className="block text-xs font-medium text-gray-600 mb-1">세그먼트 이름</label>
          <input id="sg-name" value={name} onChange={e => setName(e.target.value)} placeholder="예: 60일 미방문 VIP" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
        </div>
        <fieldset><legend className="text-xs font-medium text-gray-600 mb-1">등급</legend><div className="flex flex-wrap gap-1.5">{GRADES.map(g => <button key={g} type="button" aria-pressed={!!c.grades?.includes(g)} onClick={() => toggle('grades', g)} className={chip(!!c.grades?.includes(g))}>{g}</button>)}</div></fieldset>
        {tagOptions.length > 0 && <fieldset><legend className="text-xs font-medium text-gray-600 mb-1">태그(하나 이상)</legend><div className="flex flex-wrap gap-1.5">{tagOptions.map(t => <button key={t} type="button" aria-pressed={!!c.tagsAny?.includes(t)} onClick={() => toggle('tagsAny', t)} className={chip(!!c.tagsAny?.includes(t))}>#{t}</button>)}</div></fieldset>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700">
          <div className="flex items-center gap-2 flex-wrap"><span className="text-xs text-gray-600 w-28">마지막 방문 뒤(일)</span><input aria-label="마지막 방문 뒤 최소 일수" inputMode="numeric" value={numVal(c.lastVisitDaysMin)} onChange={e => setNum('lastVisitDaysMin', e.target.value)} placeholder="최소" className={input} /><span>~</span><input aria-label="마지막 방문 뒤 최대 일수" inputMode="numeric" value={numVal(c.lastVisitDaysMax)} onChange={e => setNum('lastVisitDaysMax', e.target.value)} placeholder="최대" className={input} /></div>
          <div className="flex items-center gap-2 flex-wrap"><span className="text-xs text-gray-600 w-28">방문 횟수</span><input aria-label="최소 방문 횟수" inputMode="numeric" value={numVal(c.visitsMin)} onChange={e => setNum('visitsMin', e.target.value)} placeholder="최소" className={input} /><span>~</span><input aria-label="최대 방문 횟수" inputMode="numeric" value={numVal(c.visitsMax)} onChange={e => setNum('visitsMax', e.target.value)} placeholder="최대" className={input} /></div>
          <div className="flex items-center gap-2"><span className="text-xs text-gray-600 w-28">누적 결제(원) 이상</span><input aria-label="최소 누적 결제" inputMode="numeric" value={numVal(c.spentMin)} onChange={e => setNum('spentMin', e.target.value)} className={input} /></div>
          <div className="flex items-center gap-2 flex-wrap"><span className="text-xs text-gray-600 w-28">최근 결제</span><input aria-label="최근 결제 기간(일)" title="1~365일 (비우면 90일)" inputMode="numeric" value={numVal(c.recentSpendDays)} onChange={e => setNum('recentSpendDays', e.target.value)} placeholder={`${DEFAULT_RECENT_SPEND_DAYS}일`} className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-lg" /><span className="text-xs text-gray-600">일 안</span><input aria-label="최근 결제 최소 금액" inputMode="numeric" value={numVal(c.recentSpendMin)} onChange={e => setNum('recentSpendMin', e.target.value)} placeholder="원 이상" className={input} /></div>
          <div className="flex items-center gap-2"><label htmlFor="sg-program" className="text-xs text-gray-600 w-28">진행 중 회차권</label><select id="sg-program" value={c.hasActiveProgram === undefined ? '' : c.hasActiveProgram ? 'yes' : 'no'} onChange={e => setC(prev => ({ ...prev, hasActiveProgram: e.target.value === '' ? undefined : e.target.value === 'yes' }))} className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"><option value="">상관없음</option><option value="yes">있음</option><option value="no">없음</option></select></div>
          <div className="flex items-center gap-2"><label htmlFor="sg-upcoming" className="text-xs text-gray-600 w-28">다음 예약</label><select id="sg-upcoming" value={c.hasUpcoming === undefined ? '' : c.hasUpcoming ? 'yes' : 'no'} onChange={e => setC(prev => ({ ...prev, hasUpcoming: e.target.value === '' ? undefined : e.target.value === 'yes' }))} className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"><option value="">상관없음</option><option value="yes">있음</option><option value="no">없음</option></select></div>
          <div className="flex items-center gap-2"><label htmlFor="sg-consent" className="text-xs text-gray-600 w-28">광고 수신</label><select id="sg-consent" value={c.adConsent ?? ''} onChange={e => setC(prev => ({ ...prev, adConsent: (e.target.value || undefined) as SegmentCondition['adConsent'] }))} className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"><option value="">상관없음</option><option value="consented">동의</option><option value="optout">거부</option><option value="unknown">동의 없음</option></select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.birthdayThisMonth} onChange={e => setC(prev => ({ ...prev, birthdayThisMonth: e.target.checked || undefined }))} className="rounded" />이달 생일</label>
        </div>
        <fieldset><legend className="text-xs font-medium text-gray-600 mb-1">RFM 구분</legend><div className="flex flex-wrap gap-1.5">{RFM.map(r => <button key={r} type="button" aria-pressed={!!c.rfmSegments?.includes(r)} onClick={() => toggle('rfmSegments', r)} className={chip(!!c.rfmSegments?.includes(r))}>{r}</button>)}</div></fieldset>
        <fieldset><legend className="text-xs font-medium text-gray-600 mb-1">이탈 위험</legend><div className="flex flex-wrap gap-1.5">{CHURN.map(x => <button key={x.v} type="button" aria-pressed={!!c.churnLevels?.includes(x.v)} onClick={() => toggle('churnLevels', x.v)} className={chip(!!c.churnLevels?.includes(x.v))}>{x.label}</button>)}</div></fieldset>
        <p className="text-xs text-gray-700 bg-gray-50 rounded-xl px-3 py-2">{describeSegment(c)} · 지금 <b data-testid="segment-count">{count}</b>명 (조건은 모두 "그리고")</p>
        <div className="flex gap-2 pt-1">
          {segment && <button type="button" onClick={() => void remove()} className="px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100">삭제</button>}
          <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">취소</button>
          <button type="button" onClick={submit} className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#15306e]" data-testid="segment-save">{segment ? '저장' : '만들기'}</button>
        </div>
      </div>
    </Modal>
  );
}
