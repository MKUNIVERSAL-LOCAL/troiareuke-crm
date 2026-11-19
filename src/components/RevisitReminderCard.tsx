import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, Copy, Check, MessageSquare, Share2 } from 'lucide-react';
import { canShareText, shareText } from '../lib/mobileBridge';
import { copyText } from '../lib/clipboard';
import { notify } from '../lib/notify';
import Modal from './ui/Modal';
import { getRevisitDueCustomers, buildReminderMessage, type DueCustomer } from '../lib/reminderEngine';
import { maskPhone } from '../lib/masking';
import { useAuth } from '../contexts/AuthContext';
import { useFeature } from '../hooks/useFeature';

/**
 * 자동 재방문 리마인더 카드 (킬러 기능 ③)
 * - 권장 재방문일이 지난 고객을 산출해 보여준다.
 * - 각 고객별 메시지 초안 생성/복사(실제 자동발송은 NAS 게이트웨이 연동 후).
 */
export default function RevisitReminderCard(props: { compact?: boolean; refreshKey?: number }) {
  // 훅 순서 보존을 위해 게이트를 래퍼로 분리 — 어드민이 끄면 카드 자체를 렌더하지 않는다
  const enabled = useFeature('dashboard.revisitReminder');
  if (!enabled) return null;
  return <RevisitReminderCardInner {...props} />;
}

function RevisitReminderCardInner({ compact = false, refreshKey = 0 }: { compact?: boolean; refreshKey?: number }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  // 대시보드 포커스/가시성 복귀(refreshKey)마다 다시 계산 — 다른 알림 카드와 같은 규칙 (2026-11-18)
  const due = useMemo<DueCustomer[]>(() => getRevisitDueCustomers(0), [refreshKey]);
  const [draftFor, setDraftFor] = useState<DueCustomer | null>(null);
  const [copied, setCopied] = useState(false);

  const list = compact ? due.slice(0, 3) : due.slice(0, 8);

  // 복사·공유가 막혔을 때 버튼이 아무 말 없이 끝나지 않게 — 공용 copyText(구형 WebView 폴백 포함) + 실패 안내 (UX 점검 2026-11-19)
  const copyDraft = async (text: string) => {
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else notify('복사하지 못했습니다. 문구를 직접 선택해 복사하세요.');
  };
  const shareDraft = async (text: string) => {
    if (!(await shareText(text, '재방문 안내'))) notify('공유 창을 열 수 없습니다 — [복사]로 문구를 옮겨 보내주세요.');
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <BellRing size={16} className="text-rose-500" />
          재방문 리마인더
          {due.length > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-rose-100 text-rose-600 rounded-full text-xs font-bold">{due.length}명</span>
          )}
        </h3>
        {due.length > 0 && (
          <button onClick={() => navigate('/messaging?segment=revisit')} className="text-xs text-[#1a3a8f] font-medium hover:underline flex items-center gap-1" title="문자/카카오 발송 화면에서 '재방문 권장' 대상에게 보냅니다">
            <MessageSquare size={12} />단체 발송
          </button>
        )}
      </div>

      {due.length === 0 ? (
        <div className="py-8 text-center">
          <BellRing size={24} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm text-gray-400">재방문 안내가 필요한 고객이 없어요</p>
          <p className="text-xs text-gray-500 mt-1">권장 재방문일이 지나면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {list.map(d => (
            <div key={d.customer.id} className="flex items-center gap-3 py-2.5">
              <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{(d.customer.name || '고')[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {d.customer.name}
                  <span className="ml-1.5 text-xs text-gray-400">{maskPhone(d.customer.phone, user?.role ?? 'staff')}</span>
                </p>
                <p className="text-xs text-gray-400">
                  {d.overdueDays <= 0 ? '오늘 권장일' : `${d.overdueDays}일 지남`}
                  {' · '}
                  {d.basis === 'recommended' ? '권장일 기준' : '방문주기 추정'}
                </p>
              </div>
              <button
                onClick={() => { setDraftFor(d); setCopied(false); }}
                className="text-xs px-2.5 py-1.5 bg-rose-50 text-rose-700 rounded-lg font-medium hover:bg-rose-100 transition-colors flex-shrink-0"
              >
                초안
              </button>
              <button
                onClick={() => navigate(`/reservations?new=1&customer=${encodeURIComponent(d.customer.id)}`)}
                aria-label={`${d.customer.name} 예약 추가`}
                className="text-xs px-2.5 py-1.5 bg-sky-50 text-sky-700 rounded-lg font-medium hover:bg-sky-100 transition-colors flex-shrink-0"
              >
                예약
              </button>
            </div>
          ))}
          {due.length > list.length && (
            <p className="pt-2 text-xs text-gray-400 text-center">외 {due.length - list.length}명 더 있음</p>
          )}
        </div>
      )}

      {/* 메시지 초안 모달 */}
      {draftFor && (
        <Modal isOpen onClose={() => setDraftFor(null)} title={`${draftFor.customer.name}님 재방문 안내 초안`} size="sm">
          <div className="space-y-3">
              <textarea
                readOnly
                value={buildReminderMessage(draftFor.customer)}
                rows={6}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 resize-none focus:outline-none"
              />
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                자동 발송은 지원하지 않습니다. 여러 명에게는 카드의 [단체 발송](문자/카카오 발송 화면)으로, 이 고객에게는 아래에서 초안을 복사하거나 공유해 보내세요.
              </p>
              <div className="flex gap-2">
                {canShareText && (
                  <button
                    onClick={() => shareDraft(buildReminderMessage(draftFor.customer))}
                    className="flex-1 py-2.5 bg-green-700 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-green-800"
                    title="카카오톡·문자 앱으로 바로 보내기"
                  >
                    <Share2 size={14} />보내기
                  </button>
                )}
                <button
                  onClick={() => copyDraft(buildReminderMessage(draftFor.customer))}
                  className="flex-1 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#152f75]"
                >
                  {copied ? <><Check size={14} />복사됨</> : <><Copy size={14} />초안 복사</>}
                </button>
                <button onClick={() => setDraftFor(null)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">닫기</button>
              </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
