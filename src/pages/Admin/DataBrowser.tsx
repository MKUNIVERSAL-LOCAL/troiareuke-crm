import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Building2, Database, Search, ChevronLeft, ChevronRight, RefreshCw,
  MessageSquare, Image as ImageIcon, X, AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';
import { isAuthApiConfigured } from '../../lib/authApi';
import {
  fetchAdminOverview, fetchAdminBranchData, fetchAdminBranchMessages, fetchAdminBranchPhotos,
  type AdminBranchOverview, type AdminDataRow, type AdminMessageLogRow,
  type AdminScheduledRow, type AdminPhotoEntity,
} from '../../lib/adminApi';

const COLLECTION_LABELS: Record<string, string> = {
  customers: '고객',
  programs: '프로그램',
  customer_programs: '고객 프로그램(회권)',
  treatment_logs: '시술 기록',
  products: '제품',
  product_sales: '제품 판매',
  payments: '결제',
  staff: '직원',
  services: '시술 메뉴',
  reservations: '예약',
  shop_settings: '샵 설정',
  message_templates: '메시지 템플릿',
  message_history: '메시지 이력',
  consultations: '피부 상담',
};

const COLLECTION_ORDER = [
  'customers', 'reservations', 'treatment_logs', 'payments', 'customer_programs',
  'programs', 'services', 'products', 'product_sales', 'staff',
  'message_templates', 'message_history', 'consultations', 'shop_settings',
];

/** data JSONB에서 사람이 읽을 만한 요약 필드를 추출 */
function summarizeRow(data: Record<string, unknown>): string {
  const candidates = [
    'name', 'customer_name', 'customerName', 'title', 'program_name', 'programName',
    'product_name', 'productName', 'shop_name', 'phone', 'email', 'content', 'details',
  ];
  const parts: string[] = [];
  for (const key of candidates) {
    const v = data[key];
    if (typeof v === 'string' && v.trim() && parts.length < 3) parts.push(v.trim().slice(0, 40));
  }
  const amount = data['amount'] ?? data['price'] ?? data['total_price'] ?? data['totalPrice'];
  if (typeof amount === 'number') parts.push(`${amount.toLocaleString()}원`);
  const date = data['date'] ?? data['reservation_date'] ?? data['treatment_date'] ?? data['payment_date'];
  if (typeof date === 'string' && parts.length < 4) parts.push(date.slice(0, 10));
  return parts.join(' · ') || '(요약 필드 없음)';
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'yyyy-MM-dd HH:mm'); } catch { return iso; }
}

const PAGE_SIZE = 50;

export default function DataBrowser() {
  const [branches, setBranches] = useState<AdminBranchOverview[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedBranch, setSelectedBranch] = useState<AdminBranchOverview | null>(null);
  const [tab, setTab] = useState<string>('customers'); // collection | '__messages' | '__photos'

  const [rows, setRows] = useState<AdminDataRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loadingRows, setLoadingRows] = useState(false);

  const [sendLog, setSendLog] = useState<AdminMessageLogRow[]>([]);
  const [scheduled, setScheduled] = useState<AdminScheduledRow[]>([]);
  const [photoEntities, setPhotoEntities] = useState<AdminPhotoEntity[]>([]);

  const [detailRow, setDetailRow] = useState<AdminDataRow | null>(null);

  const loadOverview = useCallback(async () => {
    if (!isAuthApiConfigured) { setLoadingBranches(false); return; }
    setLoadingBranches(true);
    setError(null);
    try {
      const { branches } = await fetchAdminOverview();
      setBranches(branches);
    } catch (e: any) {
      setError(e?.message || '지점 목록을 불러오지 못했습니다.');
    } finally {
      setLoadingBranches(false);
    }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const loadRows = useCallback(async (branch: AdminBranchOverview, collection: string, off: number, q: string) => {
    setLoadingRows(true);
    setError(null);
    try {
      if (collection === '__messages') {
        const res = await fetchAdminBranchMessages(branch.branchId);
        setSendLog(res.sendLog);
        setScheduled(res.scheduled);
      } else if (collection === '__photos') {
        const res = await fetchAdminBranchPhotos(branch.branchId);
        setPhotoEntities(res.entities);
      } else {
        const res = await fetchAdminBranchData(branch.branchId, collection, { limit: PAGE_SIZE, offset: off, q: q || undefined });
        setRows(res.rows);
        setTotal(res.total);
      }
    } catch (e: any) {
      setError(e?.message || '데이터를 불러오지 못했습니다.');
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBranch) loadRows(selectedBranch, tab, offset, query);
  }, [selectedBranch, tab, offset, query, loadRows]);

  const selectBranch = (b: AdminBranchOverview) => {
    setSelectedBranch(b);
    setTab('customers');
    setOffset(0);
    setQuery('');
    setSearchInput('');
    setDetailRow(null);
  };

  const changeTab = (t: string) => {
    setTab(t);
    setOffset(0);
    setQuery('');
    setSearchInput('');
    setDetailRow(null);
  };

  if (!isAuthApiConfigured) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-2">전체 데이터 조회</h1>
        <div className="mt-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-200 font-bold text-sm">NAS 중앙 서버 미연동</p>
            <p className="text-slate-400 text-sm mt-1">
              전체 데이터 조회는 NAS 중앙 서버(VITE_AUTH_API_URL) 연동 후 사용할 수 있습니다.
              서버 연동 빌드에서 다시 접속해 주세요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">전체 데이터 조회</h1>
          <p className="text-slate-400 text-sm mt-1">모든 지점의 CRM 데이터를 실시간으로 확인합니다 (읽기 전용)</p>
        </div>
        <button
          onClick={() => { loadOverview(); if (selectedBranch) loadRows(selectedBranch, tab, offset, query); }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors"
        >
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-6">
        {/* 지점 목록 */}
        <div className="w-72 flex-shrink-0 space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">지점 ({branches.length})</p>
          {loadingBranches ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : branches.length === 0 ? (
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5 text-sm text-slate-500">
              데이터가 쌓인 지점이 아직 없습니다.
            </div>
          ) : branches.map(b => {
            const recordTotal = Object.values(b.recordCounts).reduce((a, n) => a + n, 0);
            return (
              <button
                key={b.branchId}
                onClick={() => selectBranch(b)}
                className={clsx(
                  'w-full text-left rounded-2xl p-4 border transition-all',
                  selectedBranch?.branchId === b.branchId
                    ? 'bg-blue-600/15 border-blue-500/50'
                    : 'bg-slate-900 border-slate-700/50 hover:border-slate-600'
                )}
              >
                <div className="flex items-center gap-2">
                  <Building2 size={14} className="text-blue-400 flex-shrink-0" />
                  <span className="text-sm font-bold text-white truncate">{b.branchName || b.branchId}</span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                  <span>레코드 {recordTotal.toLocaleString()}</span>
                  <span>사진 {b.photoCount}</span>
                  <span>계정 {b.userCount}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">최근 활동 {formatDateTime(b.lastActivity)}</p>
              </button>
            );
          })}
        </div>

        {/* 데이터 영역 */}
        <div className="flex-1 min-w-0">
          {!selectedBranch ? (
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-12 text-center text-slate-500 text-sm">
              <Database size={28} className="mx-auto mb-3 text-slate-700" />
              왼쪽에서 지점을 선택하면 해당 지점의 모든 데이터를 확인할 수 있습니다.
            </div>
          ) : (
            <>
              {/* 컬렉션 탭 */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {COLLECTION_ORDER.map(c => {
                  const count = selectedBranch.recordCounts[c] ?? 0;
                  return (
                    <button
                      key={c}
                      onClick={() => changeTab(c)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        tab === c ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                      )}
                    >
                      {COLLECTION_LABELS[c] || c}
                      {count > 0 && <span className="ml-1.5 opacity-70">{count.toLocaleString()}</span>}
                    </button>
                  );
                })}
                <button
                  onClick={() => changeTab('__messages')}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1',
                    tab === '__messages' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  )}
                >
                  <MessageSquare size={11} /> 발송 로그
                </button>
                <button
                  onClick={() => changeTab('__photos')}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1',
                    tab === '__photos' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  )}
                >
                  <ImageIcon size={11} /> 사진
                </button>
              </div>

              {loadingRows ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : tab === '__messages' ? (
                <MessagesView sendLog={sendLog} scheduled={scheduled} />
              ) : tab === '__photos' ? (
                <PhotosView entities={photoEntities} />
              ) : (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                  {/* 검색 */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
                    <div className="relative flex-1 max-w-sm">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { setOffset(0); setQuery(searchInput.trim()); } }}
                        placeholder="검색 후 Enter (이름·전화·내용 등)"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <span className="text-xs text-slate-500">
                      총 {total.toLocaleString()}건{query && ` · "${query}" 검색 결과`}
                    </span>
                  </div>

                  {rows.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-600">데이터가 없습니다.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                          <th className="px-4 py-2.5 font-medium w-40">ID</th>
                          <th className="px-4 py-2.5 font-medium">요약</th>
                          <th className="px-4 py-2.5 font-medium w-36">수정일</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr
                            key={r.id}
                            onClick={() => setDetailRow(r)}
                            className="border-b border-slate-800/60 hover:bg-slate-800/40 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-2.5 text-slate-500 font-mono text-xs truncate max-w-[10rem]">{r.id}</td>
                            <td className="px-4 py-2.5 text-slate-300 truncate max-w-md">{summarizeRow(r.data)}</td>
                            <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDateTime(r.updatedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* 페이지네이션 */}
                  {total > PAGE_SIZE && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
                      <span className="text-xs text-slate-500">{currentPage} / {totalPages} 페이지</span>
                      <div className="flex gap-2">
                        <button
                          disabled={offset === 0}
                          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          disabled={offset + PAGE_SIZE >= total}
                          onClick={() => setOffset(offset + PAGE_SIZE)}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 상세 패널 */}
        {detailRow && (
          <div className="w-96 flex-shrink-0">
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden sticky top-6">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
                <span className="text-sm font-bold text-white">상세 보기</span>
                <button onClick={() => setDetailRow(null)} className="text-slate-500 hover:text-white transition-colors">
                  <X size={15} />
                </button>
              </div>
              <div className="p-4 max-h-[70vh] overflow-y-auto space-y-2">
                <DetailField label="ID" value={detailRow.id} mono />
                <DetailField label="수정일" value={formatDateTime(detailRow.updatedAt)} />
                <div className="border-t border-slate-800 my-2" />
                {Object.entries(detailRow.data).map(([k, v]) => (
                  <DetailField
                    key={k}
                    label={k}
                    value={
                      v === null || v === undefined ? '—'
                        : typeof v === 'object' ? JSON.stringify(v, null, 1)
                        : String(v)
                    }
                    mono={typeof v === 'object'}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={clsx('text-sm text-slate-200 break-all whitespace-pre-wrap', mono && 'font-mono text-xs')}>
        {value}
      </p>
    </div>
  );
}

function MessagesView({ sendLog, scheduled }: { sendLog: AdminMessageLogRow[]; scheduled: AdminScheduledRow[] }) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 text-sm font-bold text-white">발송 로그 (최근 {sendLog.length}건)</div>
        {sendLog.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-600">발송 이력이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2 font-medium w-32">일시</th>
                <th className="px-4 py-2 font-medium w-20">유형</th>
                <th className="px-4 py-2 font-medium w-28">수신번호</th>
                <th className="px-4 py-2 font-medium">내용</th>
                <th className="px-4 py-2 font-medium w-20">상태</th>
              </tr>
            </thead>
            <tbody>
              {sendLog.map(m => (
                <tr key={m.id} className="border-b border-slate-800/60">
                  <td className="px-4 py-2 text-xs text-slate-500">{formatDateTime(m.createdAt)}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{m.type}</td>
                  <td className="px-4 py-2 text-xs text-slate-400 font-mono">{m.phone || '—'}</td>
                  <td className="px-4 py-2 text-slate-300 truncate max-w-xs">{m.title || m.content || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={clsx(
                      'text-xs px-2 py-0.5 rounded-full',
                      m.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400'
                        : m.status === 'failed' ? 'bg-red-500/10 text-red-400'
                        : 'bg-slate-700/50 text-slate-400'
                    )}>
                      {m.status}{m.reason ? ` (${m.reason})` : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 text-sm font-bold text-white">예약 발송 ({scheduled.length}건)</div>
        {scheduled.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-600">예약된 발송이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2 font-medium w-32">발송 예정</th>
                <th className="px-4 py-2 font-medium">내용</th>
                <th className="px-4 py-2 font-medium w-24">수신자 수</th>
                <th className="px-4 py-2 font-medium w-20">상태</th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map(s => (
                <tr key={s.id} className="border-b border-slate-800/60">
                  <td className="px-4 py-2 text-xs text-slate-500">{formatDateTime(s.sendAt)}</td>
                  <td className="px-4 py-2 text-slate-300 truncate max-w-xs">{s.title || s.content || '—'}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{s.phones?.length ?? 0}명</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PhotosView({ entities }: { entities: AdminPhotoEntity[] }) {
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/50 text-sm font-bold text-white">
        시술 사진 보관 현황 ({entities.length}개 항목)
      </div>
      {entities.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-600">저장된 사진이 없습니다.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
              <th className="px-4 py-2 font-medium">항목 키 (고객/시술)</th>
              <th className="px-4 py-2 font-medium w-24">사진 수</th>
              <th className="px-4 py-2 font-medium w-36">수정일</th>
            </tr>
          </thead>
          <tbody>
            {entities.map(e => (
              <tr key={e.entityKey} className="border-b border-slate-800/60">
                <td className="px-4 py-2 text-slate-300 font-mono text-xs truncate max-w-md">{e.entityKey}</td>
                <td className="px-4 py-2 text-slate-400">{e.photoCount}장</td>
                <td className="px-4 py-2 text-xs text-slate-500">{formatDateTime(e.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
