import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { IS_MOBILE_APP } from '../../lib/platform';
import { openExternal } from '../../lib/mobileBridge';
import { checkMobileUpdate, type MobileUpdateState } from '../../lib/mobileUpdate';

const DISMISS_KEY = 'troiareuke_mobile_update_dismissed';

/**
 * 모바일 앱 새 버전 안내 배너 — 스토어 빌드에서만 렌더. PC/웹은 null.
 * optional: 닫을 수 있음(같은 버전은 하루 동안 다시 안 뜸) / required: 닫기 불가(서버 최소 지원 버전 미만).
 */
export default function MobileUpdateBanner() {
  const [state, setState] = useState<MobileUpdateState>({ kind: 'none' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!IS_MOBILE_APP) return;
    let cancelled = false;
    const run = () => checkMobileUpdate().then(s => { if (!cancelled) setState(s); }).catch(() => {});
    const t = setTimeout(run, 4000);
    const iv = setInterval(run, 6 * 60 * 60 * 1000);
    return () => { cancelled = true; clearTimeout(t); clearInterval(iv); };
  }, []);

  useEffect(() => {
    if (state.kind !== 'optional') return;
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) {
        const { version, at } = JSON.parse(raw) as { version: string; at: number };
        if (version === state.manifest.version && Date.now() - at < 24 * 60 * 60 * 1000) setDismissed(true);
      }
    } catch { /* ignore */ }
  }, [state]);

  if (!IS_MOBILE_APP || state.kind === 'none' || (state.kind === 'optional' && dismissed)) return null;
  const required = state.kind === 'required';

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify({ version: state.manifest.version, at: Date.now() })); } catch { /* ignore */ }
  };

  return (
    <div
      role="status"
      data-testid="mobile-update-banner"
      className={`flex items-start gap-3 px-4 py-3 text-sm ${required ? 'bg-red-600 text-white' : 'bg-[#1a3a8f] text-white'}`}
    >
      <Smartphone size={18} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold">
          {required ? '앱 업데이트가 필요합니다' : `새 버전 ${state.manifest.version} 이 나왔습니다`}
        </p>
        <p className="text-xs opacity-90 mt-0.5">
          {required
            ? `현재 ${state.current} 은 더 이상 지원되지 않아 일부 기능이 동작하지 않을 수 있습니다.`
            : `현재 ${state.current}. 스토어에서 업데이트하면 최신 기능이 적용됩니다.`}
        </p>
        {state.url && (
          <button
            type="button"
            onClick={() => void openExternal(state.url)}
            className="mt-2 inline-flex items-center rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#1a3a8f]"
          >
            업데이트 받기
          </button>
        )}
      </div>
      {!required && (
        <button type="button" onClick={dismiss} aria-label="닫기" className="p-1 rounded hover:bg-white/15">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
