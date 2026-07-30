import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { getAllPaymentMethods, getCustomPaymentMethods, addCustomPaymentMethod, removeCustomPaymentMethod } from '../lib/paymentMethods';

interface Props {
  value: string;
  onChange: (method: string) => void;
  /** 커스텀 수단 추가/삭제 UI 노출 여부 (기본 true) */
  manageable?: boolean;
}

/** 결제수단 선택 버튼 그리드 — 기본 4종 + 커스텀 수단 + '기타 추가' */
export default function PaymentMethodPicker({ value, onChange, manageable = true }: Props) {
  const [methods, setMethods] = useState<string[]>(() => getAllPaymentMethods());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const customs = getCustomPaymentMethods();

  const handleAdd = () => {
    if (addCustomPaymentMethod(newName)) {
      setMethods(getAllPaymentMethods());
      onChange(newName.trim());
      setNewName('');
      setAdding(false);
    } else {
      alert('이미 있는 이름이거나 사용할 수 없는 이름입니다. (20자 이내)');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {methods.map(m => (
          <span key={m} className="relative inline-flex">
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
            {manageable && customs.includes(m) && (
              <button
                type="button"
                aria-label={`${m} 삭제`}
                onClick={() => {
                  if (!confirm(`결제수단 '${m}'을(를) 목록에서 삭제할까요? (기존 결제 기록은 유지됩니다)`)) return;
                  removeCustomPaymentMethod(m);
                  setMethods(getAllPaymentMethods());
                  if (value === m) onChange('카드');
                }}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${value === m ? 'text-white/70 hover:text-white' : 'text-gray-300 hover:text-red-400'}`}
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
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            placeholder="결제수단 이름 (예: 상품권, 제로페이)"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="button" onClick={handleAdd} className="px-3 py-2 bg-[#1a3a8f] text-white rounded-xl text-sm">추가</button>
          <button type="button" onClick={() => { setAdding(false); setNewName(''); }} className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500">취소</button>
        </div>
      )}
    </div>
  );
}
