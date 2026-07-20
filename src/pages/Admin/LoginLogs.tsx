import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Search, RefreshCw, Filter } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getLocalLogs } from '../../lib/loginLog';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

interface LogEntry {
  id: string;
  email: string;
  branch_name: string | null;
  status: 'success' | 'failed';
  fail_reason: string | null;
  device_info: string | null;
  logged_in_at: string;
}

export default function LoginLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filtered, setFiltered] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => { loadLogs(); }, []);

  useEffect(() => {
    let result = logs;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l => l.email.toLowerCase().includes(q) || (l.branch_name || '').toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      result = result.filter(l => l.status === statusFilter);
    }
    setFiltered(result);
    setPage(0);
  }, [search, statusFilter, logs]);

  async function loadLogs() {
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data } = await supabase
          .from('login_logs')
          .select('*')
          .order('logged_in_at', { ascending: false })
          .limit(500);
        setLogs(data || []);
      } else {
        const local = getLocalLogs();
        setLogs(local.map(l => ({ ...l })));
      }
    } finally {
      setLoading(false);
    }
  }

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const successCount = filtered.filter(l => l.status === 'success').length;
  const failCount = filtered.filter(l => l.status === 'failed').length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">로그인 기록</h1>
          <p className="text-slate-400 text-sm mt-1">
            {isSupabaseConfigured
              ? '전체 지점의 로그인 이력을 확인하세요'
              : '로그인 이력을 확인하세요 (중앙 서버 모드에서는 이 기기에서 기록된 로그인만 표시됩니다)'}
          </p>
        </div>
        <button
          onClick={loadLogs}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
        >
          <RefreshCw size={14} />
          새로고침
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl px-5 py-4">
          <p className="text-2xl font-bold text-white">{filtered.length.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">전체 기록</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl px-5 py-4">
          <p className="text-2xl font-bold text-emerald-400">{successCount.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">성공</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl px-5 py-4">
          <p className="text-2xl font-bold text-red-400">{failCount.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">실패</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-blue-500"
            placeholder="이메일 또는 지점명 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-500" />
          {(['all', 'success', 'failed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === s
                  ? s === 'success' ? 'bg-emerald-500/20 text-emerald-400'
                  : s === 'failed' ? 'bg-red-500/20 text-red-400'
                  : 'bg-blue-500/20 text-blue-400'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {s === 'all' ? '전체' : s === 'success' ? '성공' : '실패'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/30">
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">이메일</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">지점</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">상태</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">실패 사유</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">기기 정보</th>
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">시간</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-slate-500 text-sm">
                        기록이 없습니다
                      </td>
                    </tr>
                  ) : (
                    paged.map(log => (
                      <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-3 text-sm text-slate-300 font-medium">{log.email}</td>
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
                        <td className="px-6 py-3 text-xs text-slate-500 max-w-xs truncate">
                          {log.fail_reason || '—'}
                        </td>
                        <td className="px-6 py-3 text-xs text-slate-600 max-w-xs truncate" title={log.device_info || ''}>
                          {log.device_info
                            ? log.device_info.includes('Windows') ? 'Windows'
                            : log.device_info.includes('Mac') ? 'macOS'
                            : log.device_info.includes('Linux') ? 'Linux'
                            : '기타'
                            : '—'}
                        </td>
                        <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {format(parseISO(log.logged_in_at), 'yyyy.MM.dd HH:mm:ss', { locale: ko })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-700/30 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}건
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-xs bg-slate-800 text-slate-400 rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors"
                  >
                    이전
                  </button>
                  <span className="text-xs text-slate-400">{page + 1} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 text-xs bg-slate-800 text-slate-400 rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
