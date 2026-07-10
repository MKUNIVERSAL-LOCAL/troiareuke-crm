import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Plus, X, CheckCircle,
  CreditCard, Banknote, Smartphone, DollarSign,
  ShoppingBag, Scissors, ChevronLeft, ChevronRight, Pencil, Trash2
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import {
  PaymentStore, CustomerStore, ProductStore, ProductSaleStore
} from '../../lib/store';
import type { Payment, PaymentMethod } from '../../types';

import { formatPrice, todayISO as today } from '../../lib/format';
function getYearMonth(d: Date) { return d.toISOString().substring(0, 7); }

const PAYMENT_METHODS: PaymentMethod[] = ['카드', '현금', '계좌이체', '카카오페이'];
const METHOD_ICONS: Record<string, React.ElementType> = {
  '카드': CreditCard, '현금': Banknote, '계좌이체': Banknote, '카카오페이': Smartphone,
};

export default function Sales() {
  const [tab, setTab] = useState<'overview' | 'list'>('overview');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(getYearMonth(new Date()));

  // 결제 등록 폼
  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    type: 'single_treatment' as Payment['type'],
    amount: '',
    paymentMethod: '카드' as PaymentMethod,
    paymentDate: today(),
    memo: '',
    discountAmount: '0',
  });

  const customers = useMemo(() => CustomerStore.getAll(), []);

  useEffect(() => { loadPayments(); }, []);

  function loadPayments() {
    setPayments(PaymentStore.getAll());
  }

  // 현재 보는 월 데이터
  const monthPayments = useMemo(
    () => payments.filter(p => p.paymentDate.startsWith(viewMonth) && p.status === 'completed'),
    [payments, viewMonth]
  );

  // 이번 달 집계
  const thisSummary = useMemo(() => ({
    treatment: monthPayments.filter(p => p.type === 'program' || p.type === 'single_treatment').reduce((s, p) => s + p.amount, 0),
    product: monthPayments.filter(p => p.type === 'product').reduce((s, p) => s + p.amount, 0),
    total: monthPayments.reduce((s, p) => s + p.amount, 0),
    count: monthPayments.length,
  }), [monthPayments]);

  // 지난 달 집계
  const lastSummary = useMemo(() => {
    const d = new Date(viewMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    const lastMonth = getYearMonth(d);
    const lastPayments = payments.filter(p => p.paymentDate.startsWith(lastMonth) && p.status === 'completed');
    return { total: lastPayments.reduce((s, p) => s + p.amount, 0) };
  }, [payments, viewMonth]);

  // 일별 차트 데이터
  const dailyChartData = useMemo(() => {
    const daysInMonth = new Date(parseInt(viewMonth.split('-')[0]), parseInt(viewMonth.split('-')[1]), 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      const dateStr = `${viewMonth}-${day}`;
      const dayPayments = monthPayments.filter(p => p.paymentDate === dateStr);
      return {
        day: `${i + 1}일`,
        시술: dayPayments.filter(p => p.type === 'program' || p.type === 'single_treatment').reduce((s, p) => s + p.amount, 0) / 10000,
        제품: dayPayments.filter(p => p.type === 'product').reduce((s, p) => s + p.amount, 0) / 10000,
        total: dayPayments.reduce((s, p) => s + p.amount, 0),
      };
    });
  }, [monthPayments, viewMonth]);

  // 결제 수단 분포
  const methodData = useMemo(() => {
    const counts: Record<string, number> = {};
    monthPayments.forEach(p => { counts[p.paymentMethod] = (counts[p.paymentMethod] || 0) + p.amount; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [monthPayments]);

  // 월 이동
  function changeMonth(delta: number) {
    const d = new Date(viewMonth + '-01');
    d.setMonth(d.getMonth() + delta);
    setViewMonth(getYearMonth(d));
  }

  const resetForm = () => setForm({ customerId: '', customerName: '', type: 'single_treatment', amount: '', paymentMethod: '카드', paymentDate: today(), memo: '', discountAmount: '0' });

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    resetForm();
  }

  // 결제 수정 — 목록에서 편집 클릭 시 폼 채우고 모달 오픈
  function openEdit(p: Payment) {
    setForm({
      customerId: p.customerId || '',
      customerName: p.customerName || '',
      type: p.type,
      amount: String(p.amount),
      paymentMethod: p.paymentMethod,
      paymentDate: p.paymentDate,
      memo: p.memo || '',
      discountAmount: String(p.discountAmount || 0),
    });
    setEditingId(p.id);
    setShowModal(true);
  }

  // 결제 삭제
  function handleDelete(p: Payment) {
    if (!window.confirm(`${p.paymentDate} · ${p.customerName || '고객'} · ${formatPrice(p.amount)} 결제를 삭제할까요?\n삭제 시 고객 누적 결제액에서도 차감됩니다.`)) return;
    PaymentStore.delete(p.id);
    loadPayments();
  }

  // 결제 등록/수정
  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const customer = customers.find(c => c.id === form.customerId);
    const typeLabels = { single_treatment: '단건 시술', program: '프로그램', product: '제품 판매', other: '기타' };

    const payload = {
      customerId: form.customerId || undefined,
      customerName: customer?.name || form.customerName || undefined,
      paymentDate: form.paymentDate,
      type: form.type,
      typeLabel: typeLabels[form.type],
      amount: parseInt(form.amount.replace(/,/g, '')) || 0,
      paymentMethod: form.paymentMethod,
      discountAmount: parseInt(form.discountAmount.replace(/,/g, '')) || 0,
      status: 'completed' as const,
      memo: form.memo || undefined,
    };

    if (editingId) {
      PaymentStore.update(editingId, payload);
    } else {
      PaymentStore.save(payload);
    }

    closeModal();
    loadPayments();
  }

  const growthRate = lastSummary.total > 0
    ? Math.round(((thisSummary.total - lastSummary.total) / lastSummary.total) * 100)
    : 0;

  const [viewDate] = viewMonth.split('-');
  const monthLabel = `${viewDate}년 ${parseInt(viewMonth.split('-')[1])}월`;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">매출 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">시술 + 제품 판매 통합 매출 현황</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium hover:bg-[#152f75] transition-colors shadow-md shadow-blue-200"
        >
          <Plus size={16} />결제 등록
        </button>
      </div>

      {/* 월 선택 */}
      <div className="flex items-center gap-3 mb-6 bg-white border border-gray-100 rounded-2xl p-3 w-fit">
        <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronLeft size={16} className="text-gray-400" />
        </button>
        <span className="text-sm font-bold text-gray-900 min-w-[100px] text-center">{monthLabel}</span>
        <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ChevronRight size={16} className="text-gray-400" />
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'overview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          매출 현황
        </button>
        <button onClick={() => setTab('list')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          결제 내역 ({monthPayments.length})
        </button>
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400">총 매출</p>
                {growthRate !== 0 && (
                  <span className={`text-xs font-medium flex items-center gap-0.5 ${growthRate > 0 ? 'text-green-500' : 'text-red-400'}`}>
                    {growthRate > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(growthRate)}%
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatPrice(thisSummary.total)}</p>
              <p className="text-xs text-gray-300 mt-1">지난달 {formatPrice(lastSummary.total)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-2">시술 매출</p>
              <p className="text-2xl font-bold text-blue-600">{formatPrice(thisSummary.treatment)}</p>
              <p className="text-xs text-gray-300 mt-1">
                {thisSummary.total > 0 ? Math.round((thisSummary.treatment / thisSummary.total) * 100) : 0}% 비중
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-2">제품 매출</p>
              <p className="text-2xl font-bold text-purple-600">{formatPrice(thisSummary.product)}</p>
              <p className="text-xs text-gray-300 mt-1">
                {thisSummary.total > 0 ? Math.round((thisSummary.product / thisSummary.total) * 100) : 0}% 비중
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-2">결제 건수</p>
              <p className="text-2xl font-bold text-gray-900">{thisSummary.count}건</p>
              <p className="text-xs text-gray-300 mt-1">
                건당 {thisSummary.count > 0 ? formatPrice(Math.round(thisSummary.total / thisSummary.count)) : '-'}
              </p>
            </div>
          </div>

          {/* 일별 매출 차트 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">일별 매출 현황 (만원)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={(v, i) => i % 5 === 0 ? v : ''} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip
                  formatter={(v: number, name: string) => [`${v.toFixed(0)}만원`, name]}
                  contentStyle={{ borderRadius: 12, border: '1px solid #f0f0f0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="시술" stackId="a" fill="#1a3a8f" radius={[0, 0, 0, 0]} />
                <Bar dataKey="제품" stackId="a" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 결제 수단 & 최근 결제 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">결제 수단</h3>
              {methodData.length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-6">데이터 없음</p>
              ) : (
                <div className="space-y-3">
                  {methodData.map(({ name, value }) => {
                    const pct = thisSummary.total > 0 ? (value / thisSummary.total) * 100 : 0;
                    return (
                      <div key={name}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-700 font-medium">{name}</span>
                          <span className="text-gray-500">{formatPrice(value)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full">
                          <div className="h-2 bg-[#1a3a8f] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">최근 결제</h3>
              {monthPayments.length === 0 ? (
                <div className="text-center py-6">
                  <DollarSign size={32} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">이번 달 결제 내역이 없어요</p>
                  <button onClick={() => setShowModal(true)} className="mt-2 text-xs text-blue-500 hover:underline">결제 등록하기</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {[...monthPayments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).slice(0, 5).map(p => (
                    <div key={p.id} className="flex items-center gap-3 py-1.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${p.type === 'product' ? 'bg-purple-50' : 'bg-blue-50'}`}>
                        {p.type === 'product' ? <ShoppingBag size={13} className="text-purple-500" /> : <Scissors size={13} className="text-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.customerName || '고객'}</p>
                        <p className="text-xs text-gray-400">{p.typeLabel} · {p.paymentDate}</p>
                      </div>
                      <p className="text-sm font-bold text-gray-900 flex-shrink-0">{formatPrice(p.amount)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'list' && (
        <div className="bg-white rounded-2xl border border-gray-100">
          {monthPayments.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign size={40} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">이번 달 결제 내역이 없어요</p>
              <button onClick={() => setShowModal(true)} className="mt-3 px-4 py-2 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium">
                결제 등록하기
              </button>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-6 text-xs text-gray-400 font-medium px-4 py-3 border-b border-gray-50">
                <span>날짜</span>
                <span className="col-span-2">고객</span>
                <span>구분</span>
                <span>결제 방법</span>
                <span className="text-right">금액</span>
              </div>
              {[...monthPayments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).map(p => (
                <div key={p.id} className="group grid grid-cols-6 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 items-center text-sm">
                  <span className="text-gray-500 text-xs">{p.paymentDate}</span>
                  <span className="col-span-2 font-medium text-gray-800">
                    {p.customerName || '—'}
                    {p.discountAmount > 0 && <span className="ml-1.5 text-[11px] text-orange-500">-{formatPrice(p.discountAmount)}</span>}
                  </span>
                  <span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.type === 'product' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                      {p.typeLabel}
                    </span>
                  </span>
                  <span className="text-gray-500 text-xs">{p.paymentMethod}</span>
                  <span className="flex items-center justify-end gap-1.5">
                    <span className="font-bold text-gray-900">{formatPrice(p.amount)}</span>
                    <button onClick={() => openEdit(p)} className="p-1 text-gray-300 hover:text-[#1a3a8f] hover:bg-gray-100 rounded md:opacity-0 md:group-hover:opacity-100 transition" aria-label="결제 수정">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(p)} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded md:opacity-0 md:group-hover:opacity-100 transition" aria-label="결제 삭제">
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              ))}
              <div className="px-4 py-3 bg-gray-50 rounded-b-2xl flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">합계 {monthPayments.length}건</span>
                <span className="text-base font-bold text-gray-900">{formatPrice(thisSummary.total)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 결제 등록 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editingId ? '결제 수정' : '결제 등록'}</h2>
              <button onClick={closeModal}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {/* 구분 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">결제 구분</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 'single_treatment', label: '단건 시술', icon: Scissors },
                    { v: 'product', label: '제품 판매', icon: ShoppingBag },
                    { v: 'other', label: '기타', icon: DollarSign },
                  ].map(({ v, label, icon: Icon }) => (
                    <button
                      type="button"
                      key={v}
                      onClick={() => setForm(f => ({ ...f, type: v as Payment['type'] }))}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-colors ${
                        form.type === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 고객 선택 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">고객</label>
                <select value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">고객 선택 (선택사항)</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </select>
              </div>

              {/* 금액 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">결제 금액 *</label>
                <div className="relative">
                  <input
                    required
                    type="text"
                    value={form.amount ? parseInt(form.amount || '0').toLocaleString('ko-KR') : ''}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/,/g, '') }))}
                    className="w-full pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">원</span>
                </div>
                <div className="flex gap-2 mt-1.5">
                  {[50000, 80000, 100000, 120000].map(n => (
                    <button type="button" key={n} onClick={() => setForm(f => ({ ...f, amount: n.toString() }))}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200">
                      {(n / 10000)}만
                    </button>
                  ))}
                </div>
              </div>

              {/* 할인 금액 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">할인 금액</label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.discountAmount && form.discountAmount !== '0' ? parseInt(form.discountAmount || '0').toLocaleString('ko-KR') : ''}
                    onChange={e => setForm(f => ({ ...f, discountAmount: e.target.value.replace(/,/g, '') || '0' }))}
                    className="w-full pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">원</span>
                </div>
                {form.amount && parseInt(form.discountAmount || '0') > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    할인 적용 실수령: <strong className="text-gray-600">{formatPrice((parseInt(form.amount.replace(/,/g, '')) || 0))}</strong> (결제 금액 = 할인 반영 후 금액을 입력하세요)
                  </p>
                )}
              </div>

              {/* 결제 방법 & 날짜 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">결제 방법</label>
                  <div className="flex gap-1 flex-wrap">
                    {PAYMENT_METHODS.map(m => (
                      <button
                        type="button"
                        key={m}
                        onClick={() => setForm(f => ({ ...f, paymentMethod: m }))}
                        className={`px-2.5 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                          form.paymentMethod === m ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">결제일</label>
                  <input type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
                <input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                  placeholder="시술명, 제품명 등"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={closeModal} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <CheckCircle size={14} />{editingId ? '수정 저장' : '결제 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
