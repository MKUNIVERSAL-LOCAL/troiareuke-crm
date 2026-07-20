import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { TroiareukeLogo } from './Login';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const linkParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const linkError = linkParams.get('error_description');
    if (linkError) {
      setError('재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해주세요.');
      setChecking(false);
      return;
    }

    if (!isSupabaseConfigured) {
      // 중앙 서버(NAS) 모드의 재설정은 이메일 링크(서버 페이지)에서 진행된다 — 이 화면은 Supabase 전용
      setError('이 화면에서는 재설정할 수 없습니다. 비밀번호 찾기로 받은 이메일의 링크에서 새 비밀번호를 설정해주세요.');
      setChecking(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setSessionReady(true);
        setChecking(false);
        setError('');
      }
    });

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (data.session) {
        setSessionReady(true);
      } else if (sessionError) {
        setError('재설정 링크를 확인하지 못했습니다. 다시 요청해주세요.');
      } else {
        setError('재설정 링크가 만료되었거나 올바르지 않습니다. 다시 요청해주세요.');
      }
      setChecking(false);
    }).catch(() => {
      if (!active) return;
      setError('서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.');
      setChecking(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      navigate('/login?reset=success', { replace: true });
    } catch (e: any) {
      const message = e?.message || '';
      if (/same password|different from the old/i.test(message)) {
        setError('기존 비밀번호와 다른 비밀번호를 입력해주세요.');
      } else if (/weak|password/i.test(message)) {
        setError('비밀번호는 8자 이상으로 입력해주세요.');
      } else if (/Failed to fetch|Network|ENOTFOUND|name not resolved/i.test(message)) {
        setError('서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.');
      } else {
        setError('비밀번호를 변경하지 못했습니다. 재설정 링크를 다시 요청해주세요.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <TroiareukeLogo />
        </div>
        <div className="rounded-3xl bg-white p-8 shadow-xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#1a3a8f]">
            <KeyRound size={22} />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-gray-900">새 비밀번호 설정</h1>

          {checking ? (
            <div className="py-10 text-center text-sm text-gray-500">재설정 링크를 확인하는 중...</div>
          ) : sessionReady ? (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600" htmlFor="new-password">새 비밀번호</label>
                <div className="relative mt-1.5">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    autoFocus
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-11 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="8자 이상 입력"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600" htmlFor="confirm-password">새 비밀번호 확인</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="비밀번호 다시 입력"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="min-h-[48px] w-full rounded-xl bg-[#1a3a8f] px-4 py-3 font-semibold text-white hover:bg-[#0d2260] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '변경하는 중...' : '비밀번호 변경하기'}
              </button>
            </form>
          ) : (
            <div className="mt-6">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-600">{error}</div>
              <Link
                to="/login"
                className="mt-5 block w-full rounded-xl bg-[#1a3a8f] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-[#0d2260]"
              >
                비밀번호 재설정 다시 요청하기
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
