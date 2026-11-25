import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronRight, ListChecks } from 'lucide-react';
import { StaffStore, ServiceStore, CustomerStore, SettingsStore, getShopId } from '../lib/store';
import { useAuth } from '../contexts/AuthContext';
import { canOpenRoute, canDo, type Action } from '../lib/permissions';
import { getOptOutNumber } from '../lib/marketingConsent';
import { allStaffSchedules } from '../lib/staffScheduleStore';
import { listCampaigns } from '../lib/campaignStore';
import { lastBackupAt } from '../lib/fullBackup';

/**
 * 첫 설정 체크리스트 (첫 실행 감사 2026-11-18)
 * 새 매장이 온보딩을 건너뛰면 0으로 가득한 홈에 떨어져 다음 할 일을 모른다 — 직원·시술 메뉴·매장 정보·첫 고객을
 * 순서대로 안내하고 각 줄이 해당 등록 화면(?new=1 / ?tab=)으로 바로 연다. 전부 끝나거나 [숨기기]를 누르면 사라진다.
 */
interface Item { key: string; label: string; desc: string; done: boolean; to: string; group: 'basic' | 'pilot'; action?: Action } // action: 라우트는 열려도 그 화면의 버튼이 권한 밖이면 줄을 빼 막다른 길을 막는다 (191 리뷰 M-1)

const DEFAULT_SHOP_NAME = '내 에스테틱 샵';
const hiddenKey = () => `crm_${getShopId()}_setup_hidden`;

function buildSetupItems(): Item[] {
  const s = SettingsStore.get();
  return [
    // 전화번호는 온보딩에서 선택 입력 — 조건에 넣으면 대부분 매장이 영원히 3/4에 머문다 (리뷰 2026-11-18)
    { key: 'shop', group: 'basic', label: '매장 정보', desc: '매장 이름 (안내문·결과지에 표시)', done: !!s.name && s.name !== DEFAULT_SHOP_NAME, to: '/settings?tab=shop' },
    { key: 'staff', group: 'basic', label: '직원 등록', desc: '예약·시술 담당자로 쓰입니다', done: StaffStore.getAll().some(st => st.isActive), to: '/staff?new=1' },
    { key: 'services', group: 'basic', label: '시술 항목 등록', desc: '예약·시술 기록에서 고르는 항목', done: ServiceStore.getAll().some(sv => sv.isActive), to: '/settings?tab=services' },
    { key: 'customer', group: 'basic', label: '첫 고객 등록', desc: '이름과 전화번호만 있으면 됩니다', done: CustomerStore.getAll().length > 0, to: '/customers?new=1' },
    // 파일럿 준비 — PILOT-CHECKLIST 의 "지점 PC" 항목 중 화면에서 바로 끝낼 수 있는 셋 (190, PHASE 6)
    { key: 'optout', group: 'pilot', label: '광고 수신거부 080 번호', desc: '광고성 문자·캠페인을 보내려면 필요합니다', done: !!getOptOutNumber(), to: '/settings?tab=notifications' },
    { key: 'schedule', group: 'pilot', label: '직원 근무표', desc: '직원 수정 창에서 요일별 근무·휴게·버퍼를 저장하세요 — 예약 겹침 경고·빈 시간 안내가 씁니다', done: StaffStore.getAll().some(st => st.isActive && !!allStaffSchedules()[st.id]), to: '/staff' },
    { key: 'campaigns', group: 'pilot', label: '자동 발송 시나리오', desc: '문자/카카오 > 자동 발송에서 "기본 시나리오 16 추가"', done: listCampaigns().length > 0, to: '/messaging', action: 'campaign.manage' },
    { key: 'backup', group: 'pilot', label: '전체 백업 1회 저장', desc: '설정 > 백업·보안에서 백업 파일을 한 번 저장해 두세요(이 PC 기준)', done: !!lastBackupAt(), to: '/settings?tab=backup' },
  ];
}

export default function SetupChecklistCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(hiddenKey()) === '1'; } catch { return false; } });
  const items = useMemo(() => buildSetupItems().filter(i => canOpenRoute(role, i.to) && (!i.action || canDo(role, i.action))), [refreshKey, role]); // 직원 계정에는 열 수 없는 줄(매장 정보·직원·시술 항목)을 빼 막다른 길이 없게 (117~119 리뷰 #H4)
  const remaining = items.filter(i => !i.done);
  if (hidden || remaining.length === 0) return null;
  const hide = () => { try { localStorage.setItem(hiddenKey(), '1'); } catch { /* 저장 불가여도 이번 화면에선 숨긴다 */ } setHidden(true); };

  return (
    <section data-testid="setup-checklist" aria-label="첫 설정 체크리스트" className="bg-white rounded-2xl border border-[#1a3a8f]/20 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><ListChecks size={16} className="text-[#1a3a8f]" />시작하기 — {items.length - remaining.length}/{items.length} 완료</h3>
        <button type="button" onClick={hide} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 -mr-2 rounded-lg">숨기기</button>
      </div>
      {(['basic', 'pilot'] as const).map(group => { const list = items.filter(i => i.group === group); if (list.length === 0) return null; return (
      <div key={group}>
        {group === 'pilot' && <h4 id="setup-pilot-heading" className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-500">파일럿 준비 — 실제 운영 전에</h4>}{/* 머리글을 목록 밖에 두어 첫 항목과 한 덩어리로 읽히지 않게 (191 리뷰 L) */}
        <ul className="divide-y divide-gray-50" aria-labelledby={group === 'pilot' ? 'setup-pilot-heading' : undefined}>
        {list.map(i => (
          <li key={i.key}>
            {i.done ? (
              <div className="flex items-center gap-3 px-5 py-3 text-sm text-gray-400">
                <CheckCircle2 size={18} className="text-emerald-700 flex-shrink-0" />
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
      </div>); })}
    </section>
  );
}
