// ConsentControl — 고객 상세의 광고 수신 동의·거부 (비코어, 155, GAP C-8). 상태는 고객 태그에 저장(marketingConsent)
import { consentOf, setConsent } from '../lib/marketingConsent';
import { notify } from '../lib/notify';
import { canDo } from '../lib/permissions';
import { useAuth } from '../contexts/AuthContext';
import type { Customer } from '../types';

export default function ConsentControl({ customer, onChanged }: { customer: Customer; onChanged: () => void }) {
  const { user } = useAuth();
  const canEdit = canDo(user?.role, 'consent.edit');
  const c = consentOf(customer);
  const apply = (patch: Parameters<typeof setConsent>[1], msg: string) => {
    if (!setConsent(customer.id, patch)) return;
    notify.success(msg);
    onChanged();
  };
  const label = c.ad === 'consented' ? `광고 수신 동의${c.consentAt ? ` (${c.consentAt})` : ''}` : c.ad === 'optout' ? '광고 수신 거부' : '광고 수신 동의 없음';
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1" data-testid="consent-control">
      <span className={`text-xs px-2 py-0.5 rounded-full border ${c.ad === 'consented' ? 'bg-green-50 text-green-700 border-green-100' : c.ad === 'optout' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>{label}</span>
      {/* 직원 계정은 상태만 본다 — 눌러야 "권한 필요"가 뜨는 버튼은 두지 않는다 (159 리뷰 L-3) */}
      {canEdit && c.ad !== 'consented' && <button type="button" onClick={() => apply({ ad: 'consented' }, '광고 수신 동의를 기록했습니다(오늘 날짜).')} className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">동의 받음</button>}
      {canEdit && c.ad !== 'optout' && <button type="button" onClick={() => apply({ ad: 'optout' }, '광고 수신 거부를 기록했습니다. 광고 대상에서 빠집니다.')} className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">수신 거부</button>}
      {canEdit && c.ad === 'consented' && (
        <>
          <label className="text-xs text-gray-600 flex items-center gap-1"><input type="checkbox" checked={c.sms} onChange={e => apply({ sms: e.target.checked }, e.target.checked ? '문자 광고를 받습니다.' : '문자 광고를 거부로 기록했습니다.')} className="rounded" />문자</label>
          <label className="text-xs text-gray-600 flex items-center gap-1"><input type="checkbox" checked={c.kakao} onChange={e => apply({ kakao: e.target.checked }, e.target.checked ? '카카오 광고를 받습니다.' : '카카오 광고를 거부로 기록했습니다.')} className="rounded" />카카오</label>
        </>
      )}
    </div>
  );
}
