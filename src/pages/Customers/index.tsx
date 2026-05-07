import { useState, useEffect } from 'react';
import {
  Search, Plus, Phone, Star, Calendar, TrendingUp,
  User, ChevronRight, AlertCircle, X, CheckCircle,
  Scissors, ShoppingBag, ChevronDown, Tag, Clock, Minus
} from 'lucide-react';
import { CustomerStore, ProgramStore, CustomerProgramStore, TreatmentLogStore, StaffStore, ServiceStore } from '../../lib/store';
import type { Customer, CustomerGrade, Gender, Program, CustomerProgram, PaymentMethod } from '../../types';

const GRADE_COLORS: Record<CustomerGrade, string> = {
  VIP: 'bg-yellow-100 text-yellow-700',
  골드: 'bg-orange-100 text-orange-700',
  일반: 'bg-blue-100 text-blue-700',
  신규: 'bg-green-100 text-green-700',
};
const GRADES: CustomerGrade[] = ['VIP', '골드', '일반', '신규'];
const PAYMENT_METHODS: PaymentMethod[] = ['카드', '현금', '계좌이체', '카카오페이'];

function formatPrice(n: number) { return n.toLocaleString('ko-KR') + '원'; }
function formatDate(d?: string) {
  if (!d) return '-';
  return d.replace(/-/g, '.').substring(0, 10);
}
function getDaysSince(d?: string) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}
function today() { return new Date().toISOString().split('T')[0]; }
function calcExpiryDate(days?: number | null) {
  if (!days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [customerPrograms, setCustomerPrograms] = useState<CustomerProgram[]>([]);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<CustomerGrade | '전체'>('전체');

  // 고객 추가 모달
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', phone: '', gender: '여성' as Gender, grade: '신규' as CustomerGrade, skinType: '', memo: '', birthDate: '', referralSource: '' });

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

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selected) {
      setCustomerPrograms(CustomerProgramStore.getByCustomer(selected.id));
    }
  }, [selected]);

  function loadAll() {
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
    <div className="flex h-full">
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
                      <p className="text-xs text-gray-400 truncate">{customer.phone}</p>
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
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${GRADE_COLORS[selected.grade]}`}>{selected.grade}</span>
                    </div>
                    <p className="text-sm text-gray-500">{selected.phone}</p>
                    {selected.skinType && <p className="text-xs text-gray-400 mt-0.5">피부 유형: {selected.skinType}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
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
    </div>
  );
}
