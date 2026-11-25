import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CustomerStore, ReservationStore } from '../lib/store';
import { buildCustomerAlert, hasCustomerAlert } from '../lib/customerAlertRule';

/**
 * 현장 주의사항 경고 (232, GAP C-11)
 * 예약을 잡는 자리·시술을 적는 자리에서 알레르기·메모 주의 줄·반복 노쇼를 바로 보여 준다.
 * 고객을 고르지 않았거나 올릴 것이 없으면 아무것도 그리지 않는다(장식 UI 금지).
 */
export default function CustomerAlertLine({ customerId, className = '' }: { customerId?: string | null; className?: string }) {
  const alert = useMemo(() => {
    if (!customerId) return null;
    const c = CustomerStore.getById(customerId);
    if (!c) return null;
    const noshowCount = ReservationStore.getAll().filter(r => r.customerId === customerId && r.status === 'noshow').length;
    return buildCustomerAlert({ allergies: c.allergies, memo: c.memo, noshowCount });
  }, [customerId]);

  if (!hasCustomerAlert(alert)) return null;
  return (
    <div className={`flex gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl ${className}`}
      data-testid="customer-alert" role="status" aria-live="polite" aria-label="고객 주의사항">
      <AlertTriangle size={14} className="text-amber-700 shrink-0 mt-0.5" />
      <ul className="text-xs text-amber-900 space-y-0.5 min-w-0">
        {alert!.lines.map(line => <li key={line} className="break-words">{line}</li>)}
      </ul>
    </div>
  );
}
