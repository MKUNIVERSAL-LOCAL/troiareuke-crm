import { useState, useEffect } from 'react';
import { Download, RefreshCw, X, CheckCircle } from 'lucide-react';

interface ElectronAPI {
  isElectron?: boolean;
  getAppVersion?: () => Promise<string>;
  onUpdateAvailable?: (cb: (info: { version: string }) => void) => void;
  onUpdateDownloadProgress?: (cb: (progress: { percent: number }) => void) => void;
  onUpdateDownloaded?: (cb: (info: { version: string }) => void) => void;
  onUpdateError?: (cb: (err: { message: string }) => void) => void;
  installUpdate?: () => void;
  removeUpdateListeners?: () => void;
  callClaudeApi?: (params: { apiKey: string; messages: { role: string; content: string }[]; systemPrompt: string }) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

export default function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle');
  const [version, setVersion] = useState('');
  const [percent, setPercent] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.isElectron) return;

    api.onUpdateAvailable?.((info) => {
      setVersion(info.version);
      setState('available');
      setDismissed(false);
    });

    api.onUpdateDownloadProgress?.((progress) => {
      setState('downloading');
      setPercent(progress.percent);
    });

    api.onUpdateDownloaded?.((info) => {
      setVersion(info.version);
      setState('ready');
      setDismissed(false);
    });

    api.onUpdateError?.(() => {
      // 수동 복사 배포(GitHub 릴리스 미게시) 모델에서는 업데이트 확인 실패가 정상 동작.
      // 사용자에게 불필요한 "업데이트 실패" 배너를 띄우지 않고 조용히 무시한다.
      // (실제 릴리스 게시를 시작하면 setState('error')로 되돌릴 것)
    });

    return () => {
      api.removeUpdateListeners?.();
    };
  }, []);

  if (state === 'idle' || dismissed) return null;

  const handleInstall = () => {
    window.electronAPI?.installUpdate?.();
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex justify-center pointer-events-none">
      <div className="mt-3 mx-4 pointer-events-auto max-w-lg w-full animate-slide-down">
        {/* 다운로드 중 */}
        {state === 'downloading' && (
          <div className="bg-blue-600 text-white rounded-xl shadow-2xl px-5 py-3.5 flex items-center gap-3">
            <Download className="w-5 h-5 animate-bounce flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">v{version} 업데이트 다운로드 중...</p>
              <div className="mt-1.5 bg-blue-400/40 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-white h-full rounded-full transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-blue-100 mt-1">{percent}% 완료</p>
            </div>
          </div>
        )}

        {/* 업데이트 발견 (자동 다운로드 시작 전 잠깐 표시) */}
        {state === 'available' && (
          <div className="bg-blue-600 text-white rounded-xl shadow-2xl px-5 py-3.5 flex items-center gap-3">
            <Download className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">새 업데이트 v{version} 발견!</p>
              <p className="text-xs text-blue-100">자동으로 다운로드 중입니다...</p>
            </div>
            <button onClick={() => setDismissed(true)} className="p-1 hover:bg-blue-500 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 설치 준비 완료 — 핵심 UI */}
        {state === 'ready' && (
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl shadow-2xl px-5 py-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold">v{version} 업데이트가 준비되었습니다!</p>
              <p className="text-xs text-emerald-100">지금 설치하면 앱이 재시작됩니다</p>
            </div>
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 bg-white text-emerald-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-50 transition-colors shadow-md"
            >
              <RefreshCw className="w-4 h-4" />
              지금 설치
            </button>
            <button onClick={() => setDismissed(true)} className="p-1 hover:bg-emerald-400 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 에러 */}
        {state === 'error' && (
          <div className="bg-red-500 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3">
            <X className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">업데이트 확인 실패 — 나중에 다시 시도합니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
