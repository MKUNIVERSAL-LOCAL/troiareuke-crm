import { useState } from 'react';
import { Copy, Check, Share2, X } from 'lucide-react';
import { canShareText, shareText } from '../../lib/mobileBridge';
import { notify } from '../../lib/notify';

/**
 * 안내 문구 초안 패널 — 대시보드 카드(회차권·내일 예약·생일 등)가 공용으로 쓴다 (2026-11-17)
 * 본문(<pre>)과 [복사]/[보내기](모바일 공유 시트·Web Share). 발송사 연동 전 수동 발송 경로.
 */
export default function MessageDraftPanel({ title, text, shareTitle, hint, onClose }: {
  title: string;
  text: string;
  shareTitle: string;
  hint?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify('복사하지 못했습니다. 문구를 직접 선택해 복사하세요.');
    }
  };
  return (
    <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-700">{title}</p>
        <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
      </div>
      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={copy}
          className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1">
          {copied ? <><Check size={12} />복사됨</> : <><Copy size={12} />복사</>}
        </button>
        {canShareText && (
          <button type="button" onClick={() => shareText(text, shareTitle)}
            className="px-3 py-1.5 rounded-lg bg-[#1a3a8f] text-white text-xs font-medium flex items-center gap-1">
            <Share2 size={12} />보내기
          </button>
        )}
      </div>
    </div>
  );
}
