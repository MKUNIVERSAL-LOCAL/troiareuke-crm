import { useEffect, useState } from 'react';
import { Megaphone, RefreshCw } from 'lucide-react';
import bundledHistory from '../../data/releaseHistory';

// 공지 게시판 — 업데이트 채널(NAS)의 누적 릴리스 로그를 사용자가 언제든 확인
const HISTORY_URL = 'https://crm-update.mkcorp.familyds.com/portable/history.json';

interface ReleaseEntry {
  version: string;
  releaseDate?: string;
  notes?: string;
}

export default function UpdateNewsBoard() {
  const [entries, setEntries] = useState<ReleaseEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(false);
    fetch(`${HISTORY_URL}?t=${Date.now()}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(list => setEntries(Array.isArray(list) && list.length > 0 ? list : bundledHistory))
      .catch(() => {
        // 오프라인/차단 환경 — 앱에 내장된 릴리스 로그로 대체 (설치 버전 기준)
        if (bundledHistory.length > 0) setEntries(bundledHistory);
        else setError(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">프로그램 업데이트 소식과 변경 내용을 확인할 수 있습니다.</p>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <RefreshCw size={12} /> 새로고침
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#1a3a8f] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-10 text-sm text-gray-400">
          공지 서버에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 새로고침해주세요.
        </div>
      ) : !entries || entries.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">아직 등록된 소식이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {entries.map(e => (
            <div key={e.version} className="border border-gray-100 rounded-2xl p-4 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Megaphone size={13} className="text-[#1a3a8f]" />
                </div>
                <span className="text-sm font-bold text-gray-900">v{e.version} 업데이트</span>
                {e.releaseDate && <span className="text-xs text-gray-400">{e.releaseDate}</span>}
              </div>
              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{e.notes || '변경 내용 없음'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
