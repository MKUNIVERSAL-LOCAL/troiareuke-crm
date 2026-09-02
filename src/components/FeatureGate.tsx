// 라우트 단위 기능 게이트 (비코어) — Layout의 Outlet을 감싼다.
// 현재 경로가 어드민이 끈 모듈이면 페이지 대신 안내 화면을 보여준다.
// (selfGated 모듈은 페이지가 자체 Coming Soon을 처리하므로 통과)
import { useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { featureForPath } from '../lib/featureRegistry';
import { useFeatureFlagsTick } from '../hooks/useFeature';
import { isFeatureEnabled } from '../lib/featureFlags';

export default function FeatureRouteGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  useFeatureFlagsTick();

  const def = featureForPath(location.pathname);
  if (def && !def.selfGated && !isFeatureEnabled(def.id)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
            <Lock size={24} className="text-gray-400" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">사용할 수 없는 기능입니다</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            <strong className="text-gray-700">{def.label}</strong> 기능이 현재 사용 설정되어 있지 않습니다.
            <br />
            이용을 원하시면 본사에 문의해주세요.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
