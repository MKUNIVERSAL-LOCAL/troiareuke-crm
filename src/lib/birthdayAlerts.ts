// ═══════════════════════════════════════════════════════════════
// birthdayAlerts — 생일 임박 고객 (비코어, 2026-11-17)
// ───────────────────────────────────────────────────────────────
// 오늘부터 7일 안에 생일인 고객을 모아 축하/혜택 안내 초안을 만든다(발송은 복사/공유 — 발송사 연동 후 자동).
// 날짜 규칙(연도 경계·2/29)은 birthdayRule.nextBirthday (순수).
// ═══════════════════════════════════════════════════════════════

import { CustomerStore, SettingsStore } from './store';
import type { Customer } from '../types';
import { nextBirthday } from './birthdayRule';
import { isCountableCustomer } from './customerScope';

export const BIRTHDAY_WINDOW_DAYS = 7;

export interface BirthdayAlert {
  customer: Customer;
  daysUntil: number;  // 0 = 오늘
  dateLabel: string;  // M/D
}

/** 오늘~N일 안의 생일 고객 — 가까운 순. 익명화·샘플 제외, 생년월일 형식이 맞지 않으면 제외 */
export function getUpcomingBirthdays(today = new Date(), windowDays = BIRTHDAY_WINDOW_DAYS): BirthdayAlert[] {
  const out: BirthdayAlert[] = [];
  for (const c of CustomerStore.getAll()) {
    if (!isCountableCustomer(c)) continue;
    const nb = nextBirthday(c.birthDate, today);
    if (nb && nb.daysUntil <= windowDays) out.push({ customer: c, ...nb });
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil || a.customer.name.localeCompare(b.customer.name));
}

/** 생일 축하 안내 초안 — 혜택 문구는 지점이 고쳐 쓰도록 자리만 둔다 */
export function buildBirthdayMessage(a: BirthdayAlert): string {
  const shop = SettingsStore.get().name || '저희 매장';
  const when = a.daysUntil === 0 ? '오늘' : `${a.dateLabel}`;
  return [
    `${a.customer.name}님, ${when} 생일을 진심으로 축하드려요`, // 이모지는 SMS를 유니코드(LMS 요금)로 만들고 일부 발송사가 지운다 (산출물 감사 2026-11-20)
    `${shop}에서 생일 주간 특별 케어를 준비했어요. 방문하시면 (혜택 내용)을 드립니다.`,
    '편한 시간을 알려주시면 예약을 잡아드릴게요. 행복한 하루 보내세요 :)',
  ].join('\n');
}
