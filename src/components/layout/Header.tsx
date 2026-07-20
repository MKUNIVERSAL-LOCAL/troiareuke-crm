import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}

export default function Header({ title, subtitle, action }: HeaderProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const today = format(new Date(), 'yyyy년 M월 d일 (EEEE)', { locale: ko });

  // 전역 고객 검색 — 고객 관리로 이동하며 검색어를 넘긴다 (?q=)
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/customers?q=${encodeURIComponent(q)}` : '/customers');
    setQuery('');
  };

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center px-8 gap-4 sticky top-0 z-20">
      <div className="flex-1">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 hidden lg:block">{today}</span>

        <form onSubmit={handleSearch} className="relative hidden md:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="고객 검색 후 Enter"
            className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent w-48 transition-all"
          />
        </form>

        {action && (
          <button
            onClick={action.onClick}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a3a8f] text-white text-sm font-medium rounded-lg hover:bg-[#0d2260] transition-all shadow-md shadow-blue-200 hover:shadow-lg"
          >
            <Plus size={16} />
            {action.label}
          </button>
        )}
      </div>
    </header>
  );
}
