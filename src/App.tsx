import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
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

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
