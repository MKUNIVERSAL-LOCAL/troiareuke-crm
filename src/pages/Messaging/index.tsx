import { useState } from 'react';
import { MessageSquare, Send, Users, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import Header from '../../components/layout/Header';
import Modal from '../../components/ui/Modal';
import { mockMessageTemplates, mockMessageHistory, mockCustomers } from '../../data/mockData';
import type { MessageType } from '../../types';
import clsx from 'clsx';

type Tab = 'send' | 'templates' | 'history';

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
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

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
        action={{ label: '메시지 보내기', onClick: () => setShowSendModal(true) }}
      />

      <div className="p-8 flex-1">
        {/* Connection Status */}
        <div className="flex gap-3 mb-6">
          <StatusChip label="엔포+ SMS" connected={true} />
          <StatusChip label="카카오 채널" connected={true} />
          <StatusChip label="카카오 오픈채팅" connected={false} />
          <StatusChip label="네이버 톡톡" connected={false} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'send' && <SendPanel onSend={() => setShowSendModal(true)} />}
        {tab === 'templates' && <TemplatesPanel onSelect={setSelectedTemplate} />}
        {tab === 'history' && <HistoryPanel />}
      </div>

      {showSendModal && <SendMessageModal onClose={() => setShowSendModal(false)} initialTemplate={selectedTemplate} />}
    </div>
  );
}

function StatusChip({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className={clsx(
      'flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium',
      connected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'
    )}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', connected ? 'bg-green-500' : 'bg-gray-300')}></span>
      {label}
      {connected ? ' 연결됨' : ' 미연결'}
    </div>
  );
}

function SendPanel({ onSend }: { onSend: () => void }) {
  const autoMessages = [
    { title: '예약 확인 문자', desc: '예약 완료 시 자동 발송', type: 'sms', enabled: true },
    { title: '예약 리마인더', desc: '예약 전날 09:00 자동 발송', type: 'sms', enabled: true },
    { title: '생일 축하 메시지', desc: '생일 당일 오전 자동 발송', type: 'kakao-channel', enabled: true },
    { title: '미방문 고객 케어', desc: '60일 미방문 시 자동 발송', type: 'kakao-channel', enabled: false },
    { title: '시술 후 케어 안내', desc: '시술 완료 후 1시간 뒤 발송', type: 'sms', enabled: true },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Send Targets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: '전체 고객', count: mockCustomers.length, color: 'purple' },
          { label: 'VIP 고객', count: mockCustomers.filter(c => c.grade === 'VIP').length, color: 'yellow' },
          { label: '이번달 생일', count: 3, color: 'pink' },
          { label: '미방문 60일+', count: 2, color: 'orange' },
        ].map(t => (
          <button
            key={t.label}
            onClick={onSend}
            className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all text-left hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-3">
              <Users size={20} className="text-gray-400" />
              <span className={clsx(
                'text-xs font-bold px-2 py-0.5 rounded-full',
                t.color === 'purple' && 'bg-purple-100 text-purple-700',
                t.color === 'yellow' && 'bg-yellow-100 text-yellow-700',
                t.color === 'pink' && 'bg-pink-100 text-pink-700',
                t.color === 'orange' && 'bg-orange-100 text-orange-700',
              )}>
                {t.count}명
              </span>
            </div>
            <p className="text-sm font-bold text-gray-900">{t.label}</p>
            <p className="text-xs text-purple-500 mt-1 font-medium">메시지 발송 →</p>
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
                    <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', MSG_TYPE_COLORS[m.type])}>
                      {MSG_TYPE_LABELS[m.type]}
                    </span>
                  </div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked={m.enabled} />
                <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplatesPanel({ onSelect }: { onSelect: (id: string) => void }) {
  const categories = ['전체', '예약', '이벤트', '리텐션', '케어'];
  const [cat, setCat] = useState('전체');

  const filtered = mockMessageTemplates.filter(t => cat === '전체' || t.category === cat);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={clsx(
              'px-3 py-1.5 text-sm font-medium rounded-lg border transition-all',
              cat === c ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'
            )}
          >
            {c}
          </button>
        ))}
        <button className="ml-auto px-3 py-1.5 text-sm font-medium text-purple-600 bg-purple-50 rounded-lg border border-purple-200 hover:bg-purple-100">
          + 템플릿 추가
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(t => (
          <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">{t.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={clsx('px-2 py-0.5 rounded text-[11px] font-medium', MSG_TYPE_COLORS[t.type])}>
                    {MSG_TYPE_LABELS[t.type]}
                  </span>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[11px]">{t.category}</span>
                </div>
              </div>
              <button
                onClick={() => onSelect(t.id)}
                className="px-3 py-1.5 bg-purple-500 text-white rounded-lg text-xs font-medium hover:bg-purple-600 transition-colors"
              >
                발송
              </button>
            </div>
            <div className="px-5 py-3">
              {t.title && <p className="text-xs font-semibold text-gray-700 mb-1">{t.title}</p>}
              <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">{t.content}</p>
              {t.variables.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {t.variables.map(v => (
                    <span key={v} className="px-1.5 py-0.5 bg-purple-50 text-purple-500 rounded text-[10px]">{'{' + v + '}'}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryPanel() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">발송 이력</p>
        <p className="text-xs text-gray-400">최근 30일</p>
      </div>
      <div className="divide-y divide-gray-50">
        {mockMessageHistory.map(h => (
          <div key={h.id} className="px-6 py-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={clsx(
                  'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
                  h.status === 'sent' ? 'bg-green-100' : 'bg-red-100'
                )}>
                  {h.status === 'sent'
                    ? <CheckCircle size={16} className="text-green-600" />
                    : <AlertCircle size={16} className="text-red-500" />
                  }
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-gray-900">{h.templateName || '직접 작성'}</p>
                    <span className={clsx('px-2 py-0.5 rounded text-[11px] font-medium', MSG_TYPE_COLORS[h.type])}>
                      {MSG_TYPE_LABELS[h.type]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{h.sentAt}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-gray-800">{h.recipients}명 발송</p>
                <p className="text-xs text-green-500">성공 {h.successCount}명</p>
                {h.failCount > 0 && <p className="text-xs text-red-400">실패 {h.failCount}명</p>}
                {h.cost !== undefined && <p className="text-[11px] text-gray-400 mt-1">{h.cost.toLocaleString()}원</p>}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2 ml-11 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">{h.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SendMessageModal({ onClose, initialTemplate }: { onClose: () => void; initialTemplate: string | null }) {
  const [msgType, setMsgType] = useState<MessageType>('sms');
  const [recipientMode, setRecipientMode] = useState<'all' | 'vip' | 'custom'>('all');
  const [content, setContent] = useState('');
  const charLimit = msgType === 'sms' ? 90 : 1000;

  const msgTypes: { key: MessageType; label: string }[] = [
    { key: 'sms', label: 'SMS (단문)' },
    { key: 'lms', label: 'LMS (장문)' },
    { key: 'kakao-channel', label: '카카오 채널' },
    { key: 'kakao-openchat', label: '카카오 오픈채팅' },
  ];

  const recipientCount = {
    all: mockCustomers.length,
    vip: mockCustomers.filter(c => c.grade === 'VIP').length,
    custom: 0,
  }[recipientMode];

  const estimatedCost = msgType === 'sms' ? recipientCount * 11 : msgType === 'lms' ? recipientCount * 25 : recipientCount * 5;

  return (
    <Modal isOpen={true} onClose={onClose} title="메시지 발송" size="lg">
      <div className="space-y-5">
        {/* Message Type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">발송 채널</label>
          <div className="flex gap-2 flex-wrap">
            {msgTypes.map(t => (
              <button
                key={t.key}
                onClick={() => setMsgType(t.key)}
                className={clsx(
                  'px-3 py-2 text-sm font-medium rounded-xl border transition-all',
                  msgType === t.key
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
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
          <div className="flex gap-2">
            {[
              { key: 'all', label: `전체 (${mockCustomers.length}명)` },
              { key: 'vip', label: `VIP (${mockCustomers.filter(c => c.grade === 'VIP').length}명)` },
              { key: 'custom', label: '직접 선택' },
            ].map(r => (
              <button
                key={r.key}
                onClick={() => setRecipientMode(r.key as typeof recipientMode)}
                className={clsx(
                  'px-3 py-2 text-sm font-medium rounded-xl border transition-all',
                  recipientMode === r.key
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Template selector */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">템플릿 선택 (선택사항)</label>
          <select
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            onChange={e => {
              const tmpl = mockMessageTemplates.find(t => t.id === e.target.value);
              if (tmpl) setContent(tmpl.content);
            }}
          >
            <option value="">템플릿 선택...</option>
            {mockMessageTemplates.filter(t => t.type === msgType || (msgType !== 'kakao-channel' && msgType !== 'kakao-openchat' && ['sms','lms','mms'].includes(t.type))).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Title (Kakao only) */}
        {msgType.startsWith('kakao') && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">메시지 제목</label>
            <input type="text" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300" placeholder="제목 입력" />
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
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
            placeholder="발송할 메시지 내용을 입력하세요&#10;{고객명}, {날짜} 등의 변수를 사용할 수 있습니다"
          />
          {msgType === 'sms' && (
            <p className="text-[11px] text-gray-400 mt-1">90자 초과 시 자동으로 LMS로 전환됩니다</p>
          )}
        </div>

        {/* Schedule */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">발송 시간</label>
          <div className="flex gap-2">
            <button className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-xl border border-purple-600">즉시 발송</button>
            <button className="px-4 py-2 text-sm font-medium bg-white text-gray-600 rounded-xl border border-gray-200">예약 발송</button>
          </div>
        </div>

        {/* Cost estimate */}
        <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">예상 수신자</p>
            <p className="text-base font-bold text-gray-800 mt-0.5">{recipientCount}명</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">예상 발송 비용</p>
            <p className="text-base font-bold text-purple-600 mt-0.5">약 {estimatedCost.toLocaleString()}원</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">취소</button>
          <button className="flex-1 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-md flex items-center justify-center gap-2">
            <Send size={14} /> 발송하기
          </button>
        </div>
      </div>
    </Modal>
  );
}
