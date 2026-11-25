import { useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { notify } from '../lib/notify';
import { followUpOf, saveFollowUp, clearSnooze } from '../lib/followUp';
import { FOLLOW_UP_RESULTS, SNOOZE_CHOICES, defaultSnoozeDays, describeFollowUp } from '../lib/followUpRule';

/**
 * 연락 기록 (249) — "오늘 할 일" 이 매일 같은 고객을 띄우던 것을 끊는다.
 * 직원이 전화해 "다음 달에 갈게요" 를 들어도 적을 곳이 없어 다음 날 또 같은 고객이 떴다(알림 피로 + 이중 전화).
 * 결과를 고르면 기본 기간만큼 할 일 목록에서 빠지고, 기한이 지나면 스스로 다시 나온다.
 * 기록은 설정 행이라 다른 PC 도 "이미 연락했다" 를 안다.
 */
export default function FollowUpCard({ customerId, actor, onSaved }: { customerId: string; actor?: string; onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string>(FOLLOW_UP_RESULTS[0].id);
  const [days, setDays] = useState<number>(defaultSnoozeDays(FOLLOW_UP_RESULTS[0].id));
  const [note, setNote] = useState('');
  const [tick, setTick] = useState(0);
  const rec = followUpOf(customerId);
  void tick; // 저장 뒤 다시 읽기 위한 리렌더 키

  function pickResult(id: string) {
    setResult(id);
    setDays(defaultSnoozeDays(id)); // 결과를 고르면 기본 기간이 따라온다(직원이 고칠 수 있다)
  }

  function handleSave() {
    const ok = saveFollowUp(customerId, { result, note: note.trim() || undefined, snoozeDays: days, actor });
    if (!ok) { notify('연락 기록을 저장하지 못했습니다. 저장 공간을 확인해주세요.'); return; }
    notify.success(days > 0 ? `연락을 기록하고 ${days}일간 할 일 목록에서 숨깁니다.` : '연락을 기록했습니다(할 일 목록에는 계속 보입니다).');
    setOpen(false);
    setNote('');
    setTick(t => t + 1);
    onSaved?.();
  }

  function handleClear() {
    if (!clearSnooze(customerId)) { notify('미루기를 해제하지 못했습니다.'); return; }
    notify.success('미루기를 해제했습니다. 할 일 목록에 다시 나옵니다.');
    setTick(t => t + 1);
    onSaved?.();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4" data-testid="follow-up">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><PhoneCall size={14} className="text-[#1a3a8f]" />연락 기록</h3>
        <button type="button" onClick={() => setOpen(v => !v)} data-testid="follow-up-open"
          className="px-3 py-2 min-h-[40px] text-xs font-medium text-[#1a3a8f] bg-white border border-[#1a3a8f]/30 rounded-xl hover:bg-blue-50">
          {open ? '닫기' : '연락 결과 적기'}
        </button>
      </div>

      {rec ? (
        <p className="text-sm text-gray-700 mt-2" data-testid="follow-up-last">최근 연락 — {describeFollowUp(rec)}</p>
      ) : (
        <p className="text-sm text-gray-500 mt-2">아직 연락 기록이 없습니다.</p>
      )}
      {rec?.until && (
        <button type="button" onClick={handleClear} data-testid="follow-up-clear" className="mt-1 text-xs text-[#1a3a8f] hover:underline">미루기 해제</button>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <div role="radiogroup" aria-label="연락 결과" className="flex flex-wrap gap-1.5">
            {FOLLOW_UP_RESULTS.map(o => (
              <button key={o.id} type="button" role="radio" aria-checked={result === o.id} onClick={() => pickResult(o.id)}
                className={`px-3 py-2 min-h-[44px] rounded-full text-xs font-medium border transition-colors ${result === o.id ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {o.label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">할 일 목록에서 숨길 기간</span>
            <select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="숨길 기간"
              className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 text-sm bg-white outline-none">
              {SNOOZE_CHOICES.map(d => <option key={d} value={d}>{d === 0 ? '숨기지 않음(기록만)' : `${d}일`}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">메모 (선택 · 40자)</span>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} maxLength={40} placeholder="예: 다음 달 초에 다시 연락"
              className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 text-sm outline-none focus:border-[#1a3a8f]" />
          </label>
          <button type="button" onClick={handleSave} data-testid="follow-up-save"
            className="w-full min-h-[44px] rounded-xl bg-[#1a3a8f] text-white text-sm font-semibold hover:bg-[#15306e]">
            연락 기록 저장
          </button>
        </div>
      )}
    </div>
  );
}
