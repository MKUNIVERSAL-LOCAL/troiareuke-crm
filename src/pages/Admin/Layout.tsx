import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, Building2, LogIn, Users, LogOut, ChevronRight, CreditCard, Megaphone, BarChart2, Database } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';

// search가 있는 항목은 pathname+search까지 일치해야 활성 (통계 vs 전체 데이터 구분)
const adminNav = [
  { to: '/admin/dashboard', label: '관리자 대시보드', icon: LayoutDashboard },
  { to: '/admin/branches', label: '지점 관리', icon: Building2 },
  { to: '/admin/subscriptions', label: '구독/플랜 관리', icon: CreditCard },
  { to: '/admin/announcements', label: '공지사항', icon: Megaphone },
  { to: '/admin/login-logs', label: '로그인 기록', icon: LogIn },
  { to: '/admin/users', label: '사용자 관리', icon: Users },
  { to: '/admin/statistics', label: '통계 / 분석', icon: BarChart2 },
  { to: '/admin/statistics?view=data', label: '전체 데이터', icon: Database },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isNavActive = (to: string) => {
    const [path, search] = to.split('?');
    if (location.pathname !== path) return false;
    const wantsDataView = search?.includes('view=data') ?? false;
    const hasDataView = new URLSearchParams(location.search).get('view') === 'data';
    return wantsDataView === hasDataView;
  };

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Admin Sidebar */}
      <aside className="w-64 h-screen bg-slate-900 flex flex-col fixed left-0 top-0 z-30 border-r border-slate-700/50">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white text-sm font-black">T</span>
            </div>
            <div>
              <p className="text-xs font-black tracking-widest text-white leading-tight">TROIAREUKE</p>
              <p className="text-xs text-blue-400 font-medium">관리자 콘솔</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">메뉴</p>
          <ul className="space-y-0.5">
            {adminNav.map(({ to, label, icon: Icon }) => {
              const active = isNavActive(to);
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                      active
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    )}
                  >
                    <Icon size={15} className={clsx('flex-shrink-0', active ? 'text-white' : 'text-slate-500')} />
                    <span className="flex-1">{label}</span>
                    {active && <ChevronRight size={12} className="text-white/50" />}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* 일반 CRM으로 이동 링크 */}
          <div className="mt-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">바로가기</p>
            <NavLink
              to="/"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
            >
              <ChevronRight size={15} className="text-slate-500" />
              <span>CRM 메인으로</span>
            </NavLink>
          </div>
        </nav>

        {/* Bottom */}
        <div className="px-4 py-4 border-t border-slate-700/50">
          <div className="bg-slate-800 rounded-xl px-4 py-3 mb-3">
            <p className="text-xs font-bold text-white truncate">{user?.name || '관리자'}</p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{user?.email}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
              <span className="text-xs text-blue-400 font-medium">슈퍼어드민</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOut size={14} />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-h-screen overflow-x-hidden bg-slate-950">
        <Outlet />
      </main>
    </div>
  );
}
