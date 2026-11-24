// CampaignRunModal — 캠페인 실행: 오늘 대상을 보여주고 직원이 승인한 건만 발송 (승인 발송 모드, 156, GAP M-3)
// 발송은 고객마다 본문이 달라 한 명씩 보낸다. 성공한 건만 멱등키로 기록(미연동·실패는 다음 실행에 다시 잡힘).
import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import { notify } from '../../lib/notify';
import { maskPhone } from '../../lib/pii';
import { useAuth } from '../../contexts/AuthContext';
import { MessageHistoryStore } from '../../lib/store';
import { sendMessages } from '../../lib/messagingGateway';
import { smsBytes, SMS_BYTE_LIMIT, MESSAGE_UNIT_COST } from '../../lib/smsBytes';
import { collectRawCandidates } from '../../lib/campaignTriggers';
import { sentKeysOf, markSent } from '../../lib/campaignStore';
import { segmentIdsFor } from '../../lib/savedSegments';
import { selectCandidates, describeTrigger, SKIP_LABELS, type Campaign, type SkipReason } from '../../lib/campaignRule';
import { checkAdSend, decorateAdMessage } from '../../lib/adComplianceRule';
import { getOptOutNumber } from '../../lib/marketingConsent';
import type { MessageType } from '../../types';

const FAIL_STREAK_STOP = 3;

export default function CampaignRunModal({ campaign, onClose, onSent }: { campaign: Campaign; onClose: () => void; onSent: () => void }) {
  const { user } = useAuth();
  const selection = useMemo(() => selectCandidates(campaign, collectRawCandidates(campaign), sentKeysOf(campaign.id), String(new Date().getFullYear()), segmentIdsFor(campaign.segmentId)), [campaign]); // 저장 세그먼트로 좁힘 (167)
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selection.ready.map(r => r.key)));
  const [phase, setPhase] = useState<'review' | 'sending' | 'done'>('review');
  const [result, setResult] = useState<{ sent: number; failed: number; pending: boolean; reason?: string } | null>(null);
  const [progress, setProgress] = useState(0); // 발송 진행 n/N (159 리뷰 M-5)
  const [showSkipped, setShowSkipped] = useState(false); // 제외 고객 목록 펼치기 (176)
  const optOutNumber = getOptOutNumber();
  const adCheck = checkAdSend({ isAd: campaign.isAd, channel: campaign.channel === 'sms' ? 'sms' : 'kakao', now: new Date(), optOutNumber });
  const picked = selection.ready.filter(r => checked.has(r.key));
  const skipSummary = useMemo(() => {
    const m = new Map<SkipReason, number>();
    for (const s of selection.skipped) m.set(s.why, (m.get(s.why) || 0) + 1);
    return [...m.entries()];
  }, [selection]);

  const toggle = (key: string) => setChecked(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const run = async () => {
    if (!adCheck.ok) { notify.error(adCheck.reasons.join(' ')); return; }
    if (picked.length === 0) return;
    setPhase('sending');
    let sent = 0, pending = false, reason: string | undefined, cost = 0, streak = 0;
    const okKeys: { key: string; customerId: string }[] = [];
    const base: MessageType = campaign.channel;
    for (let i = 0; i < picked.length; i++) {
      const r = picked[i];
      setProgress(i + 1);
      const content = campaign.isAd ? decorateAdMessage(r.message, optOutNumber) : r.message;
      const type: MessageType = base === 'sms' && smsBytes(content) > SMS_BYTE_LIMIT ? 'lms' : base;
      const res = await sendMessages({ type, content, recipients: 1, phones: [r.phone] });
      if (res.pending) { pending = true; reason = res.reason; break; } // 미연동은 전부 같다 — 첫 건에서 멈춘다 (159 리뷰 M-5)
      if (res.sent > 0) { sent += 1; streak = 0; cost += type === 'sms' ? MESSAGE_UNIT_COST.sms : type === 'lms' ? MESSAGE_UNIT_COST.lms : MESSAGE_UNIT_COST.kakao; okKeys.push({ key: r.key, customerId: r.customerId }); }
      else { streak += 1; reason = reason || res.reason; if (streak >= FAIL_STREAK_STOP) { reason = `${reason || '발송 실패'} — 연속 ${FAIL_STREAK_STOP}건 실패로 중단`; break; } } // 서버 장애에 N건 전부 타임아웃을 기다리지 않게
    }
    const failed = picked.length - sent; // 시도 못 한 건도 실패로 — 다음 실행에 다시 잡힌다(멱등키 미기록)
    markSent(okKeys.map(k => ({ ...k, campaignId: campaign.id })));
    // 이력은 실행 1건으로(캠페인 이름을 템플릿명 자리에). 성과 추정은 이 이력이 아니라 campaign_sends 발송 기록을 쓴다 (159 리뷰 L-6)
    MessageHistoryStore.save({
      type: base, templateId: `campaign:${campaign.id}`, templateName: `캠페인: ${campaign.name}`,
      content: picked[0] ? (campaign.isAd ? decorateAdMessage(picked[0].message, optOutNumber) : picked[0].message) : campaign.content,
      recipients: picked.length, successCount: sent, failCount: failed, sentAt: new Date().toISOString(),
      status: sent > 0 ? 'sent' : 'failed', cost, // 성공 건의 추정 비용(SMS 11·LMS 25·카카오 5) — 이력 화면의 미연동 판정(cost 0)과 구분 (159 리뷰 L-5)
    });
    setResult({ sent, failed, pending, reason });
    setPhase('done');
    onSent();
  };

  return (
    <Modal isOpen={true} onClose={phase === 'sending' ? () => undefined : onClose} title={`캠페인 실행 — ${campaign.name}`} size="lg">{/* 발송 중에는 닫히지 않는다 — 결과를 못 보는 일이 없게 (159 리뷰 M-5) */}
      {phase === 'done' && result ? (
        <div className="flex flex-col items-center justify-center py-10 text-center" data-testid="campaign-result">
          {result.pending ? <AlertCircle size={44} className="text-amber-600 mb-3" /> : result.sent > 0 ? <CheckCircle size={44} className="text-green-700 mb-3" /> : <AlertCircle size={44} className="text-red-600 mb-3" />}
          <p className="text-base font-bold text-gray-900">{result.pending ? '발송되지 않았습니다 (발송 서버 미연동)' : result.sent > 0 ? `${result.sent}명 발송 성공${result.failed ? `, ${result.failed}명 실패` : ''}` : '발송 실패'}</p>
          <p className="text-sm text-gray-500 mt-1">{result.pending ? `${result.reason || '게이트웨이 미연동'} — 이력에 미발송으로 기록했고, 대상은 다음 실행에 다시 잡힙니다.` : result.reason || `성공한 ${result.sent}명은 같은 회차에 다시 나가지 않습니다.`}</p>
          <button type="button" onClick={onClose} className="mt-6 px-6 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl">닫기</button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-600">{describeTrigger(campaign)} · 오늘 대상 <b data-testid="campaign-ready-count">{selection.ready.length}</b>명{selection.skipped.length ? ` · 제외 ${selection.skipped.length}명` : ''}. 체크한 고객에게만 나갑니다. 성공한 발송은 이 PC 에 기록되어 같은 회차에 다시 잡히지 않습니다(다른 PC 의 발송 기록은 서버 보관 승인 뒤 공유).</p>
          {!adCheck.ok && <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2" data-testid="campaign-ad-block">{adCheck.reasons.join(' ')}</p>}
          {skipSummary.length > 0 && (
            <div className="text-xs text-gray-500">
              <button type="button" onClick={() => setShowSkipped(v => !v)} aria-expanded={showSkipped} className="underline decoration-dotted hover:text-gray-700" data-testid="campaign-skipped-toggle">
                제외: {skipSummary.map(([why, n]) => `${SKIP_LABELS[why]} ${n}명`).join(' · ')} {showSkipped ? '▲ 접기' : '▼ 누가 빠졌는지 보기'}
              </button>
              {showSkipped && (
                <ul className="mt-1.5 max-h-40 overflow-y-auto divide-y divide-gray-50 border border-gray-100 rounded-lg" data-testid="campaign-skipped">
                  {selection.skipped.map(sk => (
                    <li key={`${sk.customerId}:${sk.why}`} className="flex items-center justify-between gap-2 px-3 py-1.5"><span className="text-gray-800">{sk.customerName}</span><span className="text-gray-500">{SKIP_LABELS[sk.why]}</span></li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 border border-gray-100 rounded-xl" data-testid="campaign-candidates">
            {selection.ready.length === 0 && <p className="p-6 text-sm text-gray-500 text-center">오늘 보낼 대상이 없습니다.</p>}
            {selection.ready.map(r => (
              <label key={r.key} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer" data-testid="campaign-candidate">
                <input type="checkbox" checked={checked.has(r.key)} onChange={() => toggle(r.key)} className="rounded mt-1" aria-label={`${r.customerName} 발송`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{r.customerName} <span className="text-xs text-gray-500 font-normal">{maskPhone(r.phone, (user?.role as 'staff' | 'admin' | 'superadmin') ?? 'staff')} · {r.reason}</span></p>
                  <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap">{campaign.isAd ? decorateAdMessage(r.message, optOutNumber || '(080 번호 미등록)') : r.message}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={phase === 'sending'} className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50">닫기</button>
            <button type="button" onClick={run} disabled={phase === 'sending' || picked.length === 0 || !adCheck.ok} className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl disabled:opacity-50 disabled:cursor-not-allowed" data-testid="campaign-approve">
              {phase === 'sending' ? `발송 중… ${progress}/${picked.length}` : `승인하고 ${picked.length}명에게 발송`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
