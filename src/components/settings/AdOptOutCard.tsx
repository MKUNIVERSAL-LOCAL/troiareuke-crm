// AdOptOutCard — 설정 > 알림 설정 > 광고 메시지 법정 표기(무료수신거부 080 번호) (비코어, 155, GAP M-4)
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { notify } from '../../lib/notify';
import { getOptOutNumber, setOptOutNumber } from '../../lib/marketingConsent';
import { isValidOptOutNumber, QUIET_START_HOUR, QUIET_END_HOUR } from '../../lib/adComplianceRule';

export default function AdOptOutCard() {
  const [draft, setDraft] = useState(() => getOptOutNumber());
  const [saved, setSaved] = useState(() => getOptOutNumber());
  const save = () => {
    const v = draft.trim();
    if (v && !isValidOptOutNumber(v)) { notify.error('080 번호 형식이 아닙니다. 예: 080-123-4567'); return; }
    setOptOutNumber(v);
    setSaved(v);
    notify.success(v ? `무료수신거부 번호를 ${v}로 저장했습니다. 광고 메시지 끝에 자동으로 붙습니다.` : '무료수신거부 번호를 지웠습니다. 광고 메시지는 보낼 수 없습니다.');
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="ad-optout-card">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <ShieldCheck size={15} className="text-[#1a3a8f]" />
        <h3 className="font-bold text-gray-900">광고 메시지 법정 표기</h3>
      </div>
      <div className="p-6 space-y-3">
        <p className="text-sm text-gray-600">광고성 문자·카톡은 법(정보통신망법)에 따라 본문 앞에 <b>(광고)</b>, 끝에 <b>무료수신거부 080 번호</b>가 있어야 하고, <b>{QUIET_START_HOUR}시~익일 {QUIET_END_HOUR}시</b>에는 보낼 수 없습니다. 발송 창에서 "광고성 메시지"를 켜면 자동으로 붙이고, 수신 동의가 없거나 거부한 고객은 대상에서 뺍니다. 080 번호는 문자 발송사(SOLAPI 등)에서 신청합니다.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-gray-600" htmlFor="ad-optout-number">무료수신거부 번호</label>
          <input id="ad-optout-number" value={draft} onChange={e => setDraft(e.target.value)} placeholder="080-123-4567" inputMode="tel" className="w-44 px-3 py-2 text-sm border border-gray-200 rounded-xl" />
          <button type="button" onClick={save} className="px-4 py-2 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#15306e]">저장</button>
          <span className="text-xs text-gray-500">{saved ? `현재 ${saved}` : '미등록 — 광고 발송 차단 중'}</span>
        </div>
      </div>
    </div>
  );
}
