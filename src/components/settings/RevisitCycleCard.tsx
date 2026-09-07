import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { getRevisitCycleDays, setRevisitCycleDays, DEFAULT_CYCLE_DAYS, MIN_CYCLE_DAYS, MAX_CYCLE_DAYS } from '../../lib/reminderEngine';

/**
 * 설정 > 알림 설정 > 재방문 권장 주기
 * 시술기록에 "다음 방문 권장일"이 없을 때 이 주기로 재방문 권장일을 계산한다.
 * 대시보드 재방문 리마인더 카드와 서버 자동 리마인더(발송사 연동 시)가 같은 값을 쓴다.
 * 값은 지점 환경설정(서버 동기)에 저장되어 어느 PC에서나 같다 (예전엔 PC별이었고 바꿀 화면도 없었음).
 */
export default function RevisitCycleCard() {
  const [days, setDays] = useState<number>(() => getRevisitCycleDays());
  const [draft, setDraft] = useState<string>(() => String(getRevisitCycleDays()));
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  function save() {
    const value = parseInt(draft, 10);
    if (!setRevisitCycleDays(value)) {
      setMessage({ tone: 'warn', text: `${MIN_CYCLE_DAYS}~${MAX_CYCLE_DAYS} 사이의 일수를 입력해 주세요.` });
      return;
    }
    setDays(value);
    setMessage({ tone: 'ok', text: `재방문 권장 주기를 ${value}일로 저장했습니다. 이 지점의 모든 PC에 적용됩니다.` });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <CalendarClock size={15} className="text-[#1a3a8f]" />
        <h3 className="text-sm font-bold text-gray-900">재방문 권장 주기</h3>
      </div>
      <div className="px-6 py-5 space-y-3">
        <p className="text-sm text-gray-500 leading-relaxed">
          시술기록에 다음 방문 권장일을 따로 적지 않은 고객은 마지막 방문일에서 이 주기가 지나면
          대시보드의 재방문 리마인더에 표시됩니다. 현재 <b className="text-gray-800">{days}일</b> (기본 {DEFAULT_CYCLE_DAYS}일).
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={MIN_CYCLE_DAYS}
            max={MAX_CYCLE_DAYS}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a8f]"
          />
          <span className="text-sm text-gray-500">일</span>
          <button
            onClick={save}
            className="ml-2 px-4 py-2 bg-[#1a3a8f] hover:bg-[#15307a] text-white text-sm font-bold rounded-xl transition-colors"
          >
            저장
          </button>
        </div>
        {message && <p className={`text-xs ${message.tone === 'ok' ? 'text-emerald-600' : 'text-amber-700'}`}>{message.text}</p>}
      </div>
    </div>
  );
}
