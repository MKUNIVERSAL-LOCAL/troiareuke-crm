import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, Settings, ChevronDown, Trash2, Copy, Check } from 'lucide-react';
import Header from '../../components/layout/Header';
import { CustomerStore, PaymentStore, ProductStore } from '../../lib/store';
import { mockReservations, mockStaff, mockServices, mockTreatments } from '../../data/mockData';
import { format, subDays, subMonths, parseISO, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';

type AiProvider = 'openai' | 'gemini';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_QUESTIONS = [
  '2026년 이탈 고객은 몇 명이고 누구야?',
  '이번 달 매출 현황 요약해줘',
  'VIP 고객 현황과 특징 알려줘',
  '재방문율이 낮은 고객 목록 알려줘',
  '가장 인기 있는 시술 TOP 5는?',
  '재고 부족한 제품 알려줘',
  '지난 3개월 매출 추이 분석해줘',
  '이번 달 신규 고객은 몇 명이야?',
];

function buildCrmContext(): string {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const customers = CustomerStore.getAll();
  const payments = PaymentStore.getByDateRange(
    format(subMonths(today, 12), 'yyyy-MM-dd'),
    todayStr
  );
  const products = ProductStore.getAll();

  // 이탈 고객 분석 (3개월 이상 미방문)
  const churned = customers.filter(c => {
    if (!c.lastVisitDate) return false;
    const daysSince = differenceInDays(today, parseISO(c.lastVisitDate));
    return daysSince > 90;
  });

  // 이번 달 매출
  const thisMonthStr = format(today, 'yyyy-MM');
  const thisMonthPayments = payments.filter(p => p.paymentDate.startsWith(thisMonthStr) && p.status === 'completed');
  const thisMonthRevenue = thisMonthPayments.reduce((sum, p) => sum + p.totalAmount, 0);

  // 신규 고객
  const newThisMonth = customers.filter(c => c.registeredAt.startsWith(thisMonthStr));

  // VIP 고객
  const vipCustomers = customers.filter(c => c.grade === 'VIP');

  // 재고 부족
  const lowStock = products.filter(p => p.stock <= p.minStock);

  return `
=== 트로이아르케 에스테틱 CRM 데이터 (${format(today, 'yyyy년 MM월 dd일', { locale: ko })} 기준) ===

【고객 현황】
- 전체 고객 수: ${customers.length}명
- VIP 고객: ${vipCustomers.length}명 (${customers.length > 0 ? Math.round((vipCustomers.length / customers.length) * 100) : 0}%)
- 골드 고객: ${customers.filter(c => c.grade === '골드').length}명
- 이번 달 신규 고객: ${newThisMonth.length}명
- 이탈 위험 고객 (3개월 이상 미방문): ${churned.length}명

【전체 고객 목록】
${customers.map(c => `- ${c.name} (${c.phone}) | 등급:${c.grade} | 피부타입:${c.skinType || '-'} | 총방문:${c.totalVisits}회 | 총결제:${c.totalSpent.toLocaleString()}원 | 마지막방문:${c.lastVisitDate || '없음'} | 가입:${c.registeredAt} | 유입경로:${c.referralSource || '-'}`).join('\n')}

【이탈 고객 상세 (3개월 이상 미방문)】
${churned.length === 0 ? '해당 없음' : churned.map(c => {
    const days = differenceInDays(today, parseISO(c.lastVisitDate));
    return `- ${c.name} (${c.phone}) | ${days}일 미방문 | 등급:${c.grade} | 총방문:${c.totalVisits}회 | 마지막방문:${c.lastVisitDate}`;
  }).join('\n')}

【이번 달 매출】
- 총 매출: ${thisMonthRevenue.toLocaleString()}원
- 결제 건수: ${thisMonthPayments.length}건

【전체 결제 내역 (최근 12개월)】
${payments.slice(0, 30).map(p => `- ${p.paymentDate} | ${p.customerName} | ${p.totalAmount.toLocaleString()}원 | ${p.paymentMethod} | ${p.status}`).join('\n')}

【직원 현황】
${mockStaff.map(s => `- ${s.name} (${s.role}) | 전문: ${s.specialty.join(', ')}`).join('\n')}

【시술 메뉴】
${mockServices.map(s => `- ${s.name} | ${s.category} | ${s.duration}분 | ${s.price.toLocaleString()}원`).join('\n')}

【제품/재고 현황】
${products.map(p => `- ${p.name} | 재고:${p.stock}개 | 최소재고:${p.minStock}개 | ${p.stock <= p.minStock ? '⚠️재고부족' : '정상'}`).join('\n')}

【재고 부족 제품】
${lowStock.length === 0 ? '없음' : lowStock.map(p => `- ${p.name}: 현재 ${p.stock}개 (최소 ${p.minStock}개)`).join('\n')}

【예약 현황 (최근)】
${mockReservations.slice(0, 10).map(r => `- ${r.date} ${r.startTime} | ${r.customerName} | ${r.services.map(s => s.serviceName).join('+')} | ${r.staffName} | ${r.status}`).join('\n')}

【시술 기록】
${mockTreatments.map(t => `- ${t.date} | ${t.customerName} | ${t.services.map(s => s.serviceName).join('+')} | ${t.totalAmount.toLocaleString()}원 | 담당:${t.staffName}`).join('\n')}
`.trim();
}

async function callOpenAI(apiKey: string, messages: { role: string; content: string }[], crmContext: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `당신은 트로이아르케 에스테틱 CRM의 AI 분석 어시스턴트입니다. 아래 CRM 데이터를 바탕으로 원장님의 질문에 친절하고 정확하게 한국어로 답변해주세요. 숫자는 구체적으로, 분석은 실용적으로 해주세요.\n\n${crmContext}`,
        },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'OpenAI API 오류');
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

async function callGemini(apiKey: string, messages: { role: string; content: string }[], crmContext: string): Promise<string> {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // Prepend system context to first user message
  if (contents.length > 0 && contents[0].role === 'user') {
    contents[0].parts[0].text = `[CRM 데이터]\n${crmContext}\n\n[질문]\n${contents[0].parts[0].text}`;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: '당신은 트로이아르케 에스테틱 CRM의 AI 분석 어시스턴트입니다. CRM 데이터를 바탕으로 원장님의 질문에 친절하고 정확하게 한국어로 답변해주세요. 숫자는 구체적으로, 분석은 실용적으로 해주세요.' }],
        },
        generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Gemini API 오류');
  }
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

export default function AiChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: '안녕하세요! 트로이아르케 에스테틱 CRM AI 어시스턴트입니다. 🌸\n\nCRM 데이터를 분석하여 고객 현황, 매출, 이탈 고객, 재고 등 다양한 질문에 답변해드립니다.\n\nOpenAI 또는 Gemini API 키를 설정 후 질문해주세요!',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem(`ai_key_${provider}`) || '';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('ai_key_openai') || '');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('ai_key_gemini') || '');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const key = provider === 'openai' ? openaiKey : geminiKey;
    setApiKey(key);
  }, [provider, openaiKey, geminiKey]);

  const saveKeys = () => {
    localStorage.setItem('ai_key_openai', openaiKey);
    localStorage.setItem('ai_key_gemini', geminiKey);
    setShowSettings(false);
  };

  const sendMessage = async (text?: string) => {
    const userText = (text || input).trim();
    if (!userText || isLoading) return;

    const currentKey = provider === 'openai' ? openaiKey : geminiKey;
    if (!currentKey) {
      setShowSettings(true);
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const crmContext = buildCrmContext();
      const history = [...messages, userMsg]
        .filter(m => m.id !== '0')
        .map(m => ({ role: m.role, content: m.content }));

      let responseText: string;
      if (provider === 'openai') {
        responseText = await callOpenAI(currentKey, history, crmContext);
      } else {
        responseText = await callGemini(currentKey, history, crmContext);
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ 오류가 발생했습니다: ${err.message}\n\nAPI 키를 확인해주세요.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    setMessages([{
      id: '0',
      role: 'assistant',
      content: '대화가 초기화되었습니다. 새로운 질문을 해주세요! 🌸',
      timestamp: new Date(),
    }]);
  };

  const currentKey = provider === 'openai' ? openaiKey : geminiKey;

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="AI 분석 챗봇"
        subtitle="CRM 데이터를 AI가 분석해드립니다"
      />

      <div className="flex-1 flex flex-col p-6 gap-4 max-w-4xl mx-auto w-full">
        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Provider Select */}
          <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <button
              onClick={() => setProvider('openai')}
              className={`px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${provider === 'openai' ? 'bg-[#1a3a8f] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <span className="w-4 h-4 rounded-full bg-emerald-400 flex-shrink-0" />
              ChatGPT
            </button>
            <button
              onClick={() => setProvider('gemini')}
              className={`px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${provider === 'gemini' ? 'bg-[#1a3a8f] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <span className="w-4 h-4 rounded-full bg-blue-400 flex-shrink-0" />
              Gemini
            </button>
          </div>

          {/* API Key Status */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${currentKey ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
            <span className={`w-2 h-2 rounded-full ${currentKey ? 'bg-green-500' : 'bg-red-400'}`} />
            {currentKey ? 'API 키 연결됨' : 'API 키 미설정'}
          </div>

          <div className="flex-1" />

          {/* Clear */}
          <button onClick={clearChat} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
            <Trash2 size={14} />
            초기화
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-all shadow-sm"
          >
            <Settings size={14} />
            API 키 설정
            <ChevronDown size={12} className={`transition-transform ${showSettings ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* API Key Settings Panel */}
        {showSettings && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-800">🔑 AI API 키 설정</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
                  OpenAI (ChatGPT) API 키
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">키 발급받기 →</a>
                </label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={e => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-400 inline-block" />
                  Google Gemini API 키
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">키 발급받기 →</a>
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={saveKeys}
                className="px-5 py-2 bg-[#1a3a8f] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2260] transition-all"
              >
                저장하기
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="px-5 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition-all"
              >
                닫기
              </button>
            </div>
            <p className="text-xs text-gray-400">🔒 API 키는 이 기기의 브라우저에만 저장되며 외부로 전송되지 않습니다.</p>
          </div>
        )}

        {/* Quick Questions */}
        <div className="flex gap-2 flex-wrap">
          {QUICK_QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              disabled={isLoading || !currentKey}
              className="px-3 py-1.5 text-xs bg-white border border-gray-200 text-gray-600 rounded-full hover:border-[#1a3a8f] hover:text-[#1a3a8f] hover:bg-blue-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '400px', maxHeight: '500px' }}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${msg.role === 'assistant' ? 'bg-gradient-to-br from-[#1a3a8f] to-blue-400 shadow-md shadow-blue-200' : 'bg-gray-100'}`}>
                  {msg.role === 'assistant'
                    ? <Sparkles size={14} className="text-white" />
                    : <User size={14} className="text-gray-500" />
                  }
                </div>

                {/* Bubble */}
                <div className={`flex flex-col gap-1 max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#1a3a8f] text-white rounded-tr-sm'
                      : 'bg-gray-50 text-gray-800 border border-gray-100 rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-300">
                      {format(msg.timestamp, 'HH:mm')}
                    </span>
                    {msg.role === 'assistant' && msg.id !== '0' && (
                      <button
                        onClick={() => copyMessage(msg.id, msg.content)}
                        className="text-gray-300 hover:text-gray-500 transition-colors"
                      >
                        {copiedId === msg.id
                          ? <Check size={11} className="text-green-500" />
                          : <Copy size={11} />
                        }
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1a3a8f] to-blue-400 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-200">
                  <Sparkles size={14} className="text-white" />
                </div>
                <div className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-[#1a3a8f]" />
                  <span className="text-sm text-gray-500">분석 중...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-4">
            <div className="flex gap-3 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={currentKey ? '질문을 입력하세요... (Enter로 전송, Shift+Enter 줄바꿈)' : '먼저 API 키를 설정해주세요 →'}
                disabled={isLoading || !currentKey}
                rows={1}
                className="flex-1 px-4 py-3 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
                style={{ maxHeight: '120px' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim() || !currentKey}
                className="w-10 h-10 bg-[#1a3a8f] text-white rounded-xl flex items-center justify-center hover:bg-[#0d2260] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 shadow-md shadow-blue-200"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-gray-300 mt-2 text-center">
              AI가 CRM 데이터를 직접 분석합니다 · 현재 모델: {provider === 'openai' ? 'GPT-4o mini' : 'Gemini 1.5 Flash'}
            </p>
          </div>
        </div>

        {/* Info */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: '전체 고객', value: `${CustomerStore.getAll().length}명`, color: 'blue' },
            { label: '이탈 위험', value: `${CustomerStore.getAll().filter(c => {
              if (!c.lastVisitDate) return false;
              return differenceInDays(new Date(), parseISO(c.lastVisitDate)) > 90;
            }).length}명`, color: 'red' },
            { label: '재고 부족', value: `${ProductStore.getAll().filter(p => p.stock <= p.minStock).length}개`, color: 'orange' },
          ].map(item => (
            <div key={item.label} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              <p className="text-xs text-gray-400">{item.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${item.color === 'blue' ? 'text-[#1a3a8f]' : item.color === 'red' ? 'text-red-500' : 'text-orange-500'}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
