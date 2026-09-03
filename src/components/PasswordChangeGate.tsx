// 초대된 관리자 첫 로그인 시 비밀번호 변경 강제 게이트 (비코어)
// user.mustChangePassword 가 true면 콘솔 대신 이 화면만 보인다.
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { changePassword } from '../lib/authApi';

export default function PasswordChangeGate() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('새 비밀번호는 8자 이상이어야 합니다.');
    if (newPassword !== confirm) return setError('새 비밀번호가 서로 일치하지 않습니다.');
    if (newPassword === currentPassword) return setError('임시 비밀번호와 다른 비밀번호를 사용해주세요.');
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      // 서버가 다른 기기 세션을 정리하고 플래그를 해제 — 프로필 재조회를 위해 리로드
      window.location.reload();
    } catch (err: any) {
      setError(err?.message || '비밀번호 변경에 실패했습니다.');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-slate-900 border border-slate-700/50 rounded-2xl p-8 space-y-4">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
          <KeyRound size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">비밀번호를 변경해주세요</h1>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            임시 비밀번호로 로그인하셨습니다. 보안을 위해 본인만 아는 새 비밀번호로 변경한 뒤 콘솔을 사용할 수 있습니다.
          </p>
        </div>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="임시(현재) 비밀번호"
          autoComplete="current-password"
          className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="새 비밀번호 (8자 이상)"
          autoComplete="new-password"
          className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="새 비밀번호 확인"
          autoComplete="new-password"
          className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          {saving ? '변경 중...' : '비밀번호 변경하고 시작하기'}
        </button>
      </form>
    </div>
  );
}
