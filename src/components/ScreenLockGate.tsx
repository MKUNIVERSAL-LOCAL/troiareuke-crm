// 민감 화면 PIN 게이트 (비코어, 218) — Layout 의 Outlet 을 감싼다(기능·역할 게이트와 같은 자리).
// 샵은 계정 하나로 운영하므로 역할 분리 대신 "이 화면은 PIN 을 묻기" 로 차등을 둔다. PIN 은 앱 잠금과 같은 것 하나이고 기기 로컬이다.
// 한 번 맞히면 이번 실행 동안 그 화면은 다시 묻지 않고, 자리를 비워 앱 잠금이 걸리면 다시 묻는다.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { screenNeedsPin, markScreenUnlocked, screenLabel, verifyPin, APP_LOCK_CHANGED_EVENT } from '../lib/appLock';

export default function ScreenLockGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const needed = screenNeedsPin(location.pathname);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onChange = () => setTick(t => t + 1);
    window.addEventListener(APP_LOCK_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(APP_LOCK_CHANGED_EVENT, onChange);
  }, []);
  useEffect(() => { setPin(''); setError(null); }, [location.pathname, tick]);
  useEffect(() => { if (needed) panelRef.current?.focus(); }, [needed, location.pathname]); // 낭독기가 화면 전환을 알게

  if (!needed) return <>{children}</>;

  const submit = async () => {
    setBusy(true);
    try {
      if (await verifyPin(pin)) { markScreenUnlocked(needed); setPin(''); setError(null); }
      else setError('PIN이 맞지 않습니다.');
    } finally { setBusy(false); }
  };

  return (
    <div ref={panelRef} role="region" tabIndex={-1} aria-labelledby="screen-lock-title" data-testid="screen-lock"
      className="min-h-[60vh] flex items-center justify-center p-6 outline-none">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
          <Lock size={24} className="text-gray-400" />
        </div>
        <h1 id="screen-lock-title" className="text-lg font-bold text-gray-900">{screenLabel(needed)} 화면은 PIN이 필요합니다</h1>
        <p className="text-sm text-gray-500 leading-relaxed">설정 &gt; 백업·보안에서 정한 PIN을 입력하세요. 이 기기에서 이번 실행 동안만 열립니다.</p>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
          <input type="password" inputMode="numeric" maxLength={6} autoFocus value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(null); }}
            aria-label="PIN" className="w-40 mx-auto block text-center tracking-widest border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:border-[#1a3a8f]" />
          {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
          <div className="flex items-center justify-center gap-2">
            <button type="submit" disabled={busy || pin.length < 4}
              className="min-h-[44px] px-5 rounded-xl bg-[#1a3a8f] text-white text-sm font-semibold hover:bg-[#15306e] disabled:opacity-50">확인</button>
            <button type="button" onClick={() => navigate('/')}
              className="min-h-[44px] px-5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50">대시보드로</button>
          </div>
        </form>
      </div>
    </div>
  );
}
