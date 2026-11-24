import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { registerConfirmHost, type PendingConfirm } from '../../lib/confirmDialog';

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
  const { title, message, confirmLabel = '확인', cancelLabel = '취소', danger, resolve } = pending;
  // 기본 포커스: 되돌릴 수 없는 동작은 [취소], 일반 확인은 [확인]. React 는 autoFocus 를 DOM 에 쓰지 않아 포커스 트랩이 못 보았다 → 공용 규약 data-autofocus (15차 #H2)
  const focusCancel = !!danger;
  return (
    <Modal isOpen onClose={() => resolve(false)} title={title} size="sm" elevated>
      <div className="space-y-4" data-testid="confirm-dialog">
        <div className="flex items-start gap-3">
          {danger && <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" aria-hidden />}
          <p id="confirm-dialog-desc" className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{message}</p>
        </div>
        {/* 폰에서는 다른 시트처럼 두 버튼 전폭 2분할, PC 는 우측 정렬 (15차 #L8) */}
        <div className="flex gap-2 lg:justify-end">
          <button type="button" onClick={() => resolve(false)} {...(focusCancel ? { 'data-autofocus': '' } : {})} className="flex-1 lg:flex-none min-h-[44px] px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
            {cancelLabel}
          </button>
          <button type="button" onClick={() => resolve(true)} {...(focusCancel ? {} : { 'data-autofocus': '' })}
            className={`flex-1 lg:flex-none min-h-[44px] px-5 rounded-xl text-sm font-semibold text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1a3a8f] hover:bg-[#15306e]'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
