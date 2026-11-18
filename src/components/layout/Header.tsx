import { useEffect, useRef, useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  /** 버튼이 여러 개인 페이지(매출·프로그램 등) — action 대신 그대로 렌더 */
  actions?: React.ReactNode;
}

export default function Header({ title, subtitle, action, actions }: HeaderProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const today = format(new Date(), 'yyyy년 M월 d일 (EEEE)', { locale: ko });
  // "/" 또는 Ctrl+K → 전역 고객 검색으로 포커스 (입력 중인 칸에서는 무시, 입력 속도 감사 2026-11-18)
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      const isSlash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!isK && !isSlash) return;
      const t = e.target as HTMLElement | null;
      if (!isK && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (document.querySelector('[aria-modal="true"]')) return; // 모달 포커스 트랩 밖으로 끌어내지 않는다
      const el = searchRef.current;
      if (!el || el.offsetParent === null) return; // 모바일 폭에서는 숨김
      e.preventDefault();
      el.focus();
      el.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 전역 고객 검색 — 고객 관리로 이동하며 검색어를 넘긴다 (?q=)
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/customers?q=${encodeURIComponent(q)}` : '/customers');
    setQuery('');
  };

  return (
    <header className="min-h-16 py-3 bg-white border-b border-gray-100 flex flex-wrap items-center px-4 sm:px-8 gap-x-4 gap-y-2 sticky top-0 z-20">
      <div className="flex-1">
        <h2 className="text-xl font-bold tracking-tight text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 break-keep">{subtitle}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="text-xs text-gray-400 hidden lg:block">{today}</span>

        <form onSubmit={handleSearch} className="relative hidden md:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="고객 검색 (/ 또는 Ctrl+K)"
            aria-label="고객 검색"
            title="/ 또는 Ctrl+K로 바로 포커스 · Enter로 검색, 1명만 맞으면 바로 열림"
            className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent w-48 transition-all"
          />
        </form>

        {actions}
        {action && (
          <button
            onClick={action.onClick}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a3a8f] text-white text-sm font-medium rounded-xl hover:bg-[#15306e] transition-colors"
          >
            <Plus size={16} />
            {action.label}
          </button>
        )}
      </div>
    </header>
  );
}
