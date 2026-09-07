import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * 되돌릴 수 없는 작업(계정·지점 완전 삭제)용 타이핑 확인 모달.
 * 사용자가 expected 문자열(이메일·지점명)을 정확히 입력해야 실행 버튼이 켜진다.
 */
interface Props {
  title: string;
  description: ReactNode;
  expected: string;
  expectedLabel: string;
  confirmLabel: string;
  extra?: ReactNode;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function DangerConfirmModal({ title, description, expected, expectedLabel, confirmLabel, extra, onConfirm, onClose }: Props) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (e: any) {
      setError(e?.message || '실패했습니다.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => !busy && onClose()}>
      <div className="bg-slate-900 border border-red-500/40 rounded-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-400" /> {title}
        </h3>
        <div className="text-sm text-slate-300 leading-relaxed">{description}</div>
        {extra}
        <div>
          <label className="text-xs font-bold text-slate-300">
            확인을 위해 {expectedLabel} <span className="text-red-300 font-mono">{expected}</span> 을(를) 그대로 입력하세요
          </label>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            className="mt-1.5 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 font-mono"
            placeholder={expected}
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50">취소</button>
          <button
            onClick={run}
            disabled={busy || typed.trim() !== expected}
            className="px-4 py-2 text-sm font-bold rounded-xl bg-red-600 text-white hover:bg-red-500 disabled:opacity-40"
          >
            {busy ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
