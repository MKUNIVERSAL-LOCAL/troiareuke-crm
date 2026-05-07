import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

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

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    if (offline) {
      setMinutes(getMinutesSinceSync());
    }
  }, [offline]);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs py-2 px-4 flex items-center gap-2 lg:hidden"
    >
      <WifiOff size={14} className="flex-shrink-0" />
      <span>
        오프라인
        {minutes !== null ? ` — 마지막 동기화 ${minutes}분 전` : ''}
      </span>
      <span className="ml-1 text-amber-600">인터넷 연결을 확인해주세요</span>
    </div>
  );
}
