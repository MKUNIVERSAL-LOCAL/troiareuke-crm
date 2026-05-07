import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Send, Users, FileText, CheckCircle, AlertCircle, Clock, Plus, Trash2 } from 'lucide-react';
import Header from '../../components/layout/Header';
import Modal from '../../components/ui/Modal';
import { MessageTemplateStore, MessageHistoryStore, CustomerStore, SettingsStore } from '../../lib/store';
import type { MessageType, MessageTemplate, MessageHistory } from '../../types';
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
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  const settings = SettingsStore.get();

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
          <StatusChip label="엔포+ SMS" connected={!!settings.smsApiKey} />
          <StatusChip label="카카오 채널" connected={!!settings.kakao?.channelConnected} />
          <StatusChip label="카카오 오픈채팅" connected={!!settings.kakao?.openchatConnected} />
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

        {tab === 'send' && <SendPanel onSend={() => setShowSendModal(true)} reloadKey={reloadKey} />}
        {tab === 'templates' && <TemplatesPanel onSelect={setSelectedTemplate} reloadKey={reloadKey} onReload={reload} />}
        {tab === 'history' && <HistoryPanel reloadKey={reloadKey} />}
      </div>

      {showSendModal && (
        <SendMessageModal
          onClose={() => setShowSendModal(false)}
          initialTemplate={selectedTemplate}
          onSent={reload}
        />
      )}
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

function SendPanel({ onSend, reloadKey }: { onSend: () => void; reloadKey: number }) {
  const [customers, setCustomers] = useState(CustomerStore.getAll());
  const [settings, setSettings] = useState(SettingsStore.get());

  useEffect(() => {
    setCustomers(CustomerStore.getAll());
    setSettings(SettingsStore.get());
  }, [reloadKey]);

  const autoMessages = [
    { title: '예약 확인 문자', desc: '예약 완료 시 자동 발송', type: 'sms', key: 'reservationConfirm' as const },
    { title: '예약 리마인더', desc: '예약 전날 09:00 자동 발송', type: 'sms', key: 'reservationReminder' as const },
    { title: '생일 축하 메시지', desc: '생일 당일 오전 자동 발송', type: 'kakao-channel', key: 'birthdayMessage' as const },
    { title: '미방문 고객 케어', desc: '60일 미방문 시 자동 발송', type: 'kakao-channel', key: 'novisitMessage' as const },
  ];

  const handleToggle = (key: keyof typeof settings.notificationSettings, checked: boolean) => {
    const updated = SettingsStore.save({
      notificationSettings: {
        ...settings.notificationSettings,
        [key]: checked,
      },
    });
    setSettings(updated);
  };

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
          { label: '전체 고객', count: customers.length, color: 'purple' },
          { label: 'VIP 고객', count: customers.filter(c => c.grade === 'VIP').length, color: 'yellow' },
          { label: '이번달 생일', count: birthdayCount, color: 'pink' },
          { label: '미방문 60일+', count: customers.filter(c => {
            if (!c.lastVisitDate) return false;
            const diff = Date.now() - new Date(c.lastVisitDate).getTime();
            return diff > 60 * 86400000;
          }).length, color: 'orange' },
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
                    <span className={clsx('px-1.5 py-0.5 rounded text-xs font-medium', MSG_TYPE_COLORS[m.type])}>
                      {MSG_TYPE_LABELS[m.type]}
                    </span>
                  </div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.notificationSettings[m.key]}
                  onChange={e => handleToggle(m.key, e.target.checked)}
                />
                <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
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

  useEffect(() => {
    setTemplates(MessageTemplateStore.getAll());
  }, [reloadKey]);

  const filtered = templates.filter(t => cat === '전체' || t.category === cat);

  const handleDelete = (id: string) => {
    MessageTemplateStore.delete(id);
    setTemplates(MessageTemplateStore.getAll());
    onReload();
  };

  const handleAdded = () => {
    setShowAddModal(false);
    setTemplates(MessageTemplateStore.getAll());
    onReload();
  };

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
        <button
          onClick={() => setShowAddModal(true)}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-purple-600 bg-purple-50 rounded-lg border border-purple-200 hover:bg-purple-100"
        >
          <Plus size={14} /> 템플릿 추가
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="삭제"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={() => onSelect(t.id)}
                  className="px-3 py-1.5 bg-purple-500 text-white rounded-lg text-xs font-medium hover:bg-purple-600 transition-colors"
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
                    <span key={v} className="px-1.5 py-0.5 bg-purple-50 text-purple-500 rounded text-xs">{'{' + v + '}'}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && <AddTemplateModal onClose={() => setShowAddModal(false)} onSaved={handleAdded} />}
    </div>
  );
}

function AddTemplateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<MessageTemplate['type']>('sms');
  const [category, setCategory] = useState('예약');
  const [content, setContent] = useState('');
  const [variablesStr, setVariablesStr] = useState('');

  const handleSave = () => {
    if (!name.trim() || !content.trim()) return;
    const variables = variablesStr
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
    MessageTemplateStore.save({
      name: name.trim(),
      type,
      category,
      content: content.trim(),
      variables,
    });
    onSaved();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="템플릿 추가" size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">템플릿 이름 *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
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
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
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
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">메시지 내용 *</label>
          <textarea
            rows={5}
            value={content}
            onChange={e => setContent(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
            placeholder="메시지 내용을 입력하세요"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">변수 (쉼표로 구분)</label>
          <input
            type="text"
            value={variablesStr}
            onChange={e => setVariablesStr(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            placeholder="예: 고객명, 날짜, 시간"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">취소</button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !content.trim()}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Plus size={14} /> 저장
          </button>
        </div>
      </div>
    </Modal>
  );
}

function HistoryPanel({ reloadKey }: { reloadKey: number }) {
  const [history, setHistory] = useState<MessageHistory[]>(MessageHistoryStore.getAll());

  useEffect(() => {
    setHistory(MessageHistoryStore.getAll());
  }, [reloadKey]);

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">발송 이력</p>
          <p className="text-xs text-gray-400">최근 30일</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Clock size={40} className="mb-3 text-gray-300" />
          <p className="text-sm font-medium">발송 이력이 없습니다</p>
          <p className="text-xs mt-1">메시지를 발송하면 이곳에 이력이 표시됩니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">발송 이력</p>
        <p className="text-xs text-gray-400">최근 30일</p>
      </div>
      <div className="divide-y divide-gray-50">
        {history.map(h => (
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

function SendMessageModal({ onClose, initialTemplate, onSent }: { onClose: () => void; initialTemplate: string | null; onSent: () => void }) {
  const [msgType, setMsgType] = useState<MessageType>('sms');
  const [recipientMode, setRecipientMode] = useState<'all' | 'vip' | 'custom'>('all');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplate);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const charLimit = msgType === 'sms' ? 90 : 1000;

  const customers = CustomerStore.getAll();
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

  const msgTypes: { key: MessageType; label: string }[] = [
    { key: 'sms', label: 'SMS (단문)' },
    { key: 'lms', label: 'LMS (장문)' },
    { key: 'kakao-channel', label: '카카오 채널' },
    { key: 'kakao-openchat', label: '카카오 오픈채팅' },
  ];

  const recipientCount = {
    all: customers.length,
    vip: customers.filter(c => c.grade === 'VIP').length,
    custom: 0,
  }[recipientMode];

  const estimatedCost = msgType === 'sms' ? recipientCount * 11 : msgType === 'lms' ? recipientCount * 25 : recipientCount * 5;

  const handleSend = () => {
    if (!content.trim() || recipientCount === 0) return;
    setSending(true);

    const selectedTemplate = selectedTemplateId ? templates.find(t => t.id === selectedTemplateId) : null;

    MessageHistoryStore.save({
      type: msgType,
      templateId: selectedTemplate?.id,
      templateName: selectedTemplate?.name,
      title: title || undefined,
      content: content.trim(),
      recipients: recipientCount,
      successCount: recipientCount,
      failCount: 0,
      sentAt: new Date().toLocaleString(),
      status: 'sent',
      cost: estimatedCost,
    });

    setSending(false);
    setSent(true);
    onSent();

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="메시지 발송" size="lg">
      {sent ? (
        <div className="flex flex-col items-center justify-center py-12">
          <CheckCircle size={48} className="text-green-500 mb-3" />
          <p className="text-lg font-bold text-gray-900">발송 완료!</p>
          <p className="text-sm text-gray-500 mt-1">{recipientCount}명에게 메시지가 발송되었습니다</p>
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
                { key: 'all', label: `전체 (${customers.length}명)` },
                { key: 'vip', label: `VIP (${customers.filter(c => c.grade === 'VIP').length}명)` },
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
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
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
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
              placeholder={'발송할 메시지 내용을 입력하세요\n{고객명}, {날짜} 등의 변수를 사용할 수 있습니다'}
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
            <button
              onClick={handleSend}
              disabled={sending || !content.trim()}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={14} /> 발송하기
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
