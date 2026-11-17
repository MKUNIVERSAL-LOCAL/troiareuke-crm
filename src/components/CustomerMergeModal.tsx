import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { GitMerge, X, AlertTriangle } from 'lucide-react';
import { CustomerStore } from '../lib/store';
import { previewMerge, mergeCustomers } from '../lib/customerMerge';
import { isAnonymized } from '../lib/retentionPolicy';
import { matchesSearch } from '../lib/format';
import { maskPhone } from '../lib/masking';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notify';
import type { Customer } from '../types';

/**
 * 중복 고객 병합 모달 (2026-11-18) — 현재 고객(target)을 남기고, 고른 고객(source)의 기록 전부를 옮긴 뒤 source를 삭제한다.
 * PC·모바일 공용(body 포털). 되돌릴 수 없어 confirm 2단계.
 */
export default function CustomerMergeModal({ target, onClose, onMerged }: { target: Customer; onClose: () => void; onMerged: () => void }) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [sourceId, setSourceId] = useState('');
  const candidates = useMemo(
    () => CustomerStore.getAll()
      .filter(c => c.id !== target.id && !c.id.startsWith('sample_') && !isAnonymized(c))
      .filter(c => !query.trim() || matchesSearch(query, [c.name, c.phone, c.email]))
      .slice(0, 50),
    [target.id, query],
  );
  const source = sourceId ? CustomerStore.getById(sourceId) : undefined;
  const preview = source ? previewMerge(source.id) : null;
  const total = preview ? preview.reservations + preview.treatments + preview.programs + preview.payments + preview.consultations : 0;

  function handleMerge() {
    if (!source) return;
    if (!window.confirm(`'${source.name}' 고객의 기록 ${total}건을 '${target.name}' 고객으로 옮기고 '${source.name}'을(를) 삭제할까요?\n되돌릴 수 없습니다.`)) return;
    try {
      const moved = mergeCustomers(target.id, source.id);
      const n = moved.reservations + moved.treatments + moved.programs + moved.payments + moved.consultations;
      notify(`'${source.name}' 고객을 병합했습니다. 기록 ${n}건을 옮겼습니다.`);
      onMerged();
    } catch (e) {
      notify(e instanceof Error ? e.message : '병합에 실패했습니다.');
    }
  }

  return createPortal(
    <div className="modal-backdrop fixed inset-0 bg-black/40 flex justify-center z-[60] p-4 overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-label="고객 병합" className="modal-card my-auto bg-white rounded-2xl w-full max-w-md shadow-2xl">
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
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름·전화번호" aria-label="병합할 고객 검색"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30" />
            <select value={sourceId} onChange={e => setSourceId(e.target.value)} aria-label="흡수할 고객" size={Math.min(6, Math.max(3, candidates.length + 1))}
              className="mt-2 w-full border border-gray-200 rounded-xl text-sm px-2 py-1">
              <option value="">— 고객 선택 —</option>
              {candidates.map(c => (
                <option key={c.id} value={c.id}>{c.name} · {maskPhone(c.phone, user?.role ?? 'staff')} · 방문 {c.totalVisits}회</option>
              ))}
            </select>
          </div>
          {source && preview && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1" data-testid="merge-preview">
              <p className="font-semibold flex items-center gap-1"><AlertTriangle size={12} />{source.name} → {target.name}</p>
              <p>예약 {preview.reservations} · 시술 {preview.treatments} · 프로그램 {preview.programs} · 결제 {preview.payments} · 상담 {preview.consultations} (총 {total}건)</p>
              <p>방문 횟수와 메모·태그는 합쳐지고, 비어 있는 정보(이메일·주소·생년월일 등)는 {source.name} 고객 값으로 채워집니다.</p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
            <button type="button" onClick={handleMerge} disabled={!source}
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
