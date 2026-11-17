import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, LogOut } from 'lucide-react';
import { getAppLock, verifyPin, disableAppLock, APP_LOCK_AVAILABLE, APP_LOCK_CHANGED_EVENT } from '../lib/appLock';
import { useAuth } from '../contexts/AuthContext';
import { isAuthApiConfigured } from '../lib/authApi';
import { IS_MOBILE_APP } from '../lib/platform';
import { resetFeatureFlags } from '../lib/featureFlags';
import { clearLocalPhotoCacheForLogout } from '../lib/photoStore';

const MAX_FAILS = 5;
const COOLDOWN_MS = 30_000;

/**
 * 앱 잠금 오버레이 (2026-11-18) — 설정에서 PIN을 켠 기기에서, 화면을 떠났다가(탭 전환·앱 백그라운드·창 최소화) 대기 시간이 지나 돌아오면 PIN을 묻는다.
 * - 앱 시작·새로고침 때도 PIN이 설정돼 있으면 잠근다(새로고침으로 우회 불가, 리뷰 2026-11-18).
 * - 잠금 중에는 #root를 inert로 만들어 키보드로도 뒤 화면에 닿지 않는다. 오답 5회면 30초 대기.
 * - PIN을 잊으면 로그아웃으로 해제(서버 모드). 로컬 모드에서는 기능 자체를 제공하지 않는다(APP_LOCK_AVAILABLE).
 */
export default function AppLockOverlay() {
  const { logout } = useAuth();
  const [locked, setLocked] = useState(() => APP_LOCK_AVAILABLE && !!getAppLock());
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [fails, setFails] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const hiddenAtRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 화면 이탈/복귀 감지 — 모바일 앱 백그라운드·탭 전환·창 최소화는 visibilitychange("즉시"도 적용),
  // PC 창 전환(blur/focus)은 confirm 대화상자·파일 선택창에도 발생하므로 대기 시간이 1분 이상일 때만 센다.
  // 모바일 앱은 Capacitor appStateChange도 함께 듣는다(WebView visibilitychange가 OS마다 달라서).
  useEffect(() => {
    if (!APP_LOCK_AVAILABLE) return;
    const markHidden = () => { if (getAppLock() && hiddenAtRef.current === null) hiddenAtRef.current = Date.now(); };
    const checkReturn = (minTimeoutMin: number) => {
      const cfg = getAppLock();
      if (!cfg) { hiddenAtRef.current = null; return; }
      if (cfg.timeoutMin < minTimeoutMin) return; // 이 신호가 듣지 않는 설정이면 표식을 소비하지 않는다(이벤트 순서 무관)
      if (hiddenAtRef.current === null) return;
      const away = Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (away >= cfg.timeoutMin * 60_000) setLocked(true);
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') markHidden(); else checkReturn(0); };
    const onBlur = () => { if ((getAppLock()?.timeoutMin ?? 0) >= 1) markHidden(); };
    const onFocus = () => checkReturn(1);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    let handle: { remove: () => Promise<void> } | undefined;
    if (IS_MOBILE_APP) {
      void import('@capacitor/app')
        .then(({ App }) => App.addListener('appStateChange', ({ isActive }) => { if (isActive) checkReturn(0); else markHidden(); }))
        .then(h => { handle = h; })
        .catch(() => { /* 플러그인 없음 — visibilitychange만 사용 */ });
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      void handle?.remove();
    };
  }, []);

  // 설정에서 잠금을 끄면 즉시 해제
  useEffect(() => {
    const onChange = () => { if (!getAppLock()) setLocked(false); };
    window.addEventListener(APP_LOCK_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(APP_LOCK_CHANGED_EVENT, onChange);
  }, []);

  // 잠금 중에는 앱 본문(#root)을 inert — 탭·Enter·Esc가 뒤 화면에 닿지 않게 (오버레이는 body 포털이라 영향 없음)
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    root.toggleAttribute('inert', locked);
    return () => root.removeAttribute('inert');
  }, [locked]);

  useEffect(() => { if (locked) { setPin(''); setError(null); setTimeout(() => inputRef.current?.focus(), 50); } }, [locked]);

  // 오답 대기 카운트다운 — 끝나면 실패 횟수와 대기를 초기화 (렌더 중 setState 금지 → 인터벌 안에서)
  useEffect(() => {
    if (cooldownUntil === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= cooldownUntil) { setFails(0); setCooldownUntil(null); setError(null); }
    }, 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);
  const coolingDown = cooldownUntil !== null && now < cooldownUntil;

  const submit = useCallback(async () => {
    if (checking || coolingDown) return;
    setChecking(true);
    try {
      if (await verifyPin(pin)) { setLocked(false); setPin(''); setError(null); setFails(0); }
      else {
        const next = fails + 1;
        setFails(next);
        setPin('');
        if (next >= MAX_FAILS) { setCooldownUntil(Date.now() + COOLDOWN_MS); setError(`PIN을 ${MAX_FAILS}회 틀렸습니다. 30초 뒤 다시 시도하세요.`); }
        else { setError(`PIN이 맞지 않습니다. (${next}/${MAX_FAILS})`); inputRef.current?.focus(); }
      }
    } finally {
      setChecking(false);
    }
  }, [pin, checking, coolingDown, fails]);

  if (!locked) return null;

  const handleLogout = async () => {
    // 로그아웃하면 서버 모드의 localStorage 정리로 잠금도 함께 해제된다 — 다시 로그인한 뒤 PIN을 다시 설정
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
          disabled={coolingDown}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(null); }}
          aria-label="PIN"
          className="w-full text-center tracking-[0.5em] text-2xl font-bold bg-white/10 border border-white/20 rounded-xl py-3 focus:outline-none focus:border-white/60 disabled:opacity-50"
        />
        {error && <p role="alert" className="text-sm text-rose-300 mt-2 text-center">{error}{coolingDown ? ` (${Math.ceil((cooldownUntil! - now) / 1000)}초)` : ''}</p>}
        <button type="submit" disabled={pin.length < 4 || checking || coolingDown}
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
