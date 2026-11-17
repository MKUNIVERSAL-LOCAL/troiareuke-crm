import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, LogOut } from 'lucide-react';
import { getAppLock, verifyPin, disableAppLock, APP_LOCK_CHANGED_EVENT } from '../lib/appLock';
import { useAuth } from '../contexts/AuthContext';
import { isAuthApiConfigured } from '../lib/authApi';
import { resetFeatureFlags } from '../lib/featureFlags';
import { clearLocalPhotoCacheForLogout } from '../lib/photoStore';

/**
 * 앱 잠금 오버레이 (2026-11-18) — 설정에서 PIN을 켠 기기에서, 화면을 떠났다가(탭 전환·앱 백그라운드·창 비활성) 대기 시간이 지나 돌아오면 PIN을 묻는다.
 * 잠금 중에는 화면 전체를 덮어 고객 정보가 보이지 않는다. PIN을 잊으면 로그아웃으로 해제(서버 모드) — 로컬 모드는 잠금을 끄고 다시 로그인.
 */
export default function AppLockOverlay() {
  const { logout } = useAuth();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const hiddenAtRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 화면 이탈/복귀 감지 — 모바일 앱 백그라운드·탭 전환·창 최소화는 visibilitychange("즉시"도 적용),
  // PC 창 전환(blur/focus)은 confirm 대화상자·파일 선택창에도 발생하므로 대기 시간이 1분 이상일 때만 센다
  useEffect(() => {
    const markHidden = () => { if (getAppLock() && hiddenAtRef.current === null) hiddenAtRef.current = Date.now(); };
    const checkReturn = (minTimeoutMin: number) => {
      const cfg = getAppLock();
      if (!cfg || hiddenAtRef.current === null) { hiddenAtRef.current = null; return; }
      const away = Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (cfg.timeoutMin >= minTimeoutMin && away >= cfg.timeoutMin * 60_000) setLocked(true);
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') markHidden(); else checkReturn(0); };
    const onBlur = () => { if ((getAppLock()?.timeoutMin ?? 0) >= 1) markHidden(); };
    const onFocus = () => checkReturn(1);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // 설정에서 잠금을 끄면 즉시 해제
  useEffect(() => {
    const onChange = () => { if (!getAppLock()) setLocked(false); };
    window.addEventListener(APP_LOCK_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(APP_LOCK_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => { if (locked) { setPin(''); setError(null); setTimeout(() => inputRef.current?.focus(), 50); } }, [locked]);

  const submit = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      if (await verifyPin(pin)) { setLocked(false); setPin(''); setError(null); }
      else { setError('PIN이 맞지 않습니다.'); setPin(''); inputRef.current?.focus(); }
    } finally {
      setChecking(false);
    }
  }, [pin, checking]);

  if (!locked) return null;

  const handleLogout = async () => {
    // 서버 모드: 로그아웃하면 잠금도 해제(다시 로그인하면 PIN 재설정 가능). 로컬 모드: 유일한 저장소를 지우지 않도록 잠금만 끈다.
    disableAppLock();
    setLocked(false);
    if (isAuthApiConfigured) {
      resetFeatureFlags();
      clearLocalPhotoCacheForLogout();
      await logout();
    }
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="앱 잠금" className="fixed inset-0 z-[100] bg-[#0d1b4a] text-white flex flex-col items-center justify-center p-6" data-testid="app-lock">
      <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-4"><Lock size={26} /></div>
      <p className="text-lg font-bold">잠금 해제</p>
      <p className="text-sm text-white/70 mt-1">설정한 PIN을 입력하세요</p>
      <form className="mt-6 w-full max-w-xs" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(null); }}
          aria-label="PIN"
          className="w-full text-center tracking-[0.5em] text-2xl font-bold bg-white/10 border border-white/20 rounded-xl py-3 focus:outline-none focus:border-white/60"
        />
        {error && <p role="alert" className="text-sm text-rose-300 mt-2 text-center">{error}</p>}
        <button type="submit" disabled={pin.length < 4 || checking}
          className="mt-4 w-full py-3 rounded-xl bg-white text-[#0d1b4a] font-bold disabled:opacity-40">
          확인
        </button>
      </form>
      <button type="button" onClick={handleLogout} className="mt-6 text-sm text-white/60 flex items-center gap-1.5 hover:text-white">
        <LogOut size={14} />{isAuthApiConfigured ? 'PIN을 잊었어요 — 로그아웃' : 'PIN을 잊었어요 — 잠금 끄기'}
      </button>
    </div>,
    document.body,
  );
}
