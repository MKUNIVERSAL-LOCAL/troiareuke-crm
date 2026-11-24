// ReservationPolicyCard — 설정 > 영업시간 > 예약 정책(겹침 예약 금지) (비코어, 173, GAP R-3)
import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { notify } from '../../lib/notify';
import { isAuthApiConfigured } from '../../lib/authApi';
import { getReservationPolicy, setReservationPolicy } from '../../lib/reservationPolicy';

export default function ReservationPolicyCard() {
  const [policy, setPolicy] = useState(() => getReservationPolicy());
  const toggle = (blockOverlap: boolean) => {
    const next = { ...policy, blockOverlap };
    setReservationPolicy(next); setPolicy(next);
    notify.success(blockOverlap ? '같은 담당자의 겹치는 예약은 이제 저장할 수 없습니다(빈 시간 제안만).' : '겹치는 예약은 경고 뒤 저장할 수 있습니다.');
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="reservation-policy-card">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <ShieldAlert size={15} className="text-[#1a3a8f]" />
        <h3 className="text-sm font-bold text-gray-900">예약 정책</h3>
      </div>
      <div className="px-6 py-5 space-y-3">
        <label className="flex items-start gap-3 text-sm text-gray-800">
          <input type="checkbox" role="switch" aria-checked={policy.blockOverlap} checked={policy.blockOverlap} onChange={e => toggle(e.target.checked)} className="rounded mt-0.5" aria-label="겹치는 예약 금지" />
          <span>
            <b>겹치는 예약 금지</b> — 같은 담당자의 시간이 겹치면 "그래도 등록" 없이 막고 빈 시간만 제안합니다. 꺼져 있으면(기본) 경고 뒤 등록할 수 있습니다.
            <span className="block text-xs text-gray-500 mt-1">준비·정리 시간, 근무 외 시간, 휴무일 경고는 이 설정과 무관하게 확인만 합니다.{isAuthApiConfigured ? ' 이 지점의 모든 PC 에 적용됩니다.' : ''} 두 PC 가 동시에 같은 칸을 잡는 경우는 서버 검사(승인 B-2) 뒤 막힙니다.</span>
          </span>
        </label>
      </div>
    </div>
  );
}
