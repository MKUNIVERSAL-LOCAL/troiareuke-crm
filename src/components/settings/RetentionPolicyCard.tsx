import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  getRetentionPolicy, setRetentionPolicy, getExpiredCustomers,
  DEFAULT_RETENTION_YEARS, MIN_RETENTION_YEARS, MAX_RETENTION_YEARS,
} from '../../lib/retentionPolicy';

/**
 * 설정 > 알림 설정 > 개인정보 보존기간 (P4, 2026-11-17)
 * 켜면 보존기간이 지난 고객을 대시보드·고객 화면에 모아 보여주고 한 번에 익명화할 수 있다. 자동 삭제는 하지 않는다.
 * 값은 지점 환경설정(서버 동기)에 저장된다. 기본 OFF — 보존기간은 지점(오너)이 정한다.
 */
export default function RetentionPolicyCard() {
  const [policy, setPolicy] = useState(() => getRetentionPolicy());
  const [draftYears, setDraftYears] = useState(() => String(getRetentionPolicy().years));
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  function save(enabled: boolean) {
    const years = parseInt(draftYears, 10);
    if (!setRetentionPolicy({ enabled, years })) {
      setMessage({ tone: 'warn', text: `${MIN_RETENTION_YEARS}~${MAX_RETENTION_YEARS} 사이의 연수를 입력해 주세요.` });
      return;
    }
    const next = { enabled, years };
    setPolicy(next);
    const expired = enabled ? getExpiredCustomers().length : 0;
    setMessage({
      tone: 'ok',
      text: enabled
        ? `보존기간을 ${years}년으로 저장했습니다. 현재 기간이 지난 고객 ${expired}명 — 대시보드와 고객 화면의 "보존기간 경과"에서 검토하세요.`
        : '보존기간 정책을 껐습니다. 경과 고객 안내가 표시되지 않습니다.',
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="retention-policy-card">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <ShieldCheck size={15} className="text-[#1a3a8f]" />
        <h3 className="text-sm font-bold text-gray-900">개인정보 보존기간</h3>
        <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-full ${policy.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          {policy.enabled ? `사용 중 · ${policy.years}년` : '사용 안 함'}
        </span>
      </div>
      <div className="px-6 py-5 space-y-3">
        <p className="text-sm text-gray-500 leading-relaxed">
          마지막 방문(또는 등록) 후 이 기간이 지난 고객을 <b className="text-gray-800">보존기간 경과</b>로 모아 보여줍니다.
          확인 후 한 번에 <b className="text-gray-800">익명화</b>(이름·전화·메모 등 개인 식별 정보 삭제, 방문·결제 통계는 유지)할 수 있습니다.
          자동 삭제는 하지 않습니다. 기본 {DEFAULT_RETENTION_YEARS}년.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={MIN_RETENTION_YEARS}
            max={MAX_RETENTION_YEARS}
            value={draftYears}
            onChange={e => setDraftYears(e.target.value)}
            aria-label="보존기간(년)"
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a8f]"
          />
          <span className="text-sm text-gray-500">년</span>
          <button
            type="button"
            onClick={() => save(true)}
            className="ml-2 px-4 py-2 bg-[#1a3a8f] hover:bg-[#15307a] text-white text-sm font-bold rounded-xl transition-colors"
          >
            {policy.enabled ? '기간 저장' : '정책 켜기'}
          </button>
          {policy.enabled && (
            <button
              type="button"
              onClick={() => save(false)}
              className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-medium rounded-xl transition-colors"
            >
              정책 끄기
            </button>
          )}
        </div>
        {message && <p className={`text-xs ${message.tone === 'ok' ? 'text-emerald-600' : 'text-amber-700'}`}>{message.text}</p>}
      </div>
    </div>
  );
}
