import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CustomerStore, ReservationStore } from '../lib/store';
import { buildCustomerAlert, hasCustomerAlert } from '../lib/customerAlertRule';

/**
 * 현장 주의사항 경고 (232 · 234 리뷰 반영, GAP C-11)
 * 예약을 잡는 자리·시술을 적는 자리에서 알레르기·메모 주의 줄·반복 노쇼를 바로 보여 준다.
 * 줄이 많으면 위험한 것부터 3줄을 띄우고 나머지는 [+N 더 보기] 로 펼친다 —
 * 전에는 상한을 넘은 '시술 불가' 같은 줄이 아무 표시 없이 사라졌다 (리뷰 H-1).
 * 고객을 고르지 않았거나 올릴 것이 없으면 아무것도 그리지 않는다(장식 UI 금지).
 */
export default function CustomerAlertLine({ customerId, className = '' }: { customerId?: string | null; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const alert = useMemo(() => {
    if (!customerId) return null;
    const c = CustomerStore.getById(customerId);
    if (!c) return null;
    const noshowCount = ReservationStore.getAll().filter(r => r.customerId === customerId && r.status === 'noshow').length;
    return buildCustomerAlert({ allergies: c.allergies, memo: c.memo, noshowCount });
  }, [customerId]);

  if (!hasCustomerAlert(alert)) return null;
  const shown = expanded ? alert!.allLines : alert!.lines;
  return (
    <div className={`flex gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl ${className}`}
      data-testid="customer-alert" role="alert" aria-label="고객 주의사항">
      <AlertTriangle size={14} className="text-amber-700 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <ul className="text-xs text-amber-900 space-y-0.5">
          {shown.map(line => <li key={line} className="break-words">{line}</li>)}
        </ul>
        {alert!.hiddenCount > 0 && (
          <button type="button" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}
            className="mt-1 text-xs font-medium text-amber-800 underline underline-offset-2" data-testid="customer-alert-more">
            {expanded ? '접기' : `+${alert!.hiddenCount}개 더 보기`}
          </button>
        )}
      </div>
    </div>
  );
}
