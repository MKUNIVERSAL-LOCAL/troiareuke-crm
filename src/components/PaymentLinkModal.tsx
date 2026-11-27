/**
 * PaymentLinkModal — 고객에게 보낼 카드/무통장(가상계좌) 결제 요청 링크 생성·관리
 *
 * 결제 자체는 NAS 서버가 호스팅하는 토스페이먼츠 결제 페이지에서 이뤄지고,
 * 완료되면 서버가 이 지점 매출에 자동 기록한다 (앱 재시작/동기화 시 매출 반영).
 * PG 키 미설정이면 서버가 enabled=false를 내려 생성 버튼이 준비 중으로 표시된다.
 */
import { notify } from '../lib/notify';
import { useOverlayClose, useFocusTrap } from '../lib/overlayStack';
import { useState, useEffect, useRef } from 'react';
import { X, Link2, Copy, CheckCircle, MessageSquare, RefreshCw, Ban } from 'lucide-react';
import type { Customer } from '../types';
import { formatPrice, todayISO, localISODate } from '../lib/format';
import { copyText } from '../lib/clipboard';
import { askConfirm } from '../lib/confirmDialog';
import { maskPhone } from '../lib/masking';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchPgConfig, createPaymentRequest, listPaymentRequests, cancelPaymentRequest,
  PAYMENT_STATUS_LABELS, type PaymentRequestRow,
} from '../lib/paymentLinks';
import { sendMessages } from '../lib/messagingGateway';

interface Props {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
}

export default function PaymentLinkModal({ open, onClose, customers }: Props) {
  const { user } = useAuth();
  const [pgEnabled, setPgEnabled] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false); // 서버 연결 실패 — "준비 중(PG 미계약)"과 구분 (실패 경로 감사 2026-11-18)
  const [requests, setRequests] = useState<PaymentRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [smsResult, setSmsResult] = useState('');

  const [form, setForm] = useState({
    customerId: '',
    amount: '',
    orderName: '',
    method: 'both' as 'card' | 'vbank' | 'both',
    memo: '',
  });

  useEffect(() => {
    if (!open) return;
    setCreatedUrl(null);
    setSmsResult('');
    refresh();
  }, [open]);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [config, list] = await Promise.all([fetchPgConfig(), listPaymentRequests()]);
      setPgEnabled(config.enabled);
      setRequests(list.requests);
      setLoadFailed(false);
    } catch {
      if (silent) return; // 조용한 갱신이 한 번 실패해도 마지막 성공 상태를 유지 — 입력 중인 창이 비워지고 잠기지 않게 (리뷰 2026-11-20)
      setPgEnabled(null);
      setRequests([]);
      setLoadFailed(true);
    }
    if (!silent) setLoading(false);
  }
  // 모달을 열어 둔 채 고객이 결제하면 수동 새로고침 전까지 "결제 대기"였다 — 30초마다 조용히 다시 읽는다 (9차 점검 #22)
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => { void refresh(true); }, 30_000);
    return () => clearInterval(t);
  }, [open]);

  useOverlayClose(open, onClose); // Esc·Android 뒤로가기
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, cardRef);
  if (!open) return null;

  const selectedCustomer = customers.find(c => c.id === form.customerId);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseInt(form.amount.replace(/,/g, ''), 10);
    if (Number.isNaN(amount) || amount < 1000) {
      notify('결제 금액을 1,000원 이상으로 입력해주세요.');
      return;
    }
    if (!form.orderName.trim()) {
      notify('결제 내용을 입력해주세요. (예: 아쿠아필 1회)');
      return;
    }
    setBusy(true);
    try {
      const { request } = await createPaymentRequest({
        amount,
        orderName: form.orderName.trim(),
        method: form.method,
        customerId: form.customerId || undefined,
        customerName: selectedCustomer?.name || undefined,
        memo: form.memo.trim() || undefined,
      });
      setCreatedUrl(request.url);
      setSmsResult('');
      setForm(f => ({ ...f, amount: '', orderName: '', memo: '' }));
      refresh();
    } catch (err: any) {
      notify(err?.message || '결제 요청 생성에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(url: string, id: string) {
    // Electron 은 window.prompt 를 지원하지 않아 예전 폴백은 아무 창도 띄우지 않았다 (9차 점검 #17)
    if (!(await copyText(url))) { notify('복사하지 못했습니다. 링크 칸을 길게 눌러 직접 복사하세요.'); return; }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function sendLinkSms(url: string) {
    if (!selectedCustomer?.phone) {
      notify('고객을 선택하면 문자로 바로 보낼 수 있습니다.');
      return;
    }
    setBusy(true);
    const content = `[더마솔루션] ${selectedCustomer.name}님, 결제 요청이 도착했어요.\n아래 링크에서 카드/무통장으로 결제하실 수 있습니다.\n${url}`;
    const result = await sendMessages({ type: 'sms', content, recipients: 1, phones: [selectedCustomer.phone] });
    setBusy(false);
    if (result.pending) setSmsResult(`문자 발송 대기: ${result.reason || '발송사 미설정'}`);
    else if (result.sent > 0) setSmsResult(`✓ ${selectedCustomer.name}님(${maskPhone(selectedCustomer.phone, user?.role ?? 'staff')})에게 문자를 보냈습니다`); // 목록과 같은 마스킹 (리뷰 2026-11-20)
    else setSmsResult(`문자 발송 실패: ${result.reason || '알 수 없는 오류'}`);
  }

  async function handleCancel(r: PaymentRequestRow) {
    if (!(await askConfirm({ title: '결제 요청 취소', message: `${r.orderName} · ${formatPrice(r.amount)} 결제 요청을 취소할까요?\n고객이 링크를 열어도 결제할 수 없게 됩니다.`, confirmLabel: '요청 취소', cancelLabel: '닫기', danger: true }))) return;
    try {
      await cancelPaymentRequest(r.id);
      refresh();
    } catch (e: any) {
      notify(e?.message || '취소에 실패했습니다.');
    }
  }

  return (
    <div className="modal-backdrop fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div ref={cardRef} role="dialog" aria-modal="true" aria-label="결제 요청" className="modal-card bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Link2 size={16} className="text-[#1a3a8f]" />결제 요청 (카드·무통장입금)
          </h2>
          <button onClick={onClose} aria-label="닫기"><X size={18} className="text-gray-400" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loadFailed && (
            <div role="alert" className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 flex-wrap">
              <p className="text-xs text-rose-700 font-medium">결제 서버에 연결하지 못했습니다 — 연결을 확인한 뒤 다시 불러오세요.</p>
              <button type="button" onClick={() => { void refresh(); }} className="ml-auto text-xs underline text-rose-700">다시 불러오기</button>
            </div>
          )}
          {pgEnabled === false && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs text-amber-700 font-medium">온라인 결제 준비 중입니다</p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                본사에서 토스페이먼츠 가맹 계약을 완료하면 자동으로 활성화됩니다.
                활성화되면 여기서 만든 링크로 고객이 카드·무통장입금 결제를 할 수 있습니다.
              </p>
            </div>
          )}

          {/* 생성 폼 */}
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">고객 (선택)</label>
              <select aria-label="고객 (선택)"
                value={form.customerId}
                onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                <option value="">고객 선택 — 선택하면 문자 발송 가능</option>
                {customers.filter(c => c.isActive !== false).map(c => ( /* 익명화(탈퇴) 고객 제외 */
                  <option key={c.id} value={c.id}>{c.name} ({maskPhone(c.phone, user?.role ?? 'staff')})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">금액 *</label>
                <div className="relative">
                  <input aria-label="금액"
                    required
                    type="text"
                    value={form.amount && !Number.isNaN(parseInt(form.amount, 10)) ? parseInt(form.amount, 10).toLocaleString('ko-KR') : ''}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/,/g, '') }))}
                    className="w-full pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">원</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">결제 수단</label>
                <select aria-label="결제 수단"
                  value={form.method}
                  onChange={e => setForm(f => ({ ...f, method: e.target.value as typeof form.method }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                >
                  <option value="both">카드 + 무통장입금</option>
                  <option value="card">카드만</option>
                  <option value="vbank">무통장입금(가상계좌)만</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">결제 내용 *</label>
              <input aria-label="결제 내용"
                required
                value={form.orderName}
                onChange={e => setForm(f => ({ ...f, orderName: e.target.value }))}
                placeholder="예: 아쿠아필 1회, 수분관리 10회권"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">메모 (선택)</label>
              <input aria-label="메모 (선택)"
                value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="매출 기록 메모에 함께 남습니다"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
            <button
              type="submit"
              disabled={busy || pgEnabled !== true}
              className="w-full py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Link2 size={14} />{pgEnabled === false ? '결제 링크 생성 (준비 중)' : busy ? '생성 중...' : '결제 링크 만들기'}
            </button>
          </form>

          {/* 생성 결과 */}
          {createdUrl && (
            <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
              <p className="text-xs font-bold text-blue-700">✓ 결제 링크를 만들었습니다</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={createdUrl}
                  onFocus={e => e.currentTarget.select()}
                  className="flex-1 px-2.5 py-2 bg-white border border-blue-200 rounded-lg text-xs text-gray-600 outline-none"
                />
                <button
                  onClick={() => copyLink(createdUrl, 'new')}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium flex items-center gap-1"
                >
                  {copiedId === 'new' ? <CheckCircle size={12} /> : <Copy size={12} />}
                  {copiedId === 'new' ? '복사됨' : '복사'}
                </button>
                {selectedCustomer?.phone && (
                  <button
                    onClick={() => sendLinkSms(createdUrl)}
                    disabled={busy}
                    className="px-3 py-2 bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    <MessageSquare size={12} />문자
                  </button>
                )}
              </div>
              {smsResult && <p className={`text-xs ${smsResult.startsWith('문자 발송 실패') ? 'text-rose-700' : 'text-primary-600'}`}>{smsResult}</p>}
              <p className="text-xs text-blue-700">
                카톡·문자로 링크를 보내면 고객이 휴대폰에서 바로 결제할 수 있습니다. 결제 완료 시 매출에 자동 기록됩니다.
              </p>
            </div>
          )}

          {/* 요청 목록 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-600">최근 결제 요청</p>
              <button onClick={() => { void refresh(); }} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />새로고침
              </button>
            </div>
            {requests.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">아직 결제 요청이 없어요</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {requests.map(r => {
                  const status = PAYMENT_STATUS_LABELS[r.status] || PAYMENT_STATUS_LABELS.pending;
                  return (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-2 border border-gray-100 rounded-xl text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-medium text-2xs whitespace-nowrap ${
                        status.tone === 'ok' ? 'bg-emerald-50 text-emerald-700'
                          : status.tone === 'bad' ? 'bg-gray-100 text-gray-600'
                          : 'bg-amber-50 text-amber-700'
                      }`}>{status.label}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">
                          {r.customerName ? `${r.customerName} · ` : ''}{r.orderName}
                        </p>
                        <p className="text-2xs text-gray-400">{localISODate(r.createdAt)}{r.paidAt ? ` → 결제 ${localISODate(r.paidAt)}` : ''}</p>
                      </div>
                      <span className="font-bold text-gray-900 whitespace-nowrap">{formatPrice(r.amount)}</span>
                      {(r.status === 'pending' || r.status === 'vbank_wait') && (
                        <>
                          <button onClick={() => copyLink(r.url, r.id)} className="p-1 text-gray-400 hover:text-[#1a3a8f]" aria-label="링크 복사">
                            {copiedId === r.id ? <CheckCircle size={13} className="text-emerald-700" /> : <Copy size={13} />}
                          </button>
                          <button onClick={() => handleCancel(r)} className="p-1 text-gray-400 hover:text-red-700" aria-label="요청 취소">
                            <Ban size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-2xs text-gray-500 mt-2">
              결제 완료된 건은 매출 관리에 자동 기록됩니다 (프로그램 재시작 또는 다음 동기화 때 목록에 반영). 오늘 날짜 기준: {todayISO()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
