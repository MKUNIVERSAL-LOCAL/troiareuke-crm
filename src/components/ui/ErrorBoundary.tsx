import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * 화면 단위 에러 바운더리 (비코어) — 페이지 렌더 중 예외가 나면 흰 화면 대신 복구 UI를 보여준다.
 * 라우트가 바뀌면(resetKey) 자동으로 초기화되어 다른 화면은 정상 동작한다. 데이터는 건드리지 않는다.
 */
interface Props { children: ReactNode; resetKey?: string }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 화면 렌더 오류:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle size={24} className="text-red-600" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">화면을 표시하는 중 문제가 생겼습니다</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            저장된 데이터는 안전합니다. 다시 시도해도 반복되면 본사에 아래 내용을 전달해주세요.
          </p>
          <pre className="text-left text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-3 whitespace-pre-wrap break-words overflow-y-auto max-h-32" tabIndex={0} aria-label="오류 내용">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-[#1a3a8f] text-white hover:bg-[#152f75] flex items-center gap-1.5"
            >
              <RefreshCw size={14} />새로 고침
            </button>
          </div>
        </div>
      </div>
    );
  }
}
