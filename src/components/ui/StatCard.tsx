import clsx from 'clsx';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  accent?: 'purple' | 'pink' | 'green' | 'blue' | 'orange';
}

const accents = {
  purple: 'from-purple-500 to-purple-600',
  pink: 'from-pink-500 to-rose-500',
  green: 'from-emerald-500 to-green-600',
  blue: 'from-blue-500 to-cyan-500',
  orange: 'from-orange-500 to-amber-500',
};

export default function StatCard({ title, value, subtitle, icon, trend, accent = 'purple' }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          {trend && (
            <div className={clsx(
              'flex items-center gap-1 mt-2 text-xs font-medium',
              trend.value >= 0 ? 'text-green-600' : 'text-red-500'
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
            'w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br text-white shadow-lg flex-shrink-0',
            accents[accent]
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
