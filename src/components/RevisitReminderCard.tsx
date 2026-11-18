import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, Copy, Check, MessageSquare, X, Share2 } from 'lucide-react';
import { canShareText, shareText } from '../lib/mobileBridge';
import { useOverlayClose } from '../lib/overlayStack';
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
  useOverlayClose(!!draftFor, () => setDraftFor(null)); // Android 뒤로가기·Esc
  const [copied, setCopied] = useState(false);

  const list = compact ? due.slice(0, 3) : due.slice(0, 8);

  const copyDraft = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 권한 없을 때는 무시 (사용자가 직접 선택 복사) */
    }
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
          <button onClick={() => navigate('/messaging')} className="text-xs text-[#1a3a8f] font-medium hover:underline flex items-center gap-1">
            <MessageSquare size={12} />단체 발송
          </button>
        )}
      </div>

      {due.length === 0 ? (
        <div className="py-8 text-center">
          <BellRing size={24} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm text-gray-400">재방문 안내가 필요한 고객이 없어요</p>
          <p className="text-xs text-gray-300 mt-1">권장 재방문일이 지나면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {list.map(d => (
            <div key={d.customer.id} className="flex items-center gap-3 py-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-300 to-orange-300 flex items-center justify-center flex-shrink-0">
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
                className="text-xs px-2.5 py-1.5 bg-rose-50 text-rose-600 rounded-lg font-medium hover:bg-rose-100 transition-colors flex-shrink-0"
              >
                초안
              </button>
              <button
                onClick={() => navigate(`/reservations?new=1&customer=${encodeURIComponent(d.customer.id)}${d.overdueDays < 0 ? `&date=${d.dueDate}` : ''}`)}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDraftFor(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{draftFor.customer.name}님 재방문 안내 초안</h2>
              <button onClick={() => setDraftFor(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                readOnly
                value={buildReminderMessage(draftFor.customer)}
                rows={6}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 resize-none focus:outline-none"
              />
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                ⚠️ 자동 발송은 문자/카카오 게이트웨이(회사 NAS 서버) 연동 후 지원됩니다. 현재는 초안을 복사해 직접 발송해주세요.
              </p>
              <div className="flex gap-2">
                {canShareText && (
                  <button
                    onClick={() => shareText(buildReminderMessage(draftFor.customer), '재방문 안내')}
                    className="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-green-600"
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
          </div>
        </div>
      )}
    </div>
  );
}
