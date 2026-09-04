import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, LogIn, TrendingUp, CheckCircle, XCircle, DatabaseBackup, Copy, MonitorDown, AlertTriangle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { isAuthApiConfigured, adminListUsers, apiRequest, type AuthApiUser } from '../../lib/authApi';
import {
  INSTALL_SITE_URL, INSTALL_GUIDE_MESSAGE, fetchLatestChannelVersion, isOutdated, appModeLabel, type ChannelManifest,
} from '../../lib/updateChannel';
import { getLocalLogs } from '../../lib/loginLog';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Stats {
  totalBranches: number;
  activeBranches: number;
  totalUsers: number;
  todayLogins: number;
  recentLogs: RecentLog[];
}

interface RecentLog {
  id: string;
  email: string;
  branch_name: string | null;
  status: 'success' | 'failed';
  logged_in_at: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalBranches: 0,
    activeBranches: 0,
    totalUsers: 0,
    todayLogins: 0,
    recentLogs: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // 배포 불변 원칙 패널: 지점별 실행 버전 vs 채널 최신 버전, 설치 안내 링크 복사
  const [branchUsers, setBranchUsers] = useState<AuthApiUser[]>([]);
  const [latest, setLatest] = useState<ChannelManifest | null | undefined>(undefined);
  const [copied, setCopied] = useState<'url' | 'message' | ''>('');

  useEffect(() => {
    loadStats();
  }, []);

  async function copyText(kind: 'url' | 'message', text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 클립보드 API 불가 환경(권한 거부 등) — 임시 textarea 폴백
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    }
    setCopied(kind);
    setTimeout(() => setCopied(''), 2000);
  }

  async function loadStats() {
    setLoading(true);
    setLoadError('');
    try {
      if (isAuthApiConfigured) {
        // NAS 중앙 서버 모드: 계정 목록에서 지점/사용자 집계 (로그인 로그는 이 기기 기준)
        let totalBranches = 0, activeBranches = 0, totalUsers = 0;
        try {
          const users = await adminListUsers();
          const nonAdmin = users.filter(u => u.role !== 'superadmin');
          totalUsers = nonAdmin.length;
          const byBranch = new Map<string, boolean>();
          for (const u of nonAdmin) {
            const bid = u.branchId || u.id;
            byBranch.set(bid, (byBranch.get(bid) ?? false) || u.isActive !== false);
          }
          totalBranches = byBranch.size;
          activeBranches = [...byBranch.values()].filter(Boolean).length;
          setBranchUsers(nonAdmin);
          fetchLatestChannelVersion().then(setLatest);
        } catch (e: any) {
          console.warn('[AdminDashboard] NAS 계정 집계 실패:', e?.message);
          setLoadError(`지점/사용자 집계를 불러오지 못했습니다: ${e?.message || '서버 오류'}`);
        }
        const logs = getLocalLogs();
        // "오늘"은 로컬(KST) 기준 — UTC 문자열 prefix 비교는 00~09시에 전날로 어긋남
        const todayLocal = new Date().toDateString();
        setStats({
          totalBranches,
          activeBranches,
          totalUsers,
          todayLogins: logs.filter(l => l.status === 'success' && new Date(l.logged_in_at).toDateString() === todayLocal).length,
          recentLogs: logs.slice(0, 20).map(l => ({ ...l, branch_name: l.branch_name })),
        });
      } else if (isSupabaseConfigured) {
        const today = new Date().toISOString().split('T')[0];

        const [branches, users, allLogs, todayLogs] = await Promise.all([
          supabase.from('branches').select('id, is_active'),
          supabase.from('user_profiles').select('id'),
          supabase.from('login_logs').select('id, email, branch_name, status, logged_in_at').order('logged_in_at', { ascending: false }).limit(20),
          supabase.from('login_logs').select('id', { count: 'exact' }).eq('status', 'success').gte('logged_in_at', today),
        ]);

        setStats({
          totalBranches: branches.data?.length || 0,
          activeBranches: branches.data?.filter(b => b.is_active).length || 0,
          totalUsers: users.data?.length || 0,
          todayLogins: todayLogs.count || 0,
          recentLogs: allLogs.data || [],
        });
      } else {
        // 로컬 데이터 폴백
        const logs = getLocalLogs();
        const today = new Date().toISOString().split('T')[0];
        const todayCount = logs.filter(l => l.status === 'success' && l.logged_in_at.startsWith(today)).length;

        setStats({
          totalBranches: 0,
          activeBranches: 0,
          totalUsers: 0,
          todayLogins: todayCount,
          recentLogs: logs.slice(0, 20).map(l => ({ ...l, branch_name: l.branch_name })),
        });
      }
    } finally {
      setLoading(false);
    }
  }

  // NAS 서버 수동 백업 (기존엔 서버 라우트만 있고 UI가 없던 죽은 기능)
  const [backupState, setBackupState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [backupMessage, setBackupMessage] = useState('');
  async function handleBackupNow() {
    setBackupState('running');
    try {
      // 서버 runBackup() 응답 shape: { branches, files, date }
      const result = await apiRequest<{ branches?: number; files?: number; date?: string }>('/api/admin/backup', { method: 'POST' });
      setBackupState('done');
      setBackupMessage(
        typeof result?.branches === 'number'
          ? `백업 완료: 지점 ${result.branches}곳, 파일 ${result.files ?? 0}개`
          : '백업이 완료되었습니다.'
      );
    } catch (e: any) {
      setBackupState('error');
      setBackupMessage(`백업 실패: ${e?.message || '서버 오류'}`);
    }
  }

  // 지점별 프로그램 버전 — 지점 안에 여러 PC/계정이 있으면 가장 낮은 버전을 대표값으로(경고 대상)
  const versionByBranch = (() => {
    const map = new Map<string, { name: string; version: string | null; mode: string; lastSeenAt: string | null }>();
    for (const u of branchUsers) {
      const bid = u.branchId || u.id;
      const name = u.branchName || u.shopName || u.email;
      const cur = map.get(bid);
      if (!u.lastAppVersion) {
        if (!cur) map.set(bid, { name, version: null, mode: '', lastSeenAt: null });
        continue;
      }
      if (!cur || cur.version === null || isOutdated(u.lastAppVersion, cur.version)) {
        map.set(bid, { name, version: u.lastAppVersion, mode: u.lastAppMode || '', lastSeenAt: u.lastSeenAt || null });
      }
    }
    return [...map.values()];
  })();
  const latestVersion = latest?.version || null;
  const outdatedBranches = versionByBranch.filter(b => b.version && isOutdated(b.version, latestVersion));
  const unknownBranches = versionByBranch.filter(b => !b.version);
  const upToDateCount = versionByBranch.length - outdatedBranches.length - unknownBranches.length;

  const statCards = [
    { label: '전체 지점', value: stats.totalBranches, sub: `운영 중 ${stats.activeBranches}개`, icon: Building2, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: '등록 사용자', value: stats.totalUsers, sub: '전체 지점 합계', icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: '오늘 로그인', value: stats.todayLogins, sub: '성공 기준', icon: LogIn, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: '성공률', value: stats.recentLogs.length > 0 ? Math.round((stats.recentLogs.filter(l => l.status === 'success').length / stats.recentLogs.length) * 100) + '%' : '-', sub: '최근 20건 기준', icon: TrendingUp, color: 'text-amber-700', bg: 'bg-amber-500/10' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">관리자 대시보드</h1>
          <p className="text-slate-400 text-sm mt-1">전체 지점 현황을 한눈에 확인하세요</p>
        </div>
        {isAuthApiConfigured && (
          <div className="text-right">
            <button
              onClick={handleBackupNow}
              disabled={backupState === 'running'}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              <DatabaseBackup size={15} />
              {backupState === 'running' ? '백업 중...' : '지금 서버 백업'}
            </button>
            {backupMessage && (
              <p className={`text-[11px] mt-1.5 ${backupState === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{backupMessage}</p>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {loadError && (
            <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-sm text-red-300">
              {loadError}
              <button onClick={loadStats} className="ml-3 text-xs underline text-red-200 hover:text-white">다시 시도</button>
            </div>
          )}
          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {statCards.map(card => (
              <div key={card.label} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center`}>
                    <card.icon size={18} className={card.color} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">{card.value}</p>
                <p className="text-xs font-medium text-slate-300 mt-1">{card.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* 배포 불변 원칙 패널 — 지점 프로그램 버전 현황 + 설치 안내 (재다운로드 안내 없이 운영) */}
          {isAuthApiConfigured && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-8">
              <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white">지점 프로그램 버전</h2>
                  <span className="text-xs text-slate-400">
                    {latest === undefined ? '최신 버전 확인 중…' : latest ? `배포 중 최신 v${latest.version}` : '배포 서버 확인 불가'}
                  </span>
                </div>
                <div className="px-6 py-4 text-sm">
                  {outdatedBranches.length === 0 ? (
                    <p className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                      <CheckCircle size={14} /> 접속 기록이 있는 지점 {upToDateCount}곳 모두 최신 버전입니다
                    </p>
                  ) : (
                    <>
                      <p className="flex items-center gap-2 text-red-400 text-xs font-bold mb-3">
                        <AlertTriangle size={14} /> 구버전으로 실행 중인 지점 {outdatedBranches.length}곳 — 프로그램을 닫고 다시 켜면 자동 적용됩니다
                      </p>
                      <ul className="space-y-1.5">
                        {outdatedBranches.map(b => (
                          <li key={b.name} className="flex items-center justify-between text-xs">
                            <span className="text-slate-200">{b.name}</span>
                            <span className="text-slate-500">
                              <span className="text-red-400 font-bold">v{b.version}</span>
                              {' · '}{appModeLabel[b.mode] || b.mode}
                              {b.lastSeenAt && ` · ${format(parseISO(b.lastSeenAt), 'MM/dd HH:mm', { locale: ko })}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {unknownBranches.length > 0 && (
                    <p className="mt-3 text-[11px] text-slate-500">
                      버전 기록 없음 {unknownBranches.length}곳 ({unknownBranches.map(b => b.name).join(', ')}) — v1.0.48 이상 프로그램이 접속하면 표시됩니다
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700/50 flex items-center gap-2">
                  <MonitorDown size={15} className="text-blue-400" />
                  <h2 className="text-sm font-bold text-white">신규 PC 설치 안내</h2>
                </div>
                <div className="px-6 py-4 space-y-3">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    새 PC에 처음 설치할 때만 아래 주소를 보내세요. <span className="text-slate-200 font-medium">기존 PC에는 보내지 않습니다</span> —
                    새 버전은 프로그램이 스스로 내려받아 닫을 때 적용됩니다. 설치 파일을 직접 전달하지 마세요.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate text-xs text-blue-300 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">{INSTALL_SITE_URL}</code>
                    <button
                      onClick={() => copyText('url', INSTALL_SITE_URL)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
                    >
                      <Copy size={12} /> {copied === 'url' ? '복사됨' : '주소 복사'}
                    </button>
                  </div>
                  <button
                    onClick={() => copyText('message', INSTALL_GUIDE_MESSAGE)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
                  >
                    <Copy size={12} /> {copied === 'message' ? '안내 문구 복사됨' : '카톡·문자용 안내 문구 복사'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Recent Login Logs */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">
                최근 로그인 기록
                {!isSupabaseConfigured && <span className="ml-2 text-[11px] font-normal text-slate-500">(이 기기에서 기록된 로그인 기준)</span>}
              </h2>
              <Link to="/admin/login-logs" className="text-xs text-blue-400 hover:text-blue-300">전체 보기 →</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/30">
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">이메일</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">지점</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">상태</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">시간</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-500 text-sm">
                        아직 로그인 기록이 없습니다
                      </td>
                    </tr>
                  ) : (
                    stats.recentLogs.map(log => (
                      <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-3 text-sm text-slate-300">{log.email}</td>
                        <td className="px-6 py-3 text-sm text-slate-400">{log.branch_name || '—'}</td>
                        <td className="px-6 py-3">
                          {log.status === 'success' ? (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                              <CheckCircle size={12} /> 성공
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-red-400">
                              <XCircle size={12} /> 실패
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-xs text-slate-500">
                          {format(parseISO(log.logged_in_at), 'MM/dd HH:mm', { locale: ko })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
