// campaignStore — 캠페인 정의(지점 설정 행, 모든 기기 동기)와 발송 기록·멱등키(이 기기 localStorage) (비코어, 156, GAP M-3)
// 정의는 적고 작아 설정 행에 둔다(staffSchedules 와 같은 방식). 멱등키는 발송마다 늘어나고 기기 간 중복 방지가 핵심이라
// 서버 컬렉션(`campaign_sends`, 승인 B-4)이 정답 — 그 전까지는 기기별 기록이라 "다른 PC 에서 보낸 것"은 모른다(실행 창에 안내).
import { getShopId, safeSetItem } from './store';
import { getPreference, setPreference } from './shopPreferences';
import type { Campaign } from './campaignRule';
import { TRIGGER_DAYS, TRIGGER_DEFAULT_REPEAT, type CampaignTrigger } from './campaignRule';

function genId(): string {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function listCampaigns(): Campaign[] {
  const v = getPreference('campaigns');
  return Array.isArray(v) ? v : [];
}

export type CampaignInput = Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>;

export function saveCampaign(input: CampaignInput, id?: string): Campaign {
  const list = listCampaigns();
  const now = new Date().toISOString();
  const existing = id ? list.find(c => c.id === id) : undefined;
  const saved: Campaign = existing ? { ...existing, ...input, updatedAt: now } : { ...input, id: genId(), createdAt: now, updatedAt: now };
  setPreference('campaigns', existing ? list.map(c => (c.id === saved.id ? saved : c)) : [...list, saved]);
  return saved;
}

export function deleteCampaign(id: string): void {
  setPreference('campaigns', listCampaigns().filter(c => c.id !== id));
}

export function setCampaignEnabled(id: string, enabled: boolean): void {
  setPreference('campaigns', listCampaigns().map(c => (c.id === id ? { ...c, enabled, updatedAt: new Date().toISOString() } : c)));
}

/** 새 캠페인 초안 — 트리거별 기본 일수·반복 */
export function newCampaignDraft(trigger: CampaignTrigger): CampaignInput {
  return { name: '', enabled: true, trigger, days: TRIGGER_DAYS[trigger]?.defaultDays ?? 0, channel: 'sms', content: '', isAd: false, repeat: TRIGGER_DEFAULT_REPEAT[trigger] };
}

// ── 발송 기록·멱등키 (이 기기) ─────────────────────────────────
export interface CampaignSendRecord { key: string; campaignId: string; customerId: string; at: string; historyId?: string }
const SENDS_KEY = () => `crm_${getShopId()}_campaign_sends`;
const MAX_SENDS = 50000;

function readSends(): CampaignSendRecord[] {
  try { const raw = localStorage.getItem(SENDS_KEY()); return raw ? JSON.parse(raw) : []; } catch { return []; }
}

export function sentKeysOf(campaignId: string): Set<string> {
  return new Set(readSends().filter(s => s.campaignId === campaignId).map(s => s.key));
}

/** 실제로 나간(성공) 건만 기록한다 — 미연동·실패는 다음 실행에 다시 잡혀야 한다 */
export function markSent(records: Omit<CampaignSendRecord, 'at'>[]): void {
  if (!records.length) return;
  const at = new Date().toISOString();
  const list = [...readSends(), ...records.map(r => ({ ...r, at }))];
  safeSetItem(SENDS_KEY(), JSON.stringify(list.length > MAX_SENDS ? list.slice(list.length - MAX_SENDS) : list));
}

export function lastRunOf(campaignId: string): string | null {
  const l = readSends().filter(s => s.campaignId === campaignId);
  return l.length ? l[l.length - 1].at : null;
}
