import { toISODate } from '../../lib/format';

/**
 * 날짜 입력 옆 빠른 선택 칩 — 데스크에서 가장 잦은 값(오늘·내일·+7일 / 어제)을 한 번에 (UI 품질 기준 2026-11-18)
 * 네이티브 <input type="date">를 대체하지 않고 보조한다. 현재 값과 같은 칩은 눌린 상태(aria-pressed).
 */
export interface DateQuickOption { label: string; days: number }

const DEFAULT_OPTIONS: DateQuickOption[] = [
  { label: '오늘', days: 0 },
  { label: '내일', days: 1 },
  { label: '+7일', days: 7 },
];

function shift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export default function DateQuickChips({ value, onChange, options = DEFAULT_OPTIONS, className }: {
  value: string;
  onChange: (iso: string) => void;
  options?: DateQuickOption[];
  className?: string;
}) {
  return (
    <div className={`mt-1.5 flex flex-wrap gap-1.5 ${className ?? ''}`} role="group" aria-label="날짜 빠른 선택">
      {options.map(o => {
        const iso = shift(o.days);
        const active = value === iso;
        return (
          <button
            key={o.label}
            type="button"
            aria-pressed={active}
            aria-label={`${o.label}로 설정`}
            onClick={() => onChange(iso)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
