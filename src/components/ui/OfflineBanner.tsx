import { useState, useEffect } from 'react';
import { WifiOff, UploadCloud, AlertTriangle } from 'lucide-react';
import { pendingNasOutboxCount, rejectedNasOutboxCount, clearRejectedNasOutbox, OUTBOX_CHANGED_EVENT, OUTBOX_ERROR_EVENT } from '../../lib/nasOutbox';

// 이 키의 기록(쓰기)은 코어 store.ts가 자체 복제본으로 직접 수행한다 — 여기서는 읽기만.
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

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [pending, setPending] = useState(() => pendingNasOutboxCount());
  const [sendFailed, setSendFailed] = useState(false);
  const [rejected, setRejected] = useState(() => rejectedNasOutboxCount()); // 서버가 영구 거부한 저장분 — 연결 복구로 풀리지 않는다, 마운트 전 거부도 포함 (NAS 감사 2026-11-18)

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => {
      setOffline(false);
      setSendFailed(false); // 연결 복구 — 자동 재시도되므로 실패 배너 해제
    };
    const onOutboxChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      setPending(typeof detail?.count === 'number' ? detail.count : pendingNasOutboxCount());
    };
    const onOutboxError = (e: Event) => {
      const detail = (e as CustomEvent<{ permanent?: boolean }>).detail;
      if (detail?.permanent) setRejected(rejectedNasOutboxCount()); else setSendFailed(true);
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener(OUTBOX_CHANGED_EVENT, onOutboxChanged);
    window.addEventListener(OUTBOX_ERROR_EVENT, onOutboxError);

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener(OUTBOX_CHANGED_EVENT, onOutboxChanged);
      window.removeEventListener(OUTBOX_ERROR_EVENT, onOutboxError);
    };
  }, []);

  useEffect(() => {
    if (offline) {
      setMinutes(getMinutesSinceSync());
    }
  }, [offline]);

  if (!offline && pending === 0 && !sendFailed && rejected === 0) return null;

  const base = 'sticky top-0 z-30 border-b text-xs py-2 px-4 flex items-center gap-2';

  if (rejected > 0) {
    return (
      <div role="alert" className={`${base} bg-rose-50 border-rose-200 text-rose-700`}>
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>서버가 저장분 {rejected}건을 거부해 반영되지 않았습니다 — 서버 프로그램이 구버전일 수 있습니다. 관리자에게 문의하세요.</span>
        <button type="button" onClick={() => { clearRejectedNasOutbox(); setRejected(0); }} className="ml-auto text-rose-500 hover:text-rose-700 text-xs underline">닫기</button>
      </div>
    );
  }

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

  if (sendFailed) {
    return (
      <div role="status" aria-live="polite" className={`${base} bg-amber-50 border-amber-200 text-amber-700`}>
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>일부 저장분 전송 실패 — 연결 확인 후 자동 재시도됩니다</span>
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
