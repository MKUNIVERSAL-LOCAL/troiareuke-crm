import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronRight, ListChecks } from 'lucide-react';
import { StaffStore, ServiceStore, CustomerStore, SettingsStore, getShopId } from '../lib/store';

/**
 * 첫 설정 체크리스트 (첫 실행 감사 2026-11-18)
 * 새 매장이 온보딩을 건너뛰면 0으로 가득한 홈에 떨어져 다음 할 일을 모른다 — 직원·시술 메뉴·매장 정보·첫 고객을
 * 순서대로 안내하고 각 줄이 해당 등록 화면(?new=1 / ?tab=)으로 바로 연다. 전부 끝나거나 [숨기기]를 누르면 사라진다.
 */
interface Item { key: string; label: string; desc: string; done: boolean; to: string }

const DEFAULT_SHOP_NAME = '내 에스테틱 샵';
const hiddenKey = () => `crm_${getShopId()}_setup_hidden`;

export function buildSetupItems(): Item[] {
  const s = SettingsStore.get();
  return [
    { key: 'shop', label: '매장 정보', desc: '매장 이름·전화번호 (안내문·결과지에 표시)', done: !!s.name && s.name !== DEFAULT_SHOP_NAME && !!s.phone, to: '/settings?tab=shop' },
    { key: 'staff', label: '직원 등록', desc: '예약·시술 담당자로 쓰입니다', done: StaffStore.getAll().some(st => st.isActive), to: '/staff?new=1' },
    { key: 'services', label: '시술 메뉴 등록', desc: '예약·시술 기록에서 고르는 항목', done: ServiceStore.getAll().some(sv => sv.isActive), to: '/settings?tab=services' },
    { key: 'customer', label: '첫 고객 등록', desc: '이름과 전화번호만 있으면 됩니다', done: CustomerStore.getAll().length > 0, to: '/customers?new=1' },
  ];
}

export default function SetupChecklistCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(hiddenKey()) === '1'; } catch { return false; } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(buildSetupItems, [refreshKey]);
  const remaining = items.filter(i => !i.done);
  if (hidden || remaining.length === 0) return null;
  const hide = () => { try { localStorage.setItem(hiddenKey(), '1'); } catch { /* 저장 불가여도 이번 화면에선 숨긴다 */ } setHidden(true); };

  return (
    <section data-testid="setup-checklist" aria-label="첫 설정 체크리스트" className="bg-white rounded-2xl border border-[#1a3a8f]/20 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><ListChecks size={16} className="text-[#1a3a8f]" />시작하기 — {items.length - remaining.length}/{items.length} 완료</h3>
        <button type="button" onClick={hide} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 -mr-2 rounded-lg">숨기기</button>
      </div>
      <ul className="divide-y divide-gray-50">
        {items.map(i => (
          <li key={i.key}>
            {i.done ? (
              <div className="flex items-center gap-3 px-5 py-3 text-sm text-gray-400">
                <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
                <span className="line-through">{i.label}</span>
              </div>
            ) : (
              <button type="button" onClick={() => navigate(i.to)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 active:bg-gray-50 min-h-[48px]">
                <Circle size={18} className="text-gray-300 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-800">{i.label}</span>
                  <span className="block text-xs text-gray-400">{i.desc}</span>
                </span>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
