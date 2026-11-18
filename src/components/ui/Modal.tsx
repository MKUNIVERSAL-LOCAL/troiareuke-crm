import { isImeKey } from '../../lib/ime';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useOverlayClose, useFocusTrap } from '../../lib/overlayStack';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

// 중첩 모달 대응 — 안쪽 모달이 닫힐 때 바깥 모달이 열려 있으면 스크롤 잠금을
// 풀면 안 되므로, 열린 모달 수를 전역으로 세어 0이 될 때만 복원한다.
let openModalCount = 0;

export default function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    openModalCount++;
    document.body.style.overflow = 'hidden';
    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Esc(PC)·Android 뒤로가기(모바일 앱)로 닫기 — 공용 스택이 최상위 모달만 닫는다 (중첩: 예약 상세 → 결제 등록)
  useOverlayClose(isOpen, onClose);
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, cardRef); // 첫 입력란 포커스·Tab 순환·닫힐 때 복원

  if (!isOpen) return null;

  // Ctrl/⌘+Enter → 모달 안 폼 제출 (데스크 키보드 흐름). 폼이 없는 모달(상세·확인)은 무시, 제출 버튼이 비활성(저장 중 등)이면 무시(이중 저장 방지)
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isImeKey(e)) {
      const form = cardRef.current?.querySelector('form');
      if (!form) return;
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submit?.disabled) return;
      e.preventDefault();
      form.requestSubmit();
    }
  };
  // 모바일 바텀시트 핸들: 아래로 80px 이상 끌면 닫힌다 (장식이 아닌 실제 제스처). 핸들에서만 시작해 본문 스크롤과 충돌하지 않는다
  const dragY = useRef<number | null>(null);
  const onHandleTouchStart = (e: React.TouchEvent) => { dragY.current = e.touches[0].clientY; };
  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (dragY.current === null || !cardRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragY.current);
    cardRef.current.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
    cardRef.current.style.transition = 'none';
  };
  const onHandleTouchEnd = (e: React.TouchEvent) => {
    if (dragY.current === null || !cardRef.current) return;
    const dy = e.changedTouches[0].clientY - dragY.current;
    dragY.current = null;
    cardRef.current.style.transition = 'transform 0.18s ease-out';
    cardRef.current.style.transform = '';
    if (dy > 80) onClose();
  };

  return (
    // modal-backdrop/modal-card: index.css가 lg 미만에서 바텀시트(전체 폭·위 모서리만 둥글게·아래에서 올라옴)로 바꾼다 (UI 품질 기준 2026-11-18)
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 pt-safe-4 pb-safe-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={cardRef} tabIndex={-1} onKeyDown={onKeyDown} className={`modal-card relative bg-white rounded-2xl shadow-2xl w-full ${sizes[size]} max-h-[90vh] flex flex-col outline-none`}>
        <div className="lg:hidden py-2 cursor-grab touch-none" onTouchStart={onHandleTouchStart} onTouchMove={onHandleTouchMove} onTouchEnd={onHandleTouchEnd} aria-hidden="true">
          <div className="mx-auto h-1 w-10 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
