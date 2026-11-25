import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { formatDateTime } from '../lib/format';
import { customerHistory } from '../lib/customerHistory';
import { describeCustomerChange, describeCustomerEntryHead, CUSTOMER_HISTORY_CAVEAT, CUSTOMER_HISTORY_EMPTY } from '../lib/customerHistoryRule';

/**
 * 고객 정보 변경 이력 (252) — 고객 정보는 덮어쓰기라 누가 언제 무엇을 바꿨는지 남지 않았다.
 * 등급을 누가 내렸는지, 연락처가 언제 바뀌었는지 물어볼 데가 없어 "내가 안 바꿨다" 로 끝났다.
 * 개인정보는 적게 남긴다 — 연락처·이메일은 일부만, 메모·알레르기는 바뀐 사실만(규칙은 customerHistoryRule).
 * tick 으로 저장 직후 다시 읽는다(부모가 올려 준다).
 */
export default function CustomerHistoryCard({ customerId, tick = 0 }: { customerId: string; tick?: number }) {
  const [showAll, setShowAll] = useState(false);
  const entries = useMemo(() => customerHistory(customerId), [customerId, tick]);
  const shown = showAll ? entries : entries.slice(0, 3);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4" data-testid="customer-history">
      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-2"><History size={14} className="text-[#1a3a8f]" />정보 변경 이력</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">{CUSTOMER_HISTORY_EMPTY}</p>
      ) : (
        <>
          <ul className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 space-y-2">
            {shown.map(e => (
              <li key={e.id}>
                <p className="text-xs text-gray-500">{describeCustomerEntryHead(e, iso => formatDateTime(iso))}</p>
                {e.changes.map((c, idx) => <p key={idx} className="text-sm">{describeCustomerChange(c)}</p>)}
              </li>
            ))}
          </ul>
          {entries.length > 3 && (
            <button type="button" onClick={() => setShowAll(v => !v)} className="mt-1 text-xs text-[#1a3a8f] hover:underline">
              {showAll ? '최근 3건만 보기' : `전체 ${entries.length}건 보기`}
            </button>
          )}
        </>
      )}
      <p className="text-2xs text-gray-400 mt-1">{CUSTOMER_HISTORY_CAVEAT}</p>
    </div>
  );
}
