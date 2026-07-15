/**
 * messagingGateway.ts — 메시지 발송 연동 지점
 *
 * NAS 백엔드 준비 시 이 함수 내부만 실제 SMS/알림톡 API fetch로 교체하면 됩니다.
 * 현재는 localStorage에 저장된 게이트웨이 URL/키가 있으면 fetch 시도,
 * 없으면 { sent: 0, failed: 0, pending: true, reason: '게이트웨이 미연동' }을 반환합니다.
 *
 * 교체 포인트:
 *   1. GATEWAY_URL_KEY / GATEWAY_KEY_KEY에 저장된 URL·키가 있을 때 → 실제 fetch 호출
 *   2. 없을 때 → pending 반환 (현재 상태)
 */

const GATEWAY_URL_KEY = 'crm_sms_gateway_url';
const GATEWAY_KEY_KEY = 'crm_sms_gateway_key';

export interface SendPayload {
  type: string;
  content: string;
  title?: string;
  recipients: number;
}

export interface SendResult {
  sent: number;
  failed: number;
  pending: boolean;
  reason?: string;
}

export async function sendMessages(payload: SendPayload): Promise<SendResult> {
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

  // 게이트웨이 URL이 설정된 경우 실제 fetch 시도
  // NAS 백엔드 준비 후 이 블록 내부를 실제 API 스펙에 맞게 교체하세요.
  try {
    const res = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(gatewayKey ? { Authorization: `Bearer ${gatewayKey}` } : {}),
      },
      body: JSON.stringify(payload),
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
