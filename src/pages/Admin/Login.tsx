import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Shield, Lock, Server, Activity } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('관리자 인증 정보를 입력해주세요.'); return; }
    setLoading(true); setError('');
    try {
      await login(email, password);
      navigate('/admin/dashboard');
    } catch {
      setError('인증에 실패했습니다. 관리자 계정 정보를 확인해주세요.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left Panel — System Status */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_left,_rgba(59,130,246,0.15)_0%,_transparent_50%)]"></div>
          <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_right,_rgba(99,102,241,0.1)_0%,_transparent_50%)]"></div>
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '48px 48px'
          }}></div>
        </div>

        {/* Top — Logo */}
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-white text-base font-black">T</span>
            </div>
            <div>
              <p className="text-sm font-black tracking-widest text-white">TROIAREUKE</p>
              <p className="text-[10px] text-blue-400 font-medium tracking-wider">ADMIN CONSOLE</p>
            </div>
          </div>
        </div>

        {/* Center — Hero */}
        <div className="relative space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full">
            <Shield size={12} className="text-blue-400" />
            <span className="text-[11px] text-blue-400 font-medium tracking-wide">AUTHORIZED ACCESS ONLY</span>
          </div>
          <h2 className="text-3xl font-bold text-white leading-tight">
            시스템 관리<br />
            <span className="text-slate-400">콘솔</span>
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
            트로이아르케 CRM 플랫폼의 지점, 사용자, 구독, 통계를 관리합니다.
          </p>

          {/* System status cards */}
          <div className="grid grid-cols-2 gap-3 pt-4 max-w-sm">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <Server size={14} className="text-emerald-400" />
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">System</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                <span className="text-xs text-emerald-400 font-semibold">Online</span>
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={14} className="text-blue-400" />
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Database</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>
                <span className="text-xs text-blue-400 font-semibold">Connected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="relative">
          <p className="text-[11px] text-slate-600">TROIAREUKE CRM Platform v1.0 — Superadmin Access</p>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-900">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-white text-base font-black">T</span>
              </div>
              <div>
                <p className="text-sm font-black tracking-widest text-white">TROIAREUKE</p>
                <p className="text-[10px] text-blue-400 font-medium">ADMIN CONSOLE</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-8">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-slate-700/50 rounded-xl flex items-center justify-center">
                <Lock size={18} className="text-blue-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">관리자 인증</h1>
                <p className="text-[11px] text-slate-500">Superadmin Authentication</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 flex items-center gap-2">
                <Shield size={14} />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">이메일</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-slate-900/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                  placeholder="admin@troiareuke.com"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">비밀번호</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-slate-900/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all pr-11"
                    placeholder="••••••••••"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit" disabled={loading}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-60 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    인증 중...
                  </span>
                ) : (
                  <>
                    <Shield size={16} />
                    관리자 로그인
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-700/50 text-center">
              <a href="#/login" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                일반 사용자 로그인으로 돌아가기
              </a>
            </div>
          </div>

          {/* Security notice */}
          <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-slate-600">
            <Lock size={10} />
            <span>이 페이지는 권한이 부여된 관리자만 접근 가능합니다</span>
          </div>
        </div>
      </div>
    </div>
  );
}
