import { isImeKey } from '../../lib/ime';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Customer } from '../../types';
import { matchesSearch } from '../../lib/format';
import { maskPhone } from '../../lib/masking';

/**
 * 검색형 고객 선택 (데스크 입력 속도 감사 2026-11-18)
 * 고객이 수백~수천 명이면 네이티브 <select>는 PC에서도 폰에서도 못 쓴다 — 이름·전화 뒷자리·초성으로 바로 찾는다.
 * - 입력란에 치면 아래에 결과(최대 50명)가 펼쳐지고 ↑↓·Enter로 고른다. 결과가 1명이면 Tab/포커스 이탈만으로 선택.
 * - 고른 뒤에는 "이름 (전화)"가 보이고 다시 치면 바꿀 수 있다. [×]로 해제.
 * - Esc는 목록만 닫는다(모달까지 닫히지 않게 전파 중단). 목록은 정적 배치 — 모달 본문 overflow에 잘리지 않는다.
 * - 접근성: role=combobox/listbox/option, aria-activedescendant. E2E: getByRole('combobox', { name: '고객' }) → getByRole('option').
 */
interface Props {
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
  /** 전화번호 표시 마스킹 기준 역할 — 생략하면 staff(마스킹) */
  maskRole?: 'staff' | 'admin' | 'superadmin';
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

const MAX_ROWS = 50;

export default function CustomerCombobox({ customers, value, onChange, maskRole = 'staff', placeholder = '이름·전화번호·초성으로 검색', ariaLabel = '고객', className }: Props) {
  const selected = useMemo(() => customers.find(c => c.id === value) ?? null, [customers, value]);
  const labelOf = (c: Customer) => `${c.name} (${maskPhone(c.phone, maskRole)})`;
  const [text, setText] = useState(selected ? labelOf(selected) : '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | null>(null);
  const listId = useId();

  // 프리필·초기화 등 "밖에서" value가 바뀌면 표시 텍스트도 맞춘다. 이 컴포넌트가 직접 올린 변경(타이핑·선택·해제)은
  // pushed에 기록해 두고 건너뛴다 — 안 그러면 고른 고객 위에 글자를 치는 순간 onChange('') → 효과가 text를 지워 입력이 날아간다 (리뷰 2026-11-18)
  const pushed = useRef(value);
  useEffect(() => {
    const id = selected?.id ?? '';
    if (id === pushed.current) return;
    pushed.current = id;
    setText(selected ? labelOf(selected) : '');
  }, [selected?.id]);
  const push = (id: string) => { pushed.current = id; onChange(id); };

  // 고른 고객 표시 그대로면 검색어 없음(전체 목록), 아니면 친 글자로 검색
  const query = selected && text === labelOf(selected) ? '' : text;
  const matches = useMemo(() => {
    const q = query.trim();
    const list = q ? customers.filter(c => matchesSearch(q, [c.name, c.phone])) : customers;
    return list.slice(0, MAX_ROWS);
  }, [customers, query]);
  // 목록이 열릴 때 강조 행: 검색 중이면 첫 행, 이미 고른 고객이 있으면 그 고객(Enter가 엉뚱한 첫 고객으로 바꾸지 않게, 리뷰 2026-11-18)
  useEffect(() => {
    const idx = !query.trim() && selected ? matches.findIndex(c => c.id === selected.id) : 0;
    setHi(idx < 0 ? 0 : idx);
  }, [query, open]);

  const choose = (c: Customer) => {
    if (blurTimer.current) { window.clearTimeout(blurTimer.current); blurTimer.current = null; }
    push(c.id);
    setText(labelOf(c));
    setOpen(false);
  };
  const clear = () => {
    push('');
    setText('');
    setOpen(true);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isImeKey(e)) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setHi(h => Math.min(h + 1, Math.max(0, matches.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      if (open && matches[hi]) { e.preventDefault(); choose(matches[hi]); } // 열린 목록에서 Enter = 선택 (폼 제출 아님)
    } else if (e.key === 'Escape') {
      if (open) {
        setOpen(false);
        setText(selected ? labelOf(selected) : '');
        // 검색 중이던 목록만 닫고 모달은 둔다. 검색어 없이 자동으로 펼쳐진 목록(포커스 직후)이면 그대로 전파해 Esc 한 번에 모달이 닫히게
        if (query.trim()) { e.preventDefault(); e.nativeEvent.stopPropagation(); }
      }
    }
  };
  const onBlur = () => {
    blurTimer.current = window.setTimeout(() => {
      blurTimer.current = null;
      setOpen(false);
      // 친 글자에 딱 1명 맞으면 그 고객으로 — Tab만으로 다음 칸 (데스크 입력 속도)
      if (!selected && query.trim() && matches.length === 1) { choose(matches[0]); return; }
      if (!selected && query.trim() && !matches.some(c => labelOf(c) === text)) setText(''); // 고르지 않은 글자는 지워 "선택된 척" 방지
      if (selected) setText(labelOf(selected));
    }, 120);
  };

  const activeId = open && matches[hi] ? `${listId}-opt-${matches[hi].id}` : undefined;

  return (
    <div className={className}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onChange={e => { setText(e.target.value); setOpen(true); if (selected) push(''); }}
          onFocus={e => { if (!selected) setOpen(true); e.target.select(); }} // 고른 고객이 있으면 목록을 펼치지 않는다(↓로 열기) — 포커스 트랩이 첫 칸에 포커스를 줄 때 50명이 펼쳐지지 않게
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="w-full px-3 py-2.5 pr-9 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
        />
        {selected && (
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={clear} aria-label="고객 선택 해제"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={`${ariaLabel} 검색 결과`} className="mt-1 max-h-52 overflow-y-auto border border-gray-200 rounded-xl bg-white shadow-sm divide-y divide-gray-50">
          {matches.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-gray-400">검색 결과가 없습니다 — 이름이나 전화번호 뒷자리로 찾아보세요</li>
          ) : matches.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-opt-${c.id}`}
              role="option"
              aria-selected={i === hi}
              onMouseDown={e => { e.preventDefault(); choose(c); }}
              onMouseEnter={() => setHi(i)}
              className={`px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between gap-2 ${i === hi ? 'bg-primary-50 text-primary-800' : 'text-gray-700'}`}
            >
              <span className="font-medium truncate">{c.name}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">{maskPhone(c.phone, maskRole)}{c.grade ? ` · ${c.grade}` : ''}</span>
            </li>
          ))}
          {customers.length > MAX_ROWS && matches.length === MAX_ROWS && (
            <li className="px-3 py-2 text-xs text-gray-400">{MAX_ROWS}명까지만 표시 — 더 정확히 검색하세요</li>
          )}
        </ul>
      )}
    </div>
  );
}
