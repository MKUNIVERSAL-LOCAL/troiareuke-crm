import { useState } from 'react';
import { askConfirm } from '../lib/confirmDialog';
import { createPortal } from 'react-dom';
import Modal from './ui/Modal';
import { CustomerProgramStore, PaymentStore, TreatmentLogStore } from '../lib/store';
import { usedSessionsFor } from '../lib/programSessions';
import { buildProgramLedger, ledgerRemaining, PROGRAM_LEDGER_LABEL } from '../lib/programLedgerRule';
import { programNoteLine } from '../lib/programNotes';
import { monthCloseBlock } from '../lib/monthClose';
import { todayISO, parseISODate, toISODate, formatDate, formatPrice } from '../lib/format';
import { josa } from '../lib/josa';
import { notify } from '../lib/notify';
import type { CustomerProgram } from '../types';

/**
 * 고객 프로그램 관리 모달 (2026-11-18) — 고객 상세 PC·모바일 공용.
 * 만료일 변경(연장·단축·없음), 총 회차 보정(서비스 회차 추가·오등록 수정), 완료 처리/되돌리기. 바뀐 내용은 notes에 날짜와 함께 남긴다.
 * 회차 사용(usedSessions)은 시술 기록이 정본이라 여기서 건드리지 않는다 — 시술 기록을 수정·삭제하면 자동 복구된다.
 * 만료일을 없앨 때는 undefined가 아니라 null을 보낸다 — toDbCustomerProgram이 undefined 키를 빼 버려 서버에는 옛 만료일이 남는 split-brain을 막기 위해.
 */
export default function ProgramManageModal({ program: cp, onClose, onDone }: { program: CustomerProgram; onClose: () => void; onDone: () => void }) {
  const [expiryDate, setExpiryDate] = useState(cp.expiryDate || '');
  const [totalSessions, setTotalSessions] = useState(cp.totalSessions === null ? '' : String(cp.totalSessions));
  const [reason, setReason] = useState('');
  const isSessionBased = cp.totalSessions !== null;
  const used = usedSessionsFor(cp); // 시술 기록에서 센 사용 회차 — 저장값은 다기기 동시 차감 때 어긋날 수 있다 (16차 #H2)
  const remaining = isSessionBased ? Math.max(0, (cp.totalSessions as number) - used) : null;
  const manuallyCompleted = cp.isCompleted && isSessionBased && used < (cp.totalSessions as number);
  const totalInput = totalSessions.replace(/[,\s]/g, '');
  const dirty = expiryDate !== (cp.expiryDate || '') || (isSessionBased && totalInput !== String(cp.totalSessions));
  // 회차 이력 — 시술 기록(차감 정본) + notes 기록 줄(보정·연장·완료·복원)을 날짜순으로, 행마다 잔여 (146, GAP P-1)
  const ledgerRows = buildProgramLedger(cp, TreatmentLogStore.getAll().filter(t => t.customerProgramId === cp.id), formatPrice);
  const ledgerLeft = ledgerRemaining(ledgerRows);

  const shift = (days: number) => {
    // 이미 지난 만료일에서 더하면 여전히 과거 — 연장은 오늘과 만료일 중 늦은 날부터
    const today = parseISODate(todayISO());
    const cur = /^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ? parseISODate(expiryDate) : today;
    const base = cur > today ? cur : today;
    base.setDate(base.getDate() + days);
    setExpiryDate(toISODate(base));
  };

  function appendNote(existing: string | undefined, line: string): string {
    const entry = programNoteLine(line, reason); // 시술 기록 삭제/수정이 남기는 줄과 같은 형식 (146)
    return existing ? `${existing}\n${entry}` : entry;
  }

  function handleSave() {
    const updates: Partial<CustomerProgram> = {};
    const changes: string[] = [];
    if (expiryDate !== (cp.expiryDate || '')) {
      if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) { notify('만료일 형식이 올바르지 않습니다.'); return; }
      if (expiryDate && cp.purchaseDate && expiryDate < cp.purchaseDate && !window.confirm(`만료일(${formatDate(expiryDate)})이 구매일(${formatDate(cp.purchaseDate)})보다 앞입니다. 저장하면 바로 만료돼 차감할 수 없습니다. 계속할까요?`)) return; // (14차 #L1)
      // 비우면 null — 서버 PATCH가 expiry_date를 실제로 지우게 (타입은 string?지만 스토어·서버·화면 모두 falsy로 다룬다)
      updates.expiryDate = (expiryDate || null) as unknown as string | undefined;
      changes.push(`만료일 ${cp.expiryDate ? formatDate(cp.expiryDate) : '없음'} → ${expiryDate ? formatDate(expiryDate) : '없음'}`);
    }
    if (isSessionBased && totalInput !== String(cp.totalSessions)) {
      if (!/^\d+$/.test(totalInput)) { notify('총 회차는 숫자만 입력해주세요.'); return; }
      const next = Number(totalInput);
      if (next < 1) { notify('총 회차는 1 이상이어야 합니다.'); return; }
      if (next < used) { notify(`이미 ${used}회를 사용해 총 회차를 그보다 적게 둘 수 없습니다.`); return; }
      updates.totalSessions = next;
      changes.push(`총 회차 ${cp.totalSessions}회 → ${next}회`);
      // 사람이 직접 완료 처리한 프로그램은 회차를 바꿔도 그대로 완료. 그 외엔 사용 회차 기준으로 다시 계산하고 상태가 바뀌면 기록
      if (!manuallyCompleted) {
        const nextCompleted = used >= next;
        if (nextCompleted !== cp.isCompleted) {
          updates.isCompleted = nextCompleted;
          changes.push(nextCompleted ? '진행중 → 완료' : '완료 → 진행중');
        }
      }
    }
    if (changes.length === 0) { notify.info('바뀐 내용이 없습니다.'); return; }
    updates.notes = appendNote(cp.notes, changes.join(', '));
    if (!CustomerProgramStore.update(cp.id, updates)) { notify('프로그램을 찾을 수 없습니다.'); return; }
    notify.success(`${cp.programName} 저장: ${changes.join(', ')}`);
    onDone();
  }

  // 고객·프로그램을 잘못 골라 등록한 경우 — 아직 한 번도 쓰지 않았을 때만. 연결된 결제(referenceId)를 지우면 누적 결제액은 자동 차감된다 (정합성 감사 2026-11-19)
  const cancelable = used === 0 && !TreatmentLogStore.getAll().some(t => t.customerProgramId === cp.id);
  async function cancelRegistration() {
    { const blocked = monthCloseBlock(cp.purchaseDate); if (blocked) { notify.error(blocked); return; } } // 월 마감 잠금 (147, GAP P-7)
    const linked = PaymentStore.getAll().filter(p => p.referenceId === cp.id);
    const paid = linked.reduce((sum, p) => sum + p.amount, 0);
    if (!(await askConfirm({ title: '회차권 등록 취소', confirmLabel: '등록 취소', cancelLabel: '닫기', danger: true, message: `${cp.programName} 등록을 취소할까요?\n이 회차권과 연결된 결제 ${linked.length}건(${formatPrice(paid)})이 함께 삭제되고 고객 누적 결제액에서 차감됩니다. 되돌릴 수 없습니다.` }))) return;
    for (const p of linked) PaymentStore.delete(p.id);
    CustomerProgramStore.delete(cp.id);
    notify.success(`${cp.programName} 등록을 취소했습니다.${linked.length ? ` 결제 ${linked.length}건 삭제.` : ''}`);
    onDone();
  }

  async function toggleCompleted() {
    if (dirty) { notify('만료일·총 회차 변경을 먼저 [저장]하거나 취소한 뒤 완료 상태를 바꿔주세요.'); return; }
    if (cp.isCompleted) {
      if (isSessionBased && used >= (cp.totalSessions as number)) { notify('회차를 모두 사용한 프로그램은 되돌릴 수 없습니다. 총 회차를 늘려주세요.'); return; }
      CustomerProgramStore.update(cp.id, { isCompleted: false, notes: appendNote(cp.notes, '완료 → 진행중으로 되돌림') });
      notify(`${josa(cp.programName, '을/를')} 진행중으로 되돌렸습니다.`);
    } else {
      const left = remaining !== null && remaining > 0 ? `\n잔여 ${remaining}회는 더 이상 쓸 수 없게 됩니다.` : '';
      if (!(await askConfirm({ title: '회차권 완료 처리', message: `${josa(cp.programName, '을/를')} 완료 처리할까요?${left}`, confirmLabel: '완료 처리' }))) return;
      CustomerProgramStore.update(cp.id, { isCompleted: true, notes: appendNote(cp.notes, `완료 처리${remaining ? ` (잔여 ${remaining}회 소멸)` : ''}`) });
      notify(`${josa(cp.programName, '을/를')} 완료 처리했습니다.`);
    }
    onDone();
  }

  // body 포털 — 고객 상세의 모바일 오버레이(fixed z-50)와 데스크톱 컨테이너 밖에서 렌더해야 두 레이아웃 모두에서 보인다
  return createPortal(
    <Modal isOpen onClose={onClose} title="프로그램 관리" size="sm" elevated>
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-sm text-gray-900">{cp.programName}</p>
          <p className="text-xs text-gray-500">
            {isSessionBased ? `사용 ${used}회 / 총 ${cp.totalSessions}회 · 잔여 ${remaining}회` : '기간제'} · 등록 {formatDate(cp.purchaseDate)}
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
          <p className="text-xs text-gray-400 mt-1">+30/+90일 — 이미 지난 만료일이면 오늘부터, 아직 남았으면 만료일부터 더합니다.</p>
        </div>
        {isSessionBased && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">총 회차 (회차 추가·오등록 수정)</label>
            <input inputMode="numeric" value={totalSessions} onChange={e => setTotalSessions(e.target.value)} aria-label="총 회차" className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-xl" />
            <p className="text-xs text-gray-400 mt-1">사용 회차는 시술 기록이 정본이라 여기서 바꾸지 않습니다.{manuallyCompleted ? ' 직접 완료 처리한 프로그램은 회차를 바꿔도 완료 상태가 유지됩니다.' : ''}</p>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">사유 (기록에 남음)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} aria-label="사유" placeholder="예: 휴가로 1개월 연장 요청" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl" />
        </div>
        <div className="p-3 bg-slate-50 rounded-xl" data-testid="program-ledger">
          <p className="text-xs font-medium text-gray-500 mb-1.5">
            회차 이력
            {isSessionBased && ledgerLeft !== null && (
              <span className={`ml-2 font-normal ${ledgerLeft === remaining ? 'text-gray-400' : 'text-amber-700'}`}>
                원장 잔여 {ledgerLeft}회 · 기록 기준 {remaining}회{ledgerLeft === remaining ? ' · 일치' : ' · 불일치 — 옛 수기 조정이 기록 줄 없이 들어간 회차권'}
              </span>
            )}
          </p>
          <ul className="text-xs text-gray-700 space-y-1 max-h-40 overflow-y-auto">
            {ledgerRows.slice().reverse().map(r => (
              <li key={r.id} data-testid="program-ledger-row" className="flex items-baseline gap-2">
                <span className="text-gray-400 whitespace-nowrap">{formatDate(r.date)}</span>
                <span className="font-medium whitespace-nowrap">{PROGRAM_LEDGER_LABEL[r.kind]}</span>
                {r.delta !== null && <span className={`whitespace-nowrap font-semibold ${r.delta < 0 ? 'text-pink-700' : 'text-blue-700'}`}>{r.delta > 0 ? '+' : ''}{r.delta}회</span>}
                {r.remaining !== null && <span className="text-gray-500 whitespace-nowrap">잔여 {r.remaining}회</span>}
                <span className="text-gray-600 min-w-0 truncate" title={r.text}>{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={toggleCompleted} disabled={dirty} title={dirty ? '변경 내용을 먼저 저장하세요' : undefined}
            className={`py-2.5 px-4 rounded-xl text-sm font-medium border disabled:opacity-40 ${cp.isCompleted ? 'border-green-200 text-green-700 bg-green-50' : 'border-gray-200 text-gray-600 bg-white'}`}>
            {cp.isCompleted ? '진행중으로 되돌리기' : '완료 처리'}
          </button>
          {dirty && <p className="w-full text-xs text-amber-700">변경 내용을 먼저 [저장]하세요 — 저장 뒤에 완료 처리할 수 있습니다</p>}
          {cancelable && (
            <button type="button" onClick={cancelRegistration} title="잘못 등록한 회차권 — 한 번도 쓰지 않았을 때만. 연결된 결제도 함께 삭제"
              className="py-2.5 px-4 rounded-xl text-sm font-medium border border-red-200 text-red-700 bg-red-50 hover:bg-red-100">
              등록 취소
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
          <button type="button" onClick={handleSave} className="py-2.5 px-5 bg-[#1a3a8f] hover:bg-[#15306e] text-white rounded-xl text-sm font-semibold">저장</button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
