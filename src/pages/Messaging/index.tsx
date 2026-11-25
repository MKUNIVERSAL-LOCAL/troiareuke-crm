import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { askConfirm } from '../../lib/confirmDialog';
import { maskPhone } from '../../lib/pii';
import { normalizePhone } from '../../lib/inputRules';
import { notify } from '../../lib/notify';
import { useDataRefreshed } from '../../hooks/useDataRefreshed';
import { smsBytes, SMS_BYTE_LIMIT, LMS_BYTE_LIMIT, MESSAGE_UNIT_COST } from '../../lib/smsBytes';
import { formatDateTime, parseISODate, todayISO, formatPrice } from '../../lib/format';
import { daysBetween } from '../../lib/revisitRule';
import { useSearchParams } from 'react-router-dom';
import { snoozedCustomerIds } from '../../lib/followUp';
import { getRevisitDueCustomers } from '../../lib/reminderEngine';
import { segmentIdSets } from '../../lib/customerSegments';
import { buildCustomerStatsIndex } from '../../lib/customerStats';
import { getNoRebookCustomerIds } from '../../lib/todayTasks';
import { rememberRecipients, recipientIndex, recipientsOf } from '../../lib/messageRecipients';
import { isGatewayPendingHistory } from '../../lib/messageHistoryRule';
import { estimateHistoryPerformance, describeHistoryPerformance } from '../../lib/messagePerformance';
import { listSavedSegments, buildSegmentFacts, segmentIds } from '../../lib/savedSegments';
import type { SavedSegment } from '../../lib/segmentFilterRule';
import { Send, Users, FileText, CheckCircle, AlertCircle, Clock, Plus, Trash2, HelpCircle, Pencil, Search, Share2 } from 'lucide-react';
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
import { consentOf, getOptOutNumber } from '../../lib/marketingConsent';
import { canReceiveAd, decorateAdMessage, checkAdSend, looksLikeAdMessage, undecorateAdMessage, type AdChannel } from '../../lib/adComplianceRule';
import { isAuthApiConfigured } from '../../lib/authApi';
import CampaignsCard from '../../components/campaigns/CampaignsCard';
import clsx from 'clsx';

type Tab = 'send' | 'templates' | 'history';
type Segment = 'all' | 'vip' | 'birthday' | 'novisit' | 'revisit' | 'churn' | 'loyal' | 'norebook' | `tag:${string}` | `saved:${string}` | `resend:${string}`; // resend:<이력 id> — 발송 이력 "다시 보내기" 의 같은 수신 고객 (207) // tag:<태그명> — 고객 태그 세그먼트 (2026-11-18) / saved:<id> — 저장 세그먼트 (166)

// ── 수신 대상 세그먼트 필터 (빠른발송 카드와 발송 모달이 공유) ──────────
const SEGMENT_LABELS: Record<string, string> = {
  all: '전체',
  vip: 'VIP',
  birthday: '이번달 생일',
  novisit: '미방문 60일+',
  revisit: '재방문 권장', // 대시보드 재방문 리마인더 카드와 같은 기준(권장일 또는 방문 주기) — 카드의 [단체 발송]이 여기로 온다 (3차 UX 점검 2026-11-19)
  churn: '이탈 위험', // 이 고객의 방문 주기 2배 이상 안 왔고 다음 예약 없음 (136, churnRule)
  loyal: '충성 고객', // RFM 최근성·빈도 상위 (136, rfmRule)
  norebook: '재예약 없음', // 이달 방문했지만 다음 예약 없음 — 대시보드 재예약률 타일·고객 목록 칩과 같은 기준 (184 kpiRule, 202)
};

function segmentLabel(seg: Segment, saved: SavedSegment[] = []): string {
  if (seg.startsWith('resend:')) return '다시 보내기';
  if (seg.startsWith('saved:')) return saved.find(sg => sg.id === seg.slice(6))?.name ?? '삭제된 세그먼트';
  return seg.startsWith('tag:') ? `#${seg.slice(4)}` : (SEGMENT_LABELS[seg] ?? seg);
}
/** 저장 세그먼트 id → 해당 고객 id 집합 — 발송 창·빠른 발송 카드가 한 번 만들어 공유 (166) */
function savedSegmentSets(): { list: SavedSegment[]; sets: Map<string, Set<string>> } {
  const list = listSavedSegments();
  if (list.length === 0) return { list, sets: new Map() };
  const facts = buildSegmentFacts();
  return { list, sets: new Map(list.map(sg => [sg.id, segmentIds(sg.condition, facts)])) };
}
/** 세그먼트 → 고객 필터. 태그 세그먼트는 tags 포함 여부 */
/** 재방문 권장 대상 id 집합 — 고객·예약·시술 전수 스캔이라 호출하는 쪽에서 useMemo로 한 번만 만들어 넘긴다 (리뷰 63) */
function revisitIdSet(): Set<string> {
  const snoozed = snoozedCustomerIds(); // 미뤄 둔 고객 제외 (250 리뷰 M-5)
  return new Set(getRevisitDueCustomers().map(d => d.customer.id).filter(id => !snoozed.has(id)));
}
type SegmentIdSets = { churn: Set<string>; loyal: Set<string>; norebook: Set<string> };
/** 이탈 위험·충성(136) + 재예약 없음(202) id 집합 — 전수 스캔이라 호출하는 쪽에서 useMemo 로 한 번만. 통계 인덱스는 한 번 만들어 둘이 공유 (203) */
function allSegmentIdSets(): SegmentIdSets {
  const stats = buildCustomerStatsIndex();
  const snoozed = snoozedCustomerIds(); // 연락을 미뤄 둔 고객은 발송 대상에서도 뺀다 — "당분간 안 받겠다" 고객에게 문자가 갔다 (250 리뷰 M-5)
  const without = (ids: Set<string>) => new Set([...ids].filter(id => !snoozed.has(id)));
  const base = segmentIdSets(stats);
  return { churn: without(base.churn), loyal: base.loyal, norebook: without(getNoRebookCustomerIds(stats)) };
}
function segmentFilter(seg: Segment, revisitIds: Set<string> | undefined, segIds: SegmentIdSets, savedSets?: Map<string, Set<string>>, resendIds?: Set<string>): (c: Customer) => boolean { // segIds 는 호출자 2곳이 모두 넘긴다 — 폴백 전수 스캔 분기 제거 (203)
  if (seg.startsWith('resend:')) return resendIds ? c => resendIds.has(c.id) : () => false; // 이력의 수신 고객 집합 — 없으면 아무에게도 (207)
  if (seg.startsWith('saved:')) { const ids = savedSets?.get(seg.slice(6)); return ids ? c => ids.has(c.id) : () => false; } // 삭제된 세그먼트는 아무에게도 (166)
  if (seg.startsWith('tag:')) { const tag = seg.slice(4); return c => (c.tags || []).includes(tag); }
  if (seg === 'revisit') { const ids = revisitIds ?? revisitIdSet(); return c => ids.has(c.id); }
  if (seg === 'churn' || seg === 'loyal' || seg === 'norebook') { const ids = segIds[seg]; return c => ids.has(c.id); }
  return Object.prototype.hasOwnProperty.call(SEGMENT_FILTERS, seg) ? SEGMENT_FILTERS[seg] : () => false; // 모르는 세그먼트('constructor' 같은 프로토타입 키 포함)는 '아무에게도' — 전체 발송 사고 방지
}

const SEGMENT_FILTERS: Record<string, (c: Customer) => boolean> = {
  all: () => true,
  vip: c => c.grade === 'VIP',
  birthday: c => {
    if (!c.birthDate) return false;
    return parseISODate(c.birthDate).getMonth() === new Date().getMonth(); // 앱 공통 로컬 파싱 (12차 #L3)
  },
  novisit: c => {
    if (!c.lastVisitDate) return false;
    return daysBetween(c.lastVisitDate, todayISO()) > 60; // 달력 일수 — UTC 자정 산술은 09시 전에 하루 늦게 들어왔다 (12차 #L4)
  },
};

/** 실발송 경로(NAS 서버)가 살아있는가 — 레거시 수동 게이트웨이는 제거됨 (보안 감사 2026-11-19) */
function isMessagingLive(): boolean { return isAuthApiConfigured; }

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
  const [historyCustomerId, setHistoryCustomerId] = useState<string | null>(null); // 고객 활동 타임라인 메시지 줄 → 그 고객 발송만 (205)
  const [historyStatus, setHistoryStatus] = useState<'all' | 'failed'>('all'); // 대시보드 "다시 보내기" 할 일 → 실패·미연동만 (208)
  const [resendSource, setResendSource] = useState<MessageHistory | null>(null); // 발송 이력 "다시 보내기" 원본 — 같은 대상·본문·유형으로 발송 창 (207)
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendSegment, setSendSegment] = useState<Segment>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  // 고객 상세 [메시지](?customer=<id>) → 그 고객 한 명에게 보내는 발송 모달 (1회 캡처 후 URL 비움, 2026-11-18)
  const [sendCustomerId, setSendCustomerId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    // 대시보드 재방문 리마인더 [단체 발송](?segment=revisit)·생일 카드(?segment=birthday) → 그 대상이 걸린 발송 모달 (3차·5차 UX 점검 2026-11-19)
    const seg = searchParams.get('segment');
    if (seg && (seg === 'revisit' || seg === 'churn' || seg === 'loyal' || seg === 'norebook' || seg.startsWith('saved:') || Object.prototype.hasOwnProperty.call(SEGMENT_FILTERS, seg))) { // saved:<id> 는 고객 목록 세그먼트 칩에서 (166) // churn·loyal 도 딥링크 허용 (139 #L7) // 'constructor' 같은 프로토타입 키가 전체 발송 대상이 되지 않게
      setSendCustomerId(null);
      setSendSegment(seg as Segment);
      setShowSendModal(true);
      setSearchParams({}, { replace: true });
      return;
    }
    if (searchParams.get('tab') === 'history') { // 대시보드 오늘 할 일 "다시 보내기" → 발송 이력 탭, status=failed 면 실패·미연동만 (208)
      setHistoryStatus(searchParams.get('status') === 'failed' ? 'failed' : 'all');
      setTab('history');
      setSearchParams({}, { replace: true });
      return;
    }
    const hist = searchParams.get('history');
    if (hist) { // 고객 활동 타임라인 "문자/카카오 발송" 줄 → 발송 이력 탭을 그 고객 발송만으로 (205)
      setHistoryCustomerId(hist);
      setTab('history');
      setSearchParams({}, { replace: true });
      return;
    }
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

        {/* Connection Status — 실제 발송 경로 기준 (설정값 장식 아님). 칩은 포커스 가능한 자식이 없어 가로 스크롤 대신 줄바꿈(axe, 2026-11-18); 아래 탭·카테고리 스트립은 버튼이라 스크롤 유지 */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <StatusChip label="발송 서버" connected={messagingLive} />
          <StatusChip label="카카오 채널" connected={!!settings.kakao?.channelConnected} />
          <StatusChip label="카카오 오픈채팅" connected={!!settings.kakao?.openchatConnected} />
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1 w-fit max-w-full mb-6" role="group" aria-label="문자/카카오 화면 전환">
          {tabs.map(t => (
            <button
              key={t.key}
              aria-current={tab === t.key ? 'true' : undefined} /* 설정 탭과 같은 표기 (217) */
              onClick={() => { setTab(t.key); if (t.key !== 'history') setHistoryStatus('all'); }} // 딥링크 상태 필터가 탭을 오가며 되살아나지 않게 (210, 208 리뷰 L-3)
              className={clsx(
                'flex-shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'send' && <SendPanel onSend={openSendModal} onSent={reload} reloadKey={reloadKey} />}
        {tab === 'templates' && <TemplatesPanel onSelect={(id) => { setSelectedTemplate(id); setShowSendModal(true); }} reloadKey={reloadKey} onReload={reload} />}
        {tab === 'history' && <HistoryPanel reloadKey={reloadKey} onSend={() => openSendModal('all')} customerId={historyCustomerId} onClearCustomer={() => setHistoryCustomerId(null)} initialStatus={historyStatus} onResend={h => { setResendSource(h); setSendCustomerId(null); openSendModal(`resend:${h.id}`); }} />}
      </div>

      {showSendModal && (
        <SendMessageModal
          onClose={() => { setShowSendModal(false); setSelectedTemplate(null); setSendCustomerId(null); setResendSource(null); }}
          initialTemplate={selectedTemplate}
          initialSegment={sendSegment}
          initialCustomerId={sendCustomerId}
          resendSource={resendSource}
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

function SendPanel({ onSend, onSent, reloadKey }: { onSend: (segment: Segment) => void; onSent: () => void; reloadKey: number }) {
  const [customers, setCustomers] = useState(() => CustomerStore.getAll().filter(c => c.isActive !== false)); // 익명화 고객 제외
  useDataRefreshed(() => setCustomers(CustomerStore.getAll().filter(c => c.isActive !== false))); // 발송 대상 인원이 다른 기기 등록분을 반영 (16차 #H3)

  useEffect(() => {
    setCustomers(CustomerStore.getAll().filter(c => c.isActive !== false));
  }, [reloadKey]);
  const revisitCount = useMemo(() => revisitIdSet().size, [reloadKey]); // 대시보드 재방문 카드와 같은 기준 (리뷰 63)
  const saved = useMemo(() => savedSegmentSets(), [reloadKey]); // 저장 세그먼트 카드 (166)

  const birthdayCount = customers.filter(c => {
    if (!c.birthDate) return false;
    return parseISODate(c.birthDate).getMonth() === new Date().getMonth();
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
          { key: 'revisit' as Segment, label: '재방문 권장', count: revisitCount, color: 'amber' },
          ...saved.list.map(sg => ({ key: `saved:${sg.id}` as Segment, label: sg.name, count: saved.sets.get(sg.id)?.size ?? 0, color: 'primary' })), // 저장 세그먼트 (166)
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

      {/* 자동 발송(캠페인) — 승인 발송 모드, 멱등키 (156) */}
      <CampaignsCard onSent={onSent} />
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

  const handleDelete = async (id: string) => {
    const target = templates.find(t => t.id === id);
    if (!(await askConfirm({ title: '템플릿 삭제', message: `'${target?.name ?? '이 템플릿'}' 템플릿을 삭제할까요?\n이미 보낸 발송 이력은 남습니다.`, confirmLabel: '삭제', danger: true }))) return;
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
        <div className="flex flex-wrap gap-2 pb-1">
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
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{t.category}</span>
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
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
              placeholder="예: [우리 매장] 예약 안내"
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
          <label className="block text-xs font-medium text-gray-600 mb-1.5">변수 (쉼표로 구분 — 발송 전 바꿔 넣을 자리 표시, {'{'}고객명{'}'}은 개별 발송에서 자동 치환)</label>
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
  pending: { label: '대기', color: 'bg-blue-100 text-blue-700' },
  processing: { label: '발송 중', color: 'bg-primary-100 text-primary-600' },
  sent: { label: '발송 완료', color: 'bg-green-100 text-green-700' },
  partial: { label: '일부 실패', color: 'bg-amber-100 text-amber-800' },
  failed: { label: '실패', color: 'bg-red-100 text-red-700' },
  canceled: { label: '취소됨', color: 'bg-gray-100 text-gray-600' },
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
    if (!(await askConfirm({ title: '발송 예약 취소', message: '이 발송 예약을 취소할까요?', confirmLabel: '예약 취소', cancelLabel: '닫기' }))) return;
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
                  <span className="text-xs text-gray-500">{formatDateTime(item.send_at)}</span>
                  <span className="text-xs text-gray-400">{item.phones.length}명</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 truncate">{item.title ? `[${item.title}] ` : ''}{item.content}</p>
              </div>
              {item.status === 'pending' && (
                <button
                  onClick={() => handleCancel(item.id)}
                  className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-red-100 shrink-0"
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
  return isNaN(d.getTime()) ? value : formatDateTime(value);
}

function HistoryPanel({ reloadKey, onSend, customerId, onClearCustomer, initialStatus = 'all', onResend }: { reloadKey: number; onSend: () => void; customerId: string | null; onClearCustomer: () => void; initialStatus?: 'all' | 'failed'; onResend: (h: MessageHistory) => void }) {
  const [history, setHistory] = useState<MessageHistory[]>(MessageHistoryStore.getAll());
  const customerName = customerId ? (CustomerStore.getById(customerId)?.name ?? '삭제된 고객') : null; // 고객 발송만 보기 칩 (205)
  const recipients = useMemo(() => recipientIndex(), [history]); // 이력 id → 수신 고객(이 PC 사이드맵) — 목록당 1회 (206)
  // 이력 id → 받는 사람 이름 — 목록에서 "누구에게 간 문자" 인지 바로 보이게. 고객 목록을 한 번만 색인한다 (212)
  const recipientNames = useMemo(() => {
    if (recipients.size === 0) return new Map<string, string[]>();
    const byId = new Map(CustomerStore.getAll().map(c => [c.id, c.name]));
    return new Map([...recipients].map(([hid, ids]) => [hid, ids.map(id => byId.get(id) ?? '삭제된 고객')]));
  }, [recipients]);
  const describeRecipients = (hid: string): string | null => {
    const names = recipientNames.get(hid);
    if (!names || names.length === 0) return null;
    return names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}명`;
  };
  const [perf, setPerf] = useState<Record<string, string>>({}); // 누른 행만 성과 추정 — 행마다 예약·결제 전수 스캔을 하지 않게 (211)
  useEffect(() => { setPerf({}); }, [reloadKey]); // 발송이 생기면 옛 추정치를 지운다
  const customerOnlyCount = customerId ? history.filter(h => recipients.get(h.id)?.includes(customerId)).length : 0; // 칩 건수는 고객 필터만 적용한 수 — 상태·검색과 섞이지 않게 (리뷰 L-2)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed'>(initialStatus); // 딥링크 초기값 (208)
  useEffect(() => { setStatusFilter(initialStatus); }, [initialStatus]); // 이미 발송 이력 탭에 있을 때 들어온 딥링크도 먹게 — 재마운트가 없어 초기값이 무시되던 것 (210, 208 리뷰 L-3)

  useEffect(() => {
    setHistory(MessageHistoryStore.getAll());
  }, [reloadKey]);

  // 검색 대상 문자열은 행마다 한 번만 만든다 — 글자를 칠 때마다 수백 명 이름을 다시 소문자화하지 않게 (215, 212 리뷰 M-1)
  const haystacks = useMemo(() => new Map(history.map(h => [h.id, [
    h.templateName || '직접 작성',
    h.content,
    formatSentAt(h.sentAt),
    MSG_TYPE_LABELS[h.type] || h.type,
    ...(recipientNames.get(h.id) ?? []), // 받는 사람 이름으로도 찾는다 (212)
  ].join('\n').toLowerCase()])), [history, recipientNames]);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredHistory = history.filter(item => {
    if (customerId && !recipients.get(item.id)?.includes(customerId)) return false; // 수신 고객이 기록된 건(204 부터, 이 PC)만 걸린다 (205·206)
    const statusMatches = statusFilter === 'all' || item.status === statusFilter;
    const searchMatches = !normalizedSearch || (haystacks.get(item.id) ?? '').includes(normalizedSearch);
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
            <p className="text-sm font-medium">발송 이력이 없어요</p>
            <p className="text-xs mt-1">메시지를 발송하면 이곳에 이력이 표시됩니다</p>
            <button type="button" onClick={onSend} className="mt-3 px-4 py-2 bg-[#1a3a8f] text-white rounded-xl text-xs font-medium hover:bg-[#152f75]">메시지 보내기</button>
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
            placeholder="템플릿명, 내용, 받는 사람, 발송일 검색"
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
        {customerName && ( /* 타임라인에서 넘어온 고객 필터 — 누르면 해제 (205) */
          <button type="button" onClick={onClearCustomer} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-[#1a3a8f] text-white" title="고객 활동 타임라인에서 연 필터 — 누르면 해제" aria-label={`${customerName} 발송만 보기 해제`} data-testid="history-customer-chip">{customerName} 발송만 {customerOnlyCount} ✕</button>
        )}
      </div>
      <div className="divide-y divide-gray-50 overflow-y-auto max-h-[65vh]">
        {filteredHistory.length === 0 && (
          <div className="py-14 text-center text-sm text-gray-400">조건에 맞는 발송 이력이 없어요</div>
        )}
        {filteredHistory.map(h => {
          const isGatewayPending = isGatewayPendingHistory(h); // 타임라인과 같은 판정 (206)
          return (
            <div key={h.id} className="px-6 py-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={clsx(
                    'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
                    h.status === 'sent' ? 'bg-green-100' : isGatewayPending ? 'bg-amber-100' : 'bg-red-100'
                  )}>
                    {h.status === 'sent'
                      ? <CheckCircle size={16} className="text-green-700" />
                      : isGatewayPending
                        ? <AlertCircle size={16} className="text-amber-700" />
                        : <AlertCircle size={16} className="text-red-600" />
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
                    {describeRecipients(h.id) && ( /* 받는 사람 — 이 PC 사이드맵에 남은 건만(204·206 부터) (212) */
                      <p className="text-xs text-gray-500 mt-0.5" data-testid="history-recipients">받는 사람 {describeRecipients(h.id)}</p>
                    )}
                    {isGatewayPending && (
                      <p className="text-xs text-amber-700 mt-0.5">게이트웨이 미연동 — 실제 발송 안 됨</p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-800">{h.recipients}명 대상</p>
                  {h.status === 'sent'
                    ? <p className="text-xs text-green-700">성공 {h.successCount}명</p>
                    : isGatewayPending
                      ? <p className="text-xs text-amber-700">미발송 (미연동)</p>
                      : <p className="text-xs text-red-600">실패 {h.failCount}명</p>
                  }
                  {h.status === 'sent' && h.failCount > 0 && <p className="text-xs text-red-600">실패 {h.failCount}명</p>}
                  {h.status === 'sent' && h.cost !== undefined && h.cost > 0 && (
                    <p className="text-xs text-gray-400 mt-1">예상 비용 {formatPrice(h.cost)}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2 ml-11 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">{h.content}</p>
              {(recipients.get(h.id)?.length ?? 0) > 0 && ( /* 수신 고객이 사이드맵에 남은 건(204·206 부터, 이 PC)만 — 같은 대상·본문으로 발송 창을 연다. 미연동으로 못 나간 건을 발송사 연결 뒤 다시 보낼 때 (207) */
                <div className="mt-2 ml-11 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => onResend(h)} className="px-3 py-1.5 min-h-[36px] lg:min-h-0 rounded-xl text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50" aria-label={`${h.templateName || '직접 작성'} 같은 대상에게 다시 보내기`} data-testid="history-resend">같은 대상에게 다시 보내기</button>
                  {h.status === 'sent' && ( /* 실제로 나간 건만 — 미연동·실패 건은 성과를 물을 대상이 아니다 (211). 계산 뒤에도 버튼을 남겨 예약·결제가 생긴 뒤 다시 볼 수 있게 (215, 리뷰 L-1) */
                    <button type="button" onClick={() => { const p = estimateHistoryPerformance(h.id, h.sentAt, recipients.get(h.id)); const line = p && describeHistoryPerformance(p, h, formatPrice); if (line) setPerf(prev => ({ ...prev, [h.id]: line })); }} className="px-3 py-1.5 min-h-[36px] lg:min-h-0 rounded-xl text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50" aria-label={`${h.templateName || '직접 작성'} 성과 추정 ${perf[h.id] ? '다시 보기' : '보기'}`} data-testid="history-perf">{perf[h.id] ? '성과 다시 보기' : '성과 보기'}</button>
                  )}
                </div>
              )}
              {perf[h.id] && ( /* 발송 뒤 14일 창 예약·결제 — 추정이지 인과가 아니라 [추정] 라벨을 붙인 그대로 보여 준다 (211, GAP M-6, ANALYTICS-DEFINITIONS) */
                <p className="mt-2 ml-11 text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2" data-testid="history-perf-line">{perf[h.id]}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}

function SendMessageModal({ onClose, initialTemplate, initialSegment, initialCustomerId, resendSource, onSent }: { onClose: () => void; initialTemplate: string | null; initialSegment?: Segment; initialCustomerId?: string | null; resendSource?: MessageHistory | null; onSent: () => void }) {
  const { user: authUser } = useAuth(); // 수신 대상 미리보기 전화번호 마스킹 기준 (13차 #M12)
  const kakaoSettings = SettingsStore.get().kakao;
  // 다시 보내기는 원본 유형 — 카카오 채널이 끊겼으면 문자로 내린다(끊긴 유형이 선택된 모양으로 그려지던 것: 210, 207 리뷰 L-1)
  const [msgType, setMsgType] = useState<MessageType>(() => {
    if (!resendSource) return 'sms';
    const t = resendSource.type;
    if (t === 'kakao-channel') return kakaoSettings?.channelConnected ? t : 'sms';
    if (t === 'kakao-openchat') return kakaoSettings?.openchatConnected ? t : 'sms';
    return t === 'lms' ? 'lms' : 'sms'; // mms 는 이 창에 선택지가 없어 문자로 — 90바이트를 넘으면 자동 LMS
  });
  const [recipientMode, setRecipientMode] = useState<Segment>(initialSegment ?? 'all');
  // 원본이 광고였으면 꾸밈(머리말·080 꼬리말)을 벗긴 본문으로 두고 광고 토글을 켠다 — 그렇지 않으면 동의 필터·야간 금지 점검을 건너뛴 채 광고가 다시 나간다 (210, 207 리뷰 H-1·L-8)
  const resendIsAd = !!resendSource && looksLikeAdMessage(resendSource.content);
  const [content, setContent] = useState(resendSource ? (resendIsAd ? undecorateAdMessage(resendSource.content) : resendSource.content) : '');
  const [title, setTitle] = useState(resendSource?.title ?? '');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplate);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [resultMessage, setResultMessage] = useState('');
  const [sendPartial, setSendPartial] = useState(false); // 일부 실패 — 초록 "발송 완료!" 로 가짜 성공처럼 보이지 않게 (15차 #H5)
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [isAd, setIsAd] = useState(resendIsAd); // 광고성이면 동의 고객만·(광고)·080·시간대 (155, GAP C-8·M-4). 재발송은 원본 본문으로 판정 (210)
  const [scheduleAt, setScheduleAt] = useState('');
  const byteLimit = msgType === 'sms' ? SMS_BYTE_LIMIT : LMS_BYTE_LIMIT;

  const customers = useMemo(() => CustomerStore.getAll().filter(c => c.isActive !== false), []);
  // 개별 고객 발송 — 고객 상세에서 열었을 때. [대상 바꾸기]로 세그먼트 발송으로 되돌릴 수 있다.
  // 요청한 고객이 발송 대상이 아니면(익명화·없음) 세그먼트로 떨어뜨리지 않고 막는다 — 전체 발송 사고 방지
  const [onlyCustomer, setOnlyCustomer] = useState<Customer | null>(() => (initialCustomerId && customers.find(c => c.id === initialCustomerId)) || null);
  const blockedCustomer = !!initialCustomerId && !onlyCustomer;
  const templates = MessageTemplateStore.getAll();

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

  // 세그먼트 필터 적용 대상 (빠른발송 카드와 동일 기준). 재방문 집합은 창이 열릴 때 한 번만 — 글자 입력마다 전수 스캔하지 않게 (리뷰 63)
  const revisitIds = useMemo(() => revisitIdSet(), []);
  const segIds = useMemo(() => allSegmentIdSets(), []); // 이탈 위험·충성 (136)·재예약 없음 (202) — 전수 스캔 1회
  const saved = useMemo(() => savedSegmentSets(), []); // 저장 세그먼트 (166)
  const resendIds = useMemo(() => { const ids = resendSource ? recipientsOf(resendSource.id) : undefined; return ids ? new Set(ids) : undefined; }, [resendSource]); // 다시 보내기 수신 고객 — 사이드맵(이 PC) (207)
  // 폰에서는 칩이 한 줄 가로 스크롤이라(213) 끝에 붙는 다시 보내기·태그 칩이 화면 밖에 남을 수 있다 → 선택된 칩을 보이는 곳으로 (215, 213 리뷰 M-2)
  const selectedChipRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { selectedChipRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [recipientMode]);
  const targetCustomers = useMemo(
    () => (blockedCustomer ? [] : onlyCustomer ? [onlyCustomer] : customers.filter(segmentFilter(recipientMode, revisitIds, segIds, saved.sets, resendIds))),
    [blockedCustomer, onlyCustomer, customers, recipientMode, revisitIds, segIds, saved, resendIds],
  );
  const recipientCount = targetCustomers.length;
  // 광고성이면 수신 동의가 있고 이 채널을 거부하지 않은 고객만 (155)
  const adChannel: AdChannel = msgType.startsWith('kakao') ? 'kakao' : 'sms';
  const adEligible = useMemo(() => (isAd ? targetCustomers.filter(c => canReceiveAd(consentOf(c), adChannel)) : targetCustomers), [isAd, targetCustomers, adChannel]);
  const adExcluded = targetCustomers.length - adEligible.length;
  const optOutNumber = getOptOutNumber();
  const adPreview = isAd && content.trim() ? decorateAdMessage(content, optOutNumber || '(080 번호 미등록)') : null;
  const contentBytes = smsBytes(isAd ? decorateAdMessage(content, optOutNumber || '080-000-0000') : content); // 광고면 (광고)·080 꼬리말이 붙은 실제 본문 기준으로 바이트·종류·비용 (159 리뷰 M-3)

  // 수신 대상의 실제 전화번호 목록 — 번호가 없거나 10~11자리가 아닌 것('010-1', 내선 포함)은 발송·비용 추정에서 뺀다(게이트웨이 실패를 발송 뒤에 알던 것, 14차 #M8)
  const recipientCustomers = adEligible.filter(c => { const k = normalizePhone(c.phone); return k.length === 10 || k.length === 11; });
  const recipientPhones = recipientCustomers.map(c => c.phone);

  // 90바이트를 넘긴 SMS는 LMS로 나간다 — 비용 추정도 같은 기준 (UX 점검 2026-11-19)
  const effectiveType: MessageType = msgType === 'sms' && contentBytes > SMS_BYTE_LIMIT ? 'lms' : msgType;
  const estimatedCost = recipientPhones.length * (effectiveType === 'sms' ? MESSAGE_UNIT_COST.sms : effectiveType === 'lms' ? MESSAGE_UNIT_COST.lms : MESSAGE_UNIT_COST.kakao); // 단가는 공용 상수 (165 리뷰 L-12)
  const excludedCount = adEligible.length - recipientPhones.length; // 번호 문제로 빠진 수(광고 동의 제외는 ad-recipients 에 따로 표시, 155)

  const handleSend = async () => {
    if (!content.trim() || recipientCount === 0) return;
    if (recipientPhones.length === 0) { notify('발송할 수 있는 전화번호가 없습니다(10~11자리 휴대폰 번호만). 고객 정보의 전화번호를 확인해주세요.'); return; }
    // 개별 발송(고객 상세에서 열었을 때)은 {고객명}을 그 고객 이름으로 바꾼다 — 단체 발송은 수신자별 치환이 없으므로 그대로 두지 않고 막는다 (UX 점검 2026-11-19)
    let finalContent = (onlyCustomer ? content.split('{고객명}').join(onlyCustomer.name) : content).trim();
    // 광고성: 080 번호·시간대 점검 뒤 (광고) 머리말·무료수신거부 꼬리말을 붙인다 (155, 정보통신망법)
    const adCheck = checkAdSend({ isAd, channel: adChannel, now: new Date(), optOutNumber, scheduledAt: scheduleMode === 'later' && scheduleAt ? new Date(scheduleAt) : null });
    if (!adCheck.ok) { setSendResult('error'); setResultMessage(adCheck.reasons.join(' ')); return; }
    if (isAd) finalContent = decorateAdMessage(finalContent, optOutNumber);
    // 종류는 실제로 나가는 문자열 기준 — 이름 치환으로 길어지거나 공백 정리로 짧아질 수 있다 (리뷰 60)
    const sendType: MessageType = msgType === 'sms' && smsBytes(finalContent) > SMS_BYTE_LIMIT ? 'lms' : msgType;
    // 치환 안 된 변수({고객명} 등)가 그대로 나가는 사고 방지 — 예약/즉시 발송 공통
    if (/\{[^}]+\}/.test(finalContent)) {
      notify(onlyCustomer
        ? '메시지에 바꿀 수 없는 변수가 있습니다. {고객명} 외의 변수는 실제 값으로 바꾼 뒤 발송해주세요.'
        : '메시지에 치환되지 않은 변수({고객명} 등)가 있습니다. 단체 발송은 이름을 자동으로 넣지 못하므로 실제 값으로 바꾸거나 변수를 빼고 발송해주세요.');
      return;
    }
    // 발송은 되돌릴 수 없다 — 대상·인원을 한 번 더 확인 (전체 고객이 기본 대상이라 특히) (UX 점검 2026-11-19)
    const target = onlyCustomer ? `${onlyCustomer.name} 고객 1명` : `${segmentLabel(recipientMode, saved.list)} ${recipientPhones.length}명`;
    const action = scheduleMode === 'later' && isScheduleAvailable ? '예약 발송을 등록' : '지금 발송';
    if (!window.confirm(`${target}에게 ${sendType === 'sms' ? 'SMS' : sendType === 'lms' ? 'LMS' : '카카오 메시지'}를 ${action}할까요?${excludedCount > 0 ? `\n(번호가 없거나 10~11자리가 아닌 ${excludedCount}명 제외)` : ''}`)) return;
    setSending(true);

    const selectedTemplate = selectedTemplateId ? templates.find(t => t.id === selectedTemplateId) : null;

    // 예약 발송: 서버 큐에 등록하고 종료 (시각 도달 시 서버가 발송)
    if (scheduleMode === 'later' && isScheduleAvailable) {
      try {
        if (!scheduleAt) throw new Error('발송 시각을 선택해주세요.');
        await scheduleMessage({
          sendAt: new Date(scheduleAt).toISOString(),
          type: sendType,
          title: title || undefined,
          content: finalContent,
          phones: recipientPhones,
        });
        setSending(false);
        setSendResult('success');
        setResultMessage(`${formatDateTime(scheduleAt)} 발송 예약 완료`);
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
      type: sendType,
      content: finalContent,
      title: title || undefined,
      recipients: recipientPhones.length,
      phones: recipientPhones,
    });

    const recipientIds = recipientCustomers.map(c => c.id); // 고객 활동 타임라인·고객 필터·다시 보내기용 사이드맵 (204·206)
    if (result.pending) {
      // 게이트웨이 미연동 — 발송되지 않았음을 명확히 기록
      rememberRecipients(MessageHistoryStore.save({
        type: sendType,
        templateId: selectedTemplate?.id,
        templateName: selectedTemplate?.name,
        title: title || undefined,
        content: finalContent, // 이력은 실제로 나간 본문(민원·분쟁 증빙). 실명 영구 보존은 MessageHistory 보존기간 파기(코어 delete 필요 — 메모 ⑪)로 푼다 (116 #M1 → 리뷰 #M6 번복)
        recipients: recipientPhones.length,
        successCount: 0,
        failCount: recipientPhones.length,
        sentAt: new Date().toISOString(),
        status: 'failed',
        cost: 0,
      }).id, recipientIds);
      setSending(false);
      setSendResult('pending');
      setResultMessage(result.reason ?? '게이트웨이 미연동');
      onSent();
    } else if (result.sent > 0) {
      // 실제 발송 성공 (일부 실패 포함 — 부분 성공도 sent로 기록해 성공/실패 건수 모두 노출)
      rememberRecipients(MessageHistoryStore.save({
        type: sendType,
        templateId: selectedTemplate?.id,
        templateName: selectedTemplate?.name,
        title: title || undefined,
        content: finalContent, // 이력은 실제로 나간 본문(민원·분쟁 증빙). 실명 영구 보존은 MessageHistory 보존기간 파기(코어 delete 필요 — 메모 ⑪)로 푼다 (116 #M1 → 리뷰 #M6 번복)
        recipients: recipientPhones.length,
        successCount: result.sent,
        failCount: result.failed,
        sentAt: new Date().toISOString(),
        status: 'sent',
        cost: estimatedCost,
      }).id, recipientIds);
      setSending(false);
      setSendResult('success');
      setSendPartial(result.failed > 0);
      setResultMessage(
        `${result.sent}명 발송 성공` +
        (result.failed > 0 ? `, ${result.failed}명 실패` : '') +
        (adEligible.length > recipientPhones.length ? ` (번호가 없거나 10~11자리가 아닌 ${adEligible.length - recipientPhones.length}명 제외)` : '') // 사유 표기 통일 (15차 #L11)
      );
      onSent();
      if (result.failed === 0) setTimeout(() => { onClose(); }, 1800); // 일부 실패는 실패 인원을 읽을 수 있게 [닫기]로만 (123~126 리뷰 #M2)
    } else {
      // 발송 실패
      rememberRecipients(MessageHistoryStore.save({
        type: sendType,
        templateId: selectedTemplate?.id,
        templateName: selectedTemplate?.name,
        title: title || undefined,
        content: finalContent, // 이력은 실제로 나간 본문(민원·분쟁 증빙). 실명 영구 보존은 MessageHistory 보존기간 파기(코어 delete 필요 — 메모 ⑪)로 푼다 (116 #M1 → 리뷰 #M6 번복)
        recipients: recipientPhones.length,
        successCount: 0,
        failCount: recipientPhones.length,
        sentAt: new Date().toISOString(),
        status: 'failed',
        cost: 0,
      }).id, recipientIds);
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
          {sendPartial ? <AlertCircle size={48} className="text-amber-600 mb-3" /> : <CheckCircle size={48} className="text-green-700 mb-3" />}
          <p className="text-lg font-bold text-gray-900">{sendPartial ? '일부만 발송됐습니다' : '발송 완료!'}</p>
          <p className="text-sm text-gray-500 mt-1">{resultMessage || `${recipientCount}명에게 발송을 요청했습니다.`}</p>
        </div>
      ) : sendResult === 'pending' ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <AlertCircle size={48} className="text-amber-400 mb-3" />
          <p className="text-lg font-bold text-gray-900">실제 발송이 되지 않았습니다</p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            본사 서버에 문자·알림톡 발송사가 아직 연동되지 않았습니다.<br />
            연동되면 이 화면 그대로 실제 발송됩니다 — 지점에서 따로 설정할 것은 없습니다.
          </p>
          <p className="text-xs text-gray-400 mt-3 bg-gray-50 rounded-lg px-3 py-2">{resultMessage}</p>
          <p className="text-xs text-gray-400 mt-2">발송 이력에 '미연동' 사유로 기록되었습니다.</p>
          <button onClick={onClose} className="mt-6 px-6 py-2.5 text-sm font-medium text-white bg-gray-500 rounded-xl hover:bg-gray-600">닫기</button>
        </div>
      ) : sendResult === 'error' ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <AlertCircle size={48} className="text-red-600 mb-3" />
          <p className="text-lg font-bold text-gray-900">발송 실패</p>
          <p className="text-xs mt-3 bg-red-50 rounded-lg px-3 py-2 text-red-600">{resultMessage}</p>
          <button onClick={onClose} className="mt-6 px-6 py-2.5 text-sm font-medium text-white bg-gray-500 rounded-xl hover:bg-gray-600">닫기</button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 광고성 메시지 — 정보통신망법 표기·동의·시간대 (155) */}
          <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input type="checkbox" checked={isAd} onChange={e => setIsAd(e.target.checked)} className="rounded" aria-label="광고성 메시지" />
              광고성 메시지(이벤트·할인·홍보)
            </label>
            {isAd && (
              <>
                <p className="text-xs text-gray-700" data-testid="ad-recipients">광고 대상 {adEligible.length}명{adExcluded > 0 ? ` · 동의 없음·거부 ${adExcluded}명 제외` : ''} · (광고) 머리말과 무료수신거부 {optOutNumber || '080 번호(설정 > 알림 설정에서 등록 — 미등록)'} 꼬리말이 자동으로 붙고, 21시~익일 8시에는 보낼 수 없습니다. 예약 확인·회차권 안내 같은 거래 안내는 광고가 아닙니다. 법은 보내는 곳(매장 이름·연락처)도 본문에 적게 하니 꼭 넣어주세요.</p>
                {adPreview && <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-white rounded-lg p-2 border border-gray-100 font-sans" data-testid="ad-preview">{adPreview}</pre>}
              </>
            )}
          </div>

          {/* Message Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">발송 채널</label>
            <div className="flex gap-2 flex-wrap" role="group" aria-label="발송 채널">
              {msgTypes.map(t => (
                <button
                  key={t.key}
                  aria-pressed={msgType === t.key} /* 선택을 색으로만 알리던 것 (217) */
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
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2" data-testid="recipient-blocked">
                이 고객은 발송 대상이 아닙니다(익명화됐거나 삭제됨). 창을 닫고 다른 고객을 선택해주세요.
              </p>
            ) : onlyCustomer ? (
              <div className="flex items-center gap-2 flex-wrap" data-testid="recipient-single">
                <span className="px-3 py-2 text-sm font-medium rounded-xl bg-primary-600 text-white">개별 발송: {onlyCustomer.name} ({onlyCustomer.phone ? maskPhone(onlyCustomer.phone, authUser?.role ?? 'staff') : '전화번호 없음'})</span>
                <button type="button" onClick={() => setOnlyCustomer(null)} className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">대상 바꾸기</button>
              </div>
            ) : (
            <div className="flex gap-2 flex-nowrap overflow-x-auto no-scrollbar lg:flex-wrap lg:overflow-visible py-1 -my-1 -mx-1 px-1" data-testid="recipient-chips" role="group" aria-label="수신 대상">
              {(() => {
                const keys: Segment[] = [...(['all', 'vip', 'birthday', 'novisit', 'revisit', 'churn', 'loyal', 'norebook'] as Segment[]), ...saved.list.map(sg => `saved:${sg.id}` as Segment), ...topTags(customers, 8).map(t => `tag:${t.tag}` as Segment)];
                // 빠른 발송 카드에서 넘어온 태그가 상위 8 밖이거나 그 사이 사라졌으면 칩을 하나 더 그려 (0명)으로 보이게 — 아무 칩도 안 켜진 채 조용히 0명 발송이 되지 않게
                if (resendSource && !keys.includes(`resend:${resendSource.id}` as Segment)) keys.push(`resend:${resendSource.id}` as Segment); // 다시 보내기 칩은 다른 칩을 눌렀다가도 되돌아올 수 있게 항상 (210, 207 리뷰 L-5)
                if ((recipientMode.startsWith('tag:') || recipientMode.startsWith('saved:')) && !keys.includes(recipientMode)) keys.push(recipientMode);
                return keys;
              })().map(key => ({
                key,
                label: `${segmentLabel(key, saved.list)} (${customers.filter(segmentFilter(key, revisitIds, segIds, saved.sets, resendIds)).length}명)`,
              })).map(r => (
                <button
                  key={r.key}
                  ref={recipientMode === r.key ? selectedChipRef : undefined}
                  aria-pressed={recipientMode === r.key}
                  onClick={() => setRecipientMode(r.key as typeof recipientMode)}
                  className={clsx(
                    'flex-shrink-0 whitespace-nowrap min-h-[36px] lg:min-h-0 px-3 py-2 text-sm font-medium rounded-xl border transition-all', // 폰 터치 36px·줄바꿈 금지 (213)
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
              aria-label="템플릿 선택"
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

          {/* 제목 — LMS·카카오 (템플릿 폼과 같은 기준) */}
          {msgType !== 'sms' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">메시지 제목 (LMS·카카오)</label>
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
                contentBytes > byteLimit ? 'text-red-600' : 'text-gray-400'
              )}>
                {contentBytes}/{byteLimit}바이트{msgType === 'sms' && contentBytes > SMS_BYTE_LIMIT ? ' · LMS로 발송' : ''}
              </span>
            </div>
            <textarea
              rows={5}
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
              placeholder={'발송할 메시지 내용을 입력하세요\n{고객명}은 고객 상세에서 연 개별 발송에서만 자동으로 바뀝니다 — 단체 발송은 실제 값으로 바꿔 넣으세요'}
            />
            {msgType === 'sms' && (
              <p className="text-xs text-gray-400 mt-1">SMS는 90바이트(한글 약 45자)까지 — 넘으면 자동으로 LMS로 발송됩니다</p>
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
              <p className="text-xs text-gray-500">발송 대상 (전화번호 있는 고객)</p>
              <p className="text-base font-bold text-gray-800 mt-0.5">{recipientPhones.length}명{excludedCount > 0 && <span className="ml-1.5 text-xs font-normal text-amber-700">번호 없음·자릿수 불가 {excludedCount}명 제외</span>}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">예상 발송 비용</p>
              <p className="text-base font-bold text-primary-600 mt-0.5">약 {formatPrice(estimatedCost)}</p>
            </div>
          </div>

          <div className="flex gap-3 sticky bottom-0 bg-white pt-3 -mx-6 px-6 -mb-4 pb-4 border-t border-gray-100 lg:rounded-b-2xl">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">취소</button>
            {canShareText && (
              // 모바일: 발송사 미계약이어도 문구를 카카오톡·문자 앱으로 넘겨 직접 보낼 수 있다 (2026-11-17)
              <button
                type="button"
                onClick={() => shareText(content, '고객 안내')}
                disabled={!content.trim()}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-green-700 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
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
