import { useEffect, useState } from 'react';
import { ShieldCheck, ExternalLink, Copy, CheckCircle } from 'lucide-react';

/**
 * 백신·보안 예외 등록 안내 카드 (설정 > 데이터 백업 탭, Electron 전용)
 *
 * 배포 불변 원칙: 미서명 exe가 백신에 오탐·검역되면 재설치가 필요해진다.
 * 프로그램이 보안 설정을 대신 바꾸지는 않는다. 대신
 *  - 등록할 폴더 경로를 보여주고 클립보드에 복사해 주며
 *  - Windows 보안의 해당 설정 화면을 바로 열어 준다.
 *  - V3 등 타사 백신은 메뉴 경로를 단계별로 안내한다.
 * 사용자가 "등록 완료"를 누르면 이 PC에 완료 표시를 남긴다(localStorage).
 */

interface Targets {
  supported: boolean;
  packaged: boolean;
  paths: string[];
  processes: string[];
  isPortable: boolean;
}

type GuideApi = {
  targets: () => Promise<Targets>;
  openDefender: () => Promise<{ success: boolean; reason?: string }>;
  copyPaths: () => Promise<{ success: boolean; count: number }>;
};

const DONE_KEY = 'troiareuke_av_exclusion_done_at';
const GUIDE_URL = 'https://crm-update.mkcorp.familyds.com/#antivirus';

export default function SecurityGuideCard() {
  const api = (window as unknown as { electronAPI?: { securityGuide?: GuideApi } }).electronAPI?.securityGuide;
  const [targets, setTargets] = useState<Targets | null>(null);
  const [copied, setCopied] = useState(false);
  const [openMsg, setOpenMsg] = useState('');
  const [tab, setTab] = useState<'defender' | 'v3'>('defender');
  const [doneAt, setDoneAt] = useState<string>(() => {
    try { return localStorage.getItem(DONE_KEY) || ''; } catch { return ''; }
  });

  useEffect(() => {
    if (!api) return;
    api.targets().then(setTargets).catch(() => setTargets(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!api) return null;

  async function handleCopy() {
    const r = await api!.copyPaths();
    if (r.success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  async function handleOpenDefender() {
    setOpenMsg('');
    await handleCopy();
    const r = await api!.openDefender();
    setOpenMsg(r.success
      ? 'Windows 보안 화면을 열었습니다. 맨 아래 "제외" → [제외 추가 또는 제거] → [제외 사항 추가] → [폴더]에서 아래 폴더를 하나씩 추가해 주세요. 경로는 이미 복사돼 있습니다.'
      : 'Windows 보안 화면을 자동으로 열 수 없습니다. 아래 단계대로 직접 열어 주세요.');
  }

  function markDone() {
    const now = new Date().toISOString();
    try { localStorage.setItem(DONE_KEY, now); } catch { /* 저장 실패 무시 */ }
    setDoneAt(now);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">백신·보안 예외 등록 (설치 후 1회)</h3>
        {doneAt ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle size={14} /> 완료 표시됨</span>
        ) : (
          <span className="text-xs font-medium text-amber-600">미완료</span>
        )}
      </div>
      <div className="px-6 py-5 space-y-4">
        <p className="text-sm text-gray-500 leading-relaxed">
          일부 PC의 백신이 이 프로그램이나 자동 업데이트 파일을 오탐해 지우는 경우가 있습니다.
          설치 후 한 번만 아래 폴더를 백신 예외에 등록해 두면 재설치가 필요한 일이 생기지 않습니다.
        </p>

        {targets && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs font-bold text-gray-700 mb-1.5">예외로 등록할 폴더 2개</p>
            <ul className="space-y-1 font-mono text-[11px] text-gray-700 break-all">
              {targets.paths.map(p => <li key={p}>📁 {p}</li>)}
            </ul>
            <button
              onClick={handleCopy}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 hover:bg-white transition-colors"
            >
              <Copy size={12} /> {copied ? '복사됨' : '폴더 경로 복사'}
            </button>
          </div>
        )}

        <div className="flex gap-2 border-b border-gray-100">
          <button onClick={() => setTab('defender')} className={`px-3 py-2 text-xs font-bold border-b-2 -mb-px ${tab === 'defender' ? 'border-[#1a3a8f] text-[#1a3a8f]' : 'border-transparent text-gray-400'}`}>Windows 보안</button>
          <button onClick={() => setTab('v3')} className={`px-3 py-2 text-xs font-bold border-b-2 -mb-px ${tab === 'v3' ? 'border-[#1a3a8f] text-[#1a3a8f]' : 'border-transparent text-gray-400'}`}>안랩 V3</button>
        </div>

        {tab === 'defender' ? (
          <div className="space-y-3">
            <button
              onClick={handleOpenDefender}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1a3a8f] hover:bg-[#15307a] text-white text-sm font-bold rounded-xl transition-colors"
            >
              <ShieldCheck size={15} /> Windows 보안 예외 설정 화면 열기 (경로 자동 복사)
            </button>
            {openMsg && <p className="text-xs text-gray-600 leading-relaxed">{openMsg}</p>}
            <ol className="list-decimal ml-5 space-y-1 text-xs text-gray-600 leading-relaxed">
              <li>버튼이 안 열리면: 시작 → <b>설정</b> → <b>개인 정보 및 보안</b>(Windows 10은 <b>업데이트 및 보안</b>) → <b>Windows 보안</b> → <b>바이러스 및 위협 방지</b> → "바이러스 및 위협 방지 설정"의 <b>설정 관리</b></li>
              <li>맨 아래 "제외" → <b>제외 추가 또는 제거</b> → 관리자 권한 확인 창이 뜨면 <b>[예]</b></li>
              <li><b>제외 사항 추가</b> → <b>폴더</b> → 주소창에 위 폴더 경로를 붙여넣고 <b>폴더 선택</b>. 두 폴더 모두 반복</li>
            </ol>
          </div>
        ) : (
          <ol className="list-decimal ml-5 space-y-1 text-xs text-gray-600 leading-relaxed">
            <li>V3 창 오른쪽 위 <b>환경 설정</b>(톱니바퀴) → 왼쪽 메뉴 <b>검사 예외 설정</b></li>
            <li>"검사 예외 대상"에서 <b>폴더 추가</b> → 위 폴더 경로를 붙여넣어 선택 → <b>확인</b>. 두 폴더 모두 반복</li>
            <li>"실시간 검사 예외" 항목이 따로 있는 버전은 같은 폴더를 한 번 더 추가</li>
          </ol>
        )}

        <div className="text-xs text-gray-500 leading-relaxed">
          처음 실행 때 "Windows의 PC 보호" 파란 창이 뜨면 <b>추가 정보</b> → <b>실행</b>을 누르세요. 처음 한 번만 나옵니다.
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={markDone}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
          >
            <CheckCircle size={13} /> 등록을 마쳤습니다
          </button>
          <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#1a3a8f] underline underline-offset-2">
            안내 페이지 열기 <ExternalLink size={12} />
          </a>
          {doneAt && <span className="text-[11px] text-gray-400">완료 표시 {new Date(doneAt).toLocaleString('ko-KR')}</span>}
        </div>
      </div>
    </div>
  );
}
