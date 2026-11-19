/** 선택지가 비어 있을 때 저장을 누르기 전에 보이는 안내 — 등록 화면으로 바로 보낸다 (첫 실행 감사 2026-11-18) */
export default function PrereqHint({ text, action, onGo }: { text: string; action: string; onGo: () => void }) {
  return (
    <p className="mt-1.5 text-xs text-amber-700 flex items-center gap-2 flex-wrap">
      {text}
      <button type="button" onClick={onGo} className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 font-medium hover:bg-amber-100">{action} →</button>
    </p>
  );
}
