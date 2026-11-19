import { useRef, type ReactNode } from 'react';
import { useFocusTrap, useOverlayClose } from '../../lib/overlayStack';

/**
 * 어드민 콘솔 공용 창 — 어두운 카드. 지점 화면의 ui/Modal과 같은 접근성 뼈대(role=dialog·aria-modal·이름, Esc/뒤로가기 닫기, 포커스 트랩·복원)를
 * 어드민 모달 9곳(Users 4·Branches·Subscriptions·Announcements·DangerConfirmModal·BackupRestoreView)에 한 번에 준다 (2026-11-19 53).
 * 열려 있을 때만 마운트되므로 isOpen은 항상 true로 넘긴다. 바깥(배경) 클릭 닫기는 확인 창에서만(closeOnBackdrop) — 입력 폼은 실수로 잃지 않게.
 */
interface Props {
  title: string;
  onClose: () => void;
  size?: 'md' | 'lg' | 'xl';
  danger?: boolean;
  closeOnBackdrop?: boolean;
  /** false면 Esc로 닫지 않는다(뒤로가기만) — 입력 폼(실수로 잃지 않게)과 한 번만 보여주는 안내(임시 비밀번호)에 쓴다. 확인 창은 기본값(true) */
  escape?: boolean;
  className?: string;
  children: ReactNode;
}

const sizes = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

export default function AdminDialog({ title, onClose, size = 'md', danger = false, closeOnBackdrop = false, escape = true, className = '', children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useOverlayClose(true, onClose, { escape });
  useFocusTrap(true, ref);
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className={`bg-slate-900 border ${danger ? 'border-red-500/40' : 'border-slate-700'} rounded-2xl w-full ${sizes[size]} shadow-2xl outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
