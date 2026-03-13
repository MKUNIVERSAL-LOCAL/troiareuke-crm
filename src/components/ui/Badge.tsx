import clsx from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'purple' | 'pink' | 'green' | 'yellow' | 'red' | 'blue' | 'gray';
  size?: 'sm' | 'md';
}

const variants = {
  purple: 'bg-purple-100 text-purple-700',
  pink: 'bg-pink-100 text-pink-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
  gray: 'bg-gray-100 text-gray-600',
};

export default function Badge({ children, variant = 'gray', size = 'sm' }: BadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center font-medium rounded-full',
      variants[variant],
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
    )}>
      {children}
    </span>
  );
}

export function GradeBadge({ grade }: { grade: string }) {
  const config = {
    'VIP': { variant: 'purple' as const, label: '👑 VIP' },
    '골드': { variant: 'yellow' as const, label: '⭐ 골드' },
    '일반': { variant: 'blue' as const, label: '일반' },
    '신규': { variant: 'green' as const, label: '✨ 신규' },
  };
  const { variant, label } = config[grade as keyof typeof config] || { variant: 'gray' as const, label: grade };
  return <Badge variant={variant}>{label}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const config = {
    confirmed: { variant: 'blue' as const, label: '예약확정' },
    pending: { variant: 'yellow' as const, label: '예약대기' },
    completed: { variant: 'green' as const, label: '완료' },
    cancelled: { variant: 'red' as const, label: '취소' },
    noshow: { variant: 'gray' as const, label: '노쇼' },
  };
  const { variant, label } = config[status as keyof typeof config] || { variant: 'gray' as const, label: status };
  return <Badge variant={variant}>{label}</Badge>;
}

export function SourceBadge({ source }: { source: string }) {
  const config = {
    naver: { variant: 'green' as const, label: '네이버' },
    kakao: { variant: 'yellow' as const, label: '카카오' },
    manual: { variant: 'gray' as const, label: '직접등록' },
    phone: { variant: 'blue' as const, label: '전화' },
    'walk-in': { variant: 'purple' as const, label: '워크인' },
    app: { variant: 'pink' as const, label: '앱' },
  };
  const { variant, label } = config[source as keyof typeof config] || { variant: 'gray' as const, label: source };
  return <Badge variant={variant}>{label}</Badge>;
}
