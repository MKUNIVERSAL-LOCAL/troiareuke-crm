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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-[#1a3a8f] flex items-center justify-center mx-auto mb-4 animate-pulse">
          <span className="text-white text-lg font-black">T</span>
        </div>
        <p className="text-sm text-gray-400">로딩 중...</p>
      </div>
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isAuthenticated && !user?.isOnboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated && user?.isOnboarded) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
      <Route path="/onboarding" element={<Onboarding />} />

      {/* Protected routes */}
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
