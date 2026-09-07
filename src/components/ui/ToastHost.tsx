import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { onNotify, registerNotifyHost, type NotifyEvent } from '../../lib/notify';

/**
 * 공통 토스트 표시 영역 — Layout(지점)·Admin Layout 하단 중앙에 1개씩 마운트.
 * notify()가 쏘는 이벤트를 받아 쌓아 보여주고 시간이 지나면 사라진다. 여러 줄 메시지 지원.
 */
export default function ToastHost() {
  const [items, setItems] = useState<NotifyEvent[]>([]);

  useEffect(() => {
    const unregister = registerNotifyHost();
    const off = onNotify(event => {
      setItems(prev => [...prev.slice(-4), event]);
      window.setTimeout(() => setItems(prev => prev.filter(i => i.id !== event.id)), event.durationMs);
    });
    return () => { off(); unregister(); };
  }, []);

  if (items.length === 0) return null;

  const style: Record<NotifyEvent['tone'], { box: string; icon: JSX.Element }> = {
    info: { box: 'bg-slate-900 text-white border-slate-700', icon: <Info size={16} className="text-blue-300" /> },
    success: { box: 'bg-emerald-600 text-white border-emerald-500', icon: <CheckCircle size={16} /> },
    error: { box: 'bg-red-600 text-white border-red-500', icon: <AlertCircle size={16} /> },
    warning: { box: 'bg-amber-500 text-white border-amber-400', icon: <AlertTriangle size={16} /> },
  };

  return (
    <div className="fixed inset-x-0 bottom-20 lg:bottom-6 z-[10000] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
      {items.map(item => (
        <div
          key={item.id}
          role={item.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto max-w-lg w-full sm:w-auto sm:min-w-[320px] flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-2xl text-sm leading-relaxed whitespace-pre-line ${style[item.tone].box}`}
        >
          <span className="mt-0.5 shrink-0">{style[item.tone].icon}</span>
          <span className="flex-1">{item.message}</span>
          <button
            onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}
            className="shrink-0 opacity-70 hover:opacity-100"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
