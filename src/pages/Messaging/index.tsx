import { useState, useEffect, useCallback, useMemo } from 'react';
import { notify } from '../../lib/notify';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, Send, Users, FileText, CheckCircle, AlertCircle, Clock, Plus, Trash2, HelpCircle, Pencil, Search, Share2 } from 'lucide-react';
import { canShareText, shareText } from '../../lib/mobileBridge';
import Header from '../../components/layout/Header';
import Modal from '../../components/ui/Modal';
import { MessageTemplateStore, MessageHistoryStore, CustomerStore, SettingsStore } from '../../lib/store';
import {
  sendMessages, scheduleMessage, listScheduledMessages, cancelScheduledMessage,
  isScheduleAvailable, type ScheduledMessage,
} from '../../lib/messagingGateway';
import type { MessageType, MessageTemplate, MessageHistory, Customer } from '../../types';
import { topTags } from '../../lib/customerTags';
import { isAuthApiConfigured } from '../../lib/authApi';
import clsx from 'clsx';

type Tab = 'send' | 'templates' | 'history';
type Segment = 'all' | 'vip' | 'birthday' | 'novisit' | `tag:${string}`; // tag:<태그명> — 고객 태그 세그먼트 (2026-11-18)

// ── 수신 대상 세그먼트 필터 (빠른발송 카드와 발송 모달이 공유) ──────────
const SEGMENT_LABELS: Record<string, string> = {
  all: '전체',
  vip: 'VIP',
  birthday: '이번달 생일',
  novisit: '미방문 60일+',
};
function segmentLabel(seg: Segment): string {
  return seg.startsWith('tag:') ? `#${seg.slice(4)}` : (SEGMENT_LABELS[seg] ?? seg);
}
/** 세그먼트 → 고객 필터. 태그 세그먼트는 tags 포함 여부 */
function segmentFilter(seg: Segment): (c: Customer) => boolean {
  if (seg.startsWith('tag:')) { const tag = seg.slice(4); return c => (c.tags || []).includes(tag); }
  return SEGMENT_FILTERS[seg] ?? (() => false); // 모르는 세그먼트는 '아무에게도' — 전체 발송 사고 방지
}

const SEGMENT_FILTERS: Record<string, (c: Customer) => boolean> = {
  all: () => true,
  vip: c => c.grade === 'VIP',
  birthday: c => {
    if (!c.birthDate) return false;
    return new Date(c.birthDate).getMonth() === new Date().getMonth();
  },
  novisit: c => {
    if (!c.lastVisitDate) return false;
    return Date.now() - new Date(c.lastVisitDate).getTime() > 60 * 86400000;
  },
};

/** 실발송 경로(NAS 서버 또는 레거시 게이트웨이)가 하나라도 살아있는가 */
function isMessagingLive(): boolean {
  if (isAuthApiConfigured) return true;
  try { return Boolean(localStorage.getItem('crm_sms_gateway_url')); } catch { return false; }
}

const MSG_TYPE_LABELS: Record<string, string> = {
  sms: 'SMS',
  lms: 'LMS',
  mms: 'MMS',
  'kakao-channel': '카카오 채널',
  'kakao-openchat': '카카오 오픈채팅',
};

const MSG_TYPE_COLORS: Record<string, string> = {
  sms: 'bg-blue-100 text-blue-700',
  lms: 'bg-blue-100 text-blue-700',
  mms: 'bg-blue-100 text-blue-700',
  'kakao-channel': 'bg-yellow-100 text-yellow-700',
  'kakao-openchat': 'bg-yellow-100 text-yellow-700',
};

export default function Messaging() {
  const [tab, setTab] = useState<Tab>('send');
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendSegment, setSendSegment] = useState<Segment>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  // 고객 상세 [메시지](?customer=<id>) → 그 고객 한 명에게 보내는 발송 모달 (1회 캡처 후 URL 비움, 2026-11-18)
  const [sendCustomerId, setSendCustomerId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('customer');
    if (!id) return;
    setSendCustomerId(id);
    setSendSegment('all');
    setShowSendModal(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  const settings = SettingsStore.get();
  const messagingLive = isMessagingLive();

  const openSendModal = (segment: Segment = 'all') => {
    setSendSegment(segment);
    setShowSendModal(true);
  };

  const tabs = [
    { key: 'send' as Tab, label: '발송하기', icon: <Send size={14} /> },
    { key: 'templates' as Tab, label: '템플릿 관리', icon: <FileText size={14} /> },
    { key: 'history' as Tab, label: '발송 이력', icon: <Clock size={14} /> },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="문자/카카오 발송"
        subtitle="SMS · LMS · 카카오 채널 · 오픈채팅"
        action={{ label: '메시지 보내기', onClick: () => openSendModal('all') }}
      />

      <div className="p-4 sm:p-6 lg:p-8 flex-1">
        {/* 실발송 경로 미연동 안내 */}
        {!messagingLive && (
          <div className="flex items-start gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              실제 문자/카카오 발송은 발송사 연동 후 지원됩니다. 지금 발송을 시도하면
              발송되지 않고 이력에 '미연동'으로만 기록됩니다.
            </span>
          </div>
        )}

        {/* Connection Status — 실제 발송 경로 기준 (설정값 장식 아님) */}
        <div className="flex gap-3 mb-6 overflow-x-auto no-scrollbar pr-6">
          <StatusChip label="발송 서버" connected={messagingLive} />
          <StatusChip label="카카오 채널" connected={!!settings.kakao?.channelConnected} />
          <StatusChip label="카카오 오픈채팅" connected={!!settings.kakao?.openchatConnected} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit max-w-full overflow-x-auto no-scrollbar pr-6 mb-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'flex-shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'send' && <SendPanel onSend={openSendModal} reloadKey={reloadKey} />}
        {tab === 'templates' && <TemplatesPanel onSelect={(id) => { setSelectedTemplate(id); setShowSendModal(true); }} reloadKey={reloadKey} onReload={reload} />}
        {tab === 'history' && <HistoryPanel reloadKey={reloadKey} />}
      </div>

      {showSendModal && (
        <SendMessageModal
          onClose={() => { setShowSendModal(false); setSelectedTemplate(null); setSendCustomerId(null); }}
          initialTemplate={selectedTemplate}
          initialSegment={sendSegment}
          initialCustomerId={sendCustomerId}
          onSent={reload}
        />
      )}
    </div>
  );
}

function StatusChip({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className={clsx(
      'flex-shrink-0 whitespace-nowrap flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium',
      connected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'
    )}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', connected ? 'bg-green-500' : 'bg-gray-300')}></span>
      {label}
      {connected ? ' 연결됨' : ' 미연결'}
    </div>
  );
}

function SendPanel({ onSend, reloadKey }: { onSend: (segment: Segment) => void; reloadKey: number }) {
  const [customers, setCustomers] = useState(() => CustomerStore.getAll().filter(c => c.isActive !== false)); // 익명화 고객 제외
  const [settings, setSettings] = useState(SettingsStore.get());

  useEffect(() => {
    setCustomers(CustomerStore.getAll().filter(c => c.isActive !== false));
    setSettings(SettingsStore.get());
  }, [reloadKey]);

  const autoMessages = [
    // 설명은 설정 > 알림 설정과 같은 문구 (UX QA 2026-11-17)
    { title: '예약 확인 문자', desc: '예약 등록 시 즉시 발송', type: 'sms', key: 'reservationConfirm' as const },
    { title: '예약 리마인더', desc: '예약 전날 오전 9시 발송', type: 'sms', key: 'reservationReminder' as const },
    { title: '생일 축하 메시지', desc: '생일 당일 오전 10시 카카오 발송', type: 'kakao-channel', key: 'birthdayMessage' as const },
    { title: '미방문 고객 케어', desc: '60일 미방문 시 카카오 발송', type: 'kakao-channel', key: 'novisitMessage' as const },
  ];

  const birthdayCount = customers.filter(c => {
    if (!c.birthDate) return false;
    const now = new Date();
    const bd = new Date(c.birthDate);
    return bd.getMonth() === now.getMonth();
  }).length;

  return (
    <div className="space-y-6">
      {/* Quick Send Targets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { key: 'all' as Segment, label: '전체 고객', count: customers.length, color: 'primary' },
          { key: 'vip' as Segment, label: 'VIP 고객', count: customers.filter(SEGMENT_FILTERS.vip).length, color: 'yellow' },
          { key: 'birthday' as Segment, label: '이번달 생일', count: birthdayCount, color: 'pink' },
          { key: 'novisit' as Segment, label: '미방문 60일+', count: customers.filter(SEGMENT_FILTERS.novisit).length, color: 'orange' },
          ...topTags(customers, 4).map(t => ({ key: `tag:${t.tag}` as Segment, label: `#${t.tag}`, count: t.count, color: 'amber' })),
        ].map(t => (
          <button
            key={t.key}
            onClick={() => onSend(t.key)}
            className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all text-left hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-3">
              <Users size={20} className="text-gray-400" />
              <span className={clsx(
                'text-xs font-bold px-2 py-0.5 rounded-full',
                t.color === 'primary' && 'bg-primary-100 text-primary-700',
                t.color === 'yellow' && 'bg-yellow-100 text-yellow-700',
                t.color === 'pink' && 'bg-pink-100 text-pink-700',
                t.color === 'orange' && 'bg-orange-100 text-orange-700',
                t.color === 'amber' && 'bg-amber-100 text-amber-700',
              )}>
                {t.count}명
              </span>
            </div>
            <p className="text-sm font-bold text-gray-900">{t.label}</p>
            <p className="text-xs text-primary-500 mt-1 font-medium">메시지 발송 →</p>
          </button>
        ))}
      </div>

      {/* Auto Messages */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">자동 발송 설정</h3>
          <p className="text-xs text-gray-400 mt-0.5">조건에 따라 자동으로 발송되는 메시지를 관리합니다</p>
        </div>
        <div className="divide-y divide-gray-50">
          {autoMessages.map((m, i) => (
            <div key={i} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <MessageSquare size={16} className="text-gray-400" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{m.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-400">{m.desc}</p>
                    <span className={clsx('px-1.5 py-0.5 rounded text-xs font-medium', MSG_TYPE_COLORS[m.type])}>
                      {MSG_TYPE_LABELS[m.type]}
                    </span>
                  </div>
                  <p className="text-xs text-amber-600 mt-0.5">(자동 발송 준비 중 — 현재는 수동 발송만 동작)</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-not-allowed opacity-50">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  disabled
                  readOnly
                  checked={settings.notificationSettings[m.key]}
                />
                <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplatesPanel({ onSelect, reloadKey, onReload }: { onSelect: (id: string) => void; reloadKey: number; onReload: () => void }) {
  const categories = ['전체', '예약', '이벤트', '리텐션', '케어'];
  const [cat, setCat] = useState('전체');
  const [templates, setTemplates] = useState<MessageTemplate[]>(MessageTemplateStore.getAll());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setTemplates(MessageTemplateStore.getAll());
  }, [reloadKey]);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = templates.filter(template => {
    const categoryMatches = cat === '전체' || template.category === cat;
    const searchMatches = !normalizedSearch || [
      template.name,
      template.title || '',
      template.content,
      template.category,
      MSG_TYPE_LABELS[template.type] || template.type,
    ].some(value => value.toLowerCase().includes(normalizedSearch));
    return categoryMatches && searchMatches;
  });

  const handleDelete = (id: string) => {
    const target = templates.find(t => t.id === id);
    if (!window.confirm(`'${target?.name ?? '이 템플릿'}' 템플릿을 삭제하시겠습니까?`)) return;
    MessageTemplateStore.delete(id);
    setTemplates(MessageTemplateStore.getAll());
    onReload();
  };

  const handleSaved = () => {
    setShowAddModal(false);
    setEditing(null);
    setTemplates(MessageTemplateStore.getAll());
    onReload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <label className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="템플릿명, 제목, 내용 검색"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
            aria-label="메시지 템플릿 검색"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar pr-6">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={clsx(
              'px-3 py-1.5 text-sm font-medium rounded-lg border transition-all',
              cat === c ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'
            )}
          >
            {c}
          </button>
        ))}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="lg:ml-auto flex items-center justify-center gap-1 px-3 py-2.5 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg border border-primary-200 hover:bg-primary-100 whitespace-nowrap"
        >
          <Plus size={14} /> 템플릿 추가
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.length === 0 && (
          <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 py-14 text-center">
            <FileText size={34} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">조건에 맞는 템플릿이 없어요</p>
          </div>
        )}
        {filtered.map(t => (
          <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">{t.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', MSG_TYPE_COLORS[t.type])}>
                    {MSG_TYPE_LABELS[t.type]}
                  </span>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{t.category}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(t)}
                  className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  title="수정"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="삭제"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={() => onSelect(t.id)}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors"
                >
                  발송
                </button>
              </div>
            </div>
            <div className="px-5 py-3">
              {t.title && <p className="text-xs font-semibold text-gray-700 mb-1">{t.title}</p>}
              <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">{t.content}</p>
              {t.variables.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {t.variables.map(v => (
                    <span key={v} className="px-1.5 py-0.5 bg-primary-50 text-primary-500 rounded text-xs">{'{' + v + '}'}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && <TemplateModal onClose={() => setShowAddModal(false)} onSaved={handleSaved} />}
      {editing && <TemplateModal editing={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}
    </div>
  );
}

function TemplateModal({ editing, onClose, onSaved }: { editing?: MessageTemplate; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!editing;
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<MessageTemplate['type']>(editing?.type ?? 'sms');
  const [category, setCategory] = useState(editing?.category ?? '예약');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [content, setContent] = useState(editing?.content ?? '');
  const [variablesStr, setVariablesStr] = useState((editing?.variables ?? []).join(', '));

  const handleSave = () => {
    if (!name.trim() || !content.trim()) return;
    const variables = variablesStr
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
    const payload = {
      name: name.trim(),
      type,
      category,
      title: title.trim() || undefined,
      content: content.trim(),
      variables,
    };
    if (isEdit && editing) {
      MessageTemplateStore.update(editing.id, payload);
    } else {
      MessageTemplateStore.save(payload);
    }
    onSaved();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={isEdit ? '템플릿 수정' : '템플릿 추가'} size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">템플릿 이름 *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            placeholder="예: 예약 확인 메시지"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">발송 채널</label>
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'sms' as const, label: 'SMS' },
              { key: 'lms' as const, label: 'LMS' },
              { key: 'kakao-channel' as const, label: '카카오 채널' },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setType(t.key)}
                className={clsx(
                  'px-3 py-2 text-sm font-medium rounded-xl border transition-all',
                  type === t.key
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">카테고리</label>
          <div className="flex gap-2 flex-wrap">
            {['예약', '이벤트', '리텐션', '케어'].map(c => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={clsx(
                  'px-3 py-2 text-sm font-medium rounded-xl border transition-all',
                  category === c
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {(type === 'kakao-channel' || type === 'lms' || type === 'mms') && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">제목 (카카오·LMS·MMS)</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
              placeholder="예: [우리샵] 예약 안내"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">메시지 내용 *</label>
          <textarea
            rows={5}
            value={content}
            onChange={e => setContent(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
            placeholder="메시지 내용을 입력하세요"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">변수 (쉼표로 구분)</label>
          <input
            type="text"
            value={variablesStr}
            onChange={e => setVariablesStr(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
            placeholder="예: 고객명, 날짜, 시간"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">취소</button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !content.trim()}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isEdit ? <><Pencil size={14} /> 저장</> : <><Plus size={14} /> 템플릿 추가</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const SCHEDULE_STATUS_LABELS: Record<ScheduledMessage['status'], { label: string; color: string }> = {
  pending: { label: '대기', color: 'bg-blue-100 text-blue-600' },
  processing: { label: '발송 중', color: 'bg-primary-100 text-primary-600' },
  sent: { label: '발송 완료', color: 'bg-green-100 text-green-600' },
  partial: { label: '일부 실패', color: 'bg-amber-100 text-amber-600' },
  failed: { label: '실패', color: 'bg-red-100 text-red-600' },
  canceled: { label: '취소됨', color: 'bg-gray-100 text-gray-500' },
};

function ScheduledMessagesCard({ reloadKey }: { reloadKey: number }) {
  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [visible, setVisible] = useState(false);

  const refresh = useCallback(() => {
    if (!isScheduleAvailable) return;
    listScheduledMessages()
      .then(list => { setItems(list); setVisible(list.length > 0); })
      .catch(() => setVisible(false));
  }, []);

  useEffect(() => { refresh(); }, [reloadKey, refresh]);

  const handleCancel = async (id: string) => {
    if (!confirm('이 발송 예약을 취소할까요?')) return;
    try {
      await cancelScheduledMessage(id);
      refresh();
    } catch (e: any) {
      notify(e?.message || '예약 취소에 실패했습니다.');
    }
  };

  if (!isScheduleAvailable || !visible) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">예약된 발송</p>
        <p className="text-xs text-gray-400">{items.filter(i => i.status === 'pending').length}건 대기</p>
      </div>
      <div className="divide-y divide-gray-50">
        {items.map(item => {
          const badge = SCHEDULE_STATUS_LABELS[item.status] || SCHEDULE_STATUS_LABELS.pending;
          return (
            <div key={item.id} className="px-6 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', badge.color)}>{badge.label}</span>
                  <span className="text-xs text-gray-500">{new Date(item.send_at).toLocaleString()}</span>
                  <span className="text-xs text-gray-400">{item.phones.length}명</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 truncate">{item.title ? `[${item.title}] ` : ''}{item.content}</p>
              </div>
              {item.status === 'pending' && (
                <button
                  onClick={() => handleCancel(item.id)}
                  className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg border border-red-100 shrink-0"
                >
                  취소
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 신규 이력은 ISO 저장, 기존 이력은 toLocaleString 문자열이라 파싱 실패 시 원문 유지
function formatSentAt(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleString();
}

function HistoryPanel({ reloadKey }: { reloadKey: number }) {
  const [history, setHistory] = useState<MessageHistory[]>(MessageHistoryStore.getAll());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');

  useEffect(() => {
    setHistory(MessageHistoryStore.getAll());
  }, [reloadKey]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredHistory = history.filter(item => {
    const statusMatches = statusFilter === 'all' || item.status === statusFilter;
    const searchMatches = !normalizedSearch || [
      item.templateName || '직접 작성',
      item.content,
      formatSentAt(item.sentAt),
      MSG_TYPE_LABELS[item.type] || item.type,
    ].some(value => value.toLowerCase().includes(normalizedSearch));
    return statusMatches && searchMatches;
  });

  if (history.length === 0) {
    return (
      <div>
        <ScheduledMessagesCard reloadKey={reloadKey} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">발송 이력</p>
            <p className="text-xs text-gray-400">전체 발송 이력</p>
          </div>
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Clock size={40} className="mb-3 text-gray-300" />
            <p className="text-sm font-medium">발송 이력이 없습니다</p>
            <p className="text-xs mt-1">메시지를 발송하면 이곳에 이력이 표시됩니다</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
    <ScheduledMessagesCard reloadKey={reloadKey} />
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">발송 이력</p>
        <p className="text-xs text-gray-400">전체 발송 이력</p>
      </div>
      <div className="p-3 border-b border-gray-100 flex flex-col sm:flex-row gap-2 sm:items-center">
        <label className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="템플릿명, 내용, 발송일 검색"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
            aria-label="발송 이력 검색"
          />
        </label>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | 'sent' | 'failed')}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
          aria-label="발송 상태 필터"
        >
          <option value="all">전체 상태</option>
          <option value="sent">성공</option>
          <option value="failed">실패·미연동</option>
        </select>
      </div>
      <div className="divide-y divide-gray-50 overflow-y-auto max-h-[65vh]">
        {filteredHistory.length === 0 && (
          <div className="py-14 text-center text-sm text-gray-400">조건에 맞는 발송 이력이 없어요</div>
        )}
        {filteredHistory.map(h => {
          const isGatewayPending = h.status === 'failed' && h.successCount === 0 && (h.cost === 0 || h.cost === undefined);
          return (
            <div key={h.id} className="px-6 py-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={clsx(
                    'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
                    h.status === 'sent' ? 'bg-green-100' : isGatewayPending ? 'bg-amber-100' : 'bg-red-100'
                  )}>
                    {h.status === 'sent'
                      ? <CheckCircle size={16} className="text-green-600" />
                      : isGatewayPending
                        ? <AlertCircle size={16} className="text-amber-500" />
                        : <AlertCircle size={16} className="text-red-500" />
                    }
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{h.templateName || '직접 작성'}</p>
                      <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', MSG_TYPE_COLORS[h.type])}>
                        {MSG_TYPE_LABELS[h.type]}
                      </span>
                      {isGatewayPending && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">미연동</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{formatSentAt(h.sentAt)}</p>
                    {isGatewayPending && (
                      <p className="text-xs text-amber-600 mt-0.5">게이트웨이 미연동 — 실제 발송 안 됨</p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-800">{h.recipients}명 대상</p>
                  {h.status === 'sent'
                    ? <p className="text-xs text-green-500">성공 {h.successCount}명</p>
                    : isGatewayPending
                      ? <p className="text-xs text-amber-500">미발송 (미연동)</p>
                      : <p className="text-xs text-red-400">실패 {h.failCount}명</p>
                  }
                  {h.status === 'sent' && h.failCount > 0 && <p className="text-xs text-red-400">실패 {h.failCount}명</p>}
                  {h.status === 'sent' && h.cost !== undefined && h.cost > 0 && (
                    <p className="text-xs text-gray-400 mt-1">예상 비용 {h.cost.toLocaleString()}원</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2 ml-11 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">{h.content}</p>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}

function SendMessageModal({ onClose, initialTemplate, initialSegment, initialCustomerId, onSent }: { onClose: () => void; initialTemplate: string | null; initialSegment?: Segment; initialCustomerId?: string | null; onSent: () => void }) {
  const [msgType, setMsgType] = useState<MessageType>('sms');
  const [recipientMode, setRecipientMode] = useState<Segment>(initialSegment ?? 'all');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplate);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [resultMessage, setResultMessage] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const charLimit = msgType === 'sms' ? 90 : 1000;

  const customers = useMemo(() => CustomerStore.getAll().filter(c => c.isActive !== false), []);
  // 개별 고객 발송 — 고객 상세에서 열었을 때. [대상 바꾸기]로 세그먼트 발송으로 되돌릴 수 있다.
  // 요청한 고객이 발송 대상이 아니면(익명화·없음) 세그먼트로 떨어뜨리지 않고 막는다 — 전체 발송 사고 방지
  const [onlyCustomer, setOnlyCustomer] = useState<Customer | null>(() => (initialCustomerId && customers.find(c => c.id === initialCustomerId)) || null);
  const blockedCustomer = !!initialCustomerId && !onlyCustomer;
  const templates = MessageTemplateStore.getAll();
  const kakaoSettings = SettingsStore.get().kakao;

  // Load initial template content
  useEffect(() => {
    if (initialTemplate) {
      const tmpl = templates.find(t => t.id === initialTemplate);
      if (tmpl) {
        setContent(tmpl.content);
        setMsgType(tmpl.type as MessageType);
        if (tmpl.title) setTitle(tmpl.title);
      }
    }
  }, [initialTemplate]);

  const msgTypes: { key: MessageType; label: string; disabled?: boolean }[] = [
    { key: 'sms', label: 'SMS (단문)' },
    { key: 'lms', label: 'LMS (장문)' },
    { key: 'kakao-channel', label: `카카오 채널${kakaoSettings?.channelConnected ? '' : ' (채널 미연결)'}`, disabled: !kakaoSettings?.channelConnected },
    { key: 'kakao-openchat', label: `카카오 오픈채팅${kakaoSettings?.openchatConnected ? '' : ' (채널 미연결)'}`, disabled: !kakaoSettings?.openchatConnected },
  ];

  // 세그먼트 필터 적용 대상 (빠른발송 카드와 동일 기준)
  const targetCustomers = blockedCustomer ? [] : onlyCustomer ? [onlyCustomer] : customers.filter(segmentFilter(recipientMode));
  const recipientCount = targetCustomers.length;

  // 수신 대상의 실제 전화번호 목록 (번호 없는 고객은 발송 대상에서 제외됨)
  const recipientPhones = targetCustomers
    .map(c => c.phone)
    .filter((p): p is string => Boolean(p && p.trim()));

  const estimatedCost = msgType === 'sms' ? recipientPhones.length * 11 : msgType === 'lms' ? recipientPhones.length * 25 : recipientPhones.length * 5;

  const handleSend = async () => {
    if (!content.trim() || recipientCount === 0) return;
    if (recipientPhones.length === 0) { notify('전화번호가 있는 수신 대상이 없습니다. 고객 정보의 전화번호를 확인해주세요.'); return; }
    // 치환 안 된 변수({고객명} 등)가 그대로 나가는 사고 방지 — 예약/즉시 발송 공통
    if (/\{[^}]+\}/.test(content)) {
      notify('메시지에 치환되지 않은 변수({고객명} 등)가 있습니다. 실제 값으로 바꾼 뒤 발송해주세요.');
      return;
    }
    setSending(true);

    const selectedTemplate = selectedTemplateId ? templates.find(t => t.id === selectedTemplateId) : null;
    // "90자 초과 시 자동 LMS 전환" 안내대로 실제 전환 (기존엔 문구만 있고 미구현)
    const effectiveType: MessageType = msgType === 'sms' && content.trim().length > 90 ? 'lms' : msgType;

    // 예약 발송: 서버 큐에 등록하고 종료 (시각 도달 시 서버가 발송)
    if (scheduleMode === 'later' && isScheduleAvailable) {
      try {
        if (!scheduleAt) throw new Error('발송 시각을 선택해주세요.');
        await scheduleMessage({
          sendAt: new Date(scheduleAt).toISOString(),
          type: effectiveType,
          title: title || undefined,
          content: content.trim(),
          phones: recipientPhones,
        });
        setSending(false);
        setSendResult('success');
        setResultMessage(`${new Date(scheduleAt).toLocaleString()} 발송 예약 완료`);
        onSent();
        setTimeout(() => { onClose(); }, 1500);
      } catch (e: any) {
        setSending(false);
        setSendResult('error');
        setResultMessage(e?.message || '발송 예약 실패');
      }
      return;
    }

    const result = await sendMessages({
      type: effectiveType,
      content: content.trim(),
      title: title || undefined,
      recipients: recipientCount,
      phones: recipientPhones,
    });

    if (result.pending) {
      // 게이트웨이 미연동 — 발송되지 않았음을 명확히 기록
      MessageHistoryStore.save({
        type: effectiveType,
        templateId: selectedTemplate?.id,
        templateName: selectedTemplate?.name,
        title: title || undefined,
        content: content.trim(),
        recipients: recipientCount,
        successCount: 0,
        failCount: recipientCount,
        sentAt: new Date().toISOString(),
        status: 'failed',
        cost: 0,
      });
      setSending(false);
      setSendResult('pending');
      setResultMessage(result.reason ?? '게이트웨이 미연동');
      onSent();
    } else if (result.sent > 0) {
      // 실제 발송 성공 (일부 실패 포함 — 부분 성공도 sent로 기록해 성공/실패 건수 모두 노출)
      MessageHistoryStore.save({
        type: effectiveType,
        templateId: selectedTemplate?.id,
        templateName: selectedTemplate?.name,
        title: title || undefined,
        content: content.trim(),
        recipients: recipientCount,
        successCount: result.sent,
        failCount: result.failed,
        sentAt: new Date().toISOString(),
        status: 'sent',
        cost: estimatedCost,
      });
      setSending(false);
      setSendResult('success');
      setResultMessage(
        `${result.sent}명 발송 성공` +
        (result.failed > 0 ? `, ${result.failed}명 실패` : '') +
        (recipientCount > recipientPhones.length ? ` (전화번호 없는 ${recipientCount - recipientPhones.length}명 제외)` : '')
      );
      onSent();
      setTimeout(() => { onClose(); }, 1800);
    } else {
      // 발송 실패
      MessageHistoryStore.save({
        type: effectiveType,
        templateId: selectedTemplate?.id,
        templateName: selectedTemplate?.name,
        title: title || undefined,
        content: content.trim(),
        recipients: recipientCount,
        successCount: 0,
        failCount: recipientCount,
        sentAt: new Date().toISOString(),
        status: 'failed',
        cost: 0,
      });
      setSending(false);
      setSendResult('error');
      setResultMessage(result.reason ?? '발송 실패');
      onSent();
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="메시지 발송" size="lg">
      {sendResult === 'success' ? (
        <div className="flex flex-col items-center justify-center py-12">
          <CheckCircle size={48} className="text-green-500 mb-3" />
          <p className="text-lg font-bold text-gray-900">발송 완료!</p>
          <p className="text-sm text-gray-500 mt-1">{resultMessage || `${recipientCount}명에게 발송을 요청했습니다`}</p>
        </div>
      ) : sendResult === 'pending' ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <AlertCircle size={48} className="text-amber-400 mb-3" />
          <p className="text-lg font-bold text-gray-900">실제 발송이 되지 않았습니다</p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            메시지 발송 게이트웨이가 아직 연동되지 않았습니다.<br />
            설정 &gt; 연동에서 준비 예정입니다.
          </p>
          <p className="text-xs text-gray-400 mt-3 bg-gray-50 rounded-lg px-3 py-2">{resultMessage}</p>
          <p className="text-xs text-gray-400 mt-2">발송 이력에 '미연동' 사유로 기록되었습니다.</p>
          <button onClick={onClose} className="mt-6 px-6 py-2.5 text-sm font-medium text-white bg-gray-500 rounded-xl hover:bg-gray-600">닫기</button>
        </div>
      ) : sendResult === 'error' ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <AlertCircle size={48} className="text-red-400 mb-3" />
          <p className="text-lg font-bold text-gray-900">발송 실패</p>
          <p className="text-xs text-gray-400 mt-3 bg-red-50 rounded-lg px-3 py-2 text-red-600">{resultMessage}</p>
          <button onClick={onClose} className="mt-6 px-6 py-2.5 text-sm font-medium text-white bg-gray-500 rounded-xl hover:bg-gray-600">닫기</button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Message Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">발송 채널</label>
            <div className="flex gap-2 flex-wrap">
              {msgTypes.map(t => (
                <button
                  key={t.key}
                  onClick={() => setMsgType(t.key)}
                  disabled={t.disabled}
                  className={clsx(
                    'px-3 py-2 text-sm font-medium rounded-xl border transition-all',
                    msgType === t.key
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300',
                    t.disabled && 'opacity-50 cursor-not-allowed hover:border-gray-200'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">수신 대상</label>
            {blockedCustomer ? (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2" data-testid="recipient-blocked">
                이 고객은 발송 대상이 아닙니다(익명화됐거나 삭제됨). 창을 닫고 다른 고객을 선택해주세요.
              </p>
            ) : onlyCustomer ? (
              <div className="flex items-center gap-2 flex-wrap" data-testid="recipient-single">
                <span className="px-3 py-2 text-sm font-medium rounded-xl bg-primary-600 text-white">개별 발송: {onlyCustomer.name} ({onlyCustomer.phone || '전화번호 없음'})</span>
                <button type="button" onClick={() => setOnlyCustomer(null)} className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">대상 바꾸기</button>
              </div>
            ) : (
            <div className="flex gap-2 flex-wrap">
              {(() => {
                const keys: Segment[] = [...(['all', 'vip', 'birthday', 'novisit'] as Segment[]), ...topTags(customers, 8).map(t => `tag:${t.tag}` as Segment)];
                // 빠른 발송 카드에서 넘어온 태그가 상위 8 밖이거나 그 사이 사라졌으면 칩을 하나 더 그려 (0명)으로 보이게 — 아무 칩도 안 켜진 채 조용히 0명 발송이 되지 않게
                if (recipientMode.startsWith('tag:') && !keys.includes(recipientMode)) keys.push(recipientMode);
                return keys;
              })().map(key => ({
                key,
                label: `${segmentLabel(key)} (${customers.filter(segmentFilter(key)).length}명)`,
              })).map(r => (
                <button
                  key={r.key}
                  onClick={() => setRecipientMode(r.key as typeof recipientMode)}
                  className={clsx(
                    'px-3 py-2 text-sm font-medium rounded-xl border transition-all',
                    recipientMode === r.key
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            )}
          </div>

          {/* Template selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">템플릿 선택 (선택사항)</label>
            <select
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
              value={selectedTemplateId || ''}
              onChange={e => {
                const tmpl = templates.find(t => t.id === e.target.value);
                setSelectedTemplateId(e.target.value || null);
                if (tmpl) {
                  setContent(tmpl.content);
                  if (tmpl.title) setTitle(tmpl.title);
                }
              }}
            >
              <option value="">템플릿 선택...</option>
              {templates.filter(t => t.type === msgType || (msgType !== 'kakao-channel' && msgType !== 'kakao-openchat' && ['sms','lms','mms'].includes(t.type))).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Title (Kakao only) */}
          {msgType.startsWith('kakao') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">메시지 제목</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
                placeholder="제목 입력"
              />
            </div>
          )}

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-600">메시지 내용 *</label>
              <span className={clsx(
                'text-xs font-medium',
                content.length > charLimit ? 'text-red-500' : 'text-gray-400'
              )}>
                {content.length}/{charLimit}자
              </span>
            </div>
            <textarea
              rows={5}
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
              placeholder={'발송할 메시지 내용을 입력하세요\n{고객명}, {날짜} 등의 변수를 사용할 수 있습니다'}
            />
            {msgType === 'sms' && (
              <p className="text-xs text-gray-400 mt-1">90자 초과 시 자동으로 LMS로 전환됩니다</p>
            )}
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">발송 시간</label>
            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={() => setScheduleMode('now')}
                className={clsx('px-4 py-2 text-sm font-medium rounded-xl border',
                  scheduleMode === 'now' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}
              >
                즉시 발송
              </button>
              {isScheduleAvailable ? (
                <button
                  type="button"
                  onClick={() => setScheduleMode('later')}
                  className={clsx('px-4 py-2 text-sm font-medium rounded-xl border',
                    scheduleMode === 'later' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}
                >
                  예약 발송
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2 text-sm font-medium bg-white text-gray-400 rounded-xl border border-gray-200 flex items-center gap-1.5 cursor-not-allowed opacity-60"
                  title="발송사 연동 후 지원됩니다"
                >
                  예약 발송
                  <HelpCircle size={12} className="text-gray-400" />
                </button>
              )}
            </div>
            {scheduleMode === 'later' && isScheduleAvailable && (
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={e => setScheduleAt(e.target.value)}
                className="mt-2 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
                aria-label="예약 발송 시각"
              />
            )}
            {!isScheduleAvailable && (
              <p className="text-xs text-gray-400 mt-1.5">예약 발송은 준비 중입니다.</p>
            )}
          </div>

          {/* Cost estimate */}
          <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">예상 수신자</p>
              <p className="text-base font-bold text-gray-800 mt-0.5">{recipientCount}명</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">예상 발송 비용</p>
              <p className="text-base font-bold text-primary-600 mt-0.5">약 {estimatedCost.toLocaleString()}원</p>
            </div>
          </div>

          <div className="flex gap-3 sticky bottom-0 bg-white pt-3 -mx-6 px-6 -mb-4 pb-4 border-t border-gray-100">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">취소</button>
            {canShareText && (
              // 모바일: 발송사 미계약이어도 문구를 카카오톡·문자 앱으로 넘겨 직접 보낼 수 있다 (2026-11-17)
              <button
                type="button"
                onClick={() => shareText(content, '고객 안내')}
                disabled={!content.trim()}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-green-500 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                title="카카오톡·문자 앱으로 문구 보내기"
              >
                <Share2 size={14} />앱으로 보내기
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={sending || !content.trim() || recipientCount === 0 || recipientPhones.length === 0}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Clock size={14} className="animate-spin" /> : <Send size={14} />}
              {sending ? '처리 중...' : '발송하기'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
