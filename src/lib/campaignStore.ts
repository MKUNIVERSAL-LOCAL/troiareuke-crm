// campaignStore — 캠페인 정의(지점 설정 행, 모든 기기 동기)와 발송 기록·멱등키(이 기기 localStorage) (비코어, 156, GAP M-3)
// 정의는 적고 작아 설정 행에 둔다(staffSchedules 와 같은 방식). 멱등키는 발송마다 늘어나고 기기 간 중복 방지가 핵심이라
// 서버 컬렉션(`campaign_sends`, 승인 B-4)이 정답 — 그 전까지는 기기별 기록이라 "다른 PC 에서 보낸 것"은 모른다(실행 창에 안내).
import { getShopId, safeSetItem } from './store';
import { getPreference, setPreference } from './shopPreferences';
import type { PrefLanded } from './prefLandedRule';
import type { Campaign } from './campaignRule';
import { TRIGGER_DAYS, TRIGGER_DEFAULT_REPEAT, type CampaignTrigger } from './campaignRule';
import { missingPresets } from './campaignPresets';

function genId(): string {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function listCampaigns(): Campaign[] {
  const v = getPreference('campaigns');
  return Array.isArray(v) ? v : [];
}

export type CampaignInput = Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>;

/** @returns 저장된 캠페인과 **이 PC 에 남았는지** (296) — 캠페인은 자동 발송 정의라 사라지면 아무것도 나가지 않는다 */
export function saveCampaign(input: CampaignInput, id?: string): { saved: Campaign; landed: PrefLanded } {
  const list = listCampaigns();
  const now = new Date().toISOString();
  const existing = id ? list.find(c => c.id === id) : undefined;
  const saved: Campaign = existing ? { ...existing, ...input, updatedAt: now } : { ...input, id: genId(), createdAt: now, updatedAt: now };
  const landed = setPreference('campaigns', existing ? list.map(c => (c.id === saved.id ? saved : c)) : [...list, saved]);
  return { saved, landed };
}

export function deleteCampaign(id: string): PrefLanded {
  return setPreference('campaigns', listCampaigns().filter(c => c.id !== id));
}

export function setCampaignEnabled(id: string, enabled: boolean): PrefLanded {
  return setPreference('campaigns', listCampaigns().map(c => (c.id === id ? { ...c, enabled, updatedAt: new Date().toISOString() } : c)));
}

/** 기본 시나리오 16개 중 아직 없는 것(이름 기준)을 한 번에 추가 — 추가된 수와 **남았는지** 를 돌려준다 (157·296) */
export function addMissingPresets(): { added: number; landed: PrefLanded } {
  const list = listCampaigns();
  const add = missingPresets(list.map(c => c.name));
  if (!add.length) return { added: 0, landed: 'landed' }; // 더할 것이 없었다(뜻대로)
  const now = new Date().toISOString();
  const landed = setPreference('campaigns', [...list, ...add.map(({ key: _key, group: _group, ...p }) => ({ ...p, id: genId(), createdAt: now, updatedAt: now }))]);
  return { added: add.length, landed };
}

/** 새 캠페인 초안 — 트리거별 기본 일수·반복 */
export function newCampaignDraft(trigger: CampaignTrigger): CampaignInput {
  return { name: '', enabled: true, trigger, days: TRIGGER_DAYS[trigger]?.defaultDays ?? 0, channel: 'sms', content: '', isAd: false, repeat: TRIGGER_DEFAULT_REPEAT[trigger] };
}

// ── 발송 기록·멱등키 (이 기기) ─────────────────────────────────
export interface CampaignSendRecord { key: string; campaignId: string; customerId: string; at: string }
const SENDS_KEY = () => `crm_${getShopId()}_campaign_sends`;
const MAX_SENDS = 50000;

function readSends(): CampaignSendRecord[] {
  try { const raw = localStorage.getItem(SENDS_KEY()); return raw ? JSON.parse(raw) : []; } catch { return []; }
}

/** 성과 추정용 발송 성공 기록(이 기기) (157) */
export function sendsOf(campaignId: string): CampaignSendRecord[] {
  return readSends().filter(s => s.campaignId === campaignId);
}

/** 고객 한 명의 발송 성공 기록(이 기기) — 활동 타임라인 (179) */
export function sendsForCustomer(customerId: string): CampaignSendRecord[] {
  return readSends().filter(s => s.customerId === customerId);
}

export function sentKeysOf(campaignId: string): Set<string> {
  return new Set(readSends().filter(s => s.campaignId === campaignId).map(s => s.key));
}

/** 캠페인별 멱등키 — 기록(최대 5만 건)을 한 번만 파싱해 켜진 캠페인 전부에 (178 리뷰 M-2) */
export function sentKeysByCampaign(): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const s of readSends()) { const set = m.get(s.campaignId); if (set) set.add(s.key); else m.set(s.campaignId, new Set([s.key])); }
  return m;
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
