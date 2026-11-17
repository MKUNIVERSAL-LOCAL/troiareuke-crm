import { useState, useEffect } from 'react';
import { WifiOff, UploadCloud, AlertTriangle, Image } from 'lucide-react';
import {
  pendingNasOutboxCount, rejectedNasOutboxCount, listRejectedNasOutbox, clearRejectedNasOutbox, retryRejectedNasOutbox,
  OUTBOX_CHANGED_EVENT, OUTBOX_ERROR_EVENT,
} from '../../lib/nasOutbox';
import { dirtyPhotoCount, rejectedPhotoCount, retryDirtyPhotos, PHOTO_SYNC_EVENT } from '../../lib/photoStore';
import { exportFile } from '../../lib/mobileBridge';
import { notify } from '../../lib/notify';

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

// /api/data/<collection>[/id] → 사람이 읽는 기록 종류
const COLLECTION_LABELS: Record<string, string> = {
  customers: '고객', reservations: '예약', treatment_logs: '시술 기록', consultations: '상담 기록', payments: '결제',
  expenses: '지출', customer_programs: '고객 프로그램', programs: '프로그램', products: '제품', product_sales: '제품 판매',
  staff: '직원', services: '시술 메뉴', settings: '설정', message_templates: '메시지 템플릿', message_history: '발송 기록',
};
function describeRejected(paths: string[]): string {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const m = /\/api\/data\/([^/?]+)/.exec(p);
    const label = m ? (COLLECTION_LABELS[m[1]] || m[1]) : '기타';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].map(([k, v]) => `${k} ${v}건`).join(' · ');
}

/**
 * 서버(NAS) 모드 연결·전송 상태 배너 — 오프라인, 전송 대기, 일시 실패, 영구 거부, 세션 만료, 용량 폴백, 사진 전송.
 * 우선순위: 거부(사람이 조치) > 세션 만료 > 용량 폴백 실패 > 오프라인 > 일시 실패 > 대기 중.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [pending, setPending] = useState(() => pendingNasOutboxCount());
  const [sendFailed, setSendFailed] = useState(false);
  const [rejected, setRejected] = useState(() => listRejectedNasOutbox()); // 서버가 영구 거부한 저장분 — 재시작해도 남는다 (실패 경로 감사 2026-11-18)
  const [authExpired, setAuthExpired] = useState(false);
  const [quotaFallback, setQuotaFallback] = useState<'none' | 'sent' | 'failed'>('none');
  const [photoDirty, setPhotoDirty] = useState(() => dirtyPhotoCount());
  const [photoRejected, setPhotoRejected] = useState(() => rejectedPhotoCount());

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => {
      setOffline(false);
      setSendFailed(false); // 연결 복구 — 자동 재시도되므로 실패 배너 해제
    };
    const onOutboxChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      const n = typeof detail?.count === 'number' ? detail.count : pendingNasOutboxCount();
      setPending(n);
      if (n === 0) setAuthExpired(false); // 다 보내졌으면 세션 문제도 해소된 것
    };
    const onOutboxError = (e: Event) => {
      const detail = (e as CustomEvent<{ permanent?: boolean; auth?: boolean; fallback?: boolean; failed?: boolean }>).detail;
      if (detail?.permanent) setRejected(listRejectedNasOutbox());
      else if (detail?.auth) setAuthExpired(true);
      else if (detail?.fallback) setQuotaFallback(detail.failed ? 'failed' : 'sent');
      else setSendFailed(true);
    };
    const onPhotoSync = () => { setPhotoDirty(dirtyPhotoCount()); setPhotoRejected(rejectedPhotoCount()); };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener(OUTBOX_CHANGED_EVENT, onOutboxChanged);
    window.addEventListener(OUTBOX_ERROR_EVENT, onOutboxError);
    window.addEventListener(PHOTO_SYNC_EVENT, onPhotoSync);

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener(OUTBOX_CHANGED_EVENT, onOutboxChanged);
      window.removeEventListener(OUTBOX_ERROR_EVENT, onOutboxError);
      window.removeEventListener(PHOTO_SYNC_EVENT, onPhotoSync);
    };
  }, []);

  useEffect(() => {
    if (offline) {
      setMinutes(getMinutesSinceSync());
    }
  }, [offline]);

  const photoIssue = photoDirty > 0 || photoRejected > 0;
  if (!offline && pending === 0 && !sendFailed && rejected.length === 0 && !authExpired && quotaFallback === 'none' && !photoIssue) return null;

  const base = 'sticky top-0 z-30 border-b text-xs py-2 px-4 flex items-center gap-2 flex-wrap';
  const linkBtn = 'text-xs underline px-1 py-1';

  if (rejected.length > 0) {
    const retry = () => {
      const n = retryRejectedNasOutbox();
      setRejected([]);
      notify(`${n}건을 다시 전송 대기열에 넣었습니다. 서버가 또 거부하면 다시 표시됩니다.`);
    };
    const download = async () => {
      try {
        const blob = new Blob([JSON.stringify(rejected, null, 2)], { type: 'application/json' });
        const r = await exportFile(`서버거부_저장분_${new Date().toISOString().slice(0, 10)}.json`, blob);
        if (r === 'cancelled') notify('공유를 취소했습니다 — 파일은 저장되지 않았습니다.');
      } catch (e) {
        notify(e instanceof Error ? e.message : '파일을 저장하지 못했습니다.');
      }
    };
    return (
      <div role="alert" data-testid="nas-rejected-banner" className={`${base} bg-rose-50 border-rose-200 text-rose-700`}>
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>
          서버가 저장분 {rejected.length}건을 거부해 반영되지 않았습니다 ({describeRejected(rejected.map(r => r.path))}) — 서버 프로그램이 구버전일 수 있습니다. 이 기기에는 남아 있습니다.
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={retry} className={`${linkBtn} text-rose-700 hover:text-rose-900 font-medium`}>다시 시도</button>
          <button type="button" onClick={download} className={`${linkBtn} text-rose-600 hover:text-rose-800`}>내려받기</button>
          <button type="button" onClick={() => { if (window.confirm('거부된 저장분 기록을 지울까요? 서버에는 반영되지 않은 상태로 남습니다.')) { clearRejectedNasOutbox(); setRejected([]); } }} className={`${linkBtn} text-rose-500 hover:text-rose-700`}>지우기</button>
        </span>
      </div>
    );
  }

  if (authExpired && pending > 0) {
    return (
      <div role="alert" className={`${base} bg-rose-50 border-rose-200 text-rose-700`}>
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>로그인 세션이 만료돼 저장분 {pending}건을 보내지 못하고 있습니다 — [로그아웃]은 누르지 말고(대기분이 지워짐) 프로그램을 다시 시작해 로그인하면 이어서 전송됩니다.</span>
      </div>
    );
  }

  if (quotaFallback === 'failed') {
    return (
      <div role="alert" className={`${base} bg-rose-50 border-rose-200 text-rose-700`}>
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>이 기기 저장 공간이 부족해 대기열 없이 바로 보냈는데 전송에 실패했습니다 — 방금 저장한 내용이 서버에 없을 수 있습니다. 설정 &gt; 데이터 백업으로 백업한 뒤 다시 저장해주세요.</span>
        <button type="button" onClick={() => setQuotaFallback('none')} className={`${linkBtn} ml-auto text-rose-500 hover:text-rose-700`}>닫기</button>
      </div>
    );
  }

  if (offline) {
    // 전송 대기분이 있으면 매장 데스크톱(lg)에서도 표시해 유실 위험을 알린다
    return (
      <div
        role="status"
        aria-live="polite"
        className={`${base} bg-amber-50 border-amber-200 text-amber-700 ${pending > 0 || photoDirty > 0 ? '' : 'lg:hidden'}`}
      >
        <WifiOff size={14} className="flex-shrink-0" />
        <span>
          오프라인
          {minutes !== null ? ` — 마지막 동기화 ${minutes}분 전` : ''}
          {pending > 0 ? ` · 저장분 ${pending}건 전송 대기` : ''}
          {photoDirty > 0 ? ` · 사진 ${photoDirty}건 전송 대기` : ''}
        </span>
        <span className="ml-1 text-amber-600">
          {pending > 0 || photoDirty > 0 ? '연결이 복구되면 자동 전송됩니다' : '인터넷 연결을 확인해주세요'}
        </span>
      </div>
    );
  }

  if (photoRejected > 0) {
    return (
      <div role="alert" className={`${base} bg-rose-50 border-rose-200 text-rose-700`}>
        <Image size={14} className="flex-shrink-0" />
        <span>사진 {photoRejected}건을 서버가 받지 않았습니다(용량 초과 등) — 이 기기에만 저장돼 있어 다른 기기에서는 보이지 않습니다.</span>
        <button type="button" onClick={() => { void retryDirtyPhotos(true); }} className={`${linkBtn} ml-auto text-rose-700 hover:text-rose-900 font-medium`}>다시 시도</button>
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

  if (quotaFallback === 'sent') {
    return (
      <div role="status" aria-live="polite" className={`${base} bg-amber-50 border-amber-200 text-amber-700`}>
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>이 기기 저장 공간이 부족해 대기열 없이 바로 전송했습니다 — 실패하면 유실될 수 있으니 설정 &gt; 데이터 백업으로 공간을 확보해주세요.</span>
        <button type="button" onClick={() => setQuotaFallback('none')} className={`${linkBtn} ml-auto text-amber-600 hover:text-amber-800`}>닫기</button>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className={`${base} bg-sky-50 border-sky-200 text-sky-700`}>
      <UploadCloud size={14} className="flex-shrink-0" />
      <span>
        {pending > 0 ? `저장분 ${pending}건` : ''}{pending > 0 && photoDirty > 0 ? ' · ' : ''}{photoDirty > 0 ? `사진 ${photoDirty}건` : ''} 서버 전송 대기 중 — 자동으로 전송됩니다
      </span>
      {photoDirty > 0 && pending === 0 && (
        <button type="button" onClick={() => { void retryDirtyPhotos(false); }} className={`${linkBtn} ml-auto text-sky-700 hover:text-sky-900`}>지금 전송</button>
      )}
    </div>
  );
}
