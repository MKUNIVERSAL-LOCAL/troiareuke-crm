import { isImeKey } from '../lib/ime';
import { describePrefLoss, describePrefRemovalLoss } from '../lib/prefLandedRule'; // 저장이 정말 남았는지 (296·297)
import { prefSaveMode } from '../lib/prefSaveMode';
import { notify } from '../lib/notify';
import { josa } from '../lib/josa';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { getAllPaymentMethods, getCustomPaymentMethods, addCustomPaymentMethod, removeCustomPaymentMethod } from '../lib/paymentMethods';

interface Props {
  value: string;
  onChange: (method: string) => void;
  /** 커스텀 수단 추가/삭제 UI 노출 여부 (기본 true) */
  manageable?: boolean;
  /** 고르기(선택) 의미가 있는 곳인지 — 설정 화면의 관리 전용 블록은 false (고르는 척하는 버튼을 두지 않는다, 210) */
  selectable?: boolean;
}

/** 결제수단 선택 버튼 그리드 — 기본 4종 + 커스텀 수단 + '기타 추가'. selectable=false 면 고르기 없이 추가·삭제만 */
export default function PaymentMethodPicker({ value, onChange, manageable = true, selectable = true }: Props) {
  const [methods, setMethods] = useState<string[]>(() => getAllPaymentMethods());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const customs = getCustomPaymentMethods();

  const handleAdd = () => {
    const landed = addCustomPaymentMethod(newName);
    if (landed === 'invalid') { notify('이미 있는 이름이거나 사용할 수 없는 이름입니다. (20자 이내)'); return; }
    setMethods(getAllPaymentMethods());
    if (selectable) onChange(newName.trim()); // 관리 전용 블록에서는 고르지 않는다 (210)
    setNewName('');
    setAdding(false);
    // 296: 전에는 "쓸 수 없는 이름" 과 "저장 실패" 가 같은 답이었다 — 저장 실패는 아예 알 수 없었다
    const lost = describePrefLoss(landed, '결제수단', prefSaveMode());
    if (lost) notify.error(lost);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {methods.map(m => (
          <span key={m} className="relative inline-flex">
            {selectable ? (
              <button
                type="button"
                onClick={() => onChange(m)}
                className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
                  value === m
                    ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                } ${manageable && customs.includes(m) ? 'pr-7' : ''}`}
              >
                {m}
              </button>
            ) : (
              <span className={`px-3 py-2 rounded-xl text-sm border bg-white text-gray-600 border-gray-200 ${manageable && customs.includes(m) ? 'pr-7' : ''}`}>{m}</span>
            )}
            {manageable && customs.includes(m) && (
              <button
                type="button"
                aria-label={`${m} 삭제`}
                onClick={() => {
                  if (!confirm(`결제수단 ${josa(`'${m}'`, '을/를')} 목록에서 삭제할까요? (기존 결제 기록은 유지됩니다)`)) return;
                  // 297(리뷰 M-2): 추가만 고치고 같은 화면의 삭제는 판정을 버렸다 — 다시 열면 지운 칩이 돌아온다
                  const lostRemove = describePrefRemovalLoss(removeCustomPaymentMethod(m), '결제수단', prefSaveMode());
                  setMethods(getAllPaymentMethods());
                  if (lostRemove) notify.error(lostRemove);
                  if (selectable && value === m) onChange('카드');
                }}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${selectable && value === m ? 'text-white/70 hover:text-white' : 'text-gray-300 hover:text-red-600'}`}
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        {manageable && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
          >
            <Plus size={13} />기타 추가
          </button>
        )}
      </div>
      {manageable && adding && (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !isImeKey(e)) { e.preventDefault(); handleAdd(); } }} // 한글 조합 중 Enter로 반쪽 이름이 추가되지 않게
            placeholder="결제수단 이름 (예: 상품권, 제로페이)"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          <button type="button" onClick={handleAdd} className="px-3 py-2 bg-[#1a3a8f] text-white rounded-xl text-sm">추가</button>
          <button type="button" onClick={() => { setAdding(false); setNewName(''); }} className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500">취소</button>
        </div>
      )}
    </div>
  );
}
