// ═══════════════════════════════════════════════════════════════
// birthdayAlerts — 생일 임박 고객 (비코어, 2026-11-17)
// ───────────────────────────────────────────────────────────────
// 오늘부터 7일 안에 생일인 고객을 모아 축하/혜택 안내 초안을 만든다(발송은 복사/공유 — 발송사 연동 후 자동).
// 생년월일은 YYYY-MM-DD 문자열(월·일만 사용, 연도 경계 처리).
// ═══════════════════════════════════════════════════════════════

import { CustomerStore, SettingsStore } from './store';
import type { Customer } from '../types';

export const BIRTHDAY_WINDOW_DAYS = 7;

export interface BirthdayAlert {
  customer: Customer;
  daysUntil: number;  // 0 = 오늘
  dateLabel: string;  // M/D
}

function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 오늘~N일 안의 생일 고객 — 가까운 순. 익명화·샘플 제외, 생년월일 형식이 맞지 않으면 제외 */
export function getUpcomingBirthdays(today = new Date(), windowDays = BIRTHDAY_WINDOW_DAYS): BirthdayAlert[] {
  const base = localMidnight(today);
  const out: BirthdayAlert[] = [];
  for (const c of CustomerStore.getAll()) {
    if (c.id.startsWith('sample_') || c.isActive === false || !c.birthDate) continue;
    const m = /^\d{4}-(\d{2})-(\d{2})/.exec(c.birthDate);
    if (!m) continue;
    const month = Number(m[1]) - 1, day = Number(m[2]);
    if (month < 0 || month > 11 || day < 1 || day > 31) continue;
    // 올해 생일이 이미 지났으면 내년 생일로 (연말 → 연초 경계). 2/29는 평년에 2/28로, 그 밖의 존재하지 않는 날짜는 제외
    const birthdayIn = (year: number): Date | null => {
      const d = new Date(year, month, day);
      if (d.getMonth() === month) return d;
      if (month === 1 && day === 29) return new Date(year, 1, 28);
      return null;
    };
    let next = birthdayIn(base.getFullYear());
    if (next && next < base) next = birthdayIn(base.getFullYear() + 1);
    if (!next) continue;
    const daysUntil = Math.round((next.getTime() - base.getTime()) / 86_400_000);
    if (daysUntil <= windowDays) out.push({ customer: c, daysUntil, dateLabel: `${month + 1}/${day}` });
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil || a.customer.name.localeCompare(b.customer.name));
}

/** 생일 축하 안내 초안 — 혜택 문구는 지점이 고쳐 쓰도록 자리만 둔다 */
export function buildBirthdayMessage(a: BirthdayAlert): string {
  const shop = SettingsStore.get().name || '저희 샵';
  const when = a.daysUntil === 0 ? '오늘' : `${a.dateLabel}`;
  return [
    `${a.customer.name}님, ${when} 생일을 진심으로 축하드려요 🎂`,
    `${shop}에서 생일 주간 특별 케어를 준비했어요. 방문하시면 (혜택 내용)을 드립니다.`,
    '편한 시간을 알려주시면 예약을 잡아드릴게요. 행복한 하루 보내세요 :)',
  ].join('\n');
}
