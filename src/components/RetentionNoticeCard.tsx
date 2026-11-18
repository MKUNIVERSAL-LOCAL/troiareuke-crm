import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ChevronRight } from 'lucide-react';
import { getExpiredCustomers, getRetentionPolicy } from '../lib/retentionPolicy';

/**
 * 대시보드 — 개인정보 보존기간 경과 고객 안내 (P4, 2026-11-17)
 * 정책이 켜져 있고 경과 고객이 있을 때만 보인다. 누르면 고객 화면의 "보존기간 경과" 목록으로.
 */
export default function RetentionNoticeCard({ compact }: { compact?: boolean }) {
  const navigate = useNavigate();
  const policy = getRetentionPolicy();
  if (!policy.enabled) return null;
  const expired = getExpiredCustomers();
  if (expired.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => navigate('/customers?retention=1')}
      data-testid="retention-notice"
      className={`w-full text-left bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 ${compact ? 'px-4 py-3' : 'px-5 py-4'} hover:bg-amber-100/70 transition-colors`}
    >
      <ShieldAlert size={compact ? 18 : 20} className="text-amber-700 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={`${compact ? 'text-sm' : 'text-sm'} font-semibold text-amber-900`}>개인정보 보존기간 경과 고객 {expired.length}명</p>
        <p className="text-xs text-amber-700 mt-0.5">마지막 방문 후 {policy.years}년이 지났습니다. 확인 후 익명화하세요.</p>
      </div>
      <ChevronRight size={16} className="text-amber-700 flex-shrink-0" />
    </button>
  );
}
