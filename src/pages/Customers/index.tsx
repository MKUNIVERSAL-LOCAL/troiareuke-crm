import { useState, useEffect } from 'react';
import {
  Search, Plus, Phone, Star, Calendar, TrendingUp,
  User, ChevronRight, AlertCircle, X, CheckCircle,
  Scissors, ShoppingBag, ChevronDown, Tag, Clock, Minus,
  Sparkles, Activity
} from 'lucide-react';
import { CustomerStore, ProgramStore, CustomerProgramStore, TreatmentLogStore, StaffStore, ServiceStore } from '../../lib/store';
import {
  ConsultationStore, loadConsultations, deriveSkinType, buildSolutionDraft
} from '../../lib/consultationStore';
import { HOMECARE_PROBLEMS, recommendHomecare } from '../../data/homecareGuide';
import type { Customer, CustomerGrade, Gender, Program, CustomerProgram, PaymentMethod, Consultation, BeaconMetrics } from '../../types';
import { maskPhone } from '../../lib/masking';
import { useAuth } from '../../contexts/AuthContext';
import { formatPrice, formatDate, todayISO as today } from '../../lib/format';

// 피부 고민 체크리스트 (한국 에스테틱 상담 실무 기준)
const CONCERN_GROUPS: { group: string; items: string[] }[] = [
  { group: '수분·유분', items: ['건조함', '속건조', '번들거림', '유수분 불균형'] },
  { group: '모공·각질', items: ['모공 늘어짐', '블랙헤드', '각질', '피지 과다'] },
  { group: '색소', items: ['기미', '잡티', '주근깨', '색소침착', '칙칙함'] },
  { group: '주름·탄력', items: ['잔주름', '탄력 저하', '처짐', '팔자주름'] },
  { group: '트러블', items: ['여드름', '뾰루지', '좁쌀', '여드름 흉터'] },
  { group: '민감·장벽', items: ['민감성', '붉어짐', '따가움', '홍조'] },
  { group: '기타', items: ['다크서클', '안색 저하', '푸석함'] },
];

// 비컨(AI 피부진단기) 측정 지표 — 0~100
const BEACON_FIELDS: { key: keyof BeaconMetrics; label: string; hint: string }[] = [
  { key: 'moisture', label: '수분', hint: '높을수록 촉촉' },
  { key: 'oil', label: '유분', hint: '높을수록 유분 많음' },
  { key: 'elasticity', label: '탄력', hint: '높을수록 탄탄' },
  { key: 'pigmentation', label: '색소침착', hint: '높을수록 침착 심함' },
  { key: 'pore', label: '모공', hint: '높을수록 모공 큼' },
  { key: 'wrinkle', label: '주름', hint: '높을수록 주름 많음' },
  { key: 'redness', label: '홍조', hint: '높을수록 붉음' },
  { key: 'sensitivity', label: '민감도', hint: '높을수록 민감' },
  { key: 'skinTone', label: '피부톤', hint: '높을수록 밝음' },
];

const SKIN_TYPES = ['건성', '지성', '복합성', '민감성', '중성'];

const emptyConsultForm = () => ({
  consultDate: today(),
  staffName: '',
  concerns: [] as string[],
  homecareProblems: [] as string[], // 홈케어 추천용 피부 문제(세트 타입) 체크
  metrics: {} as Record<string, string>, // 입력 편의를 위해 문자열로 보관
  skinTypeResult: '',
  managerNote: '',
  recommendedSolution: '',
  recommendedProducts: '',
  nextConsultDate: '',
});

const GRADE_COLORS: Record<CustomerGrade, string> = {
  VIP: 'bg-yellow-100 text-yellow-700',
  골드: 'bg-orange-100 text-orange-700',
  일반: 'bg-blue-100 text-blue-700',
  신규: 'bg-green-100 text-green-700',
};
const GRADES: CustomerGrade[] = ['VIP', '골드', '일반', '신규'];
const PAYMENT_METHODS: PaymentMethod[] = ['카드', '현금', '계좌이체', '카카오페이'];

function getDaysSince(d?: string) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}
function calcExpiryDate(days?: number | null) {
  if (!days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [customerPrograms, setCustomerPrograms] = useState<CustomerProgram[]>([]);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<CustomerGrade | '전체'>('전체');

  // 고객 추가 모달
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', phone: '', gender: '여성' as Gender, grade: '신규' as CustomerGrade, skinType: '', memo: '', birthDate: '', referralSource: '' });

  // 등급(VIP) 변경 드롭다운
  const [showGradeMenu, setShowGradeMenu] = useState(false);

  // 선택된 고객의 등급을 변경 (뱃지 클릭 → 드롭다운)
  function changeGrade(grade: CustomerGrade) {
    if (!selected || selected.grade === grade) { setShowGradeMenu(false); return; }
    CustomerStore.update(selected.id, { grade });
    const updated = CustomerStore.getById(selected.id);
    if (updated) setSelected(updated);
    loadAll();          // 목록 뱃지도 갱신
    setShowGradeMenu(false);
  }

  // 프로그램 등록 모달
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [progForm, setProgForm] = useState({ programId: '', pricePaid: '', paymentMethod: '카드' as PaymentMethod, purchaseDate: today(), notes: '' });

  // 시술 기록 (차감) 모달
  const [showTreatmentModal, setShowTreatmentModal] = useState(false);
  const [treatForm, setTreatForm] = useState({
    customerProgramId: '',
    staffName: '',
    treatmentDate: today(),
    treatmentTime: '',
    treatmentDetails: '',
    skinCondition: '',
    staffNotes: '',
    nextAppointment: '',
  });

  // 피부상담 모달
  const [showConsultModal, setShowConsultModal] = useState(false);
  const [consultForm, setConsultForm] = useState(emptyConsultForm());
  const [consultations, setConsultations] = useState<Consultation[]>([]);

  useEffect(() => {
    loadAll();
    // 상담 기록 Supabase에서 1회 동기화 후 캐시 반영
    loadConsultations().catch(() => {});
  }, []);

  useEffect(() => {
    if (selected) {
      setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
      setConsultations(ConsultationStore.getByCustomer(selected.id));
    }
  }, [selected]);

  // 입력된 비컨 측정값(문자열)을 BeaconMetrics(숫자)로 변환
  function parseMetrics(m: Record<string, string>): BeaconMetrics {
    const out: BeaconMetrics = {};
    for (const { key } of BEACON_FIELDS) {
      const raw = m[key as string];
      if (raw !== undefined && raw !== '') {
        const n = Math.max(0, Math.min(100, parseInt(raw, 10)));
        if (!Number.isNaN(n)) (out as any)[key] = n;
      }
    }
    return out;
  }

  // 비컨값 입력 시 피부타입·솔루션 초안 자동 제안
  function applyDiagnosisDraft(nextMetrics: Record<string, string>, concerns: string[]) {
    const parsed = parseMetrics(nextMetrics);
    const type = deriveSkinType(parsed);
    const draft = buildSolutionDraft(parsed, concerns);
    setConsultForm(f => ({
      ...f,
      metrics: nextMetrics,
      skinTypeResult: f.skinTypeResult || type,
      recommendedSolution: draft,
    }));
  }

  // 피부상담 저장
  function handleSaveConsultation(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    ConsultationStore.save({
      customerId: selected.id,
      customerName: selected.name,
      consultDate: consultForm.consultDate,
      staffName: consultForm.staffName || undefined,
      concerns: consultForm.concerns,
      beaconMetrics: parseMetrics(consultForm.metrics),
      skinTypeResult: consultForm.skinTypeResult || undefined,
      managerNote: consultForm.managerNote || undefined,
      recommendedSolution: consultForm.recommendedSolution || undefined,
      recommendedProducts: consultForm.recommendedProducts
        ? consultForm.recommendedProducts.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      nextConsultDate: consultForm.nextConsultDate || undefined,
      photos: [],
    });
    // 상담에서 판정한 피부타입을 고객 프로필에도 반영(있을 때)
    if (consultForm.skinTypeResult && consultForm.skinTypeResult !== selected.skinType) {
      CustomerStore.update(selected.id, { skinType: consultForm.skinTypeResult });
      const updated = CustomerStore.getById(selected.id);
      if (updated) setSelected(updated);
    }
    setConsultations(ConsultationStore.getByCustomer(selected.id));
    setShowConsultModal(false);
    setConsultForm(emptyConsultForm());
  }

  function toggleConcern(item: string) {
    setConsultForm(f => {
      const has = f.concerns.includes(item);
      const concerns = has ? f.concerns.filter(c => c !== item) : [...f.concerns, item];
      return { ...f, concerns };
    });
  }

  // 홈케어 추천용 피부 문제(세트 타입) 토글
  function toggleHomecareProblem(problem: string) {
    setConsultForm(f => {
      const has = f.homecareProblems.includes(problem);
      const homecareProblems = has
        ? f.homecareProblems.filter(p => p !== problem)
        : [...f.homecareProblems, problem];
      return { ...f, homecareProblems };
    });
  }

  // 체크된 피부 문제 → 추천 홈케어 세트를 '추천 제품·솔루션' 칸에 자동 반영
  function applyHomecareRecommendation() {
    const sets = recommendHomecare(consultForm.homecareProblems);
    if (sets.length === 0) return;
    // 추천 제품: 세트별 스텝 제품을 중복 없이 모음
    const products = Array.from(new Set(sets.flatMap(s => s.steps)));
    // 솔루션 요약: 세트명 + 설명
    const summary = sets.map(s => `[${s.name}] ${s.description}`).join('\n');
    setConsultForm(f => ({
      ...f,
      recommendedProducts: products.join(', '),
      recommendedSolution: f.recommendedSolution
        ? `${f.recommendedSolution}\n\n■ 추천 홈케어\n${summary}`
        : `■ 추천 홈케어\n${summary}`,
    }));
  }

  // 신규 → 일반(기존고객) 자동 승급: 등록 90일 경과 + 시술 3회 이상
  // (목록을 불러올 때마다 점검 — 조건 충족 시 1회만 승급되고 이후엔 '신규'가 아니라 재실행 안 됨)
  function autoPromoteNewCustomers() {
    const NINETY_DAYS = 90 * 86400000;
    const now = Date.now();
    CustomerStore.getAll().forEach(c => {
      if (c.grade !== '신규' || c.id.startsWith('sample_') || !c.registeredAt) return;
      const aged = now - new Date(c.registeredAt).getTime() >= NINETY_DAYS;
      if (!aged) return;
      const treatmentCount = TreatmentLogStore.getByCustomer(c.id).length;
      if (treatmentCount >= 3) {
        CustomerStore.update(c.id, { grade: '일반' });
      }
    });
  }

  function loadAll() {
    autoPromoteNewCustomers();
    setCustomers(CustomerStore.getAll());
    // Pull from ProgramStore first; if empty, create Program-like entries from ServiceStore
    const storePrograms = ProgramStore.getAll().filter(p => p.isActive);
    if (storePrograms.length > 0) {
      setPrograms(storePrograms);
    } else {
      // Fallback: convert ServiceStore entries to Program-compatible objects
      const services = ServiceStore.getAll().filter(s => s.isActive);
      const serviceAsPrograms: Program[] = services.map(s => ({
        id: s.id,
        shopId: '',
        name: s.name,
        category: s.category || '',
        totalSessions: null,
        validityDays: null,
        price: s.price,
        costPrice: 0,
        color: '#1a3a8f',
        isActive: true,
        createdAt: '',
      }));
      setPrograms(serviceAsPrograms);
    }
  }

  // 필터링
  const filtered = customers.filter(c => {
    const matchSearch = !search || c.name.includes(search) || c.phone.includes(search) || (c.email?.includes(search) ?? false);
    const matchGrade = gradeFilter === '전체' || c.grade === gradeFilter;
    return matchSearch && matchGrade;
  });

  // 고객 추가
  function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    CustomerStore.save({
      name: addForm.name, phone: addForm.phone,
      gender: addForm.gender, grade: addForm.grade,
      skinType: addForm.skinType, memo: addForm.memo,
      birthDate: addForm.birthDate || undefined,
      referralSource: addForm.referralSource || undefined,
      email: undefined, allergies: undefined,
      tags: [], isActive: true,
    });
    setShowAddModal(false);
    setAddForm({ name: '', phone: '', gender: '여성', grade: '신규', skinType: '', memo: '', birthDate: '', referralSource: '' });
    loadAll();
  }

  // 프로그램 등록
  function handleRegisterProgram(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const prog = programs.find(p => p.id === progForm.programId);
    if (!prog) return;

    CustomerProgramStore.save({
      customerId: selected.id,
      customerName: selected.name,
      programId: prog.id,
      programName: prog.name,
      category: prog.category,
      totalSessions: prog.totalSessions,
      pricePaid: parseInt(progForm.pricePaid.replace(/,/g, '')) || prog.price,
      paymentMethod: progForm.paymentMethod,
      purchaseDate: progForm.purchaseDate,
      expiryDate: calcExpiryDate(prog.validityDays),
      notes: progForm.notes || undefined,
    });

    setShowProgramModal(false);
    setProgForm({ programId: '', pricePaid: '', paymentMethod: '카드', purchaseDate: today(), notes: '' });
    setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
    loadAll();
  }

  // 시술 기록 (회차 차감)
  function handleTreatment(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    TreatmentLogStore.save({
      customerId: selected.id,
      customerName: selected.name,
      customerProgramId: treatForm.customerProgramId || undefined,
      programName: treatForm.customerProgramId
        ? customerPrograms.find(cp => cp.id === treatForm.customerProgramId)?.programName
        : undefined,
      staffName: treatForm.staffName || undefined,
      treatmentDate: treatForm.treatmentDate,
      treatmentTime: treatForm.treatmentTime || undefined,
      sessionsUsed: 1,
      treatmentDetails: treatForm.treatmentDetails || undefined,
      skinCondition: treatForm.skinCondition || undefined,
      staffNotes: treatForm.staffNotes || undefined,
      nextAppointment: treatForm.nextAppointment || undefined,
    });

    setShowTreatmentModal(false);
    setTreatForm({ customerProgramId: '', staffName: '', treatmentDate: today(), treatmentTime: '', treatmentDetails: '', skinCondition: '', staffNotes: '', nextAppointment: '' });
    setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
    const updated = CustomerStore.getById(selected.id);
    if (updated) setSelected(updated);
    loadAll();
  }

  const selectedProgForForm = programs.find(p => p.id === progForm.programId);

  return (
    <div className="flex flex-col h-full">

      {/* ── 모바일 뷰 (< lg) ── 카드 리스트 */}
      <div className="flex flex-col lg:hidden flex-1">
        {/* 검색바 + 필터 */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-3 pb-2 shadow-sm">
          <div className="relative mb-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="고객명, 전화번호 검색"
              className="w-full h-10 pl-9 pr-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {(['전체', ...GRADES] as const).map(g => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  gradeFilter === g ? 'bg-[#1a3a8f] text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* 카드 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <User size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">고객이 없습니다</p>
              <p className="text-xs text-slate-400 mt-1">PC에서 고객을 추가하세요</p>
            </div>
          ) : (
            filtered.map(customer => {
              const daysSince = getDaysSince(customer.lastVisitDate);
              return (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelected(customer);
                    setCustomerPrograms(CustomerProgramStore.getByCustomer(customer.id));
                  }}
                  className="w-full bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-left min-h-[72px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {customer.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{customer.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${GRADE_COLORS[customer.grade]}`}>
                          {customer.grade}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {maskPhone(customer.phone, user?.role ?? 'staff')}
                      </p>
                      <p className="text-xs text-gray-400">
                        {daysSince !== null ? `${daysSince}일 전 방문` : '방문 기록 없음'} · 방문 {customer.totalVisits}회
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* 모바일 고객 상세 — 풀스크린 모달 */}
        {selected && (
          <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
            {/* 헤더 */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
              <button
                onClick={() => setSelected(null)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200"
                aria-label="뒤로가기"
              >
                <ChevronRight size={18} className="rotate-180 text-gray-600" />
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-gray-900">{selected.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${GRADE_COLORS[selected.grade]}`}>
                    {selected.grade}
                  </span>
                </div>
              </div>
            </div>

            {/* 상세 콘텐츠 스크롤 */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* 기본 정보 */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">기본 정보</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">전화번호</span>
                    <span className="text-xs font-medium text-gray-900">{maskPhone(selected.phone, user?.role ?? 'staff')}</span>
                  </div>
                  {selected.birthDate && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">생년월일</span>
                      <span className="text-xs font-medium text-gray-900">{selected.birthDate}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">피부 타입</span>
                    <span className="text-xs font-medium text-gray-900">{selected.skinType || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">총 방문</span>
                    <span className="text-xs font-medium text-gray-900">{selected.totalVisits}회</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">총 결제</span>
                    <span className="text-xs font-medium text-gray-900">{(selected.totalSpent || 0).toLocaleString()}원</span>
                  </div>
                  {selected.lastVisitDate && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">마지막 방문</span>
                      <span className="text-xs font-medium text-gray-900">{formatDate(selected.lastVisitDate)}</span>
                    </div>
                  )}
                </div>
                {selected.memo && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">메모</p>
                    <p className="text-xs text-gray-700">{selected.memo}</p>
                  </div>
                )}
              </div>

              {/* 프로그램 목록 */}
              {customerPrograms.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">진행 프로그램</p>
                  <div className="space-y-2">
                    {customerPrograms.map(cp => (
                      <div key={cp.id} className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-gray-800">{cp.programName}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            !cp.isCompleted ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                          }`}>{!cp.isCompleted ? '진행중' : '완료'}</span>
                        </div>
                        {cp.totalSessions != null && (
                          <p className="text-xs text-gray-500">
                            {cp.usedSessions || 0}/{cp.totalSessions}회 · 잔여 {(cp.totalSessions - (cp.usedSessions || 0))}회
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 text-center pb-2">수정·삭제는 PC에서 이용해주세요</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 데스크톱 뷰 (lg+) ── 기존 레이아웃 그대로 */}
      <div className="hidden lg:flex h-full flex-1">
      {/* 왼쪽: 고객 목록 */}
      <div className="w-80 flex-shrink-0 border-r border-gray-100 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <h1 className="text-lg font-bold text-gray-900 flex-1">고객 관리</h1>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#1a3a8f] text-white rounded-lg text-xs font-medium hover:bg-[#152f75] transition-colors"
            >
              <Plus size={12} />고객 추가
            </button>
          </div>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="이름, 전화번호 검색"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(['전체', ...GRADES] as const).map(g => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                  gradeFilter === g ? 'bg-[#1a3a8f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <p className="px-4 py-2 text-xs text-gray-400">{filtered.length}명</p>
          {filtered.length === 0 ? (
            <div className="p-8 text-center">
              <User size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">고객이 없어요</p>
            </div>
          ) : (
            filtered.map(customer => {
              const daysSince = getDaysSince(customer.lastVisitDate);
              const isRisk = daysSince !== null && daysSince > 60;
              const activeProgs = CustomerProgramStore.getActive(customer.id).length;
              return (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelected(customer);
                    setCustomerPrograms(CustomerProgramStore.getByCustomer(customer.id));
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 ${selected?.id === customer.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {customer.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-gray-900 truncate">{customer.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${GRADE_COLORS[customer.grade]}`}>
                          {customer.grade}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{maskPhone(customer.phone, user?.role ?? 'staff')}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 pl-10">
                    <span>방문 {customer.totalVisits}회</span>
                    {activeProgs > 0 && (
                      <span className="text-blue-500 font-medium">활성 {activeProgs}개</span>
                    )}
                    {isRisk && <AlertCircle size={11} className="text-orange-400" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 오른쪽: 고객 상세 */}
      {selected ? (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* 기본 정보 카드 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xl font-bold">
                    {selected.name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-900">{selected.name}</h2>
                      <div className="relative">
                        <button
                          onClick={() => setShowGradeMenu(v => !v)}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-0.5 hover:ring-2 hover:ring-offset-1 hover:ring-blue-300 transition ${GRADE_COLORS[selected.grade]}`}
                          aria-label="등급 변경"
                        >
                          {selected.grade}
                          <ChevronDown size={11} />
                        </button>
                        {showGradeMenu && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowGradeMenu(false)} />
                            <div className="absolute left-0 mt-1 z-20 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[90px]">
                              {GRADES.map(g => (
                                <button
                                  key={g}
                                  onClick={() => changeGrade(g)}
                                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-1.5 ${g === selected.grade ? 'font-bold text-blue-700' : 'text-gray-600'}`}
                                >
                                  {g === selected.grade && <CheckCircle size={11} className="text-blue-600" />}
                                  <span className={g === selected.grade ? '' : 'ml-[18px]'}>{g}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-500">{maskPhone(selected.phone, user?.role ?? 'staff')}</p>
                    {selected.skinType && <p className="text-xs text-gray-400 mt-0.5">피부 유형: {selected.skinType}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setConsultForm(emptyConsultForm()); setShowConsultModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 transition-colors"
                  >
                    <Sparkles size={12} />피부 상담
                  </button>
                  <button
                    onClick={() => setShowTreatmentModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-xl text-xs font-medium hover:bg-green-600 transition-colors"
                  >
                    <Scissors size={12} />시술 기록
                  </button>
                  <button
                    onClick={() => setShowProgramModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#1a3a8f] text-white rounded-xl text-xs font-medium hover:bg-[#152f75] transition-colors"
                  >
                    <Plus size={12} />프로그램 등록
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-50">
                <div className="text-center">
                  <p className="text-xs text-gray-400">총 방문</p>
                  <p className="text-lg font-bold text-gray-900">{selected.totalVisits}회</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">누적 결제</p>
                  <p className="text-lg font-bold text-gray-900">{formatPrice(selected.totalSpent)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">마지막 방문</p>
                  <p className="text-sm font-semibold text-gray-700">{formatDate(selected.lastVisitDate)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">등록일</p>
                  <p className="text-sm font-semibold text-gray-700">{formatDate(selected.registeredAt)}</p>
                </div>
              </div>

              {selected.memo && (
                <div className="mt-3 p-3 bg-yellow-50 rounded-xl">
                  <p className="text-xs text-yellow-700">📝 {selected.memo}</p>
                </div>
              )}
            </div>

            {/* 피부 상담 이력 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-indigo-600" />피부 상담 이력
                </h3>
                <button
                  onClick={() => { setConsultForm(emptyConsultForm()); setShowConsultModal(true); }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                >
                  <Plus size={12} />상담 기록
                </button>
              </div>

              {consultations.length === 0 ? (
                <div className="text-center py-6">
                  <Activity size={28} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">상담 기록이 없어요</p>
                  <button onClick={() => { setConsultForm(emptyConsultForm()); setShowConsultModal(true); }} className="mt-2 text-xs text-indigo-600 hover:underline">
                    비컨 분석으로 첫 상담 시작하기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {consultations.map(c => {
                    const metricEntries = BEACON_FIELDS
                      .map(f => ({ label: f.label, v: (c.beaconMetrics as any)?.[f.key] }))
                      .filter(e => e.v != null);
                    return (
                      <div key={c.id} className="border border-indigo-100 bg-indigo-50/30 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {c.skinTypeResult && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                                {c.skinTypeResult}
                              </span>
                            )}
                            <span className="text-sm font-semibold text-gray-800">{formatDate(c.consultDate)}</span>
                            {c.staffName && <span className="text-xs text-gray-400">· {c.staffName}</span>}
                          </div>
                          <button
                            onClick={() => {
                              if (window.confirm('이 상담 기록을 삭제할까요?')) {
                                ConsultationStore.delete(c.id);
                                setConsultations(ConsultationStore.getByCustomer(selected.id));
                              }
                            }}
                            className="text-gray-300 hover:text-red-400"
                            aria-label="상담 삭제"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        {c.concerns.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {c.concerns.map(cc => (
                              <span key={cc} className="text-xs px-1.5 py-0.5 rounded bg-white border border-indigo-100 text-gray-600">{cc}</span>
                            ))}
                          </div>
                        )}

                        {metricEntries.length > 0 && (
                          <div className="grid grid-cols-3 gap-1.5 mb-2">
                            {metricEntries.map(e => (
                              <div key={e.label} className="text-center bg-white rounded-lg py-1 border border-indigo-50">
                                <p className="text-[10px] text-gray-400">{e.label}</p>
                                <p className="text-xs font-bold text-indigo-700">{e.v}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {c.recommendedSolution && (
                          <div className="mt-1 p-2.5 bg-white rounded-lg border border-indigo-50">
                            <p className="text-[10px] font-semibold text-indigo-500 mb-0.5">추천 솔루션</p>
                            <p className="text-xs text-gray-700 whitespace-pre-line">{c.recommendedSolution}</p>
                          </div>
                        )}
                        {c.recommendedProducts.length > 0 && (
                          <p className="text-xs text-gray-500 mt-1.5">🧴 {c.recommendedProducts.join(', ')}</p>
                        )}
                        {c.managerNote && (
                          <p className="text-xs text-gray-500 mt-1.5">📝 {c.managerNote}</p>
                        )}
                        {c.nextConsultDate && (
                          <p className="text-xs text-indigo-500 mt-1.5">다음 관리 권고일: {formatDate(c.nextConsultDate)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 등록된 프로그램 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">등록 프로그램</h3>
                <button
                  onClick={() => setShowProgramModal(true)}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <Plus size={12} />추가
                </button>
              </div>

              {customerPrograms.length === 0 ? (
                <div className="text-center py-6">
                  <Tag size={28} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">등록된 프로그램이 없어요</p>
                  <button onClick={() => setShowProgramModal(true)} className="mt-2 text-xs text-blue-500 hover:underline">
                    프로그램 등록하기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {customerPrograms.map(cp => {
                    const remaining = cp.totalSessions !== null ? cp.totalSessions - cp.usedSessions : null;
                    const progress = cp.totalSessions ? (cp.usedSessions / cp.totalSessions) * 100 : 0;
                    const isExpired = cp.expiryDate && cp.expiryDate < today();
                    return (
                      <div
                        key={cp.id}
                        className={`border rounded-xl p-4 ${cp.isCompleted || isExpired ? 'border-gray-100 opacity-60' : 'border-blue-100 bg-blue-50/30'}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">{cp.category}</span>
                              {cp.isCompleted && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">완료</span>}
                              {isExpired && !cp.isCompleted && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-400">만료</span>}
                            </div>
                            <p className="font-semibold text-sm text-gray-900 mt-1">{cp.programName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">결제</p>
                            <p className="text-sm font-bold text-gray-800">{formatPrice(cp.pricePaid)}</p>
                          </div>
                        </div>

                        {cp.totalSessions !== null ? (
                          <>
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                              <span>사용 {cp.usedSessions}회 / 총 {cp.totalSessions}회</span>
                              <span className="font-bold text-blue-600">잔여 {remaining}회</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-2 rounded-full transition-all ${progress >= 80 ? 'bg-orange-400' : 'bg-blue-400'}`}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400">기간제 프로그램</p>
                        )}

                        <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                          <span>등록일: {formatDate(cp.purchaseDate)}</span>
                          {cp.expiryDate && <span>만료일: {formatDate(cp.expiryDate)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 최근 시술 기록 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">최근 시술 기록</h3>
              {(() => {
                const logs = TreatmentLogStore.getByCustomer(selected.id).slice(0, 5);
                if (logs.length === 0) return (
                  <div className="text-center py-6">
                    <Scissors size={28} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">시술 기록이 없어요</p>
                  </div>
                );
                return (
                  <div className="space-y-2">
                    {logs.map(log => (
                      <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Scissors size={14} className="text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-800 truncate">{log.programName || '시술'}</p>
                            <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatDate(log.treatmentDate)}</span>
                          </div>
                          {log.staffName && <p className="text-xs text-gray-400">담당: {log.staffName}</p>}
                          {log.treatmentDetails && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{log.treatmentDetails}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <User size={48} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">고객을 선택하세요</p>
            <p className="text-sm text-gray-300 mt-1">왼쪽 목록에서 고객을 클릭하면 상세 정보가 표시됩니다</p>
          </div>
        </div>
      )}

      {/* ───── 고객 추가 모달 ───── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">고객 추가</h2>
              <button onClick={() => setShowAddModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleAddCustomer} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">이름 *</label>
                  <input required value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="홍길동" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">전화번호 *</label>
                  <input required value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="010-0000-0000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">성별</label>
                  <select value={addForm.gender} onChange={e => setAddForm(f => ({ ...f, gender: e.target.value as Gender }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="여성">여성</option><option value="남성">남성</option><option value="미입력">미입력</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">등급</label>
                  <select value={addForm.grade} onChange={e => setAddForm(f => ({ ...f, grade: e.target.value as CustomerGrade }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">생년월일</label>
                  <input type="date" value={addForm.birthDate} onChange={e => setAddForm(f => ({ ...f, birthDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">피부 유형</label>
                  <select value={addForm.skinType} onChange={e => setAddForm(f => ({ ...f, skinType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">선택 안함</option>
                    {['건성', '지성', '복합성', '민감성', '중성'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">유입 경로</label>
                <select value={addForm.referralSource} onChange={e => setAddForm(f => ({ ...f, referralSource: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">선택</option>
                  {['네이버', '카카오', '지인 소개', '간판', '유튜브', 'SNS', '직접 방문', '기타'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
                <textarea value={addForm.memo} onChange={e => setAddForm(f => ({ ...f, memo: e.target.value }))}
                  rows={2} placeholder="특이사항, 알레르기 등"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium">등록</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───── 프로그램 등록 모달 ───── */}
      {showProgramModal && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">프로그램 등록</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected.name} 고객</p>
              </div>
              <button onClick={() => setShowProgramModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleRegisterProgram} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">프로그램 선택 *</label>
                <select
                  required
                  value={progForm.programId}
                  onChange={e => {
                    const prog = programs.find(p => p.id === e.target.value);
                    setProgForm(f => ({ ...f, programId: e.target.value, pricePaid: prog ? prog.price.toString() : '' }));
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">프로그램을 선택하세요</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.price.toLocaleString('ko-KR')}원
                    </option>
                  ))}
                </select>
              </div>

              {selectedProgForForm && (
                <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                  <p>📋 {selectedProgForForm.category} / {selectedProgForForm.totalSessions ? `${selectedProgForForm.totalSessions}회권` : '기간제'}</p>
                  {selectedProgForForm.validityDays && <p>📅 유효기간: {selectedProgForForm.validityDays}일</p>}
                  <p>💰 정가: {formatPrice(selectedProgForForm.price)}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">실제 결제 금액 *</label>
                <div className="relative">
                  <input
                    required
                    type="text"
                    value={progForm.pricePaid ? parseInt(progForm.pricePaid || '0').toLocaleString('ko-KR') : ''}
                    onChange={e => setProgForm(f => ({ ...f, pricePaid: e.target.value.replace(/,/g, '') }))}
                    className="w-full pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">원</span>
                </div>
                {selectedProgForForm && progForm.pricePaid && parseInt(progForm.pricePaid) < selectedProgForForm.price && (
                  <p className="text-xs text-orange-500 mt-1">
                    💡 정가보다 {formatPrice(selectedProgForForm.price - parseInt(progForm.pricePaid))} 할인
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">결제 방법</label>
                  <select value={progForm.paymentMethod} onChange={e => setProgForm(f => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">구매 날짜</label>
                  <input type="date" value={progForm.purchaseDate} onChange={e => setProgForm(f => ({ ...f, purchaseDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">메모 (선택)</label>
                <input value={progForm.notes} onChange={e => setProgForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="특이사항 등" />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowProgramModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <CheckCircle size={14} />프로그램 등록
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───── 시술 기록 모달 ───── */}
      {showTreatmentModal && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">시술 기록</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected.name} — 회차 차감</p>
              </div>
              <button onClick={() => setShowTreatmentModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleTreatment} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">차감할 프로그램</label>
                <select value={treatForm.customerProgramId} onChange={e => setTreatForm(f => ({ ...f, customerProgramId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">선택 없음 (단순 기록)</option>
                  {CustomerProgramStore.getActive(selected.id).map(cp => (
                    <option key={cp.id} value={cp.id}>
                      {cp.programName} — 잔여 {cp.totalSessions !== null ? cp.totalSessions - cp.usedSessions : '∞'}회
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">시술일 *</label>
                  <input required type="date" value={treatForm.treatmentDate} onChange={e => setTreatForm(f => ({ ...f, treatmentDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">시간</label>
                  <input type="time" value={treatForm.treatmentTime} onChange={e => setTreatForm(f => ({ ...f, treatmentTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">담당자</label>
                <select value={treatForm.staffName} onChange={e => setTreatForm(f => ({ ...f, staffName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">선택</option>
                  {StaffStore.getAll().filter(s => s.isActive).map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">시술 내용</label>
                <textarea value={treatForm.treatmentDetails} onChange={e => setTreatForm(f => ({ ...f, treatmentDetails: e.target.value }))}
                  rows={2} placeholder="시술 내용을 기록하세요"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">피부 상태</label>
                <input value={treatForm.skinCondition} onChange={e => setTreatForm(f => ({ ...f, skinCondition: e.target.value }))}
                  placeholder="오늘 피부 상태 메모"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">다음 예약 권고일</label>
                <input type="date" value={treatForm.nextAppointment} onChange={e => setTreatForm(f => ({ ...f, nextAppointment: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowTreatmentModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <Scissors size={14} />시술 기록 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───── 피부 상담 모달 ───── */}
      {showConsultModal && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between p-5 border-b border-gray-100 z-10">
              <div>
                <h2 className="font-bold text-gray-900 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-indigo-600" />피부 상담 · 비컨 분석
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected.name} 고객 · 1:1 맞춤 솔루션</p>
              </div>
              <button onClick={() => setShowConsultModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleSaveConsultation} className="p-5 space-y-5">
              {/* 상담일 / 담당 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">상담일 *</label>
                  <input required type="date" value={consultForm.consultDate}
                    onChange={e => setConsultForm(f => ({ ...f, consultDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">담당 관리사</label>
                  <select value={consultForm.staffName} onChange={e => setConsultForm(f => ({ ...f, staffName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">선택</option>
                    {StaffStore.getAll().filter(s => s.isActive).map(s => (
                      <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 피부 고민 체크리스트 */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">피부 고민 (고객 체크)</label>
                <div className="space-y-2.5">
                  {CONCERN_GROUPS.map(grp => (
                    <div key={grp.group}>
                      <p className="text-[11px] text-gray-400 mb-1">{grp.group}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {grp.items.map(item => {
                          const active = consultForm.concerns.includes(item);
                          return (
                            <button key={item} type="button" onClick={() => toggleConcern(item)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                              }`}>
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 홈케어 추천용 피부 문제 (진단기기 가이드 연동) */}
              <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3.5">
                <label className="block text-xs font-semibold text-indigo-900 mb-2">
                  진단 후 피부 문제 체크 → 홈케어 추천
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {HOMECARE_PROBLEMS.map(problem => {
                    const active = consultForm.homecareProblems.includes(problem);
                    return (
                      <button key={problem} type="button" onClick={() => toggleHomecareProblem(problem)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                        }`}>
                        {problem}
                      </button>
                    );
                  })}
                </div>

                {/* 추천 세트 미리보기 */}
                {(() => {
                  const sets = recommendHomecare(consultForm.homecareProblems);
                  if (sets.length === 0) return null;
                  return (
                    <div className="mt-3 space-y-2">
                      {sets.map(s => (
                        <div key={s.id} className="bg-white border border-indigo-100 rounded-lg p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-700">🧴 {s.name}</span>
                            <span className="text-[10px] text-gray-400">{s.problem}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1 leading-snug">{s.description}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {s.steps.map((step, i) => (
                              <span key={step} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                                {i + 1}. {step}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={applyHomecareRecommendation}
                        className="w-full mt-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">
                        ↓ 추천 홈케어를 제품·솔루션 칸에 자동 입력
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* 비컨 측정 수치 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <Activity size={13} className="text-indigo-500" />비컨 측정 수치 (0~100)
                  </label>
                  <button type="button"
                    onClick={() => applyDiagnosisDraft(consultForm.metrics, consultForm.concerns)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 font-medium hover:bg-indigo-100">
                    분석 → 맞춤 제안 자동작성
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {BEACON_FIELDS.map(f => (
                    <div key={f.key as string}>
                      <label className="block text-[11px] text-gray-500 mb-0.5" title={f.hint}>{f.label}</label>
                      <input type="number" min={0} max={100} inputMode="numeric"
                        value={consultForm.metrics[f.key as string] ?? ''}
                        onChange={e => setConsultForm(prev => ({ ...prev, metrics: { ...prev.metrics, [f.key as string]: e.target.value } }))}
                        placeholder="-"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  ))}
                </div>
              </div>

              {/* 피부타입 판정 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">종합 피부 타입</label>
                  <select value={consultForm.skinTypeResult} onChange={e => setConsultForm(f => ({ ...f, skinTypeResult: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">선택</option>
                    {SKIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">다음 관리 권고일</label>
                  <input type="date" value={consultForm.nextConsultDate} onChange={e => setConsultForm(f => ({ ...f, nextConsultDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {/* 맞춤 솔루션 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">1:1 맞춤 솔루션 (추천)</label>
                <textarea value={consultForm.recommendedSolution} onChange={e => setConsultForm(f => ({ ...f, recommendedSolution: e.target.value }))}
                  rows={4} placeholder="‘분석 → 맞춤 제안 자동작성’을 누르면 비컨 수치 기반 초안이 채워집니다. 자유롭게 수정하세요."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              {/* 추천 제품/프로그램 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">추천 제품·프로그램 (쉼표로 구분)</label>
                <input value={consultForm.recommendedProducts} onChange={e => setConsultForm(f => ({ ...f, recommendedProducts: e.target.value }))}
                  placeholder="예: 수분 앰플, 진정 관리 10회권"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {/* 관리사 소견 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">관리사 소견</label>
                <textarea value={consultForm.managerNote} onChange={e => setConsultForm(f => ({ ...f, managerNote: e.target.value }))}
                  rows={2} placeholder="고객 피부 상태 관찰 소견을 기록하세요"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              <p className="text-[11px] text-gray-400">
                ※ 비컨은 피부 상태를 분석·측정하는 미용 기기입니다. 본 상담은 의료 진단·처방·치료가 아닙니다.
              </p>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowConsultModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <CheckCircle size={14} />상담 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
