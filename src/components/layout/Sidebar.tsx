import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar, ClipboardList,
  UserCog, Package, TrendingUp, MessageSquare,
  Settings, ChevronRight, Link2, LogOut, Sparkles, Tag, Bot, X
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { differenceInDays, parseISO } from 'date-fns';
import { useCrmBrand } from '../../hooks/useCrmBrand';
import { featureForPath } from '../../lib/featureRegistry';
import { isFeatureEnabled, resetFeatureFlags } from '../../lib/featureFlags';
import { useFeatureFlagsTick } from '../../hooks/useFeature';

const navItems = [
  { to: '/', label: '대시보드', icon: LayoutDashboard },
  { to: '/customers', label: '고객 관리', icon: Users },
  { to: '/programs', label: '시술 프로그램', icon: Tag },
  { to: '/reservations', label: '예약 관리', icon: Calendar },
  { to: '/treatments', label: '시술 기록', icon: ClipboardList },
  { to: '/staff', label: '직원 관리', icon: UserCog },
  { to: '/products', label: '제품/재고', icon: Package },
  { to: '/sales', label: '매출·손익 관리', icon: TrendingUp },
  { to: '/messaging', label: '문자/카카오 발송', icon: MessageSquare },
  { to: '/ai-chat', label: 'AI 분석 챗봇', icon: Bot },
  { to: '/api-guide', label: 'API 연동 가이드', icon: Link2 },
  { to: '/settings', label: '설정', icon: Settings },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { shopName, programName } = useCrmBrand(user?.shopName);
  useFeatureFlagsTick();

  // 어드민이 끈 모듈은 메뉴에서 제외. selfGated(AI 챗봇)는 남기되 SOON 배지 표시.
  const visibleNavItems = navItems
    .map((item) => {
      const def = featureForPath(item.to);
      if (!def) return { ...item, badge: null as string | null };
      const enabled = isFeatureEnabled(def.id);
      if (def.selfGated) return { ...item, badge: enabled ? null : 'SOON' };
      return enabled ? { ...item, badge: null as string | null } : null;
    })
    .filter((item): item is typeof navItems[number] & { badge: string | null } => item !== null);

  // 올림 기준 — 가입 당일 "14일"로 표시 (내림이면 13일로 보이는 off-by-one)
  const trialDaysLeft = user?.trialEndsAt
    ? Math.ceil((parseISO(user.trialEndsAt).getTime() - Date.now()) / 86400000)
    : null;

  // 어드민이 설정한 사용기간(serviceEndsAt) — NAS 서버 응답에 실려 오는 필드로,
  // 코어(AuthContext) 타입에는 없어 런타임 값으로만 읽는다. 만료 14일 전부터 안내.
  const serviceEndsAt = (user as { serviceEndsAt?: string | null } | null)?.serviceEndsAt || null;
  const serviceDaysLeft = serviceEndsAt
    ? Math.ceil((parseISO(serviceEndsAt).getTime() - Date.now()) / 86400000)
    : null;

  const handleNavClick = () => {
    // 모바일에서 메뉴 클릭 시 사이드바 닫기
    if (onClose) onClose();
  };

  return (
    <aside className={clsx(
      'w-64 h-screen bg-white border-r border-gray-100 flex flex-col fixed left-0 top-0 z-30 shadow-sm transition-transform duration-300',
      // 데스크탑: 항상 표시
      'lg:translate-x-0',
      // 모바일: open 상태에 따라
      open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    )}>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#1a3a8f] rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <p className="max-w-[145px] truncate text-[13px] font-black text-[#1a3a8f] leading-tight" title={programName}>{programName}</p>
            <p className="text-[10px] text-gray-400 font-medium tracking-wide">에스테틱 고객관리</p>
          </div>
        </div>
        {/* 모바일 닫기 버튼 */}
        <button
          onClick={onClose}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {visibleNavItems.map(({ to, label, icon: Icon, badge }) => {
            const isActive = to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(to);
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={handleNavClick}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                    isActive
                      ? 'bg-[#1a3a8f] text-white shadow-md shadow-blue-200'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <Icon size={16} className={clsx('flex-shrink-0', isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600')} />
                  <span className="flex-1 truncate">{label}</span>
                  {badge && !isActive && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full">
                      {badge}
                    </span>
                  )}
                  {isActive && <ChevronRight size={13} className="text-white/60" />}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-gray-100 space-y-3">
        {serviceDaysLeft !== null && serviceDaysLeft >= 0 && serviceDaysLeft <= 14 && (
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-[11px] font-bold text-amber-700">⏰ 사용기간 만료 예정</p>
            <p className="text-xs text-amber-500 mt-0.5">
              {serviceEndsAt!.slice(0, 10).replace(/-/g, '.')}까지 (D-{serviceDaysLeft})
            </p>
            <p className="text-[10px] text-amber-400 mt-1">연장은 본사에 문의해주세요</p>
          </div>
        )}
        {user?.plan === 'trial' && trialDaysLeft !== null && trialDaysLeft >= 0 && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-[11px] font-bold text-blue-700">🎁 무료 체험 중</p>
            <p className="text-xs text-blue-400 mt-0.5">남은 기간: {trialDaysLeft}일</p>
            <div className="mt-2 bg-blue-200 rounded-full h-1">
              <div className="bg-blue-500 rounded-full h-1" style={{ width: `${Math.max(5, ((14 - trialDaysLeft) / 14) * 100)}%` }} />
            </div>
          </div>
        )}
        <div className="bg-gray-50 rounded-xl px-4 py-3">
          <p className="text-[11px] font-bold text-gray-700 truncate">{shopName || '샵 정보 미설정'}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{user?.shopType || '에스테틱'}</p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
            <span className="text-xs text-green-600 font-medium">정상 운영 중</span>
          </div>
        </div>
        <button
          onClick={() => { resetFeatureFlags(); logout(); }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <LogOut size={14} />
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  );
}
