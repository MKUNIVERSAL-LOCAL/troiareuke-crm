// AiServiceCard — 설정 > AI 서비스 (비코어, 151, GAP A-3): 이용 방식 4종·제공사별 키/모델·연결 테스트·사용량·한국어 설정 마법사·FAQ·요금 안내
// 키 읽기/쓰기는 lib/ai/keys 한 곳, 호출은 lib/ai/adapters — 이 화면은 제공사 API 를 직접 부르지 않는다. 가짜 성공 없음: 연결 테스트는 실제 응답으로만 "연결됨".
import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2, ExternalLink, ChevronDown, KeyRound, ShieldCheck } from 'lucide-react';
import { notify } from '../../lib/notify';
import { askConfirm } from '../../lib/confirmDialog';
import { canDo, ADMIN_REQUIRED_MESSAGE } from '../../lib/permissions';
import { useAuth } from '../../contexts/AuthContext';
import { getAiKey, setAiKey, maskAiKey, looksLikeKey, getAiModel, setAiModel } from '../../lib/ai/keys';
import { modelsOf, findModel, PROVIDER_LABEL, PRICING_AS_OF, AI_PROVIDERS } from '../../lib/ai/catalog';
import { ADAPTERS } from '../../lib/ai/adapters';
import { usageLog, currentUsageMonth, USAGE_KEEP_DAYS, estimateCostUsd } from '../../lib/ai/usage';
import { summarizeAiUsage, describeAiUsageDelta } from '../../lib/ai/usageSummaryRule';
import { getCachedAiProxyStatus, refreshAiProxyStatus, onAiProxyStatusChanged } from '../../lib/aiProxy';
import type { AiProvider } from '../../lib/ai/types';

const PROVIDERS: readonly AiProvider[] = AI_PROVIDERS; // 324(리뷰 L-6): 목록은 카탈로그 한 곳에서
const IS_ELECTRON = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);

interface Guide { title: string; steps: string[]; links: { label: string; href: string }[]; note?: string }
const GUIDES: Record<AiProvider, Guide> = {
  openai: {
    title: 'ChatGPT(OpenAI) 키 받기 — 약 5분',
    steps: [
      'platform.openai.com 에 접속해 OpenAI 계정으로 로그인합니다(ChatGPT 계정과 같아도 되지만 API 는 별도 결제입니다).',
      '왼쪽 Settings → Billing 에서 결제 수단을 등록하고 선불 크레딧을 충전합니다(최소 $5 권장 — 사용한 만큼만 차감).',
      'Dashboard → API keys → "Create new secret key" 를 누르고 이름(예: 더마솔루션)을 적은 뒤 만듭니다.',
      '키는 한 번만 보입니다 — "sk-" 로 시작하는 전체를 복사해 아래 OpenAI 칸에 붙여넣고 [저장]합니다.',
      '[연결 테스트]를 눌러 "연결됨"이 뜨면 끝. 실패하면 키 전체가 복사됐는지, 크레딧이 있는지 확인하세요.',
    ],
    links: [{ label: 'OpenAI 플랫폼 로그인', href: 'https://platform.openai.com/' }, { label: 'API 키 만들기', href: 'https://platform.openai.com/api-keys' }, { label: '결제·크레딧', href: 'https://platform.openai.com/settings/organization/billing/overview' }],
  },
  claude: {
    title: 'Claude(Anthropic) 키 받기 — 약 5분',
    steps: [
      'console.anthropic.com 에 접속해 계정을 만들고 로그인합니다.',
      'Settings → Billing(Plans & billing) 에서 결제 수단을 등록하고 크레딧을 충전합니다.',
      'Settings → API Keys → "Create Key" 로 키를 만듭니다(이름 예: 더마솔루션).',
      '"sk-ant-" 로 시작하는 전체를 복사해 아래 Claude 칸에 붙여넣고 [저장]합니다.',
      '데스크톱 앱에서 [연결 테스트]를 누릅니다. 브라우저·폰에서는 Claude 가 차단(CORS)되니 OpenAI 나 Gemini 를 함께 등록해 두면 어디서나 동작합니다.',
    ],
    links: [{ label: 'Anthropic 콘솔', href: 'https://console.anthropic.com/' }, { label: 'API 키', href: 'https://console.anthropic.com/settings/keys' }],
    note: 'Claude 는 데스크톱 앱에서만 직접 호출됩니다(브라우저 CORS). 본사 AI 중계가 켜져 있으면 어디서나 됩니다.',
  },
  gemini: {
    title: 'Gemini(Google) 키 받기 — 약 3분',
    steps: [
      'aistudio.google.com 에 Google 계정으로 로그인합니다.',
      '"Get API key" → "Create API key" 를 누릅니다(무료 할당량이 있어 바로 써 볼 수 있습니다).',
      '"AIza" 로 시작하는 키를 복사해 아래 Gemini 칸에 붙여넣고 [저장]합니다.',
      '[연결 테스트]로 확인합니다. 무료 한도를 넘기면 Google Cloud 결제 연결이 필요합니다.',
    ],
    links: [{ label: 'Google AI Studio', href: 'https://aistudio.google.com/' }, { label: 'API 키 만들기', href: 'https://aistudio.google.com/app/apikey' }],
  },
};

const FAQ: { q: string; a: string }[] = [
  { q: '키를 넣었는데 "연결 실패"가 떠요', a: '키 전체(앞뒤 공백 없이)가 복사됐는지, 그 제공사에 결제 수단·크레딧이 있는지 확인하세요. 401/403 은 키 문제, 429 는 한도 초과입니다. 브라우저·폰에서 Claude 는 원래 안 됩니다(데스크톱 앱 전용).' },
  { q: '비용은 얼마나 나오나요?', a: '제공사에 질문·답변 길이(토큰)만큼 후불/선불로 냅니다. 아래 "이달 사용량"은 이 기기에서 추정한 값이고, 정확한 청구는 제공사 콘솔이 정본입니다. 보통 질문 1건에 몇 원~몇십 원 수준입니다.' },
  { q: '키는 어디에 저장되나요? 안전한가요?', a: '이 PC(또는 폰)의 앱 저장소에만 저장되고 본사·서버로 보내지 않습니다. 백업 파일·AI 대화 내용·로그에도 들어가지 않습니다. 더 안전한 보관(운영체제 키 보관함)은 준비 중입니다. 키가 새어 나간 것 같으면 제공사 콘솔에서 키를 삭제(revoke)하고 새로 만드세요.' },
  { q: '고객 이름·전화가 AI 에 나가나요?', a: '아니요. 전화번호는 가려지고 고객 이름은 "고객#번호"로 바꿔서 보냅니다. 직원 계정은 매출·직원 자료가 빠집니다.' },
  { q: '본사 AI 중계가 뭔가요?', a: '본사가 서버에 AI 키를 두고 대신 호출해 주는 방식입니다. 켜져 있으면 지점 키 없이도 되고, 지점 키가 있으면 중계 실패 때만 지점 키를 씁니다. 본사 유료 AI 상품은 준비 중입니다.' },
];

function ProviderRow({ provider, canEdit, onChanged }: { provider: AiProvider; canEdit: boolean; onChanged: () => void }) {
  const saved = getAiKey(provider);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(() => findModel(provider, getAiModel(provider)).id);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const adapter = ADAPTERS[provider];
  const browserBlocked = !adapter.browserCapable && !IS_ELECTRON;

  const save = () => {
    if (!canEdit) { notify(ADMIN_REQUIRED_MESSAGE); return; }
    const v = input.trim();
    if (!v) { notify('키를 붙여넣어 주세요.'); return; }
    if (!looksLikeKey(provider, v)) { notify.error(`${PROVIDER_LABEL[provider]} 키 형식이 아닙니다. 콘솔에서 복사한 키 전체(공백 없이)를 붙여넣어 주세요.`); return; }
    if (!setAiKey(provider, v)) { notify.error('키를 저장하지 못했습니다. 브라우저 저장소를 확인해주세요.'); return; }
    setInput(''); setTest(null);
    notify.success(`${PROVIDER_LABEL[provider]} 키를 저장했습니다. [연결 테스트]로 확인하세요.`);
    onChanged();
  };
  const remove = async () => {
    if (!canEdit) { notify(ADMIN_REQUIRED_MESSAGE); return; }
    if (!(await askConfirm({ title: 'AI 키 삭제', confirmLabel: '삭제', cancelLabel: '닫기', danger: true, message: `${PROVIDER_LABEL[provider]} 키를 이 기기에서 지울까요? 제공사 콘솔의 키는 그대로 남습니다.` }))) return;
    setAiKey(provider, ''); setTest(null);
    notify.info(`${PROVIDER_LABEL[provider]} 키를 지웠습니다.`);
    onChanged();
  };
  const runTest = async () => {
    const key = getAiKey(provider);
    if (!key) { notify('먼저 키를 저장하세요.'); return; }
    setTesting(true); setTest(null);
    try {
      const r = await adapter.testConnection(key, model);
      setTest(r);
    } finally {
      setTesting(false);
    }
  };
  const changeModel = (id: string) => { setModel(id); setAiModel(provider, id); onChanged(); };

  return (
    <div className="rounded-xl border border-gray-100 p-4 space-y-3" data-testid={`ai-provider-${provider}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-gray-900">{PROVIDER_LABEL[provider]}</p>
        {saved ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700"><KeyRound size={11} />키 저장됨 {maskAiKey(saved)}</span> : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">키 없음</span>}
        {browserBlocked && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">데스크톱 앱 전용</span>}
      </div>
      <div className="grid sm:grid-cols-[1fr_auto] gap-2">
        <input type="password" aria-label={`${PROVIDER_LABEL[provider]} 키`} value={input} onChange={e => setInput(e.target.value)} placeholder={saved ? '새 키를 붙여넣으면 교체됩니다' : provider === 'claude' ? 'sk-ant-...' : provider === 'openai' ? 'sk-...' : 'AIza...'} autoComplete="off" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300" />
        <div className="flex gap-2">
          <button type="button" onClick={save} className="px-3 py-2 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#15306e]">저장</button>
          {saved && <button type="button" onClick={() => void remove()} className="px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-xl hover:bg-red-100">삭제</button>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-gray-600" htmlFor={`ai-model-${provider}`}>모델</label>
        <select id={`ai-model-${provider}`} value={model} onChange={e => changeModel(e.target.value)} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
          {modelsOf(provider).map(m => <option key={m.id} value={m.id}>{m.label}{m.default ? ' (기본)' : ''} · 입력 ${m.inputPer1M}/출력 ${m.outputPer1M} (100만 토큰)</option>)}
        </select>
        <button type="button" onClick={() => void runTest()} disabled={!saved || testing} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50">
          {testing ? <><Loader2 size={12} className="animate-spin" />확인 중…</> : '연결 테스트'}
        </button>
        {test && (
          <span className={`inline-flex items-center gap-1 text-xs ${test.ok ? 'text-green-700' : 'text-red-600'}`} role="status" data-testid={`ai-test-${provider}`}>
            {test.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}{test.message}
          </span>
        )}
      </div>
      {provider === 'claude' && GUIDES.claude.note && <p className="text-2xs text-gray-500">{GUIDES.claude.note}</p>}
    </div>
  );
}

export default function AiServiceCard() {
  const { user } = useAuth();
  const canEdit = canDo(user?.role, 'ai.key');
  const [tick, setTick] = useState(0);
  const [proxy, setProxy] = useState(() => getCachedAiProxyStatus());
  const [openGuide, setOpenGuide] = useState<AiProvider | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  useEffect(() => {
    void refreshAiProxyStatus().then(() => setProxy(getCachedAiProxyStatus()));
    return onAiProxyStatusChanged(() => setProxy(getCachedAiProxyStatus()));
  }, []);
  const keys = { claude: getAiKey('claude'), openai: getAiKey('openai'), gemini: getAiKey('gemini') };
  const hasOwnKey = !!(keys.claude || keys.openai || keys.gemini);
  const usage = summarizeAiUsage(usageLog(), currentUsageMonth());
  const usageDelta = describeAiUsageDelta(usage);
  void tick;

  const modes = [
    { key: 'proxy', title: '본사 AI 중계', desc: '본사가 서버 키로 대신 호출 — 지점 키 불필요', active: proxy.enabled, badge: proxy.enabled ? (proxy.monthlyLimit > 0 ? `사용 중 · 이달 ${proxy.usedThisMonth}/${proxy.monthlyLimit}건` : '사용 중') : '본사 미설정' },
    { key: 'byok', title: '내 키로 직접(BYOK)', desc: '아래에 제공사 키를 등록 — 내 계정에서 사용한 만큼 결제', active: hasOwnKey, badge: hasOwnKey ? `사용 중 · ${PROVIDERS.filter(p => keys[p]).map(p => PROVIDER_LABEL[p].split(' ')[0]).join(' + ')}` : '키 미등록' },
    { key: 'paid', title: '본사 유료 AI', desc: '본사 크레딧으로 쓰는 상품 — 준비 중', active: false, badge: '준비 중' },
    { key: 'off', title: '사용 안 함', desc: 'AI 챗봇·피부 분석을 쓰지 않음', active: !proxy.enabled && !hasOwnKey, badge: !proxy.enabled && !hasOwnKey ? '현재 상태' : '' },
  ];

  return (
    <div className="space-y-5" data-testid="ai-service-card">
      <div>
        <p className="text-sm font-bold text-gray-900 mb-2">이용 방식</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {modes.map(m => (
            <div key={m.key} data-testid={`ai-mode-${m.key}`} className={`rounded-xl border p-3 ${m.active ? 'border-[#1a3a8f] bg-blue-50/40' : 'border-gray-100 bg-white'}`}>
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">{m.title}{m.active && <CheckCircle size={14} className="text-[#1a3a8f]" />}</p>
              <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
              {m.badge && <p className={`text-2xs mt-1 font-medium ${m.active ? 'text-[#1a3a8f]' : 'text-gray-500'}`}>{m.badge}</p>}
            </div>
          ))}
        </div>
        <p className="text-2xs text-gray-400 mt-1.5">우선순위: 본사 중계 → 내 키(Claude → ChatGPT → Gemini 순, 실패하면 다음 키로). AI 는 자료를 해석·추천만 하고 숫자는 프로그램이 계산합니다.</p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-bold text-gray-900">제공사 키 · 모델 {!canEdit && <span className="text-xs font-normal text-gray-500">(키 등록·삭제는 관리자만)</span>}</p>
        {PROVIDERS.map(p => <ProviderRow key={p} provider={p} canEdit={canEdit} onChanged={() => setTick(t => t + 1)} />)}
      </div>

      <div className="rounded-xl bg-slate-50 border border-gray-100 p-3 text-sm" data-testid="ai-usage">
        <p className="font-semibold text-gray-900">이달 사용량 (이 기기, 추정)</p>
        <p className="text-xs text-gray-600 mt-0.5">호출 {usage.calls}건 · 입력 {usage.input.toLocaleString()} 토큰 · 출력 {usage.output.toLocaleString()} 토큰 · 약 ${usage.usd.toFixed(2)} (참고값, 단가 {PRICING_AS_OF} 기준 — 정확한 청구는 제공사 콘솔)</p>
        {/* 319: 150 부터 날짜별·제공사별로 쌓아 온 기록을 **처음으로** 보여 준다 — 그전에는 위 한 줄뿐이어서
            어느 날·어느 제공사에서 그 비용이 났는지 알 수 없었다. 기록이 없으면 아래를 아예 만들지 않는다(빈 표 금지). */}
        {usageDelta && <p className="text-xs text-gray-600 mt-0.5" data-testid="ai-usage-delta">{usageDelta}</p>}
        {usage.byProvider.length > 0 && (
          <p className="text-xs text-gray-600 mt-1.5" data-testid="ai-usage-providers">
            {/* 324(321~323 리뷰 L-6): 규칙(`summarizeAiUsage`)이 `AI_PROVIDERS` 만 돌려주므로 라벨은 **항상 있다** —
                321 이 넣은 `?? b.provider` 는 도달하지 않는 분기였다(CLAUDE.md 2절). 그 보장은 lib-units 가 고정한다. */}
            제공사별: {usage.byProvider.map(b => `${PROVIDER_LABEL[b.provider].split(' ')[0]} ${b.calls}건`).join(' · ')}
          </p>
        )}
        {usage.daily.length > 0 && (
          <div className="mt-1.5" data-testid="ai-usage-daily">
            {/* 321(리뷰 L-7): "최근 N일" 은 **기록이 있는** 날이다 — 한 달에 흩어져 있을 수 있다 */}
            <p className="text-2xs text-gray-500">기록이 있는 최근 {usage.daily.length}일 (이달 기록이 있는 날 {usage.recordedDays}일, 이 기기 보관 {USAGE_KEEP_DAYS}일분)</p>
            <ul className="mt-1 space-y-0.5">
              {usage.daily.map(d => (
                <li key={d.date} className="flex items-center justify-between text-xs text-gray-600">
                  <span>{d.date.slice(5).replace('-', '월 ')}일</span>
                  <span>{d.calls}건 · 약 ${d.usd.toFixed(4)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-2xs text-gray-400 mt-1">예: 질문 1건(자료 3,000 토큰 + 답 500 토큰)은 {PROVIDERS.map(p => `${PROVIDER_LABEL[p].split(' ')[0]} 약 $${estimateCostUsd(p, findModel(p, getAiModel(p)).id, { input: 3000, output: 500, estimated: true }).toFixed(4)}`).join(' · ')}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold text-gray-900">처음이라면 — 설정 마법사</p>
        {PROVIDERS.map(p => (
          <div key={p} className="rounded-xl border border-gray-100">
            <button type="button" onClick={() => setOpenGuide(openGuide === p ? null : p)} aria-expanded={openGuide === p} className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-800">
              {GUIDES[p].title}<ChevronDown size={16} className={`transition-transform ${openGuide === p ? 'rotate-180' : ''}`} />
            </button>
            {openGuide === p && (
              <div className="px-4 pb-4 space-y-2" data-testid={`ai-guide-${p}`}>
                <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">{GUIDES[p].steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                <div className="flex flex-wrap gap-2">{GUIDES[p].links.map(l => <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#1a3a8f] hover:underline"><ExternalLink size={11} />{l.label}</a>)}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><ShieldCheck size={15} />자주 묻는 질문</p>
        {FAQ.map((f, i) => (
          <div key={i} className="rounded-xl border border-gray-100">
            <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i} className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm text-gray-800">{f.q}<ChevronDown size={14} className={`transition-transform ${openFaq === i ? 'rotate-180' : ''}`} /></button>
            {openFaq === i && <p className="px-4 pb-3 text-sm text-gray-600">{f.a}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
