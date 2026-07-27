import { useState, useEffect } from 'react';
import { WifiOff, UploadCloud } from 'lucide-react';
import { pendingNasOutboxCount, OUTBOX_CHANGED_EVENT } from '../../lib/nasOutbox';

const LAST_SYNC_KEY = 'crm_last_sync_at';

function getMinutesSinceSync(): number | null {
  try {
    const ts = localStorage.getItem(LAST_SYNC_KEY);
    if (!ts) return null;
    return Math.floor((Date.now() - Number(ts)) / 60000);
  } catch {
    return null;
  }
}

export function recordSyncTimestamp() {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  } catch {}
}

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [pending, setPending] = useState(() => pendingNasOutboxCount());

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    const onOutboxChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      setPending(typeof detail?.count === 'number' ? detail.count : pendingNasOutboxCount());
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener(OUTBOX_CHANGED_EVENT, onOutboxChanged);

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener(OUTBOX_CHANGED_EVENT, onOutboxChanged);
    };
  }, []);

  useEffect(() => {
    if (offline) {
      setMinutes(getMinutesSinceSync());
    }
  }, [offline]);

  if (!offline && pending === 0) return null;

  const base = 'sticky top-0 z-30 border-b text-xs py-2 px-4 flex items-center gap-2';

  if (offline) {
    // 전송 대기분이 있으면 매장 데스크톱(lg)에서도 표시해 유실 위험을 알린다
    return (
      <div
        role="status"
        aria-live="polite"
        className={`${base} bg-amber-50 border-amber-200 text-amber-700 ${pending > 0 ? '' : 'lg:hidden'}`}
      >
        <WifiOff size={14} className="flex-shrink-0" />
        <span>
          오프라인
          {minutes !== null ? ` — 마지막 동기화 ${minutes}분 전` : ''}
          {pending > 0 ? ` · 저장분 ${pending}건 전송 대기` : ''}
        </span>
        <span className="ml-1 text-amber-600">
          {pending > 0 ? '연결이 복구되면 자동 전송됩니다' : '인터넷 연결을 확인해주세요'}
        </span>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className={`${base} bg-sky-50 border-sky-200 text-sky-700`}>
      <UploadCloud size={14} className="flex-shrink-0" />
      <span>저장분 {pending}건 서버 전송 대기 중 — 자동으로 전송됩니다</span>
    </div>
  );
}
