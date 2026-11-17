import { useState } from 'react';
import Modal from './ui/Modal';
import { CustomerProgramStore } from '../lib/store';
import { todayISO, parseISODate, toISODate, formatDate } from '../lib/format';
import { notify } from '../lib/notify';
import type { CustomerProgram } from '../types';

/**
 * 고객 프로그램 관리 모달 (2026-11-18) — 고객 상세 PC·모바일 공용.
 * 만료일 변경(연장·단축), 총 회차 보정(서비스 회차 추가·오등록 수정), 완료 처리/되돌리기. 바뀐 내용은 notes에 날짜와 함께 남긴다.
 * 회차 사용(usedSessions)은 시술 기록이 정본이라 여기서 건드리지 않는다 — 시술 기록을 수정·삭제하면 자동 복구된다.
 */
export default function ProgramManageModal({ program: cp, onClose, onDone }: { program: CustomerProgram; onClose: () => void; onDone: () => void }) {
  const [expiryDate, setExpiryDate] = useState(cp.expiryDate || '');
  const [totalSessions, setTotalSessions] = useState(cp.totalSessions === null ? '' : String(cp.totalSessions));
  const [reason, setReason] = useState('');
  const isSessionBased = cp.totalSessions !== null;
  const remaining = isSessionBased ? Math.max(0, (cp.totalSessions as number) - cp.usedSessions) : null;

  const shift = (days: number) => {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ? parseISODate(expiryDate) : new Date();
    base.setDate(base.getDate() + days);
    setExpiryDate(toISODate(base));
  };

  function appendNote(existing: string | undefined, line: string): string {
    const entry = `[${todayISO()}] ${line}${reason.trim() ? ` — ${reason.trim()}` : ''}`;
    return existing ? `${existing}\n${entry}` : entry;
  }

  function handleSave() {
    const updates: Partial<CustomerProgram> = {};
    const changes: string[] = [];
    if (expiryDate !== (cp.expiryDate || '')) {
      if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) { notify('만료일 형식이 올바르지 않습니다.'); return; }
      updates.expiryDate = expiryDate || undefined;
      changes.push(`만료일 ${cp.expiryDate ? formatDate(cp.expiryDate) : '없음'} → ${expiryDate ? formatDate(expiryDate) : '없음'}`);
    }
    if (isSessionBased) {
      const t = totalSessions.replace(/[,\s]/g, '');
      if (!/^\d+$/.test(t)) { notify('총 회차는 숫자만 입력해주세요.'); return; }
      const next = Number(t);
      if (next !== cp.totalSessions) {
        if (next < cp.usedSessions) { notify(`이미 ${cp.usedSessions}회를 사용해 총 회차를 그보다 적게 둘 수 없습니다.`); return; }
        updates.totalSessions = next;
        updates.isCompleted = cp.usedSessions >= next;
        changes.push(`총 회차 ${cp.totalSessions}회 → ${next}회`);
      }
    }
    if (changes.length === 0) { notify('바뀐 내용이 없습니다.'); return; }
    updates.notes = appendNote(cp.notes, changes.join(', '));
    if (!CustomerProgramStore.update(cp.id, updates)) { notify('프로그램을 찾을 수 없습니다.'); return; }
    notify(`${cp.programName}: ${changes.join(', ')}`);
    onDone();
  }

  function toggleCompleted() {
    if (cp.isCompleted) {
      if (isSessionBased && cp.usedSessions >= (cp.totalSessions as number)) { notify('회차를 모두 사용한 프로그램은 되돌릴 수 없습니다. 총 회차를 늘려주세요.'); return; }
      CustomerProgramStore.update(cp.id, { isCompleted: false, notes: appendNote(cp.notes, '완료 → 진행중으로 되돌림') });
      notify(`${cp.programName}을(를) 진행중으로 되돌렸습니다.`);
    } else {
      const left = remaining !== null && remaining > 0 ? `\n잔여 ${remaining}회는 더 이상 쓸 수 없게 됩니다.` : '';
      if (!window.confirm(`${cp.programName}을(를) 완료 처리할까요?${left}`)) return;
      CustomerProgramStore.update(cp.id, { isCompleted: true, notes: appendNote(cp.notes, `완료 처리${remaining ? ` (잔여 ${remaining}회 소멸)` : ''}`) });
      notify(`${cp.programName}을(를) 완료 처리했습니다.`);
    }
    onDone();
  }

  return (
    <Modal isOpen onClose={onClose} title="프로그램 관리" size="sm">
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-sm text-gray-900">{cp.programName}</p>
          <p className="text-xs text-gray-500">
            {isSessionBased ? `사용 ${cp.usedSessions}회 / 총 ${cp.totalSessions}회 · 잔여 ${remaining}회` : '기간제'} · 등록 {formatDate(cp.purchaseDate)}
            {cp.isCompleted ? ' · 완료' : ''}
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">만료일</label>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} aria-label="만료일" className="px-3 py-2 text-sm border border-gray-200 rounded-xl" />
            <button type="button" onClick={() => shift(30)} className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-gray-700 hover:bg-slate-200">+30일</button>
            <button type="button" onClick={() => shift(90)} className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-gray-700 hover:bg-slate-200">+90일</button>
            {expiryDate && <button type="button" onClick={() => setExpiryDate('')} className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-500">만료 없음</button>}
          </div>
        </div>
        {isSessionBased && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">총 회차 (서비스 회차 추가·오등록 수정)</label>
            <input inputMode="numeric" value={totalSessions} onChange={e => setTotalSessions(e.target.value)} aria-label="총 회차" className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-xl" />
            <p className="text-xs text-gray-400 mt-1">사용 회차는 시술 기록이 정본이라 여기서 바꾸지 않습니다.</p>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">사유 (기록에 남음)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} aria-label="사유" placeholder="예: 휴가로 1개월 연장 요청" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
        </div>
        {cp.notes && (
          <div className="p-3 bg-slate-50 rounded-xl">
            <p className="text-[11px] font-medium text-gray-400 mb-1">변경 기록</p>
            <p className="text-xs text-gray-600 whitespace-pre-line max-h-28 overflow-y-auto">{cp.notes}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={toggleCompleted}
            className={`py-2.5 px-4 rounded-xl text-sm font-medium border ${cp.isCompleted ? 'border-green-200 text-green-700 bg-green-50' : 'border-gray-200 text-gray-600 bg-white'}`}>
            {cp.isCompleted ? '진행중으로 되돌리기' : '완료 처리'}
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
          <button type="button" onClick={handleSave} className="py-2.5 px-5 bg-[#1a3a8f] hover:bg-[#15306e] text-white rounded-xl text-sm font-semibold">저장</button>
        </div>
      </div>
    </Modal>
  );
}
