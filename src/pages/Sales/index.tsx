import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Plus, X, CheckCircle, DollarSign,
  ShoppingBag, Scissors, ChevronLeft, ChevronRight, Pencil, Trash2, Search, Layers,
  Receipt, FileText, CreditCard
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import { PaymentStore, CustomerStore } from '../../lib/store';
import { ExpenseStore, loadExpenses } from '../../lib/expenseStore';
import type { Payment, PaymentMethod, Expense, ExpenseCategory } from '../../types';
import { EXPENSE_CATEGORIES, COGS_CATEGORIES } from '../../types';

import { formatPrice, todayISO as today } from '../../lib/format';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';
import PaymentLinkModal from '../../components/PaymentLinkModal';
import { isPaymentLinkAvailable } from '../../lib/paymentLinks';
import { getAllPaymentMethods } from '../../lib/paymentMethods';
// 로컬(KST) 기준 — toISOString()은 UTC라 매월 1일 오전에 지난달로 어긋남
function getYearMonth(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

type PnlPeriodMode = 'month' | 'quarter' | 'year';

/** 기준 월(YYYY-MM)과 기간 모드로 손익 집계 대상 월 목록을 만든다 */
function periodMonths(viewMonth: string, mode: PnlPeriodMode, shift = 0): string[] {
  const [y, m] = viewMonth.split('-').map(Number);
  if (mode === 'month') {
    const d = new Date(y, m - 1 + shift, 1);
    return [getYearMonth(d)];
  }
  if (mode === 'quarter') {
    const qStartMonth = Math.floor((m - 1) / 3) * 3; // 0,3,6,9
    const start = new Date(y, qStartMonth + shift * 3, 1);
    return [0, 1, 2].map(i => getYearMonth(new Date(start.getFullYear(), start.getMonth() + i, 1)));
  }
  const year = y + shift;
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

function periodLabel(months: string[], mode: PnlPeriodMode): string {
  const [y, m] = months[0].split('-').map(Number);
  if (mode === 'month') return `${y}년 ${m}월`;
  if (mode === 'quarter') return `${y}년 ${Math.floor((m - 1) / 3) + 1}분기`;
  return `${y}년`;
}


export default function Sales() {
  const [tab, setTab] = useState<'overview' | 'list' | 'expense' | 'pnl'>('overview');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(getYearMonth(new Date()));
  const [listSearch, setListSearch] = useState('');
  const [listType, setListType] = useState<'all' | Payment['type']>('all');
  const [listMethod, setListMethod] = useState<'all' | PaymentMethod>('all');

  // 지출(매입) 상태
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<'all' | ExpenseCategory>('all');
  const [pnlMode, setPnlMode] = useState<PnlPeriodMode>('month');

  // 결제 요청 링크 (NAS 서버 모드 전용)
  const [showPaymentLinkModal, setShowPaymentLinkModal] = useState(false);

  const emptyExpenseForm = {
    expenseDate: today(),
    category: '제품 매입' as ExpenseCategory,
    vendor: '',
    description: '',
    amount: '',
    paymentMethod: '카드' as PaymentMethod,
    memo: '',
  };
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);

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
    status: 'completed' as Payment['status'],
  });

  const customers = useMemo(() => CustomerStore.getAll(), []);

  // 수정 중인 원본 결제 (환불 가드·프로그램 타입 유지에 사용)
  const editingPayment = useMemo(
    () => (editingId ? payments.find(p => p.id === editingId) : undefined),
    [editingId, payments]
  );

  useEffect(() => {
    loadPayments();
    refreshExpenses();
    // NAS 서버에서 지출 원장 최신화 (실패 시 localStorage 캐시 유지)
    loadExpenses().then(refreshExpenses).catch(() => {});
  }, []);

  function loadPayments() {
    setPayments(PaymentStore.getAll());
  }

  function refreshExpenses() {
    setExpenses(ExpenseStore.getAll());
  }

  // 현재 보는 월 데이터
  const monthPayments = useMemo(
    () => payments.filter(p => p.paymentDate.startsWith(viewMonth) && p.status === 'completed'),
    [payments, viewMonth]
  );

  // 결제 내역 탭용: 환불/대기 상태도 함께 표시 (통계에는 미포함)
  const monthAllPayments = useMemo(
    () => payments.filter(p => p.paymentDate.startsWith(viewMonth)),
    [payments, viewMonth]
  );

  // 이번 달 집계 — 기타(other) 포함해야 총매출과 비중 합이 일치
  const thisSummary = useMemo(() => ({
    treatment: monthPayments.filter(p => p.type === 'program' || p.type === 'single_treatment').reduce((s, p) => s + p.amount, 0),
    product: monthPayments.filter(p => p.type === 'product').reduce((s, p) => s + p.amount, 0),
    other: monthPayments.filter(p => p.type === 'other').reduce((s, p) => s + p.amount, 0),
    total: monthPayments.reduce((s, p) => s + p.amount, 0),
    count: monthPayments.length,
  }), [monthPayments]);

  const listPayments = useMemo(() => {
    const query = listSearch.trim().toLowerCase();
    return [...monthAllPayments]
      .filter(payment => {
        const typeMatches = listType === 'all' || payment.type === listType;
        const methodMatches = listMethod === 'all' || payment.paymentMethod === listMethod;
        const searchMatches = !query || [
          payment.customerName || '',
          payment.typeLabel,
          payment.paymentMethod,
          payment.memo || '',
        ].some(value => value.toLowerCase().includes(query));
        return typeMatches && methodMatches && searchMatches;
      })
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [monthAllPayments, listSearch, listType, listMethod]);

  // 합계는 완료 결제만 (환불/대기 제외)
  const listTotal = useMemo(
    () => listPayments.filter(p => p.status === 'completed').reduce((sum, payment) => sum + payment.amount, 0),
    [listPayments],
  );

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
        기타: dayPayments.filter(p => p.type === 'other').reduce((s, p) => s + p.amount, 0) / 10000,
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

  // ─── 지출(매입) 집계 — 지출 탭은 월 단위 ─────────────────────
  const monthExpenses = useMemo(
    () => expenses.filter(x => x.expenseDate.startsWith(viewMonth)),
    [expenses, viewMonth]
  );

  const expenseList = useMemo(
    () => monthExpenses
      .filter(x => expenseCategoryFilter === 'all' || x.category === expenseCategoryFilter)
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate)),
    [monthExpenses, expenseCategoryFilter]
  );

  const expenseSummary = useMemo(() => {
    const cogs = monthExpenses.filter(x => COGS_CATEGORIES.includes(x.category)).reduce((s, x) => s + x.amount, 0);
    const total = monthExpenses.reduce((s, x) => s + x.amount, 0);
    return { total, cogs, sga: total - cogs, count: monthExpenses.length };
  }, [monthExpenses]);

  // ─── 손익계산서 집계 (월/분기/연도) ──────────────────────────
  const pnl = useMemo(() => {
    const months = periodMonths(viewMonth, pnlMode);
    const prevMonths = periodMonths(viewMonth, pnlMode, -1);
    const calc = (ms: string[]) => {
      const set = new Set(ms);
      const pays = payments.filter(p => p.status === 'completed' && set.has(p.paymentDate.slice(0, 7)));
      const exps = expenses.filter(x => set.has(x.expenseDate.slice(0, 7)));
      const revenue = {
        treatment: pays.filter(p => p.type === 'program' || p.type === 'single_treatment').reduce((s, p) => s + p.amount, 0),
        product: pays.filter(p => p.type === 'product').reduce((s, p) => s + p.amount, 0),
        other: pays.filter(p => p.type === 'other').reduce((s, p) => s + p.amount, 0),
        total: pays.reduce((s, p) => s + p.amount, 0),
      };
      const byCategory: Partial<Record<ExpenseCategory, number>> = {};
      exps.forEach(x => { byCategory[x.category] = (byCategory[x.category] || 0) + x.amount; });
      const totalExpense = exps.reduce((s, x) => s + x.amount, 0);
      const cogs = COGS_CATEGORIES.reduce((s, c) => s + (byCategory[c] || 0), 0);
      const sga = totalExpense - cogs;
      const grossProfit = revenue.total - cogs;
      const operatingProfit = grossProfit - sga;
      return { revenue, byCategory, totalExpense, cogs, sga, grossProfit, operatingProfit };
    };
    return {
      months,
      label: periodLabel(months, pnlMode),
      prevLabel: periodLabel(prevMonths, pnlMode),
      cur: calc(months),
      prev: calc(prevMonths),
    };
  }, [payments, expenses, viewMonth, pnlMode]);

  // 손익 추이 차트 — 월간 모드는 최근 6개월, 분기/연간은 기간 내 월별 (만원)
  const pnlTrend = useMemo(() => {
    const months = pnlMode === 'month'
      ? Array.from({ length: 6 }, (_, i) => {
          const [y, m] = viewMonth.split('-').map(Number);
          return getYearMonth(new Date(y, m - 1 - (5 - i), 1));
        })
      : pnl.months;
    return months.map(mo => {
      const rev = payments.filter(p => p.status === 'completed' && p.paymentDate.startsWith(mo)).reduce((s, p) => s + p.amount, 0);
      const exp = expenses.filter(x => x.expenseDate.startsWith(mo)).reduce((s, x) => s + x.amount, 0);
      return {
        month: `${parseInt(mo.split('-')[1], 10)}월`,
        매출: Math.round(rev / 10000),
        지출: Math.round(exp / 10000),
        이익: Math.round((rev - exp) / 10000),
      };
    });
  }, [pnlMode, pnl.months, payments, expenses, viewMonth]);

  // 월 이동 — 손익 탭에서는 선택한 기간 단위(분기/연도)만큼 이동
  function changeMonth(delta: number) {
    const step = tab === 'pnl' ? (pnlMode === 'quarter' ? 3 : pnlMode === 'year' ? 12 : 1) : 1;
    const d = new Date(viewMonth + '-01');
    d.setMonth(d.getMonth() + delta * step);
    setViewMonth(getYearMonth(d));
  }

  const resetForm = () => setForm({ customerId: '', customerName: '', type: 'single_treatment', amount: '', paymentMethod: '카드', paymentDate: today(), memo: '', discountAmount: '0', status: 'completed' });

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
      status: p.status,
    });
    setEditingId(p.id);
    setShowModal(true);
  }

  // 결제 삭제 — 제품 결제는 차단 (PaymentStore.delete는 재고·판매기록을 복구하지 않아
  // 수정 모달의 환불 차단과 동일한 크로스 모듈 불일치 발생)
  function handleDelete(p: Payment) {
    if (p.type === 'product') {
      alert('제품 결제는 여기서 삭제하면 재고·판매기록과 어긋납니다. 제품/재고 페이지의 판매 취소를 사용해주세요.');
      return;
    }
    if (!window.confirm(`${p.paymentDate} · ${p.customerName || '고객'} · ${formatPrice(p.amount)} 결제를 삭제할까요?\n삭제 시 고객 누적 결제액에서도 차감됩니다.`)) return;
    PaymentStore.delete(p.id);
    loadPayments();
  }

  // 결제 등록/수정
  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const customer = customers.find(c => c.id === form.customerId);
    const typeLabels = { single_treatment: '단건 시술', program: '프로그램', product: '제품 판매', other: '기타' };

    const amount = parseInt(form.amount.replace(/,/g, ''), 10);
    if (Number.isNaN(amount) || amount <= 0) {
      alert('결제 금액을 0보다 큰 숫자로 입력해주세요.');
      return;
    }
    const discountAmount = Math.max(0, parseInt(form.discountAmount.replace(/,/g, ''), 10) || 0);

    const payload = {
      customerId: form.customerId || undefined,
      customerName: customer?.name || form.customerName || undefined,
      paymentDate: form.paymentDate,
      type: form.type,
      typeLabel: typeLabels[form.type],
      amount,
      paymentMethod: form.paymentMethod,
      discountAmount,
      status: form.status,
      memo: form.memo || undefined,
    };

    // 제품 결제를 '환불'로 저장하면 매출에선 빠지지만 재고·판매기록은 안 돌아오는
    // 크로스 모듈 불일치(QA⑤) — 신규·수정 모두 차단, 판매 기록 삭제(재고 자동 복구)로 유도
    const effectiveType = editingId ? editingPayment?.type : form.type;
    if (form.status === 'refunded' && effectiveType === 'product') {
      alert(
        '제품 결제의 환불은 [제품/재고 > 판매 기록]에서 해당 판매를 삭제해주세요.\n' +
        '판매 기록을 삭제하면 재고 복구와 결제 취소가 함께 처리됩니다.'
      );
      return;
    }

    if (editingId) {
      PaymentStore.update(editingId, payload);
    } else {
      PaymentStore.save(payload);
    }

    closeModal();
    loadPayments();
  }

  // ─── 지출(매입) 등록/수정/삭제 ─────────────────────────────
  function closeExpenseModal() {
    setShowExpenseModal(false);
    setEditingExpenseId(null);
    setExpenseForm(emptyExpenseForm);
  }

  function openExpenseEdit(x: Expense) {
    setExpenseForm({
      expenseDate: x.expenseDate,
      category: x.category,
      vendor: x.vendor || '',
      description: x.description,
      amount: String(x.amount),
      paymentMethod: x.paymentMethod,
      memo: x.memo || '',
    });
    setEditingExpenseId(x.id);
    setShowExpenseModal(true);
  }

  function handleExpenseDelete(x: Expense) {
    if (!window.confirm(`${x.expenseDate} · ${x.category} · ${formatPrice(x.amount)} 지출을 삭제할까요?`)) return;
    ExpenseStore.delete(x.id);
    refreshExpenses();
  }

  function handleExpenseSave(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseInt(expenseForm.amount.replace(/,/g, ''), 10);
    if (Number.isNaN(amount) || amount <= 0) {
      alert('지출 금액을 0보다 큰 숫자로 입력해주세요.');
      return;
    }
    const description = expenseForm.description.trim();
    if (!description) {
      alert('지출 내용을 입력해주세요. (예: 앰플 20개 매입)');
      return;
    }
    const payload = {
      expenseDate: expenseForm.expenseDate,
      category: expenseForm.category,
      vendor: expenseForm.vendor.trim() || undefined,
      description,
      amount,
      paymentMethod: expenseForm.paymentMethod,
      memo: expenseForm.memo.trim() || undefined,
    };
    if (editingExpenseId) {
      ExpenseStore.update(editingExpenseId, payload);
    } else {
      ExpenseStore.save(payload);
    }
    closeExpenseModal();
    refreshExpenses();
  }

  const growthRate = lastSummary.total > 0
    ? Math.round(((thisSummary.total - lastSummary.total) / lastSummary.total) * 100)
    : 0;

  const [viewDate] = viewMonth.split('-');
  const monthLabel = tab === 'pnl' ? pnl.label : `${viewDate}년 ${parseInt(viewMonth.split('-')[1])}월`;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">매출·손익 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">매출 · 지출(매입) · 손익계산서 통합 현황</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isPaymentLinkAvailable && (
            <button
              onClick={() => setShowPaymentLinkModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <CreditCard size={16} />결제 요청
            </button>
          )}
          <button
            onClick={() => setShowExpenseModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Receipt size={16} />지출 등록
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium hover:bg-[#152f75] transition-colors shadow-md shadow-blue-200"
          >
            <Plus size={16} />결제 등록
          </button>
        </div>
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
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit overflow-x-auto no-scrollbar max-w-full">
        <button onClick={() => setTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${tab === 'overview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          매출 현황
        </button>
        <button onClick={() => setTab('list')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${tab === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          결제 내역 ({monthAllPayments.length})
        </button>
        <button onClick={() => setTab('expense')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${tab === 'expense' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          지출 내역 ({monthExpenses.length})
        </button>
        <button onClick={() => setTab('pnl')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${tab === 'pnl' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          손익계산서
        </button>
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
              <p className="text-xs text-gray-300 mt-1">
                지난달 {formatPrice(lastSummary.total)}
                {thisSummary.other > 0 && <span className="ml-1.5 text-gray-400">· 기타 {formatPrice(thisSummary.other)} 포함</span>}
              </p>
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
                <Bar dataKey="제품" stackId="a" fill="#7c3aed" radius={[0, 0, 0, 0]} />
                <Bar dataKey="기타" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 결제 수단 & 최근 결제 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
          <div className="p-3 border-b border-gray-100 flex flex-col lg:flex-row gap-2 lg:items-center">
            <label className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={listSearch}
                onChange={e => setListSearch(e.target.value)}
                placeholder="고객명, 구분, 결제수단, 메모 검색"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
                aria-label="결제 내역 검색"
              />
            </label>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <select
                value={listType}
                onChange={e => setListType(e.target.value as 'all' | Payment['type'])}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
                aria-label="결제 구분 필터"
              >
                <option value="all">전체 구분</option>
                <option value="single_treatment">단건 시술</option>
                <option value="program">프로그램</option>
                <option value="product">제품 판매</option>
                <option value="other">기타</option>
              </select>
              <select
                value={listMethod}
                onChange={e => setListMethod(e.target.value as 'all' | PaymentMethod)}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
                aria-label="결제 수단 필터"
              >
                <option value="all">전체 결제수단</option>
                {getAllPaymentMethods().map(method => <option key={method} value={method}>{method}</option>)}
              </select>
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">{listPayments.length}건 표시</span>
          </div>
          {listPayments.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign size={40} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">조건에 맞는 결제 내역이 없어요</p>
              <button onClick={() => setShowModal(true)} className="mt-3 px-4 py-2 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium">
                결제 등록하기
              </button>
            </div>
          ) : (
            <div>
              <div className="overflow-auto max-h-[65vh]">
                <div className="min-w-[720px]">
                  <div className="sticky top-0 z-10 bg-white grid grid-cols-6 text-xs text-gray-400 font-medium px-4 py-3 border-b border-gray-100">
                    <span>날짜</span>
                    <span className="col-span-2">고객</span>
                    <span>구분</span>
                    <span>결제 방법</span>
                    <span className="text-right">금액</span>
                  </div>
                  {listPayments.map(p => (
                    <div key={p.id} className="group grid grid-cols-6 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 items-center text-sm">
                      <span className="text-gray-500 text-xs">{p.paymentDate}</span>
                      <span className="col-span-2 font-medium text-gray-800">
                        {p.customerName || '—'}
                        {p.discountAmount > 0 && <span className="ml-1.5 text-[11px] text-orange-500">-{formatPrice(p.discountAmount)}</span>}
                        {p.status === 'refunded' && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 bg-red-50 text-red-500 rounded-full font-medium">환불</span>}
                        {p.status === 'pending' && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full font-medium">대기</span>}
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
                </div>
              </div>
              <div className="px-4 py-3 bg-gray-50 rounded-b-2xl flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  표시 {listPayments.length}건 · 완료 합계 (환불/대기 제외)
                </span>
                <span className="text-base font-bold text-gray-900">{formatPrice(listTotal)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'expense' && (
        <div className="space-y-5">
          {/* 지출 요약 카드 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-2">총 지출</p>
              <p className="text-2xl font-bold text-gray-900">{formatPrice(expenseSummary.total)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-2">매입 (매출원가)</p>
              <p className="text-2xl font-bold text-orange-600">{formatPrice(expenseSummary.cogs)}</p>
              <p className="text-xs text-gray-300 mt-1">제품·소모품 매입</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-2">판매비·관리비</p>
              <p className="text-2xl font-bold text-rose-500">{formatPrice(expenseSummary.sga)}</p>
              <p className="text-xs text-gray-300 mt-1">인건비·임대료 등</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-2">지출 건수</p>
              <p className="text-2xl font-bold text-gray-900">{expenseSummary.count}건</p>
            </div>
          </div>

          {/* 지출 목록 */}
          <div className="bg-white rounded-2xl border border-gray-100">
            <div className="p-3 border-b border-gray-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setExpenseCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${expenseCategoryFilter === 'all' ? 'bg-[#1a3a8f] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                전체
              </button>
              {EXPENSE_CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setExpenseCategoryFilter(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${expenseCategoryFilter === c ? 'bg-[#1a3a8f] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {c}
                </button>
              ))}
            </div>
            {expenseList.length === 0 ? (
              <div className="text-center py-12">
                <Receipt size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400">
                  {expenseCategoryFilter === 'all' ? '이번 달 지출 내역이 없어요' : '해당 분류의 지출이 없어요'}
                </p>
                <p className="text-xs text-gray-300 mt-1">제품 매입, 임대료, 인건비 등을 기록하면 손익계산서가 자동 작성돼요</p>
                <button onClick={() => setShowExpenseModal(true)} className="mt-3 px-4 py-2 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium">
                  지출 등록하기
                </button>
              </div>
            ) : (
              <div>
                <div className="overflow-auto max-h-[65vh]">
                  <div className="min-w-[720px]">
                    <div className="sticky top-0 z-10 bg-white grid grid-cols-6 text-xs text-gray-400 font-medium px-4 py-3 border-b border-gray-100">
                      <span>날짜</span>
                      <span>분류</span>
                      <span className="col-span-2">내용 / 거래처</span>
                      <span>결제 수단</span>
                      <span className="text-right">금액</span>
                    </div>
                    {expenseList.map(x => (
                      <div key={x.id} className="group grid grid-cols-6 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 items-center text-sm">
                        <span className="text-gray-500 text-xs">{x.expenseDate}</span>
                        <span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COGS_CATEGORIES.includes(x.category) ? 'bg-orange-100 text-orange-600' : 'bg-rose-50 text-rose-500'}`}>
                            {x.category}
                          </span>
                        </span>
                        <span className="col-span-2 font-medium text-gray-800 truncate">
                          {x.description}
                          {x.vendor && <span className="ml-1.5 text-xs text-gray-400">· {x.vendor}</span>}
                        </span>
                        <span className="text-gray-500 text-xs">{x.paymentMethod}</span>
                        <span className="flex items-center justify-end gap-1.5">
                          <span className="font-bold text-gray-900">{formatPrice(x.amount)}</span>
                          <button onClick={() => openExpenseEdit(x)} className="p-1 text-gray-300 hover:text-[#1a3a8f] hover:bg-gray-100 rounded md:opacity-0 md:group-hover:opacity-100 transition" aria-label="지출 수정">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleExpenseDelete(x)} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded md:opacity-0 md:group-hover:opacity-100 transition" aria-label="지출 삭제">
                            <Trash2 size={13} />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-4 py-3 bg-gray-50 rounded-b-2xl flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">표시 {expenseList.length}건 합계</span>
                  <span className="text-base font-bold text-gray-900">
                    {formatPrice(expenseList.reduce((s, x) => s + x.amount, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'pnl' && (
        <div className="space-y-5">
          {/* 기간 단위 선택 */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
              {([
                { v: 'month', label: '월간' },
                { v: 'quarter', label: '분기' },
                { v: 'year', label: '연간' },
              ] as { v: PnlPeriodMode; label: string }[]).map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => setPnlMode(v)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${pnlMode === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              결제(완료)와 지출 기록 기준의 운영 참고용 간이 손익계산서입니다 · 세무 신고 자료는 세무사와 확인하세요
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* 손익계산서 본문 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2"><FileText size={16} className="text-[#1a3a8f]" />손익계산서</h3>
                <span className="text-xs text-gray-400">{pnl.label}</span>
              </div>
              <div className="text-sm">
                {/* 매출 */}
                <div className="flex justify-between py-2 font-bold text-gray-900 border-b border-gray-100">
                  <span>매출액</span><span>{formatPrice(pnl.cur.revenue.total)}</span>
                </div>
                <div className="flex justify-between py-1.5 text-gray-500 text-xs pl-3">
                  <span>시술 매출</span><span>{formatPrice(pnl.cur.revenue.treatment)}</span>
                </div>
                <div className="flex justify-between py-1.5 text-gray-500 text-xs pl-3">
                  <span>제품 매출</span><span>{formatPrice(pnl.cur.revenue.product)}</span>
                </div>
                {pnl.cur.revenue.other > 0 && (
                  <div className="flex justify-between py-1.5 text-gray-500 text-xs pl-3">
                    <span>기타 매출</span><span>{formatPrice(pnl.cur.revenue.other)}</span>
                  </div>
                )}
                {/* 매출원가 */}
                <div className="flex justify-between py-2 font-medium text-gray-700 border-b border-gray-100 mt-1">
                  <span>매출원가 (매입)</span><span className="text-orange-600">−{formatPrice(pnl.cur.cogs)}</span>
                </div>
                {COGS_CATEGORIES.map(c => (pnl.cur.byCategory[c] || 0) > 0 && (
                  <div key={c} className="flex justify-between py-1.5 text-gray-500 text-xs pl-3">
                    <span>{c}</span><span>{formatPrice(pnl.cur.byCategory[c] || 0)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 font-bold text-gray-900 bg-gray-50 -mx-2 px-2 rounded-lg my-1">
                  <span>매출총이익</span>
                  <span className={pnl.cur.grossProfit >= 0 ? 'text-gray-900' : 'text-red-500'}>{formatPrice(pnl.cur.grossProfit)}</span>
                </div>
                {/* 판관비 */}
                <div className="flex justify-between py-2 font-medium text-gray-700 border-b border-gray-100">
                  <span>판매비와 관리비</span><span className="text-rose-500">−{formatPrice(pnl.cur.sga)}</span>
                </div>
                {EXPENSE_CATEGORIES.filter(c => !COGS_CATEGORIES.includes(c)).map(c => (pnl.cur.byCategory[c] || 0) > 0 && (
                  <div key={c} className="flex justify-between py-1.5 text-gray-500 text-xs pl-3">
                    <span>{c}</span><span>{formatPrice(pnl.cur.byCategory[c] || 0)}</span>
                  </div>
                ))}
                {/* 영업이익 */}
                <div className={`flex justify-between py-3 font-bold text-base -mx-2 px-2 rounded-lg mt-1 ${pnl.cur.operatingProfit >= 0 ? 'bg-blue-50 text-[#1a3a8f]' : 'bg-red-50 text-red-600'}`}>
                  <span>영업이익</span><span>{formatPrice(pnl.cur.operatingProfit)}</span>
                </div>
                <div className="flex justify-between pt-2 text-xs text-gray-400">
                  <span>영업이익률</span>
                  <span>{pnl.cur.revenue.total > 0 ? `${Math.round((pnl.cur.operatingProfit / pnl.cur.revenue.total) * 100)}%` : '—'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* 전기 대비 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="font-bold text-gray-900 mb-3">전기 대비 ({pnl.prevLabel})</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {([
                    { label: '매출', cur: pnl.cur.revenue.total, prev: pnl.prev.revenue.total },
                    { label: '지출', cur: pnl.cur.totalExpense, prev: pnl.prev.totalExpense },
                    { label: '영업이익', cur: pnl.cur.operatingProfit, prev: pnl.prev.operatingProfit },
                  ]).map(({ label, cur, prev }) => {
                    const diff = cur - prev;
                    return (
                      <div key={label} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-1">{label}</p>
                        <p className="text-sm font-bold text-gray-900">{formatPrice(cur)}</p>
                        <p className={`text-[11px] mt-1 font-medium ${diff > 0 ? 'text-green-500' : diff < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                          {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${formatPrice(diff)}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 추이 차트 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="font-bold text-gray-900 mb-4">
                  {pnlMode === 'month' ? '최근 6개월 손익 추이 (만원)' : `${pnl.label} 월별 손익 (만원)`}
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={pnlTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <Tooltip
                      formatter={(v: number, name: string) => [`${v.toLocaleString('ko-KR')}만원`, name]}
                      contentStyle={{ borderRadius: 12, border: '1px solid #f0f0f0', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="매출" fill="#1a3a8f" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="지출" fill="#f97316" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="이익" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
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
                <div className={`grid gap-2 ${editingPayment?.type === 'program' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  {[
                    { v: 'single_treatment', label: '단건 시술', icon: Scissors },
                    // 프로그램 결제는 고객 페이지에서 생성 — 신규 등록엔 미노출,
                    // 편집 대상이 프로그램일 때만 타입 유지를 위해 표시
                    ...(editingPayment?.type === 'program'
                      ? [{ v: 'program', label: '프로그램', icon: Layers }]
                      : []),
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
                    value={form.amount && !Number.isNaN(parseInt(form.amount, 10)) ? parseInt(form.amount, 10).toLocaleString('ko-KR') : ''}
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
                    value={form.discountAmount && form.discountAmount !== '0' && !Number.isNaN(parseInt(form.discountAmount, 10)) ? parseInt(form.discountAmount, 10).toLocaleString('ko-KR') : ''}
                    onChange={e => setForm(f => ({ ...f, discountAmount: e.target.value.replace(/,/g, '') || '0' }))}
                    className="w-full pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">원</span>
                </div>
                {form.amount && parseInt(form.discountAmount || '0') > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    결제 금액(할인 반영 후): <strong className="text-gray-600">{formatPrice((parseInt(form.amount.replace(/,/g, '')) || 0))}</strong> — 위 결제 금액란에 할인을 뺀 실수령액을 입력하세요
                  </p>
                )}
              </div>

              {/* 결제 상태 — 환불/취소 기록 가능 (누적결제액은 자동 정합 조정) */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">결제 상태</label>
                <div className="flex gap-1">
                  {([
                    { v: 'completed', label: '완료' },
                    { v: 'refunded', label: '환불' },
                    { v: 'pending', label: '대기' },
                  ] as { v: Payment['status']; label: string }[]).map(({ v, label }) => (
                    <button
                      type="button"
                      key={v}
                      onClick={() => setForm(f => ({ ...f, status: v }))}
                      className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                        form.status === v
                          ? v === 'refunded' ? 'border-red-400 bg-red-50 text-red-600' : 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {form.status === 'refunded' && (
                  <p className="text-[11px] text-red-400 mt-1">환불로 저장하면 매출 통계와 고객 누적결제액에서 제외됩니다.</p>
                )}
              </div>

              {/* 결제 방법 & 날짜 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">결제 방법</label>
                  <PaymentMethodPicker
                    value={form.paymentMethod}
                    onChange={m => setForm(f => ({ ...f, paymentMethod: m }))}
                  />
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

      {/* 결제 요청 링크 모달 (카드·무통장입금) */}
      <PaymentLinkModal
        open={showPaymentLinkModal}
        onClose={() => setShowPaymentLinkModal(false)}
        customers={customers}
      />

      {/* 지출(매입) 등록 모달 */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editingExpenseId ? '지출 수정' : '지출(매입) 등록'}</h2>
              <button onClick={closeExpenseModal}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleExpenseSave} className="p-5 space-y-4">
              {/* 분류 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">지출 분류 *</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {EXPENSE_CATEGORIES.map(c => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setExpenseForm(f => ({ ...f, category: c }))}
                      className={`py-2 rounded-xl border text-xs font-medium transition-colors ${
                        expenseForm.category === c
                          ? COGS_CATEGORIES.includes(c)
                            ? 'border-orange-400 bg-orange-50 text-orange-600'
                            : 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  제품·소모품 매입은 손익계산서에서 매출원가로, 나머지는 판매비·관리비로 집계돼요
                </p>
              </div>

              {/* 내용 & 거래처 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">내용 *</label>
                <input
                  required
                  value={expenseForm.description}
                  onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="예: 트로이아르케 앰플 20개 매입, 8월 임대료"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">거래처</label>
                <input
                  value={expenseForm.vendor}
                  onChange={e => setExpenseForm(f => ({ ...f, vendor: e.target.value }))}
                  placeholder="예: 트로이아르케 본사, 건물주 (선택)"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 금액 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">금액 *</label>
                <div className="relative">
                  <input
                    required
                    type="text"
                    value={expenseForm.amount && !Number.isNaN(parseInt(expenseForm.amount, 10)) ? parseInt(expenseForm.amount, 10).toLocaleString('ko-KR') : ''}
                    onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value.replace(/,/g, '') }))}
                    className="w-full pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">원</span>
                </div>
              </div>

              {/* 결제 수단 & 날짜 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">지불 수단</label>
                  <PaymentMethodPicker
                    value={expenseForm.paymentMethod}
                    onChange={m => setExpenseForm(f => ({ ...f, paymentMethod: m }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">지출일</label>
                  <input
                    type="date"
                    value={expenseForm.expenseDate}
                    onChange={e => setExpenseForm(f => ({ ...f, expenseDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
                <input
                  value={expenseForm.memo}
                  onChange={e => setExpenseForm(f => ({ ...f, memo: e.target.value }))}
                  placeholder="세금계산서 발행 여부 등 (선택)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={closeExpenseModal} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">취소</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <CheckCircle size={14} />{editingExpenseId ? '수정 저장' : '지출 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
