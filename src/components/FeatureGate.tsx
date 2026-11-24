// 라우트 단위 기능 게이트 (비코어) — Layout의 Outlet을 감싼다.
// 현재 경로가 어드민이 끈 모듈이면 페이지 대신 안내 화면을 보여준다.
// (selfGated 모듈은 페이지가 자체 Coming Soon을 처리하므로 통과)
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { featureForPath } from '../lib/featureRegistry';
import { useFeatureFlagsTick } from '../hooks/useFeature';
import { isFeatureEnabled } from '../lib/featureFlags';
import { useAuth } from '../contexts/AuthContext';
import { actionForRoute, canOpenRoute } from '../lib/permissions';

export default function FeatureRouteGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  useFeatureFlagsTick();
  const blocked = !canOpenRoute(user?.role, location.pathname);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (blocked) panelRef.current?.focus(); }, [blocked, location.pathname]); // 라우트만 바뀌면 낭독기가 전환을 모른다 (15차 #M18)

  // 역할 게이트 — 설정·직원 관리·매출은 매장 관리자 전용. 메뉴 숨김만으로는 URL·딥링크·뒤로가기로 들어올 수 있어 라우트에서 막는다 (13차 점검 2026-11-23)
  if (blocked) {
    const action = actionForRoute(location.pathname);
    const label = action === 'settings.open' ? '설정' : action === 'staff.manage' ? '직원 관리' : '매출·손익';
    return (
      <div ref={panelRef} role="region" tabIndex={-1} className="min-h-[60vh] flex items-center justify-center p-6 outline-none" data-testid="role-gate" aria-labelledby="role-gate-title">
        <div className="max-w-md text-center space-y-4">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
            <Lock size={24} className="text-gray-400" />
          </div>
          <h1 id="role-gate-title" className="text-lg font-bold text-gray-900">관리자 권한이 필요합니다</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            <strong className="text-gray-700">{label}</strong> 화면은 매장 관리자 계정에서만 열 수 있습니다.
            <br />
            필요하면 매장 관리자에게 요청해주세요.
          </p>
          <button type="button" onClick={() => navigate('/')} className="min-h-[44px] px-5 rounded-xl bg-[#1a3a8f] text-white text-sm font-semibold hover:bg-[#15306e]">대시보드로 가기</button>{/* 북마크·딥링크로 들어온 직원에게 돌아갈 길 (15차 #M18) */}
        </div>
      </div>
    );
  }

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
