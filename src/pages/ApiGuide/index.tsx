import { useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, ChevronDown, ChevronUp, AlertCircle, CreditCard } from 'lucide-react';
import Header from '../../components/layout/Header';
import clsx from 'clsx';

type Status = 'connected' | 'pending' | 'not-started';

interface ApiItem {
  id: string;
  name: string;
  category: string;
  priority: 'must' | 'recommended' | 'optional';
  status: Status;
  description: string;
  purpose: string;
  steps: string[];
  docs: string;
  cost: string;
  estimatedTime: string;
}

const apis: ApiItem[] = [
  {
    id: 'naver-booking',
    name: '네이버 예약 (스마트플레이스)',
    category: '예약',
    priority: 'must',
    status: 'not-started',
    description: '네이버 스마트플레이스에서 들어오는 예약을 CRM으로 연동합니다. 현재 2가지 방식을 지원합니다.',
    purpose: '네이버 예약 → CRM 연동으로 예약 통합 관리, 고객·매출 데이터 자동 집계',
    steps: [
      '【사전 준비】 네이버 스마트플레이스 (smartplace.naver.com) 에 사업자 등록이 되어 있어야 합니다',
      '【사전 준비】 스마트플레이스 > 예약 > 설정 > "예약받기"가 "시작" 상태인지 확인',
      '【방법 A — 수동 연동 (즉시 가능)】 스마트플레이스에서 예약이 들어오면 CRM "예약 관리 > + 예약 추가"로 직접 등록',
      '【방법 A】 예약 추가 시 "예약경로"를 "네이버"로 선택하면 네이버 유입 고객 통계가 자동 집계됩니다',
      '【방법 B — 자동 연동 (솔루션 파트너 등록 필요)】 네이버 솔루션 파트너센터에 CRM 솔루션 등록 신청',
      '【방법 B】 파트너 심사 승인 후 API Key 및 PlaceID 발급',
      '【방법 B】 설정 > 연동 설정 > 네이버 예약에 API Key / PlaceID 입력',
      '【방법 B】 테스트 예약 1건 생성하여 CRM 자동 동기화 확인',
      '【참고】 자동 연동 시 네이버 예약 확정 방식은 "예약신청과 동시에 확정"으로 설정해야 합니다',
      '【참고】 네이버페이 결제 예약의 경우 예약시간·담당자·시술항목 변경이 불가합니다 (네이버 정책)',
    ],
    docs: 'https://smartplace.naver.com',
    cost: '무료 (스마트플레이스 기본 제공)',
    estimatedTime: '방법A: 즉시 / 방법B: 2~4주 (파트너 심사)',
  },
  {
    id: 'kakao-channel',
    name: '카카오 채널 (카카오톡 비즈)',
    category: '메시지',
    priority: 'must',
    status: 'not-started',
    description: '카카오톡으로 예약 확인, 리마인더, 마케팅 메시지를 발송합니다.',
    purpose: '예약 확인 알림톡, 생일 메시지, 미방문 고객 케어 자동 발송',
    steps: [
      '카카오 비즈니스 (business.kakao.com) 채널 개설',
      '사업자등록증 제출 후 채널 인증 완료',
      '카카오 i 오픈빌더 또는 알림톡 비즈메시지 신청',
      '채널 ID 및 API Key 발급',
      '발송 템플릿 사전 등록 (카카오 승인 필요, 1~3일)',
      '설정 > 연동 설정 > 카카오 채널에 정보 입력',
    ],
    docs: 'https://business.kakao.com/info/bizmessage',
    cost: '알림톡 건당 7~15원, 친구톡 건당 5~15원',
    estimatedTime: '3~5 영업일 (채널 인증 + 템플릿 승인)',
  },
  {
    id: 'nhn-sms',
    name: '엔포+ SMS (NHN Cloud)',
    category: '메시지',
    priority: 'must',
    status: 'pending',
    description: 'SMS·LMS 문자 메시지를 발송합니다. 카카오 미사용 고객 대상.',
    purpose: '예약 확인 문자, 이벤트 공지, 장문 안내 (LMS), 사진 포함 (MMS)',
    steps: [
      'NHN Cloud (console.nhncloud.com) 회원가입',
      '콘솔 > Notification > SMS 서비스 활성화',
      '발신번호 등록 (사업자 또는 개인 명의 전화번호, 통신사 인증 필요)',
      'API Key (AppKey) 발급',
      '설정 > 연동 설정 > SMS에 AppKey 및 발신번호 입력',
      '테스트 문자 발송으로 확인',
    ],
    docs: 'https://docs.nhncloud.com/ko/Notification/SMS/ko/Overview/',
    cost: 'SMS 9원/건, LMS 27원/건, MMS 65원/건',
    estimatedTime: '1~2 영업일 (발신번호 인증)',
  },
  {
    id: 'kakao-openchat',
    name: '카카오 오픈채팅 연동',
    category: '메시지',
    priority: 'recommended',
    status: 'not-started',
    description: '오픈채팅방을 통해 그룹 고객에게 공지사항·이벤트를 전달합니다.',
    purpose: '단골 고객 커뮤니티 운영, 이벤트 공지, 신규 시술 안내',
    steps: [
      '카카오톡 앱에서 오픈채팅방 개설 (채널 계정으로)',
      '오픈채팅방 URL 복사',
      '설정 > 연동 설정 > 카카오 오픈채팅 URL 입력',
      '메시지 발송 시 "카카오 오픈채팅" 채널 선택하여 발송',
    ],
    docs: 'https://open.kakao.com/',
    cost: '무료',
    estimatedTime: '30분 (즉시 설정 가능)',
  },
  {
    id: 'naver-login',
    name: '네이버 소셜 로그인',
    category: '인증',
    priority: 'recommended',
    status: 'not-started',
    description: '직원이 네이버 계정으로 간편하게 로그인할 수 있습니다.',
    purpose: '직원 계정 관리 간소화, 별도 비밀번호 불필요',
    steps: [
      'Naver Developers (developers.naver.com) 애플리케이션 등록',
      '서비스 URL 및 Callback URL 설정',
      'Client ID / Client Secret 발급',
      '백엔드 OAuth 2.0 연동 코드 적용',
    ],
    docs: 'https://developers.naver.com/docs/login/overview/',
    cost: '무료',
    estimatedTime: '반나절~1일',
  },
  {
    id: 'kakao-login',
    name: '카카오 소셜 로그인',
    category: '인증',
    priority: 'recommended',
    status: 'not-started',
    description: '카카오 계정으로 간편 로그인/회원가입을 지원합니다.',
    purpose: '사용자 편의 향상, 비밀번호 분실 문의 감소',
    steps: [
      'Kakao Developers (developers.kakao.com) 앱 생성',
      '카카오 로그인 기능 ON, Redirect URI 등록',
      'REST API Key 발급',
      'OAuth 2.0 인증 플로우 백엔드 연동',
    ],
    docs: 'https://developers.kakao.com/docs/latest/ko/kakaologin/common',
    cost: '무료',
    estimatedTime: '반나절~1일',
  },
  {
    id: 'toss-customer',
    name: '토스페이먼츠 (고객 현장 결제)',
    category: '결제',
    priority: 'recommended',
    status: 'not-started',
    description: '샵에서 고객 시술비 결제를 받을 때 사용합니다.',
    purpose: '카드·계좌이체·간편결제 (카카오페이, 네이버페이 등) 통합 수납',
    steps: [
      '토스페이먼츠 (https://toss.im/payment) 사업자 가입',
      '사업자등록증·통장사본 제출 후 심사 (3~5 영업일)',
      '테스트키 / 라이브키 발급',
      '결제 위젯 또는 API 방식 선택 후 개발 적용',
      '결제 완료 후 자동 정산 (D+2 영업일)',
    ],
    docs: 'https://docs.tosspayments.com/',
    cost: '신용카드 2.2%, 계좌이체 0.7%, 간편결제 1.5~2%',
    estimatedTime: '5~7 영업일 (심사 포함)',
  },
  {
    id: 'toss-saas',
    name: '토스페이먼츠 (SaaS 구독 결제)',
    category: '결제',
    priority: 'must',
    status: 'not-started',
    description: 'CRM 솔루션 월 이용료를 샵 사장님께 정기 결제로 받습니다.',
    purpose: '월간/연간 구독 자동 결제, 카드 정기결제, 결제 실패 재시도',
    steps: [
      '토스페이먼츠 정기결제(빌링) 기능 신청',
      '빌링키 발급 플로우 개발 (최초 카드 등록)',
      '구독 결제 스케줄러 개발 (매월 자동 청구)',
      '결제 실패 시 재시도·알림 로직 개발',
      '구독 관리 페이지 (업그레이드/해지) 개발',
    ],
    docs: 'https://docs.tosspayments.com/guides/billing',
    cost: '신용카드 정기결제 2.2%',
    estimatedTime: '개발 2~4주 (정기결제 플로우 전체)',
  },
  {
    id: 'portone',
    name: '포트원 (PortOne) — 대안 PG 통합',
    category: '결제',
    priority: 'optional',
    status: 'not-started',
    description: '하나의 API로 토스·KCP·이니시스 등 여러 PG사를 사용할 수 있습니다.',
    purpose: 'PG사 이중화, 한 API로 다양한 결제수단 지원',
    steps: [
      '포트원 (https://portone.io) 계정 생성',
      '원하는 PG사 선택 및 계약',
      '포트원 콘솔에서 가맹점 설정',
      '포트원 SDK 프론트엔드/백엔드 적용',
    ],
    docs: 'https://developers.portone.io/',
    cost: '플랜별 상이 (Starter 무료, 거래 수수료 별도)',
    estimatedTime: '3~5 영업일',
  },
  {
    id: 'google-calendar',
    name: 'Google 캘린더 연동',
    category: '연동',
    priority: 'optional',
    status: 'not-started',
    description: '예약을 구글 캘린더와 양방향 동기화합니다.',
    purpose: '직원 개인 캘린더에서 예약 확인, 모바일 알림 수신',
    steps: [
      'Google Cloud Console 프로젝트 생성',
      'Calendar API 활성화',
      'OAuth 2.0 클라이언트 ID 생성',
      'Google Calendar API 연동 개발',
    ],
    docs: 'https://developers.google.com/calendar',
    cost: '무료 (할당량 이내)',
    estimatedTime: '1~2일',
  },
];

const categories = ['전체', '예약', '메시지', '인증', '결제', '연동'];
const priorities = { must: { label: '필수', color: 'bg-red-100 text-red-700' }, recommended: { label: '권장', color: 'bg-orange-100 text-orange-700' }, optional: { label: '선택', color: 'bg-gray-100 text-gray-600' } };
const statuses = { connected: { label: '✅ 연동완료', color: 'text-green-600' }, pending: { label: '⏳ 진행중', color: 'text-orange-500' }, 'not-started': { label: '⬜ 미시작', color: 'text-gray-400' } };

export default function ApiGuide() {
  const [category, setCategory] = useState('전체');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<Record<string, Status>>({});

  const getStatus = (api: ApiItem): Status => localStatus[api.id] ?? api.status;

  const filtered = apis.filter(a => category === '전체' || a.category === category);
  const connectedCount = apis.filter(a => getStatus(a) === 'connected').length;

  const toggleStatus = (id: string, current: Status) => {
    const next: Status = current === 'not-started' ? 'pending' : current === 'pending' ? 'connected' : 'not-started';
    setLocalStatus(p => ({ ...p, [id]: next }));
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="API 연동 가이드" subtitle="순서대로 연동하면 완성됩니다" />
      <div className="p-8 flex-1">

        {/* Progress */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">연동 진행률</h3>
              <p className="text-xs text-gray-400 mt-0.5">{connectedCount} / {apis.length} 연동 완료</p>
            </div>
            <span className="text-2xl font-black text-[#1a3a8f]">{Math.round((connectedCount / apis.length) * 100)}%</span>
          </div>
          <div className="bg-gray-100 rounded-full h-2.5">
            <div className="bg-[#1a3a8f] rounded-full h-2.5 transition-all duration-500" style={{ width: `${(connectedCount / apis.length) * 100}%` }} />
          </div>
          <div className="flex gap-4 mt-4 text-xs">
            {(['connected', 'pending', 'not-started'] as Status[]).map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <span className={statuses[s].color + ' font-medium'}>{statuses[s].label}</span>
                <span className="text-gray-400">({apis.filter(a => getStatus(a) === s).length}개)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={clsx('px-4 py-2 text-sm font-medium rounded-xl border transition-all',
                category === c ? 'bg-[#1a3a8f] text-white border-[#1a3a8f] shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300')}>
              {c}
            </button>
          ))}
        </div>

        {/* API Cards */}
        <div className="space-y-3">
          {filtered.map((api, idx) => {
            const st = getStatus(api);
            const isOpen = expandedId === api.id;
            return (
              <div key={api.id} className={clsx('bg-white rounded-2xl border shadow-sm overflow-hidden transition-all',
                st === 'connected' ? 'border-green-200' : st === 'pending' ? 'border-orange-200' : 'border-gray-100')}>
                <div className="flex items-center gap-4 px-6 py-4 cursor-pointer" onClick={() => setExpandedId(isOpen ? null : api.id)}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{api.name}</p>
                      <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-bold', priorities[api.priority].color)}>{priorities[api.priority].label}</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[11px]">{api.category}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{api.description}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); toggleStatus(api.id, st); }}
                      className={clsx('text-xs font-medium', statuses[st].color)}>
                      {statuses[st].label}
                    </button>
                    {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </div>

                {isOpen && (
                  <div className="px-6 pb-6 border-t border-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 mb-5">
                      <InfoBox label="목적" value={api.purpose} />
                      <InfoBox label="비용" value={api.cost} />
                      <InfoBox label="소요 시간" value={api.estimatedTime} />
                    </div>

                    <div className="mb-5">
                      <p className="text-xs font-bold text-gray-700 mb-3">📋 연동 단계</p>
                      <div className="space-y-2">
                        {api.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-full bg-[#1a3a8f] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</div>
                            <p className="text-sm text-gray-700 leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <a href={api.docs} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-[#1a3a8f] text-white text-sm font-medium rounded-xl hover:bg-[#0d2260] transition-colors">
                        <ExternalLink size={13} /> 공식 문서 보기
                      </a>
                      <button
                        onClick={() => toggleStatus(api.id, st)}
                        className={clsx('flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border-2 transition-all',
                          st === 'connected' ? 'border-green-500 text-green-600 bg-green-50' : 'border-gray-200 text-gray-600 hover:border-blue-300')}>
                        {st === 'connected' ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                        {st === 'connected' ? '연동 완료' : st === 'pending' ? '진행 중으로 표시' : '완료로 표시'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Payment SaaS Section */}
        <div className="mt-8 bg-gradient-to-br from-[#1a3a8f] to-[#0d2260] rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard size={22} />
            <h3 className="text-base font-bold">💳 SaaS 구독 결제 — 이용료를 받으려면</h3>
          </div>
          <p className="text-blue-200 text-sm mb-5">고객(샵 원장님)에게 월 이용료를 받는 구독 결제 시스템 구축 가이드</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {[
              { plan: 'Starter', price: '29,000원/월', features: '1개 샵, 직원 3명, SMS 100건' },
              { plan: 'Pro', price: '59,000원/월', features: '2개 샵, 직원 무제한, SMS 300건', highlight: true },
              { plan: 'Enterprise', price: '협의', features: '무제한 샵, 전담 지원, 커스터마이징' },
            ].map(p => (
              <div key={p.plan} className={clsx('rounded-xl p-4', p.highlight ? 'bg-white/20 border-2 border-white/40' : 'bg-white/10')}>
                <p className="font-bold text-sm">{p.plan}</p>
                <p className="text-lg font-black mt-1">{p.price}</p>
                <p className="text-blue-200 text-xs mt-1">{p.features}</p>
              </div>
            ))}
          </div>
          <div className="bg-white/10 rounded-xl p-4 space-y-2">
            <p className="text-sm font-bold mb-2">구축 순서</p>
            {[
              '토스페이먼츠 가입 → 정기결제(빌링) 기능 신청',
              '회원가입 시 카드 등록 플로우 개발 (빌링키 발급)',
              '매월 자동 결제 스케줄러 개발',
              '결제 실패 시 재시도·이메일 알림 개발',
              '관리자 대시보드: 구독 현황·매출 통계 개발',
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-blue-100">
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                {s}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <a href="https://docs.tosspayments.com/guides/billing" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-white text-[#1a3a8f] text-sm font-bold rounded-xl hover:bg-blue-50 transition-colors">
              <ExternalLink size={13} /> 토스페이먼츠 정기결제 문서
            </a>
            <a href="https://developers.portone.io/" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white text-sm font-medium rounded-xl hover:bg-white/30 transition-colors">
              포트원 대안 보기
            </a>
          </div>
        </div>

        {/* Alert */}
        <div className="mt-4 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700">
            <strong>백엔드 서버가 필요합니다.</strong> 위 API들은 실제 서버(Node.js, Python 등)와 데이터베이스(PostgreSQL 등)가 있어야 연동됩니다. 현재는 프론트엔드 프로토타입 단계입니다. 상용화를 위해서는 백엔드 개발이 필요합니다.
          </div>
        </div>

      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-[11px] font-bold text-gray-400 mb-1">{label}</p>
      <p className="text-sm text-gray-700 leading-relaxed">{value}</p>
    </div>
  );
}
