import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Download, RefreshCw, X } from 'lucide-react';

interface ElectronAPI {
  isElectron?: boolean;
  getAppVersion?: () => Promise<string>;
  onUpdateAvailable?: (cb: (info: { version: string }) => void) => void;
  onUpdateDownloadProgress?: (cb: (progress: { percent: number }) => void) => void;
  onUpdateDownloaded?: (cb: (info: { version: string }) => void) => void;
  onUpdateError?: (cb: (err: { message: string }) => void) => void;
  downloadUpdate?: () => Promise<{ version: string }>;
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
  const stateRef = useRef<UpdateState>('idle');
  const [version, setVersion] = useState('');
  const [percent, setPercent] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const changeState = (nextState: UpdateState) => {
    stateRef.current = nextState;
    setState(nextState);
  };

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.isElectron) return;

    api.onUpdateAvailable?.((info) => {
      setVersion(info.version);
      setDismissed(false);
      changeState('available');
    });
    api.onUpdateDownloadProgress?.((progress) => {
      setPercent(progress.percent);
      changeState('downloading');
    });
    api.onUpdateDownloaded?.((info) => {
      setVersion(info.version);
      setDismissed(false);
      changeState('ready');
    });
    api.onUpdateError?.((error) => {
      if (stateRef.current === 'idle') return;
      setErrorMessage(error.message || '업데이트에 실패했습니다.');
      changeState('error');
    });

    return () => api.removeUpdateListeners?.();
  }, []);

  if (state === 'idle' || dismissed) return null;

  const handleDownload = async () => {
    setPercent(0);
    setErrorMessage('');
    changeState('downloading');
    try {
      await window.electronAPI?.downloadUpdate?.();
    } catch (error: any) {
      setErrorMessage(error?.message || '업데이트를 내려받지 못했습니다.');
      changeState('error');
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex justify-center pointer-events-none">
      <div className="mt-3 mx-4 pointer-events-auto max-w-lg w-full animate-slide-down">
        {state === 'available' && (
          <div className="bg-blue-600 text-white rounded-xl shadow-2xl px-5 py-3.5 flex items-center gap-3">
            <Download className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">새 업데이트 v{version}</p>
              <p className="text-xs text-blue-100">버튼을 누르면 NAS에서 내려받습니다.</p>
            </div>
            <button
              onClick={handleDownload}
              className="bg-white text-blue-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-50 transition-colors shadow-md"
            >
              업데이트
            </button>
            <button onClick={() => setDismissed(true)} className="p-1 hover:bg-blue-500 rounded-lg" aria-label="닫기">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {state === 'downloading' && (
          <div className="bg-blue-600 text-white rounded-xl shadow-2xl px-5 py-3.5 flex items-center gap-3">
            <Download className="w-5 h-5 animate-bounce flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">v{version} 업데이트 다운로드 중...</p>
              <div className="mt-1.5 bg-blue-400/40 rounded-full h-2 overflow-hidden">
                <div className="bg-white h-full rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-xs text-blue-100 mt-1">{percent}% 완료</p>
            </div>
          </div>
        )}

        {state === 'ready' && (
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl shadow-2xl px-5 py-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold">v{version} 업데이트 준비 완료</p>
              <p className="text-xs text-emerald-100">적용하면 앱이 자동으로 다시 실행됩니다.</p>
            </div>
            <button
              onClick={() => window.electronAPI?.installUpdate?.()}
              className="flex items-center gap-1.5 bg-white text-emerald-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-50 transition-colors shadow-md"
            >
              <RefreshCw className="w-4 h-4" />
              지금 적용
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="bg-red-500 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3">
            <X className="w-5 h-5 flex-shrink-0" />
            <p className="flex-1 text-sm">{errorMessage || '업데이트에 실패했습니다. 잠시 후 다시 시도해주세요.'}</p>
            <button onClick={() => setDismissed(true)} className="p-1 hover:bg-red-400 rounded-lg" aria-label="닫기">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
