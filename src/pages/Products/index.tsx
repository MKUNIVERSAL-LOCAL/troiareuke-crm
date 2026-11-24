import { useState, useCallback, useEffect, useMemo } from 'react';
import { tagRefund } from '../../lib/refundDate';
import { canceledSaleIds } from '../../lib/saleCancel';
import { saleCustomerNameResolver } from '../../lib/customerIdentity';
import { askConfirm } from '../../lib/confirmDialog';
import { canDo } from '../../lib/permissions';
import { parseAmount, parseCount, isISODate } from '../../lib/inputRules';
import { thisYearMonthISO } from '../../lib/format';
import { josa } from '../../lib/josa';
import { isLowStock } from '../../lib/stockRule';
import { useSearchParams } from 'react-router-dom';
import { notify } from '../../lib/notify';
import { useDataRefreshed } from '../../hooks/useDataRefreshed';
import { Search, AlertTriangle, Package, ShoppingCart, Plus, TrendingUp, Pencil, Trash2, PackagePlus, History } from 'lucide-react';
import StockAdjustModal from '../../components/StockAdjustModal';
import StockLedgerModal from '../../components/StockLedgerModal';
import { recordStockMovement, removeStockEntries } from '../../lib/stockLedger';
import Header from '../../components/layout/Header';
import Modal from '../../components/ui/Modal';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';
import { ProductStore, ProductSaleStore, CustomerStore, StaffStore, PaymentStore } from '../../lib/store';
import { todayISO, formatDate, formatPrice } from '../../lib/format';
import { getLastPaymentMethod, rememberPaymentMethod } from '../../lib/lastUsed';
import CustomerCombobox from '../../components/ui/CustomerCombobox';
import type { Product, ProductSale, Payment } from '../../types';
import type { PaymentMethod } from '../../types';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';

const CATEGORIES = ['전체', '세럼', '크림', '스킨', '선케어', '앰플', '클렌저', '오일', '기타'];

type Tab = 'inventory' | 'sales';

// ─── 메인 컴포넌트 ──────────────────────────────────────────────
export default function Products() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('inventory');
  const [search, setSearch] = useState('');
  const [salesSearch, setSalesSearch] = useState('');
  const [category, setCategory] = useState('전체');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [products, setProducts] = useState(() => ProductStore.getAll());
  const [sales, setSales] = useState(() => ProductSaleStore.getAll());
  const [payments, setPayments] = useState<Payment[]>(() => PaymentStore.getAll()); // 판매 취소(환불) 식별용 — 빈 배열로 시작하면 화면을 새로 열 때 취소 표시가 사라지고 같은 판매를 다시 취소할 수 있었다(재고 이중 복구) (리뷰 2026-11-23)
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null); // 재고 입고·조정 (2026-11-18)
  const [ledgerProduct, setLedgerProduct] = useState<Product | null>(null); // 재고 이동 이력·대조 (145)
  // 대시보드 재고 부족 알림(?stock=<id>) → 입고 모달 바로 열기. 1회 캡처 후 URL 비움(프리필 관례)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('stock');
    const tabParam = searchParams.get('tab'); // 고객 타임라인 제품 판매 → 판매 기록 탭 (139 #M9 — 링크만 있고 탭이 안 바뀌던 것)
    if (!id && tabParam !== 'sales') return;
    if (tabParam === 'sales') setTab('sales');
    if (id) {
      const p = ProductStore.getAll().find(x => x.id === id);
      if (p) setStockProduct(p); else notify('제품을 찾을 수 없습니다. 삭제됐거나 다른 매장의 제품입니다.');
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [saleProduct, setSaleProduct] = useState<Product | null>(null);

  const refresh = useCallback(() => {
    setProducts(ProductStore.getAll());
    setSales(ProductSaleStore.getAll());
    setPayments(PaymentStore.getAll());
  }, []);
  useDataRefreshed(refresh); // (16차 #H3)

  const handleDeleteProduct = async (product: Product) => {
    // 제품을 지우면 그 판매를 나중에 [판매 취소]해도 재고를 돌려줄 대상이 없다 — 판매만 멈추려면 비활성 (11차 #M9)
    const linked = sales.filter(s => s.productId === product.id).length;
    const detail = linked > 0
      ? `\n연결된 판매 기록 ${linked}건은 남지만, 삭제 뒤에는 그 판매를 취소해도 재고가 복구되지 않습니다.\n판매만 멈추려면 삭제 대신 [수정]에서 '판매 활성'을 끄세요.`
      : '\n재고 항목은 복구할 수 없습니다.';
    if (!(await askConfirm({ title: '제품 삭제', message: `'${product.name}' 제품을 삭제할까요?${detail}`, confirmLabel: '삭제', danger: true }))) return;
    ProductStore.delete(product.id);
    removeStockEntries(product.id); // 재고 원장도 함께 (145)
    notify('제품을 삭제했습니다.'); // (15차 #M10)
    refresh();
  };

  // 취소된 판매 = 연결 결제가 환불 상태 (판매 행 자체는 코어에 수정 API 가 없어 결제 쪽 상태로 식별)
  const canceled = useMemo(() => canceledSaleIds(payments), [payments]);
  const isCanceled = (sale: ProductSale) => canceled.has(sale.id);
  const handleDeleteSale = async (sale: ProductSale) => {
    if (!(await askConfirm({ title: '판매 취소', danger: true, confirmLabel: '판매 취소', cancelLabel: '닫기', message: `${formatDate(sale.saleDate)} · ${sale.productName} ${sale.quantity}개 판매 기록을 취소할까요?\n재고 ${sale.quantity}개가 복구되고, 연결된 결제는 환불로 바뀌어 매출·마감·엑셀에 환불 기록이 남습니다.` }))) return;
    const before = sale.productId ? ProductStore.getById(sale.productId) : undefined; // 원장 행의 "이동 전 재고" (145)
    const linked = PaymentStore.getAll().filter(p => p.referenceId === sale.id && p.status === 'completed');
    if (linked.length === 0) {
      // 연결 결제가 없는 옛 판매 — 예전처럼 행 삭제(코어: 재고 복구 포함)
      ProductSaleStore.delete(sale.id);
    } else {
      // 결제를 지우면 매출이 소급 감소할 뿐 환불 흔적이 어디에도 남지 않았다(세무 대사 불가) — 재고만 복구하고 결제는 환불로 (10차 숫자 점검 #H2)
      if (sale.productId) ProductStore.adjustStock(sale.productId, -sale.quantity); // 제품이 지워진 옛 판매는 재고 복구 대상이 없다
      for (const p of linked) PaymentStore.update(p.id, { status: 'refunded', memo: tagRefund(p.memo, todayISO()) });
    }
    if (before) recordStockMovement({ product: before, kind: 'cancel', qty: sale.quantity, refId: sale.id, note: `${formatDate(sale.saleDate)} 판매 취소`, actor: user?.name }); // 재고 원장 (145)
    notify(`판매를 취소했습니다. ${josa(`재고 ${sale.quantity}${(sale.productId && ProductStore.getById(sale.productId)?.unit) || '개'}`, '을/를')} 복구했습니다.`); // '1병를' 이 되던 것 (123~126 리뷰 #M3) // 파괴적 동작 뒤 피드백 (15차 #M10)
    refresh();
  };

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
      || (p.brand || '').toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === '전체' || p.category === category;
    const matchLowStock = !lowStockOnly || isLowStock(p); // 헤더 "재고부족 N종"과 같은 규칙 — 단종 제품은 제외 (10차 #M6)
    return matchSearch && matchCategory && matchLowStock;
  });

  const lowStockCount = products.filter(isLowStock).length;

  const normalizedSalesSearch = salesSearch.trim().toLowerCase();
  // 현재 고객 이름(개명·익명화 반영, 11차 #H4) — 고객 인덱스를 한 번 만들어 행마다 선형 탐색하지 않는다 (리뷰 #M2). 비회원 판매는 저장 사본
  const customerNameOf = useMemo(() => saleCustomerNameResolver(), [sales, payments]); // eslint-disable-line react-hooks/exhaustive-deps -- 판매·결제가 바뀔 때 고객 캐시도 다시 읽는다
  const recentSales = useMemo(() => [...sales]
    .filter(sale => !normalizedSalesSearch || [
      sale.productName,
      customerNameOf(sale),
      sale.paymentMethod,
      sale.saleDate,
    ].some(value => value.toLowerCase().includes(normalizedSalesSearch)))
    .sort((a, b) => b.saleDate.localeCompare(a.saleDate))
    .slice(0, 60), [sales, normalizedSalesSearch, customerNameOf]);

  const liveSales = sales.filter(sale => !isCanceled(sale)); // 취소(환불)된 판매는 매출 화면 '제품 매출'처럼 제외 (10차 #H2·#M5)
  const totalSalesRevenue = liveSales.reduce((sum, sale) => sum + sale.totalPrice, 0);
  const monthSalesRevenue = liveSales.filter(sale => sale.saleDate.startsWith(thisYearMonthISO())).reduce((sum, sale) => sum + sale.totalPrice, 0);
  const visibleSalesRevenue = recentSales.filter(sale => !isCanceled(sale)).reduce((sum, sale) => sum + sale.totalPrice, 0);

  const handleSell = (product: Product) => {
    if (!product.isActive) { notify('판매 중지된 제품입니다. [수정]에서 \'판매 활성\'을 켜면 다시 팔 수 있습니다.'); return; }
    setSaleProduct(product);
    setShowSaleModal(true);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="제품/재고 관리"
        subtitle={`총 ${products.length}종 · 재고부족 ${lowStockCount}종`}
        action={{ label: '제품 추가', onClick: () => setShowAddModal(true) }}
      />

      <div className="p-4 sm:p-6 lg:p-8 flex-1">
        {/* Low Stock Alert — 클릭 시 재고부족만 필터 */}
        {lowStockCount > 0 && (
          <button
            type="button"
            onClick={() => setLowStockOnly(v => !v)}
            className={clsx(
              'w-full flex items-center gap-3 px-4 py-3 border rounded-xl mb-6 text-left transition-colors',
              lowStockOnly ? 'bg-orange-100 border-orange-300' : 'bg-orange-50 border-orange-200 hover:bg-orange-100'
            )}
          >
            <AlertTriangle size={16} className="text-orange-700 flex-shrink-0" />
            <p className="text-sm text-orange-700 font-medium flex-1">
              재고 부족 제품이 <strong>{lowStockCount}종</strong> 있습니다. 빠른 발주가 필요합니다.
            </p>
            <span className="text-xs font-semibold text-orange-700">
              {lowStockOnly ? '전체 보기 ↩' : '재고 부족만 보기 →'}
            </span>
          </button>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 [&:has(>:last-child:nth-child(3))]:lg:grid-cols-3 [&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1"> {/* 직원은 매출 카드가 빠져 3장 — 빈 칸 대신 3열·전폭 (15차 #M13) */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">전체 제품</p>
            <p className="text-2xl font-bold text-gray-900">{products.length}<span className="text-sm font-medium ml-1">종</span></p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">재고 부족</p>
            <p className={clsx('text-2xl font-bold', lowStockCount > 0 ? 'text-red-600' : 'text-gray-900')}>
              {lowStockCount}<span className="text-sm font-medium ml-1">종</span>
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">총 판매건수</p>
            <p className="text-2xl font-bold text-gray-900">{sales.length}<span className="text-sm font-medium ml-1">건</span></p>
          </div>
          {canDo(user?.role, 'sales.view') && ( /* 매출 금액은 매출 화면·대시보드와 같은 권한 (117~119 리뷰 #M6) */
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">홈케어 누적 매출</p>
            <p className="text-2xl font-bold text-[#1a3a8f]">
              {formatPrice(totalSalesRevenue)}
            </p>
            <p className="text-xs text-gray-400 mt-1">이달 {formatPrice(monthSalesRevenue)} · 전체 기간, 취소 제외 — 매출 화면과 같은 기준</p>
          </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
          <button
            onClick={() => setTab('inventory')}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded-lg transition-all',
              tab === 'inventory' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            )}
          >
            재고 현황
          </button>
          <button
            onClick={() => setTab('sales')}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded-lg transition-all',
              tab === 'sales' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            )}
          >
            판매 기록 {sales.length > 0 && <span className="ml-1 text-xs text-gray-400">({sales.length})</span>}
          </button>
        </div>

        {tab === 'inventory' ? (
          <>
            {/* Filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="제품명, 브랜드 검색"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={clsx(
                      'px-3.5 py-2 text-sm font-medium rounded-xl border transition-all',
                      category === c
                        ? 'bg-[#1a3a8f] text-white border-[#1a3a8f] shadow-md'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a8f]/30 hover:text-[#1a3a8f]'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {filtered.length === 0 ? (
                <div className="py-16 text-center">
                  <Package size={32} className="mx-auto mb-3 text-gray-300" />
                  {products.length === 0 ? (
                    <>
                      <p className="text-sm text-gray-400">아직 제품이 없습니다 — 판매하고 재고를 관리할 홈케어 제품을 등록해주세요</p>
                      <button type="button" onClick={() => setShowAddModal(true)} className="mt-3 px-4 py-2 bg-[#1a3a8f] text-white rounded-xl text-xs font-medium hover:bg-[#152f75]">제품 추가</button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-400">조건에 맞는 제품이 없어요</p>
                      <button type="button" onClick={() => { setSearch(''); setCategory('전체'); setLowStockOnly(false); }} className="mt-3 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-200">필터 초기화</button>
                    </>
                  )}
                </div>
              ) : (
                <>
                {/* 모바일(lg 미만): 카드 목록 — 표는 900px 폭 (2026-11-17) */}
                <ul className="lg:hidden divide-y divide-gray-50 max-h-[65vh] overflow-y-auto" data-testid="products-mobile-list">
                  {filtered.map(p => {
                    const isLow = p.stock <= p.minStock;
                    const margin = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
                    return (
                      <li key={p.id} data-testid="product-row" className={clsx('px-4 py-3', isLow && 'bg-orange-50/40')}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900">
                              {p.name}
                              {!p.isActive && <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-2xs font-medium align-middle">비활성</span>}
                            </p>
                            {p.brand && <p className="text-xs text-gray-400">{p.brand}</p>}
                            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md">{p.category}</span>
                              <span className={clsx('font-bold', isLow ? 'text-red-600' : 'text-gray-700')}>재고 {p.stock}{p.unit}</span>
                              {isLow && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium"><AlertTriangle size={10} /> 부족</span>}
                              <span className={clsx('font-semibold', margin >= 50 ? 'text-green-700' : margin >= 30 ? 'text-amber-700' : 'text-red-600')}>마진 {margin}%</span>
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <span className="text-sm font-bold text-gray-900">{formatPrice(p.price)}</span>
                            <span className="flex items-center gap-1">
                              <button onClick={() => handleSell(p)} disabled={!p.isActive} title={p.isActive ? undefined : '판매 중지 제품 — [수정]에서 판매 활성을 켜세요'} className="inline-flex items-center gap-1 px-3 py-2 bg-[#1a3a8f] text-white text-xs font-medium rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed"><ShoppingCart size={11} />판매</button>
                              <button onClick={() => setStockProduct(p)} className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 text-gray-700 text-xs font-medium rounded-lg" aria-label={`${p.name} 입고·조정`}><PackagePlus size={11} />입고</button>
                              <button onClick={() => setLedgerProduct(p)} className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 text-gray-700 text-xs font-medium rounded-lg" aria-label={`${p.name} 재고 이력`}><History size={11} />이력</button>
                              <button onClick={() => setEditProduct(p)} className="p-2.5 text-gray-400 hover:text-[#1a3a8f] rounded-lg" aria-label="제품 수정"><Pencil size={16} /></button>
                              <button onClick={() => handleDeleteProduct(p)} className="p-2.5 text-gray-400 hover:text-red-600 rounded-lg" aria-label="제품 삭제"><Trash2 size={16} /></button>
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="hidden lg:block overflow-auto max-h-[65vh]">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500">제품명</th>
                      <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500">카테고리</th>
                      <th className="text-right px-4 py-3.5 text-xs font-semibold text-gray-500">판매가</th>
                      <th className="text-right px-4 py-3.5 text-xs font-semibold text-gray-500">원가</th>
                      <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500">재고</th>
                      <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500">상태</th>
                      <th className="text-right px-4 py-3.5 text-xs font-semibold text-gray-500">마진율</th>
                      <th className="text-center px-6 py-3.5 text-xs font-semibold text-gray-500">판매</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map(p => {
                      const isLow = p.stock <= p.minStock;
                      const margin = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;

                      return (
                        <tr key={p.id} data-testid="product-row" className={clsx('hover:bg-gray-50/50 transition-colors', isLow && 'bg-orange-50/40')}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                                <Package size={16} className="text-[#1a3a8f]" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {p.name}
                                  {!p.isActive && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-2xs font-medium align-middle">비활성</span>
                                  )}
                                </p>
                                {p.brand && <p className="text-xs text-gray-400">{p.brand}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs">{p.category}</span>
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-gray-800 text-right">
                            {formatPrice(p.price)}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-400 text-right">
                            {formatPrice(p.cost)}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <p className={clsx('text-sm font-bold', isLow ? 'text-red-600' : 'text-gray-800')}>
                              {p.stock}{p.unit}
                            </p>
                            <p className="text-xs text-gray-400">최소 {p.minStock}{p.unit}</p>
                          </td>
                          <td className="px-4 py-4 text-center">
                            {isLow ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                <AlertTriangle size={10} /> 부족
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">정상</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className={clsx(
                              'text-sm font-bold',
                              margin >= 50 ? 'text-green-700' : margin >= 30 ? 'text-amber-700' : 'text-red-600'
                            )}>
                              {margin}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleSell(p)}
                                disabled={!p.isActive}
                                title={p.isActive ? undefined : '판매 중지 제품 — [수정]에서 판매 활성을 켜세요'}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1a3a8f] text-white text-xs font-medium rounded-lg hover:bg-[#152d6e] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
                              >
                                <ShoppingCart size={11} />
                                판매
                              </button>
                              <button
                                onClick={() => setStockProduct(p)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors"
                                aria-label={`${p.name} 입고·조정`}
                                title="재고 입고 또는 실사 조정"
                              >
                                <PackagePlus size={11} />
                                입고
                              </button>
                              <button
                                onClick={() => setLedgerProduct(p)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors"
                                aria-label={`${p.name} 재고 이력`}
                                title="입고·판매·실사 이력과 원장 대조"
                              >
                                <History size={11} />
                                이력
                              </button>
                              <button
                                onClick={() => setEditProduct(p)}
                                className="p-1.5 text-gray-400 hover:text-[#1a3a8f] hover:bg-gray-100 rounded-lg transition-colors"
                                aria-label="제품 수정"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(p)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                aria-label="제품 삭제"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                </>
              )}
            </div>
          </>
        ) : (
          /* 판매 기록 탭 */
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-3 border-b border-gray-100 flex flex-col sm:flex-row gap-2 sm:items-center">
              <label className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={salesSearch}
                  onChange={e => setSalesSearch(e.target.value)}
                  placeholder="제품명, 고객명, 결제 수단, 판매일 검색"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
                  aria-label="제품 판매 기록 검색"
                />
              </label>
              <span className="text-xs text-gray-400 whitespace-nowrap">최근 {recentSales.length}건 표시</span>
            </div>
            {recentSales.length === 0 ? (
              <div className="py-16 text-center">
                <TrendingUp size={32} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-400 mb-1">판매 기록이 없습니다</p>
                <p className="text-xs text-gray-500">제품 목록에서 [판매]를 눌러 기록해주세요</p>
              </div>
            ) : (
              <>
              <ul className="lg:hidden divide-y divide-gray-50 max-h-[65vh] overflow-y-auto" data-testid="product-sales-mobile-list">
                {recentSales.map(sale => (
                  <li key={sale.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{sale.productName}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                          <span>{formatDate(sale.saleDate)}</span>
                          <span>{customerNameOf(sale) || '-'}</span>
                          <span>{sale.quantity}개 × {formatPrice(sale.unitPrice)}</span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md">{sale.paymentMethod}</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-sm font-bold ${isCanceled(sale) ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatPrice(sale.totalPrice)}</span>
                        {isCanceled(sale) ? <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-700 rounded-full">취소(환불)</span> : (
                        <button onClick={() => handleDeleteSale(sale)} className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-gray-400 hover:text-red-600 rounded-lg" aria-label="판매 취소" title="판매 취소 및 재고 복구"><Trash2 size={14} /></button>)}
                      </div>
                    </div>
                  </li>
                ))}
                <li className="px-4 py-3 bg-gray-50/50 flex items-center justify-between text-xs font-semibold text-gray-500">
                  <span>표시분 합계(최근 60건)</span>
                  <span className="text-sm font-bold text-[#1a3a8f]">{formatPrice(visibleSalesRevenue)}</span>
                </li>
              </ul>
              <div className="hidden lg:block overflow-auto max-h-[65vh]">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500">판매일</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500">제품명</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500">고객</th>
                    <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500">수량</th>
                    <th className="text-right px-4 py-3.5 text-xs font-semibold text-gray-500">단가</th>
                    <th className="text-right px-4 py-3.5 text-xs font-semibold text-gray-500">합계</th>
                    <th className="text-center px-6 py-3.5 text-xs font-semibold text-gray-500">결제 수단</th>
                    <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentSales.map(sale => (
                    <tr key={sale.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5 text-sm text-gray-500">{formatDate(sale.saleDate)}</td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-medium text-gray-900">{sale.productName}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{customerNameOf(sale) || '-'}</td>
                      <td className="px-4 py-3.5 text-sm text-center text-gray-700 font-medium">{sale.quantity}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 text-right">{formatPrice(sale.unitPrice)}</td>
                      <td className={`px-4 py-3.5 text-sm font-bold text-right ${isCanceled(sale) ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatPrice(sale.totalPrice)}</td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs">{sale.paymentMethod}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {isCanceled(sale) ? <span className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded-full">취소(환불)</span> : (
                        <button
                          onClick={() => handleDeleteSale(sale)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          aria-label="판매 취소"
                          title="판매 취소 및 재고 복구"
                        >
                          <Trash2 size={14} />
                        </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50/50">
                    <td colSpan={5} className="px-6 py-3 text-xs font-semibold text-gray-500 text-right">표시분 합계(최근 60건)</td>
                    <td className="px-4 py-3 text-sm font-bold text-[#1a3a8f] text-right">
                      {formatPrice(visibleSalesRevenue)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
              </div>
              </>
            )}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddProductModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { refresh(); setShowAddModal(false); }}
        />
      )}
      {stockProduct && (
        <StockAdjustModal product={stockProduct} actor={user?.name} onClose={() => setStockProduct(null)} onDone={() => { setStockProduct(null); refresh(); }} />
      )}
      {ledgerProduct && (
        <StockLedgerModal product={ledgerProduct} actor={user?.name} onClose={() => setLedgerProduct(null)} onChanged={refresh} />
      )}
      {editProduct && (
        <AddProductModal
          product={editProduct}
          onClose={() => setEditProduct(null)}
          onSaved={() => { refresh(); setEditProduct(null); }}
        />
      )}
      {showSaleModal && saleProduct && (
        <SaleModal
          product={saleProduct}
          onClose={() => { setShowSaleModal(false); setSaleProduct(null); }}
          onSaved={() => { refresh(); setShowSaleModal(false); setSaleProduct(null); }}
        />
      )}
    </div>
  );
}

// ─── 제품 추가/수정 모달 ──────────────────────────────────────────────
function AddProductModal({ product, onClose, onSaved }: { product?: Product | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    name: product?.name ?? '',
    category: product?.category ?? '세럼',
    brand: product?.brand ?? '',
    price: product ? String(product.price) : '',
    cost: product ? String(product.cost) : '',
    stock: product ? String(product.stock) : '',
    minStock: product ? String(product.minStock) : '5',
    unit: product?.unit ?? '개',
    description: product?.description ?? '',
    isActive: product?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = () => {
    if (!form.name.trim() || !form.price || !form.stock) {
      notify('제품명, 판매가, 재고는 필수 입력 항목입니다.');
      return;
    }
    // "1e5"→1원, "1500.9"→1500 처럼 parseInt 가 조용히 바꾸던 값을 거부한다 (14차 #H6)
    const price = parseAmount(form.price), cost = form.cost.trim() ? parseAmount(form.cost) : 0, stock = parseAmount(form.stock), minStock = form.minStock.trim() ? parseAmount(form.minStock) : 5;
    if (price === null || cost === null || stock === null || minStock === null) {
      notify('판매가·원가·재고·최소재고는 0 이상 정수로 입력해주세요. (소수·지수 표기는 받지 않습니다)');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      category: form.category,
      brand: form.brand.trim() || undefined,
      price,
      cost,
      minStock,
      unit: form.unit || '개',
      description: form.description.trim() || undefined,
      isActive: form.isActive,
    };
    if (isEdit && product) {
      ProductStore.update(product.id, payload); // stock 제외 — 다른 기기의 판매·입고로 바뀐 재고를 되돌리지 않는다 (16차 #H1)
    } else {
      ProductStore.save({ ...payload, stock });
    }
    onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? '제품 수정' : '제품 추가'} size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">제품명 *</label>
          <input
            type="text"
            placeholder="제품명 입력"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">카테고리</label>
            <select
              aria-label="카테고리"
              value={form.category}
              onChange={e => set('category', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            >
              {['세럼', '크림', '스킨', '선케어', '앰플', '클렌저', '오일', '기타'].map(c =>
                <option key={c} value={c}>{c}</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">브랜드</label>
            <input
              type="text"
              placeholder="브랜드명"
              value={form.brand}
              onChange={e => set('brand', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">판매가 (원) *</label>
            <input
              type="number"
              aria-label="판매가"
              placeholder="0"
              value={form.price}
              onChange={e => set('price', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">원가 (원)</label>
            <input
              type="number"
              aria-label="원가"
              placeholder="0"
              value={form.cost}
              onChange={e => set('cost', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            />
          </div>
        </div>
        {/* Margin preview */}
        {parseInt(form.price) > 0 && form.cost !== '' && (
          <div className="px-3 py-2 bg-blue-50 rounded-xl text-xs text-blue-700">
            마진율: <strong>{Math.round(((parseInt(form.price) - (parseInt(form.cost) || 0)) / parseInt(form.price)) * 100)}%</strong>
            {' '}· 마진액: <strong>{formatPrice((parseInt(form.price) - (parseInt(form.cost) || 0)))}</strong>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">재고 *</label>
            <input
              type="number"
              aria-label="재고"
              placeholder="0"
              value={form.stock}
              onChange={e => set('stock', e.target.value)}
              disabled={isEdit}
              title={isEdit ? '재고는 목록의 [입고]·조정으로 바꿉니다 (매입 지출·사유가 함께 남도록)' : undefined}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30 disabled:bg-gray-50 disabled:text-gray-500"
            />
            {isEdit && <p className="text-xs text-gray-500 mt-1">재고는 [입고]·조정으로 바꿉니다</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">최소 재고</label>
            <input
              type="number"
              aria-label="최소 재고"
              placeholder="5"
              value={form.minStock}
              onChange={e => set('minStock', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">단위</label>
            <input
              type="text"
              placeholder="개"
              value={form.unit}
              onChange={e => set('unit', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">메모</label>
          <input
            type="text"
            placeholder="제품 설명 (선택)"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={e => set('isActive', e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-gray-700">판매 활성</span>
        </label>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#152d6e] shadow-md disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── 제품 판매 모달 ──────────────────────────────────────────────
function SaleModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const { user: authUser } = useAuth();
  const customers = CustomerStore.getAll().filter(c => c.isActive !== false); // 익명화('탈퇴고객')·퇴점 고객은 새 판매 대상이 아니다 — 예약 폼과 같은 규칙 (11차 #M11)

  const [form, setForm] = useState({
    customerId: '',
    quantity: '1',
    unitPrice: String(product.price),
    paymentMethod: (getLastPaymentMethod() ?? '카드') as PaymentMethod, // 결제 등록과 같은 기본값 (UX 점검 2026-11-19)
    saleDate: todayISO(),
    staffName: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const qty = parseCount(form.quantity) ?? 0;      // 0·소수·문자는 0 으로 보여 합계가 거짓 1개 기준이 되지 않게 (14차 #M6)
  const unitPrice = parseAmount(form.unitPrice) ?? 0;
  const totalPrice = qty * unitPrice;

  const selectedCustomer = customers.find(c => c.id === form.customerId);

  const handleSubmit = () => {
    if (!isISODate(form.saleDate)) { notify('판매일을 선택해주세요(YYYY-MM-DD).'); return; } // 빈 판매일은 월 매출·목록에서 사라지는 유령 판매 (120~122 리뷰 #M8)
    if (!form.unitPrice || !form.quantity) {
      notify('수량과 단가를 입력해주세요.');
      return;
    }
    if (!(unitPrice > 0)) {
      notify.error('단가는 1원 이상 정수여야 합니다. 무상 제공이면 메모에 남기고 단가는 실제 가격으로 적어주세요.'); // 검증 오류는 빨간 토스트 (15차 #M7)
      return;
    }
    if (qty < 1) {
      notify.error('수량은 1 이상 정수여야 합니다.');
      return;
    }
    const fresh = ProductStore.getById(product.id) ?? product; // 모달을 열어 둔 사이 다른 판매가 있었을 수 있다 — 저장 직전 재고로 (정합성 감사 2026-11-19)
    if (fresh.stock < qty) {
      notify(`재고가 부족합니다. (현재 재고: ${fresh.stock}${product.unit})`);
      return;
    }
    setSaving(true);
    const sale = ProductSaleStore.save({
      customerId: form.customerId || undefined,
      customerName: selectedCustomer?.name || undefined,
      productId: product.id,
      productName: product.name,
      quantity: qty,
      unitPrice,
      totalPrice,
      paymentMethod: form.paymentMethod,
      saleDate: form.saleDate,
      staffName: form.staffName.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
    rememberPaymentMethod(form.paymentMethod); // 다음 판매·결제 등록의 기본값 (리뷰 60)
    recordStockMovement({ product: fresh, kind: 'sale', qty: -qty, date: form.saleDate, refId: sale.id, note: selectedCustomer?.name ? `${selectedCustomer.name} 판매` : undefined, actor: form.staffName.trim() || undefined }); // 재고 원장 (145)
    onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title="제품 판매 기록" size="md">
      <div className="space-y-4">
        {/* Product Info */}
        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div className="w-10 h-10 rounded-xl bg-[#1a3a8f] flex items-center justify-center flex-shrink-0">
            <Package size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{product.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {product.brand && <span className="text-xs text-gray-500">{product.brand}</span>}
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs font-medium text-[#1a3a8f]">정가 {formatPrice(product.price)}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className={clsx('text-xs font-medium', product.stock <= product.minStock ? 'text-red-700' : 'text-gray-600')}>
                재고 {product.stock}{product.unit}
              </span>
            </div>
          </div>
        </div>

        {/* Customer */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">고객 선택 (선택)</label>
          <CustomerCombobox customers={customers} value={form.customerId} onChange={id => set('customerId', id)} maskRole={authUser?.role ?? 'staff'} ariaLabel="고객 선택" placeholder="이름·전화번호 검색 (비우면 고객 없이 기록)" />
        </div>

        {/* Quantity & Unit Price */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">수량</label>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => set('quantity', String(Math.max(1, qty - 1)))}
                className="px-3 py-2.5 text-gray-500 hover:bg-gray-50 font-bold transition-colors"
              >-</button>
              <input
                type="number"
                aria-label="수량"
                min="1"
                value={form.quantity}
                onChange={e => set('quantity', e.target.value)}
                className="flex-1 py-2.5 text-sm text-center focus:outline-none"
              />
              <button
                onClick={() => set('quantity', String(qty + 1))}
                className="px-3 py-2.5 text-gray-500 hover:bg-gray-50 font-bold transition-colors"
              >+</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">단가 (원)</label>
            <input
              type="number"
              aria-label="단가"
              value={form.unitPrice}
              onChange={e => set('unitPrice', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            />
          </div>
        </div>

        {/* Total Price */}
        <div className="px-4 py-3 bg-gray-50 rounded-xl flex items-center justify-between">
          <span className="text-sm text-gray-600">결제 금액</span>
          <span className="text-xl font-bold text-[#1a3a8f]">{formatPrice(totalPrice)}</span>
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">결제 수단</label>
          <PaymentMethodPicker
            value={form.paymentMethod}
            onChange={m => setForm(prev => ({ ...prev, paymentMethod: m }))}
          />
        </div>

        {/* Date & Staff */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">판매일</label>
            <input
              type="date"
              aria-label="판매일" required value={form.saleDate}
              onChange={e => set('saleDate', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">담당 직원</label>
            <select
              value={form.staffName}
              onChange={e => set('staffName', e.target.value)}
              aria-label="담당 직원"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            >
              <option value="">담당 직원 없음</option>
              {StaffStore.getAll().filter(s => s.isActive).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">메모 (선택)</label>
          <input
            type="text"
            placeholder="메모"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#152d6e] shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus size={14} />
            {saving ? '저장 중...' : '판매 기록'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
