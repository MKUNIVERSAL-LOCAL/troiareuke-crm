// BookingRequestsModal — 예약 요청함: 전화·카톡·네이버 요청 접수 + 처리 전 목록 → 예약으로 등록 / 거절 (비코어, 143·144, GAP R-6·R-10)
import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import Modal from './ui/Modal';
import { notify } from '../lib/notify';
import { askConfirm } from '../lib/confirmDialog';
import { ServiceStore } from '../lib/store';
import { todayISO, formatPhoneInput } from '../lib/format';
import { isISODate } from '../lib/inputRules';
import { maskPhone } from '../lib/masking';
import { useAuth } from '../contexts/AuthContext';
import { bookingRequests, newRequests, rejectRequest, findCustomerByPhone, CHANNEL_LABEL } from '../lib/bookingRequests';
import type { BookingRequest, BookingChannel } from '../types';

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const INPUT = 'w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300';

export default function BookingRequestsModal({ onClose, onRegister }: { onClose: () => void; onRegister: (req: BookingRequest) => void }) {
  const { user } = useAuth();
  const maskRole = user?.role ?? 'staff'; // 요청 목록의 전화번호도 고객 목록과 같은 규칙으로 가린다 (144 리뷰 M-4)
  const services = ServiceStore.getAll().filter(s => s.isActive);
  const [list, setList] = useState<BookingRequest[]>([]);
  const [channel, setChannel] = useState<BookingChannel>('phone');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0].id : '');
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState('10:00');
  const [memo, setMemo] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => setList(await newRequests());
  useEffect(() => { void reload(); }, []);

  const submit = async () => {
    const service = services.find(s => s.id === serviceId);
    const missing = [!customerName.trim() && '이름', !phone.trim() && '전화번호', !service && '시술', !isISODate(date) && '날짜'].filter(Boolean).join(', ');
    if (missing) { setError(`${missing}을(를) 입력해주세요.`); return; }
    const known = findCustomerByPhone(phone);
    if (!known && !consent) { setError('처음 오는 고객은 개인정보 수집·이용 동의를 받은 뒤 접수해주세요.'); return; }
    setError('');
    setBusy(true);
    try {
      await bookingRequests.add({ channel, customerName: customerName.trim(), phone: phone.trim(), serviceId: service!.id, serviceName: service!.name, durationMin: service!.duration, date, startTime, memo: memo.trim() || undefined, privacyConsent: known ? (known.privacyConsent ?? false) : consent });
      await reload();
      setCustomerName(''); setPhone(''); setMemo(''); setConsent(false);
      notify.success('요청을 접수했습니다. 확인 뒤 [예약으로 등록]을 누르세요.');
    } catch {
      notify.error('요청을 저장하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };

  const reject = async (req: BookingRequest) => {
    if (!(await askConfirm({ title: '요청 거절', confirmLabel: '거절', cancelLabel: '닫기', message: `${req.customerName} 고객의 ${req.date} ${req.startTime} ${req.serviceName} 요청을 거절할까요? 고객에게는 직접 연락해주세요. 거절한 요청의 이름·전화는 7일 뒤 지워집니다.` }))) return;
    try {
      await rejectRequest(req.id);
      await reload();
      notify.info('요청을 거절로 처리했습니다.');
    } catch {
      notify.error('요청을 처리하지 못했습니다. 다시 시도해주세요.');
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="예약 요청함" size="md">
      <div className="space-y-5">
        <div className="space-y-3" data-testid="booking-request-form">
          <p className="text-xs text-gray-500">전화·카톡·네이버로 받은 예약 요청을 바로 못 잡을 때 적어 둡니다. [예약으로 등록]을 누르면 예약 폼이 요청 내용으로 채워지고, 담당자·베드·겹침은 거기서 확인합니다.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">채널</label>
              <select aria-label="요청 채널" value={channel} onChange={e => setChannel(e.target.value as BookingChannel)} className={INPUT}>
                {(Object.keys(CHANNEL_LABEL) as BookingChannel[]).map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">시술 *</label>
              <select aria-label="요청 시술" value={serviceId} onChange={e => setServiceId(e.target.value)} className={INPUT}>
                <option value="">시술 선택</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.duration}분)</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">이름 *</label>
              <input type="text" aria-label="요청 고객 이름" value={customerName} onChange={e => setCustomerName(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">전화번호 *</label>
              <input type="tel" aria-label="요청 전화번호" placeholder="010-0000-0000" value={phone} onChange={e => setPhone(formatPhoneInput(e.target.value))} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">날짜 *</label>
              <input type="date" aria-label="요청 날짜" value={date} min={todayISO()} onChange={e => setDate(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">희망 시간</label>
              <select aria-label="요청 시간" value={startTime} onChange={e => setStartTime(e.target.value)} className={INPUT}>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">메모</label>
            <input type="text" aria-label="요청 메모" placeholder="예: 창가 베드 희망, 오후만 가능" value={memo} onChange={e => setMemo(e.target.value)} maxLength={300} className={INPUT} />
          </div>
          <label className="flex items-start gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="rounded mt-0.5" aria-label="개인정보 수집·이용 동의 받음" />
            <span>개인정보 수집·이용 동의를 받았습니다 (처음 오는 고객은 필수 — 예약으로 등록할 때 고객으로 함께 등록됩니다)</span>
          </label>
          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
          <button type="button" onClick={() => void submit()} disabled={busy} className="w-full py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#15306e] disabled:opacity-60">{busy ? '접수 중…' : '요청 접수'}</button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5"><Inbox size={14} /> 처리 전 요청 {list.length > 0 && <span className="text-[#1a3a8f]">{list.length}건</span>}</p>
          {list.length === 0 ? (
            <p className="text-sm text-gray-500">처리 전 요청이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
              {list.map(req => (
                <li key={req.id} data-testid="booking-request-item" className="px-3 py-2.5 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{req.customerName}</span>
                    <span className="text-xs text-gray-500">{maskPhone(req.phone, maskRole)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{CHANNEL_LABEL[req.channel]}</span>
                    {!findCustomerByPhone(req.phone) && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">신규 고객</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{req.date} {req.startTime} · {req.serviceName}{req.memo ? ` · ${req.memo}` : ''}</p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => onRegister(req)} className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a3a8f] rounded-lg hover:bg-[#15306e]">예약으로 등록</button>
                    <button type="button" onClick={() => void reject(req)} className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100">거절</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
