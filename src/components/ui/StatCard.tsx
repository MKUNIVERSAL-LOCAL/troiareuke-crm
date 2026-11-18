import clsx from 'clsx';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  accent?: 'primary' | 'pink' | 'green' | 'blue' | 'orange';
}

// 플랫 연한 타일 — 대시보드 2열 타일과 같은 어법(그라데이션·색 그림자 없음, UI 품질 기준 2026-11-18)
const accents = {
  primary: 'bg-primary-50 text-primary-600',
  pink: 'bg-rose-50 text-rose-600',
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-600',
  orange: 'bg-amber-50 text-amber-700',
};

export default function StatCard({ title, value, subtitle, icon, trend, accent = 'primary' }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          {trend && (
            <div className={clsx(
              'flex items-center gap-1 mt-2 text-xs font-medium',
              trend.value >= 0 ? 'text-green-700' : 'text-red-600'
            )}>
              {trend.value >= 0
                ? <TrendingUp size={12} />
                : <TrendingDown size={12} />
              }
              <span>{trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={clsx(
            'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0',
            accents[accent]
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
