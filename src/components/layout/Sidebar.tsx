import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar, ClipboardList,
  UserCog, Package, TrendingUp, MessageSquare,
  Settings, ChevronRight, Link2, LogOut, Sparkles, Tag
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { differenceInDays, parseISO } from 'date-fns';

const navItems = [
  { to: '/', label: '대시보드', icon: LayoutDashboard },
  { to: '/customers', label: '고객 관리', icon: Users },
  { to: '/programs', label: '시술 프로그램', icon: Tag },
  { to: '/reservations', label: '예약 관리', icon: Calendar },
  { to: '/treatments', label: '시술 기록', icon: ClipboardList },
  { to: '/staff', label: '직원 관리', icon: UserCog },
  { to: '/products', label: '제품/재고', icon: Package },
  { to: '/sales', label: '매출 관리', icon: TrendingUp },
  { to: '/messaging', label: '문자/카카오 발송', icon: MessageSquare },
  { to: '/api-guide', label: 'API 연동 가이드', icon: Link2 },
  { to: '/settings', label: '설정', icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const trialDaysLeft = user?.trialEndsAt
    ? differenceInDays(parseISO(user.trialEndsAt), new Date())
    : null;

  return (
    <aside className="w-64 h-screen bg-white border-r border-gray-100 flex flex-col fixed left-0 top-0 z-30 shadow-sm">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#1a3a8f] rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <p className="text-[12px] font-black tracking-widest text-[#1a3a8f] leading-tight">TROIAREUKE</p>
            <p className="text-[10px] text-gray-400 font-medium tracking-wide">CRM Solution</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(to);
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                    isActive
                      ? 'bg-[#1a3a8f] text-white shadow-md shadow-blue-200'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <Icon size={16} className={clsx('flex-shrink-0', isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600')} />
                  <span className="flex-1 truncate">{label}</span>
                  {isActive && <ChevronRight size={13} className="text-white/60" />}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-gray-100 space-y-3">
        {/* Trial banner */}
        {user?.plan === 'trial' && trialDaysLeft !== null && trialDaysLeft >= 0 && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-[11px] font-bold text-blue-700">🎁 무료 체험 중</p>
            <p className="text-[10px] text-blue-400 mt-0.5">남은 기간: {trialDaysLeft}일</p>
            <div className="mt-2 bg-blue-200 rounded-full h-1">
              <div className="bg-blue-500 rounded-full h-1" style={{ width: `${Math.max(5, ((14 - trialDaysLeft) / 14) * 100)}%` }} />
            </div>
          </div>
        )}
        {/* Shop info */}
        <div className="bg-gray-50 rounded-xl px-4 py-3">
          <p className="text-[11px] font-bold text-gray-700 truncate">{user?.shopName || '샵 정보 미설정'}</p>
          <p className="text-[10px] text-gray-400 mt-0.5 truncate">{user?.shopType || ''}</p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
            <span className="text-[10px] text-green-600 font-medium">네이버 예약 연동 중</span>
          </div>
        </div>
        {/* Logout */}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <LogOut size={14} />
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  );
}
