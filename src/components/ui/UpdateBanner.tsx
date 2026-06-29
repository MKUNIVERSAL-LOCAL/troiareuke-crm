import { useState, useEffect } from 'react';

interface UpdateInfo {
  version: string;
  releaseDate?: string;
}

interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
}

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const api = (window as any).electronAPI;

  useEffect(() => {
    // Electron 앱이 아니면 아무것도 안 함
    if (!api?.isElectron) return;

    api.onUpdateAvailable((info: UpdateInfo) => {
      setUpdateInfo(info);
      setState('available');
      setDismissed(false);
    });

    api.onUpdateDownloadProgress((prog: DownloadProgress) => {
      setState('downloading');
      setProgress(prog);
    });

    api.onUpdateDownloaded((info: UpdateInfo) => {
      setUpdateInfo(info);
      setState('ready');
    });

    api.onUpdateError(() => {
      // 수동 복사 배포(GitHub 릴리스 미게시) 모델에서는 업데이트 확인 실패가 정상 동작.
      // 사용자에게 불필요한 오류 배너를 띄우지 않고 조용히 무시한다.
      // (실제 릴리스 게시를 시작하면 setState('error')로 되돌릴 것)
    });

    return () => {
      api.removeUpdateListeners?.();
    };
  }, []);

  // 배너가 필요없는 상태
  if (!api?.isElectron || state === 'idle' || dismissed) return null;

  const handleInstall = () => {
    api.installUpdate();
  };

  // ── 다운로드 완료 → 지금 재시작 배너 ──
  if (state === 'ready') {
    return (
      <div className="w-full bg-[#1a3a8f] text-white px-4 py-2.5 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>
            <strong>v{updateInfo?.version}</strong> 업데이트 준비 완료 — 지금 재시작하면 적용됩니다
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstall}
            className="bg-white text-[#1a3a8f] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            지금 재시작
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-white/70 hover:text-white transition-colors"
            aria-label="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ── 다운로드 진행 중 배너 ──
  if (state === 'downloading') {
    return (
      <div className="w-full bg-[#1a3a8f] text-white px-4 py-2.5 flex items-center gap-4 shadow-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 animate-pulse">
          <polyline points="8 17 12 21 16 17" />
          <line x1="12" y1="12" x2="12" y2="21" />
          <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs mb-1">
            <span>업데이트 다운로드 중...</span>
            <span className="font-bold">{progress?.percent ?? 0}%</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-1">
            <div
              className="bg-white rounded-full h-1 transition-all duration-300"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── 업데이트 발견 배너 ──
  if (state === 'available') {
    return (
      <div className="w-full bg-[#1a3a8f] text-white px-4 py-2.5 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            새 버전 <strong>v{updateInfo?.version}</strong>을 백그라운드에서 다운로드하는 중입니다
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/70 hover:text-white transition-colors shrink-0"
          aria-label="닫기"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  // ── 오류 ──
  if (state === 'error') {
    return (
      <div className="w-full bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>업데이트 확인 중 문제가 발생했습니다</span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/70 hover:text-white transition-colors shrink-0"
          aria-label="닫기"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  return null;
}
