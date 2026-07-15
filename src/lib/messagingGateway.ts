/**
 * messagingGateway.ts — 메시지 발송 연동 지점
 *
 * 우선순위:
 *   1. NAS 중앙 서버(VITE_AUTH_API_URL) 설정 시 → POST /api/messages/send
 *      (발송사 키는 서버에만 보관. 서버의 SMS_PROVIDER 미설정 시 pending 정직 반환)
 *   2. localStorage의 게이트웨이 URL/키 (레거시 수동 설정)
 *   3. 둘 다 없으면 { pending: true } — 발송되지 않았음을 기록
 */
import { apiRequest, isAuthApiConfigured } from './authApi';

const GATEWAY_URL_KEY = 'crm_sms_gateway_url';
const GATEWAY_KEY_KEY = 'crm_sms_gateway_key';

export interface SendPayload {
  type: string;
  content: string;
  title?: string;
  /** 표시용 인원수 (phones가 있으면 phones.length가 우선) */
  recipients: number;
  /** 실제 수신자 전화번호 목록 — 없으면 발송 불가 */
  phones?: string[];
}

export interface SendResult {
  sent: number;
  failed: number;
  pending: boolean;
  reason?: string;
}

export async function sendMessages(payload: SendPayload): Promise<SendResult> {
  const phones = (payload.phones || []).map(p => String(p || '').trim()).filter(Boolean);

  // 1. NAS 중앙 서버
  if (isAuthApiConfigured) {
    if (phones.length === 0) {
      return { sent: 0, failed: payload.recipients, pending: false, reason: '수신자 전화번호가 없습니다. 고객 정보에 전화번호를 입력해주세요.' };
    }
    try {
      const result = await apiRequest<SendResult>('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify({ type: payload.type, title: payload.title, content: payload.content, phones }),
      });
      return { sent: result.sent ?? 0, failed: result.failed ?? 0, pending: Boolean(result.pending), reason: result.reason };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { sent: 0, failed: phones.length, pending: false, reason: message };
    }
  }

  // 2. 레거시 수동 게이트웨이
  let gatewayUrl: string | null = null;
  let gatewayKey: string | null = null;
  try {
    gatewayUrl = localStorage.getItem(GATEWAY_URL_KEY);
    gatewayKey = localStorage.getItem(GATEWAY_KEY_KEY);
  } catch {
    // localStorage 접근 불가
  }

  if (!gatewayUrl) {
    return { sent: 0, failed: 0, pending: true, reason: '게이트웨이 미연동' };
  }

  try {
    const res = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(gatewayKey ? { Authorization: `Bearer ${gatewayKey}` } : {}),
      },
      body: JSON.stringify({ ...payload, phones }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      return { sent: 0, failed: payload.recipients, pending: false, reason: `게이트웨이 오류: ${res.status} ${errorText}` };
    }

    const data = (await res.json()) as { sent?: number; failed?: number };
    return {
      sent: data.sent ?? 0,
      failed: data.failed ?? payload.recipients - (data.sent ?? 0),
      pending: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: 0, failed: payload.recipients, pending: false, reason: `네트워크 오류: ${message}` };
  }
}

// ── 예약 발송 (NAS 중앙 서버 전용) ─────────────────────────────
export interface ScheduledMessage {
  id: string;
  send_at: string;
  type: string;
  title?: string | null;
  content: string;
  phones: string[];
  status: 'pending' | 'processing' | 'sent' | 'partial' | 'failed' | 'canceled';
  created_at: string;
}

export const isScheduleAvailable = isAuthApiConfigured;

export async function scheduleMessage(payload: {
  sendAt: string; type: string; title?: string; content: string; phones: string[];
}): Promise<{ id: string }> {
  const result = await apiRequest<{ scheduled: { id: string } }>('/api/messages/schedule', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { id: result.scheduled.id };
}

export async function listScheduledMessages(): Promise<ScheduledMessage[]> {
  const result = await apiRequest<{ scheduled: ScheduledMessage[] }>('/api/messages/scheduled');
  return result.scheduled;
}

export async function cancelScheduledMessage(id: string): Promise<void> {
  await apiRequest<void>(`/api/messages/scheduled/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
