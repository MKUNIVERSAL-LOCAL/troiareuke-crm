import { createPortal } from 'react-dom';
import { RefreshCw } from 'lucide-react';

/** usePullToRefresh의 상태 표시 — 당기는 동안 "당겨서 새로고침", 놓으면 "새로고침 중". body 포털·모바일 폭에서만 */
export default function PullToRefreshIndicator({ refreshing, pullDistance }: { refreshing: boolean; pullDistance: number }) {
  const visible = refreshing || pullDistance > 12;
  if (!visible) return null;
  const ready = pullDistance >= 70;
  return createPortal(
    <div className="lg:hidden fixed inset-x-0 z-40 flex justify-center pointer-events-none" style={{ top: `calc(var(--mobile-top, 3.0625rem + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px))) + 0.25rem)` }} /* fallback은 ResizeObserver가 없을 때만 — 헤더 48px+테두리 1px 근사 (리뷰 2026-11-20) */ aria-live="polite">
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm text-xs font-medium text-gray-600">
        <RefreshCw size={13} className={refreshing ? 'animate-spin text-[#1a3a8f]' : ready ? 'text-[#1a3a8f]' : 'text-gray-400'} />
        {refreshing ? '새로고침 중' : ready ? '놓으면 새로고침' : '당겨서 새로고침'}
      </div>
    </div>,
    document.body,
  );
}
