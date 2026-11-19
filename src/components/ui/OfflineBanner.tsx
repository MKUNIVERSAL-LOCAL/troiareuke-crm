import { useState, useEffect } from 'react';
import { WifiOff, UploadCloud, AlertTriangle, Image } from 'lucide-react';
import {
  pendingNasOutboxCount, listRejectedNasOutbox, clearRejectedNasOutbox, retryRejectedNasOutbox,
  OUTBOX_CHANGED_EVENT, OUTBOX_ERROR_EVENT,
} from '../../lib/nasOutbox';
import { dirtyPhotoCount, rejectedPhotoCount, retryDirtyPhotos, keepRejectedPhotosLocal, PHOTO_SYNC_EVENT } from '../../lib/photoStore';
import { isAuthApiConfigured } from '../../lib/authApi';
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
  expenses: '지출', customer_programs: '고객 회차권', programs: '프로그램', products: '제품', product_sales: '제품 판매',
  staff: '직원', services: '시술 항목', settings: '설정', message_templates: '메시지 템플릿', message_history: '발송 기록',
};
function describeRejected(items: { path: string }[]): string {
  const counts = new Map<string, number>();
  for (const { path } of items) {
    const m = /\/api\/data\/([^/?]+)/.exec(path);
    const label = m ? (COLLECTION_LABELS[m[1]] || m[1]) : '기타';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].map(([k, v]) => `${k} ${v}건`).join(' · ');
}
// 왜 거부됐는지 — 404 PATCH는 다른 기기에서 이미 삭제된 기록(서버 문제 아님), 404 PUT/400은 서버가 모르는 컬렉션·형식(서버 구버전 가능)
function describeReason(items: { status: number; method: string }[]): string {
  const reasons = new Set<string>();
  for (const { status, method } of items) {
    if (status === 404 && method === 'PATCH') reasons.add('다른 기기에서 이미 삭제된 기록');
    else if (status === 404) reasons.add('서버가 모르는 항목(서버 프로그램 구버전 가능)');
    else if (status === 400 || status === 422) reasons.add('서버가 형식을 거부(서버 프로그램 구버전 가능)');
    else if (status === 413) reasons.add('용량 초과');
    else reasons.add(`서버 응답 ${status}`);
  }
  return [...reasons].join(', ');
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
  const [lostRejected, setLostRejected] = useState(0); // 거부분을 이 기기에 보존조차 못 한 건수(저장 공간 부족)
  const [quotaFallback, setQuotaFallback] = useState<'none' | 'sent' | 'failed'>('none');
  const [photoDirty, setPhotoDirty] = useState(() => dirtyPhotoCount());
  const [photoRejected, setPhotoRejected] = useState(() => rejectedPhotoCount());

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => {
      setOffline(false);
      setSendFailed(false); // 연결 복구 — 자동 재시도되므로 실패 배너 해제
      setAuthExpired(false); // 재시도 루프가 아직 만료면 다시 올린다
    };
    const onOutboxChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      const n = typeof detail?.count === 'number' ? detail.count : pendingNasOutboxCount();
      setPending(prev => { if (n < prev) setAuthExpired(false); return n; }); // 전송이 진행되면 세션 문제는 해소된 것
    };
    const onOutboxError = (e: Event) => {
      const detail = (e as CustomEvent<{ permanent?: boolean; auth?: boolean; fallback?: boolean; failed?: boolean; lost?: boolean }>).detail;
      if (detail?.permanent) { setRejected(listRejectedNasOutbox()); if (detail.lost) setLostRejected(n => n + 1); }
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
  if (!offline && pending === 0 && !sendFailed && rejected.length === 0 && lostRejected === 0 && !authExpired && quotaFallback === 'none' && !photoIssue) return null;

  const base = 'sticky top-0 z-30 border-b text-xs py-2 px-4 flex items-center gap-2 flex-wrap';
  const linkBtn = 'text-xs underline px-1 py-1';

  if (rejected.length > 0 || lostRejected > 0) {
    const retry = () => {
      const n = retryRejectedNasOutbox();
      setRejected([]);
      notify(`${n}건을 다시 전송 대기열에 넣었습니다. 서버가 또 거부하면 다시 표시됩니다. (그 사이 다른 기기에서 고친 내용은 덮일 수 있습니다)`);
    };
    const download = async () => {
      try {
        const blob = new Blob([JSON.stringify(rejected, null, 2)], { type: 'application/json' });
        const r = await exportFile(`서버거부_저장분_${new Date().toISOString().slice(0, 10)}.json`, blob);
        if (r === 'cancelled') notify.info('공유를 취소했습니다 — 파일은 저장되지 않았습니다.');
      } catch (e) {
        notify(e instanceof Error ? e.message : '파일을 저장하지 못했습니다.');
      }
    };
    return (
      <div role="alert" data-testid="nas-rejected-banner" className={`${base} bg-rose-50 border-rose-200 text-rose-700`}>
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>
          {rejected.length > 0 && <>서버가 저장분 {rejected.length}건을 거부해 반영되지 않았습니다 ({describeRejected(rejected)}) — 사유: {describeReason(rejected)}. 이 기기에는 남아 있습니다.</>}
          {lostRejected > 0 && <> 추가로 {lostRejected}건은 이 기기 저장 공간이 부족해 보존하지 못했습니다 — 해당 기록을 다시 입력해야 합니다.</>}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {rejected.length > 0 && <button type="button" onClick={retry} className={`${linkBtn} text-rose-700 hover:text-rose-900 font-medium`}>다시 시도</button>}
          {rejected.length > 0 && <button type="button" onClick={download} className={`${linkBtn} text-rose-600 hover:text-rose-800`}>내려받기</button>}
          <button type="button" onClick={() => { if (window.confirm('거부된 저장분 기록을 지울까요? 서버에는 반영되지 않은 상태로 남습니다.')) { clearRejectedNasOutbox(); setRejected([]); setLostRejected(0); } }} className={`${linkBtn} text-rose-500 hover:text-rose-700`}>지우기</button>
        </span>
      </div>
    );
  }

  if (authExpired && pending > 0) {
    return (
      <div role="alert" className={`${base} bg-rose-50 border-rose-200 text-rose-700`}>
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>로그인 세션이 만료돼 저장분 {pending}건을 보내지 못하고 있습니다 — 프로그램을 다시 시작해 로그인하면 이어서 전송됩니다 (대기분은 이 기기에 보존됩니다).</span>
      </div>
    );
  }

  if (quotaFallback === 'failed') {
    return (
      <div role="alert" className={`${base} bg-rose-50 border-rose-200 text-rose-700`}>
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>이 기기 저장 공간이 부족해 대기열 없이 바로 보냈는데 전송에 실패했습니다 — 방금 저장한 내용이 서버에 없을 수 있습니다. 설정 &gt; 백업·보안으로 백업한 뒤 다시 저장해주세요.</span>
        <button type="button" onClick={() => setQuotaFallback('none')} className={`${linkBtn} ml-auto text-rose-500 hover:text-rose-700`}>닫기</button>
      </div>
    );
  }

  if (offline) {
    // 로컬 모드(서버 없음)는 인터넷이 없어도 아무것도 막히지 않는다 — 전송 대기분이 없으면 띠를 띄우지 않는다 (UX 점검 2026-11-19)
    if (!isAuthApiConfigured && pending === 0 && photoDirty === 0) return null;
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
        <span className="ml-1 text-amber-700">
          {pending > 0 || photoDirty > 0 ? '연결이 복구되면 자동 전송됩니다' : '인터넷 연결을 확인해주세요'}
        </span>
      </div>
    );
  }

  if (photoRejected > 0) {
    return (
      <div role="alert" className={`${base} bg-rose-50 border-rose-200 text-rose-700`}>
        <Image size={14} className="flex-shrink-0" />
        <span>사진 {photoRejected}건을 서버가 받지 않았습니다(용량 초과 등) — 이 기기에만 저장돼 있어 다른 기기에서는 보이지 않습니다. 그 기록의 사진 장수를 줄여 다시 저장하면 올라갑니다.</span>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => { void retryDirtyPhotos(true); }} className={`${linkBtn} text-rose-700 hover:text-rose-900 font-medium`}>다시 시도</button>
          {/* 같은 413이 반복되면 [다시 시도]만으로는 영원히 빨간 띠 — 이 기기에만 두는 선택을 준다 (UX 점검 2026-11-19) */}
          <button type="button" onClick={() => { if (window.confirm(`거부된 사진 ${photoRejected}건을 이 기기에만 보관할까요?\n서버에는 올라가지 않아 다른 기기에서는 보이지 않고, 이 기기에서 로그아웃하면 함께 사라집니다. 나중에 그 기록의 사진을 줄여 다시 저장하면 올라갑니다.`)) { const n = keepRejectedPhotosLocal(); notify.info(`사진 ${n}건을 이 기기에만 보관합니다.`); } }} className={`${linkBtn} text-rose-600 hover:text-rose-800`}>이 기기에만 보관</button>
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

  if (quotaFallback === 'sent') {
    return (
      <div role="status" aria-live="polite" className={`${base} bg-amber-50 border-amber-200 text-amber-700`}>
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>이 기기 저장 공간이 부족해 대기열 없이 바로 전송했습니다 — 실패하면 유실될 수 있으니 설정 &gt; 백업·보안으로 공간을 확보해주세요.</span>
        <button type="button" onClick={() => setQuotaFallback('none')} className={`${linkBtn} ml-auto text-amber-700 hover:text-amber-800`}>닫기</button>
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
