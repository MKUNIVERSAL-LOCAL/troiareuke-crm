import { HashRouter, BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers/index';
import Reservations from './pages/Reservations/index';
import Treatments from './pages/Treatments/index';
import StaffPage from './pages/Staff/index';
import Products from './pages/Products/index';
import Sales from './pages/Sales/index';
import Messaging from './pages/Messaging/index';
import ApiGuide from './pages/ApiGuide/index';
import Settings from './pages/Settings/index';
import Programs from './pages/Programs/index';
import Login from './pages/Auth/Login';
import Signup from './pages/Auth/Signup';
import Onboarding from './pages/Onboarding/index';
import AiChat from './pages/AiChat/index';

// Admin
import AdminLayout from './pages/Admin/Layout';
import AdminDashboard from './pages/Admin/Dashboard';
import Branches from './pages/Admin/Branches';
import LoginLogs from './pages/Admin/LoginLogs';
import AdminUsers from './pages/Admin/Users';
import Subscriptions from './pages/Admin/Subscriptions';
import Announcements from './pages/Admin/Announcements';
import Statistics from './pages/Admin/Statistics';
import AdminLogin from './pages/Admin/Login';
import UpdateNotification from './components/UpdateNotification';

// ── 로딩 스피너 ─────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-[#1a3a8f] flex items-center justify-center mx-auto mb-4 animate-pulse">
          <span className="text-white text-lg font-black">T</span>
        </div>
        <p className="text-sm text-gray-400">로딩 중...</p>
      </div>
    </div>
  );
}

// ── 보호 라우트 (일반 사용자) ────────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // 슈퍼어드민은 항상 관리자 콘솔로
  if (user?.role === 'superadmin') return <Navigate to="/admin/dashboard" replace />;
  if (!user?.isOnboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

// ── 관리자 전용 라우트 ───────────────────────────────────────────
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  if (user?.role !== 'superadmin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

// ── 퍼블릭 라우트 ────────────────────────────────────────────────
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) {
    if (user?.role === 'superadmin') return <Navigate to="/admin/dashboard" replace />;
    if (user?.isOnboarded) return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/admin/login" element={<PublicRoute><AdminLogin /></PublicRoute>} />

      {/* Admin routes */}
      <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="branches" element={<Branches />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="login-logs" element={<LoginLogs />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="statistics" element={<Statistics />} />
      </Route>

      {/* Protected CRM routes */}
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="reservations" element={<Reservations />} />
        <Route path="treatments" element={<Treatments />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="products" element={<Products />} />
        <Route path="sales" element={<Sales />} />
        <Route path="programs" element={<Programs />} />
        <Route path="messaging" element={<Messaging />} />
        <Route path="api-guide" element={<ApiGuide />} />
        <Route path="settings" element={<Settings />} />
        <Route path="ai-chat" element={<AiChat />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ── BW-H4: localStorage 용량 초과 토스트 + BW-C6: 자동 백업 트리거 ─
function SystemListeners() {
  const [quotaToast, setQuotaToast] = useState(false);

  useEffect(() => {
    // 저장 용량 초과 이벤트
    const onQuota = () => {
      setQuotaToast(true);
      setTimeout(() => setQuotaToast(false), 6000);
    };
    window.addEventListener('crm:storage-quota-exceeded', onQuota);

    // 자동 백업 트리거 (main 프로세스 → preload → renderer)
    const electronAPI = (window as Window & { electronAPI?: { backup?: { exportNow: (d: Record<string, string>) => Promise<unknown>; onTrigger: (cb: () => void) => void } } }).electronAPI;
    if (electronAPI?.backup) {
      electronAPI.backup.onTrigger(() => {
        // localStorage 전체 스냅샷
        const snapshot: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) snapshot[k] = localStorage.getItem(k) ?? '';
        }
        electronAPI.backup!.exportNow(snapshot).catch(() => {});
      });
    }

    return () => {
      window.removeEventListener('crm:storage-quota-exceeded', onQuota);
    };
  }, []);

  if (!quotaToast) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-red-600 text-white text-sm px-4 py-3 rounded-lg shadow-lg max-w-sm text-center">
      저장 공간이 부족합니다. 사진을 정리하거나 설정에서 데이터를 백업 후 정리해주세요.
    </div>
  );
}

// Electron 환경 감지 — HashRouter 사용 (file:// 프로토콜 필요)
// 웹/PWA 환경 — BrowserRouter 사용
const IS_ELECTRON =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.includes('Electron');

const Router = IS_ELECTRON ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <UpdateNotification />
        <SystemListeners />
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
