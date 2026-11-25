import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { registerConfirmHost, type PendingConfirm } from '../../lib/confirmDialog';

/** 직접 입력 칩의 내부 id — 보기 id 와 겹치지 않는 값 */
const OTHER_ID = '__other__';

/**
 * 공용 확인창 호스트 — Layout 에 한 번 마운트. askConfirm() 이 띄운 창을 앱 디자인(Modal: 포커스 트랩·Esc·Android 뒤로가기)으로 그린다.
 * elevated: 고객 상세 풀스크린(z-50)·포털 창 위에서도 보이게. (9차 점검 #30, 2026-11-23)
 */
export default function ConfirmHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  useEffect(() => registerConfirmHost(setPending), []);
  // 본문을 dialog 의 aria-describedby 로 — "되돌릴 수 없습니다" 같은 경고가 낭독되게 (15차 #M1). Modal 이 role=dialog 를 그리므로 마운트 뒤 연결한다
  useEffect(() => {
    if (!pending) return;
    const desc = document.getElementById('confirm-dialog-desc');
    desc?.closest('[role="dialog"]')?.setAttribute('aria-describedby', 'confirm-dialog-desc');
  }, [pending]);
  if (!pending) return null;
  return <ConfirmBody key={pending.id} pending={pending} />;
}

/** 창 하나를 그린다 — key 로 분리해 사유 선택 상태가 다음 창에 새지 않게 한다 (244) */
function ConfirmBody({ pending }: { pending: PendingConfirm }) {
  const { title, message, confirmLabel = '확인', cancelLabel = '취소', danger, resolve, choices, choiceTitle = '사유 (선택)', allowOtherText = true } = pending;
  const [choice, setChoice] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const picked = (): string | null => {
    const typed = other.replace(/\s+/g, ' ').trim();
    if (choice === OTHER_ID) return typed || null;       // 직접 입력을 골랐으면 쓴 말만
    return choice ?? (typed || null);                     // 칩을 안 골랐어도 쓴 말이 있으면 그것을
  };
  // 기본 포커스: 되돌릴 수 없는 동작은 [취소], 일반 확인은 [확인]. React 는 autoFocus 를 DOM 에 쓰지 않아 포커스 트랩이 못 보았다 → 공용 규약 data-autofocus (15차 #H2)
  const focusCancel = !!danger;
  return (
    <Modal isOpen onClose={() => resolve({ ok: false, choice: null })} title={title} size="sm" topmost>
      <div className="space-y-4" data-testid="confirm-dialog">
        <div className="flex items-start gap-3">
          {danger && <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" aria-hidden />}
          <p id="confirm-dialog-desc" className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{message}</p>
        </div>
        {/* 사유 선택 — 고르지 않아도 확인은 된다(집계에 "사유 미기록" 으로 센다) (244) */}
        {choices && choices.length > 0 && (
          <div role="group" aria-label={choiceTitle} data-testid="confirm-choices">
            <p className="text-xs font-medium text-gray-500 mb-2">{choiceTitle}</p>
            <div className="flex flex-wrap gap-1.5">
              {choices.map(c => {
                const on = choice === c.id;
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => setChoice(on ? null : c.id)}
                    className={`px-3 py-1.5 min-h-[36px] rounded-full text-xs font-medium border transition-colors ${on ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    {c.label}
                  </button>
                );
              })}
              {allowOtherText && (
                <button type="button" aria-pressed={choice === OTHER_ID} onClick={() => setChoice(choice === OTHER_ID ? null : OTHER_ID)}
                  className={`px-3 py-1.5 min-h-[36px] rounded-full text-xs font-medium border transition-colors ${choice === OTHER_ID ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  직접 입력
                </button>
              )}
            </div>
            {allowOtherText && choice === OTHER_ID && (
              <label className="block mt-2">
                <span className="sr-only">사유 직접 입력</span>
                <input type="text" value={other} onChange={e => setOther(e.target.value)} maxLength={30} placeholder="사유를 짧게 적어주세요 (30자)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#1a3a8f]" />
              </label>
            )}
          </div>
        )}
        {/* 폰에서는 다른 시트처럼 두 버튼 전폭 2분할, PC 는 우측 정렬 (15차 #L8) */}
        <div className="flex gap-2 lg:justify-end">
          <button type="button" onClick={() => resolve({ ok: false, choice: null })} {...(focusCancel ? { 'data-autofocus': '' } : {})} className="flex-1 lg:flex-none min-h-[44px] px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
            {cancelLabel}
          </button>
          <button type="button" onClick={() => resolve({ ok: true, choice: picked() })} {...(focusCancel ? {} : { 'data-autofocus': '' })}
            className={`flex-1 lg:flex-none min-h-[44px] px-5 rounded-xl text-sm font-semibold text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1a3a8f] hover:bg-[#15306e]'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
