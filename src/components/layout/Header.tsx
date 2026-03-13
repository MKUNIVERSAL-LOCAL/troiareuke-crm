import { Bell, Search, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}

export default function Header({ title, subtitle, action }: HeaderProps) {
  const today = format(new Date(), 'yyyy년 M월 d일 (EEEE)', { locale: ko });

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center px-8 gap-4 sticky top-0 z-20">
      <div className="flex-1">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 hidden lg:block">{today}</span>

        <div className="relative hidden md:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="고객 검색..."
            className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent w-48 transition-all"
          />
        </div>

        <button className="relative p-2 rounded-lg hover:bg-gray-50 transition-colors">
          <Bell size={18} className="text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

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
