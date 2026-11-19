import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GitMerge, X, AlertTriangle } from 'lucide-react';
import { CustomerStore } from '../lib/store';
import { previewMerge, mergeCustomers, mergeBlockReason } from '../lib/customerMerge';
import { isPaymentLinkAvailable, listPaymentRequests } from '../lib/paymentLinks';
import { loadConsultations } from '../lib/consultationStore';
import { isNasDataConfigured } from '../lib/nasData';
import { matchesSearch, formatPrice } from '../lib/format';
import { maskPhone } from '../lib/masking';
import { useAuth } from '../contexts/AuthContext';
import { recordPrivacyAction, maskNameForLog } from '../lib/privacyLog';
import { notify } from '../lib/notify';
import { useFocusTrap, useOverlayClose } from '../lib/overlayStack';
import type { Customer } from '../types';

const MAX_CANDIDATES = 50;

/**
 * 중복 고객 병합 모달 (2026-11-18) — 현재 고객(target)을 남기고, 고른 고객(source)의 기록 전부를 옮긴 뒤 source를 삭제한다.
 * PC·모바일 공용(body 포털). 되돌릴 수 없어 confirm 2단계. 서버 결제 링크가 켜진 지점은 흡수 고객의 미결 결제 요청이 있으면 막는다
 * (요청의 customer_id는 서버에만 있어 옮길 수 없고, 입금되면 삭제된 고객 앉으로 결제가 기록되기 때문).
 */
export default function CustomerMergeModal({ target, initialQuery = '', onClose, onMerged }: { target: Customer; initialQuery?: string; onClose: () => void; onMerged: () => void }) {
  const { user } = useAuth();
  const [query, setQuery] = useState(initialQuery);
  const [sourceId, setSourceId] = useState('');
  const [pendingBySource, setPendingBySource] = useState<Record<string, number> | null>(isPaymentLinkAvailable ? null : {});
  const [busy, setBusy] = useState(false);
  // 서버 모드: 상담 기록을 서버에서 다시 받아 온 뒤에만 병합 — 캐시에 없는 상담이 이동에서 빠져 고아가 되지 않게 (실패면 병합 금지)
  const [consultsReady, setConsultsReady] = useState<boolean | null>(isNasDataConfigured ? null : true);
  useEffect(() => {
    if (!isNasDataConfigured) return;
    let alive = true;
    loadConsultations().then(ok => { if (alive) setConsultsReady(ok); }).catch(() => { if (alive) setConsultsReady(false); });
    return () => { alive = false; };
  }, []);

  // 서버 결제 요청 중 미결(pending/vbank_wait)을 고객별로 센다 — 실패하면 null 유지 → 병합 버튼 비활성(가짜 성공 금지)
  useEffect(() => {
    if (!isPaymentLinkAvailable) return;
    let alive = true;
    listPaymentRequests()
      .then(res => {
        if (!alive) return;
        const map: Record<string, number> = {};
        for (const r of res.requests) {
          if (!r.customerId || (r.status !== 'pending' && r.status !== 'vbank_wait')) continue;
          map[r.customerId] = (map[r.customerId] || 0) + 1;
        }
        setPendingBySource(map);
      })
      .catch(() => { if (alive) setPendingBySource(null); });
    return () => { alive = false; };
  }, []);

  const all = useMemo(() => CustomerStore.getAll().filter(c => c.id !== target.id && !mergeBlockReason(c)), [target.id]);
  const matched = useMemo(
    () => all.filter(c => !query.trim() || matchesSearch(query, [c.name, c.phone, c.email])),
    [all, query],
  );
  const candidates = matched.slice(0, MAX_CANDIDATES);
  const source = sourceId ? CustomerStore.getById(sourceId) : undefined;
  const preview = source ? previewMerge(source.id) : null;
  const total = preview ? preview.reservations + preview.treatments + preview.programs + preview.payments + preview.consultations : 0;
  const pendingRequests = source && pendingBySource ? pendingBySource[source.id] || 0 : 0;
  const serverCheckFailed = (isPaymentLinkAvailable && pendingBySource === null) || consultsReady === false;
  const serverChecking = consultsReady === null;
  const spentMismatch = source && preview && (source.totalSpent || 0) !== preview.completedAmount;

  function handleMerge() {
    if (!source || busy || pendingRequests > 0 || serverCheckFailed || serverChecking) return;
    if (!window.confirm(`'${source.name}' 고객의 기록 ${total}건을 '${target.name}' 고객으로 옮기고 '${source.name}'을(를) 삭제할까요?\n되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try {
      const moved = mergeCustomers(target.id, source.id);
      const n = moved.reservations + moved.treatments + moved.programs + moved.payments + moved.consultations;
      recordPrivacyAction({ type: 'merge', count: 1, actor: user?.name || user?.email || '알 수 없음', detail: `${maskNameForLog(source.name)} → ${maskNameForLog(target.name)} (기록 ${n}건)` }); // 파기 대장 — 이름은 가려서 (9차 점검 #29, 리뷰)
      notify(`'${source.name}' 고객을 병합했습니다. 기록 ${n}건을 옮겼습니다.`);
      onMerged();
    } catch (e) {
      notify(e instanceof Error ? e.message : '병합에 실패했습니다.');
      setBusy(false);
    }
  }

  useOverlayClose(true, onClose); // Esc·Android 뒤로가기
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, cardRef); // 검색란에 포커스, Tab 순환, 닫히면 열었던 버튼으로 (55)

  return createPortal(
    <div className="modal-backdrop fixed inset-0 bg-black/40 flex justify-center z-[60] p-4 overflow-y-auto" onClick={onClose}>
      <div ref={cardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="고객 병합" onClick={e => e.stopPropagation()}
        className="modal-card my-auto bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 flex items-center gap-1.5"><GitMerge size={16} className="text-[#1a3a8f]" />고객 병합</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            <b className="text-gray-900">{target.name}</b> 고객을 남기고, 아래에서 고른 고객의 예약·시술·프로그램·결제·상담 기록을 모두 이 고객으로 옮긴 뒤 그 고객은 삭제합니다.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">흡수할 고객 검색</label>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="이름·전화번호" aria-label="병합할 고객 검색"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30" />
            <div role="radiogroup" aria-label="흡수할 고객" className="mt-2 max-h-56 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
              {candidates.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">검색 결과가 없습니다</p>}
              {candidates.map(c => (
                <label key={c.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${sourceId === c.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                  <input type="radio" name="merge-source" value={c.id} checked={sourceId === c.id} onChange={() => setSourceId(c.id)} className="accent-amber-600" />
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium text-gray-900">{c.name}</span>
                    <span className="text-gray-500"> · {maskPhone(c.phone, user?.role ?? 'staff')} · 방문 {c.totalVisits}회</span>
                  </span>
                </label>
              ))}
            </div>
            {matched.length > MAX_CANDIDATES && (
              <p className="mt-1 text-xs text-gray-400">{matched.length}명 중 {MAX_CANDIDATES}명만 표시 — 이름이나 전화번호를 더 입력하세요</p>
            )}
          </div>
          {source && preview && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1" data-testid="merge-preview">
              <p className="font-semibold flex items-center gap-1"><AlertTriangle size={12} />{source.name} → {target.name}</p>
              <p>예약 {preview.reservations} · 시술 {preview.treatments} · 프로그램 {preview.programs} · 결제 {preview.payments} · 상담 {preview.consultations} (총 {total}건)</p>
              <p>방문 횟수·메모·태그는 합쳐지고, 등급은 높은 쪽·등록일은 이른 쪽을 따르며, 비어 있는 정보(이메일·주소·생년월일 등)는 {source.name} 고객 값으로 채워집니다.</p>
              <p>누적 결제액은 완료된 결제 기록 기준 {formatPrice(preview.completedAmount)}이 더해집니다{spentMismatch ? ` (이 고객 화면의 누적 ${formatPrice(source.totalSpent || 0)}과 다름 — 결제 기록 없는 금액은 옮겨지지 않음)` : ''}.</p>
              {preview.productSales > 0 && <p className="font-semibold">제품 판매 {preview.productSales}건은 옮겨지지 않고 {source.name} 이름으로 남습니다.</p>}
              {pendingRequests > 0 && <p className="font-semibold text-red-700">미결 결제 요청(링크) {pendingRequests}건이 있어 병합할 수 없습니다. 결제 링크 화면에서 취소하거나 완료된 뒤 다시 시도하세요.</p>}
              {serverCheckFailed && <p className="font-semibold text-red-700">서버의 결제 요청·상담 기록을 확인하지 못했습니다. 네트워크를 확인한 뒤 다시 열어주세요.</p>}
              {serverChecking && <p className="text-gray-500">서버 기록을 확인하는 중...</p>}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
            <button type="button" onClick={handleMerge} disabled={!source || busy || pendingRequests > 0 || serverCheckFailed || serverChecking}
              className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
              <GitMerge size={14} />병합 실행
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
