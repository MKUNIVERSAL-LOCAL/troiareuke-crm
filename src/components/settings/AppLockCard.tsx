import { useState } from 'react';
import { Lock } from 'lucide-react';
import { getAppLock, enableAppLock, disableAppLock, verifyPin, isValidPin, LOCK_TIMEOUTS, APP_LOCK_AVAILABLE } from '../../lib/appLock';
import { notify } from '../../lib/notify';

/**
 * 설정 > 데이터 백업(보안) > 앱 잠금 (2026-11-18)
 * 이 기기에서 화면을 떠났다가 돌아오면 PIN을 묻는다. 기기별 설정(서버 미동기), 기본 OFF.
 */
export default function AppLockCard() {
  const [cfg, setCfg] = useState(() => getAppLock());
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [timeoutMin, setTimeoutMin] = useState(() => getAppLock()?.timeoutMin ?? 1);
  const [busy, setBusy] = useState(false);

  async function handleEnable() {
    if (!isValidPin(pin)) { notify('PIN은 숫자 4~6자리로 입력하세요.'); return; }
    if (pin !== pin2) { notify('PIN 두 번 입력이 서로 다릅니다.'); return; }
    setBusy(true);
    try {
      await enableAppLock(pin, timeoutMin);
      setCfg(getAppLock());
      setPin(''); setPin2('');
      notify('앱 잠금을 켰습니다. 화면을 떠났다가 돌아오면 PIN을 묻습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!(await verifyPin(pin))) { notify('현재 PIN이 맞지 않습니다.'); return; }
    disableAppLock();
    setCfg(null);
    setPin(''); setPin2('');
    notify('앱 잠금을 껐습니다.');
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="app-lock-card">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <Lock size={15} className="text-[#1a3a8f]" />
        <h3 className="text-sm font-bold text-gray-900">앱 잠금 (PIN)</h3>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${cfg ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
          {cfg ? `사용 중 · ${LOCK_TIMEOUTS.find(t => t.value === cfg.timeoutMin)?.label ?? `${cfg.timeoutMin}분`}` : '사용 안 함'}
        </span>
      </div>
      <div className="px-6 py-5 space-y-3">
        <p className="text-sm text-gray-500 leading-relaxed">
          자리를 비운 사이 고객 정보가 보이지 않도록, 이 기기에서 화면을 떠났다가(다른 앱·탭·창) 돌아오면 PIN을 묻습니다.
          기기마다 따로 설정되며 서버에는 저장되지 않습니다. PIN을 잊으면 잠금 화면에서 로그아웃해 해제할 수 있고, 로그아웃하면 잠금도 함께 해제되므로 다시 로그인한 뒤 PIN을 다시 켜세요.
        </p>
        {!APP_LOCK_AVAILABLE ? (
          <p className="text-xs text-gray-400">중앙 서버(NAS) 연동 계정에서만 사용할 수 있습니다. (로컬 모드에는 PIN을 잊었을 때 되돌릴 로그인이 없습니다)</p>
        ) : cfg ? (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">현재 PIN</label>
              <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                aria-label="현재 PIN" className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a8f]" />
            </div>
            <button type="button" onClick={handleDisable} disabled={pin.length < 4}
              className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl disabled:opacity-50">
              잠금 끄기
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">PIN (숫자 4~6자리)</label>
              <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                aria-label="새 PIN" className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a8f]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">PIN 확인</label>
              <input type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ''))}
                aria-label="PIN 확인" className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a8f]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">잠금까지</label>
              <select value={timeoutMin} onChange={e => setTimeoutMin(Number(e.target.value))} aria-label="잠금 대기 시간"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                {LOCK_TIMEOUTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <button type="button" onClick={handleEnable} disabled={busy || pin.length < 4}
              className="px-4 py-2 bg-[#1a3a8f] hover:bg-[#15307a] text-white text-sm font-bold rounded-xl disabled:opacity-50">
              잠금 켜기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
