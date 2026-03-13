import { useState, useCallback } from 'react';
import { Search, AlertTriangle, Package, ShoppingCart, Plus, TrendingUp } from 'lucide-react';
import Header from '../../components/layout/Header';
import Modal from '../../components/ui/Modal';
import { ProductStore, ProductSaleStore, CustomerStore } from '../../lib/store';
import type { Product } from '../../types';
import type { PaymentMethod } from '../../types';
import clsx from 'clsx';

const CATEGORIES = ['전체', '세럼', '크림', '스킨', '선케어', '앰플', '클렌저', '오일', '기타'];
const PAYMENT_METHODS: PaymentMethod[] = ['카드', '현금', '계좌이체', '카카오페이'];

type Tab = 'inventory' | 'sales';

// ─── 메인 컴포넌트 ──────────────────────────────────────────────
export default function Products() {
  const [tab, setTab] = useState<Tab>('inventory');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('전체');
  const [products, setProducts] = useState(() => ProductStore.getAll());
  const [sales, setSales] = useState(() => ProductSaleStore.getAll());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [saleProduct, setSaleProduct] = useState<Product | null>(null);

  const refresh = useCallback(() => {
    setProducts(ProductStore.getAll());
    setSales(ProductSaleStore.getAll());
  }, []);

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
      || (p.brand || '').toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === '전체' || p.category === category;
    return matchSearch && matchCategory;
  });

  const lowStockCount = products.filter(p => p.stock <= p.minStock).length;

  const recentSales = [...sales]
    .sort((a, b) => b.saleDate.localeCompare(a.saleDate))
    .slice(0, 60);

  const totalSalesRevenue = sales.reduce((s, sale) => s + sale.totalPrice, 0);

  const handleSell = (product: Product) => {
    setSaleProduct(product);
    setShowSaleModal(true);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="제품/재고 관리"
        subtitle={`총 ${products.length}종 · 재고부족 ${lowStockCount}종`}
        action={{ label: '+ 제품 추가', onClick: () => setShowAddModal(true) }}
      />

      <div className="p-8 flex-1">
        {/* Low Stock Alert */}
        {lowStockCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl mb-6">
            <AlertTriangle size={16} className="text-orange-500 flex-shrink-0" />
            <p className="text-sm text-orange-700 font-medium">
              재고 부족 제품이 <strong>{lowStockCount}종</strong> 있습니다. 빠른 발주가 필요합니다.
            </p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">전체 제품</p>
            <p className="text-2xl font-black text-gray-900">{products.length}<span className="text-sm font-medium ml-1">종</span></p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">재고 부족</p>
            <p className={clsx('text-2xl font-black', lowStockCount > 0 ? 'text-red-500' : 'text-gray-900')}>
              {lowStockCount}<span className="text-sm font-medium ml-1">종</span>
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">총 판매건수</p>
            <p className="text-2xl font-black text-gray-900">{sales.length}<span className="text-sm font-medium ml-1">건</span></p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">홈케어 누적 매출</p>
            <p className="text-2xl font-black text-[#1a3a8f]">
              {Math.round(totalSalesRevenue / 10000)}<span className="text-sm font-medium ml-1">만원</span>
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
          <button
            onClick={() => setTab('inventory')}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded-lg transition-all',
              tab === 'inventory' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            재고 현황
          </button>
          <button
            onClick={() => setTab('sales')}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded-lg transition-all',
              tab === 'sales' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
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
                  placeholder="제품명, 브랜드 검색..."
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
                  <p className="text-sm text-gray-400">해당하는 제품이 없습니다</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
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
                        <tr key={p.id} className={clsx('hover:bg-gray-50/50 transition-colors', isLow && 'bg-orange-50/40')}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center flex-shrink-0">
                                <Package size={16} className="text-[#1a3a8f]" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                                {p.brand && <p className="text-xs text-gray-400">{p.brand}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs">{p.category}</span>
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-gray-800 text-right">
                            {p.price.toLocaleString()}원
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-400 text-right">
                            {p.cost.toLocaleString()}원
                          </td>
                          <td className="px-4 py-4 text-center">
                            <p className={clsx('text-sm font-bold', isLow ? 'text-red-500' : 'text-gray-800')}>
                              {p.stock}{p.unit}
                            </p>
                            <p className="text-[10px] text-gray-400">최소 {p.minStock}{p.unit}</p>
                          </td>
                          <td className="px-4 py-4 text-center">
                            {isLow ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-600 rounded-full text-[11px] font-medium">
                                <AlertTriangle size={10} /> 부족
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-green-100 text-green-600 rounded-full text-[11px] font-medium">정상</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className={clsx(
                              'text-sm font-bold',
                              margin >= 50 ? 'text-green-600' : margin >= 30 ? 'text-blue-600' : 'text-orange-500'
                            )}>
                              {margin}%
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => handleSell(p)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1a3a8f] text-white text-xs font-medium rounded-lg hover:bg-[#152d6e] transition-colors"
                            >
                              <ShoppingCart size={11} />
                              판매
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          /* 판매 기록 탭 */
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {recentSales.length === 0 ? (
              <div className="py-16 text-center">
                <TrendingUp size={32} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-400 mb-1">판매 기록이 없습니다</p>
                <p className="text-xs text-gray-300">제품 목록에서 "판매" 버튼을 눌러 기록하세요</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500">판매일</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500">제품명</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500">고객</th>
                    <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500">수량</th>
                    <th className="text-right px-4 py-3.5 text-xs font-semibold text-gray-500">단가</th>
                    <th className="text-right px-4 py-3.5 text-xs font-semibold text-gray-500">합계</th>
                    <th className="text-center px-6 py-3.5 text-xs font-semibold text-gray-500">결제수단</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentSales.map(sale => (
                    <tr key={sale.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5 text-sm text-gray-500">{sale.saleDate}</td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-medium text-gray-900">{sale.productName}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{sale.customerName || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-center text-gray-700 font-medium">{sale.quantity}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 text-right">{sale.unitPrice.toLocaleString()}원</td>
                      <td className="px-4 py-3.5 text-sm font-bold text-gray-900 text-right">{sale.totalPrice.toLocaleString()}원</td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs">{sale.paymentMethod}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50/50">
                    <td colSpan={5} className="px-6 py-3 text-xs font-semibold text-gray-500 text-right">합계</td>
                    <td className="px-4 py-3 text-sm font-black text-[#1a3a8f] text-right">
                      {totalSalesRevenue.toLocaleString()}원
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
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

// ─── 제품 추가 모달 ──────────────────────────────────────────────
function AddProductModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '',
    category: '세럼',
    brand: '',
    price: '',
    cost: '',
    stock: '',
    minStock: '5',
    unit: '개',
    description: '',
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = () => {
    if (!form.name.trim() || !form.price || !form.stock) {
      alert('제품명, 판매가, 재고는 필수 입력 항목입니다.');
      return;
    }
    setSaving(true);
    ProductStore.save({
      name: form.name.trim(),
      category: form.category,
      brand: form.brand.trim() || undefined,
      price: parseInt(form.price) || 0,
      cost: parseInt(form.cost) || 0,
      stock: parseInt(form.stock) || 0,
      minStock: parseInt(form.minStock) || 5,
      unit: form.unit || '개',
      description: form.description.trim() || undefined,
      isActive: form.isActive,
    });
    onSaved();
  };

  return (
    <Modal isOpen onClose={onClose} title="제품 추가" size="md">
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
              placeholder="0"
              value={form.cost}
              onChange={e => set('cost', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            />
          </div>
        </div>
        {/* Margin preview */}
        {form.price && form.cost && (
          <div className="px-3 py-2 bg-blue-50 rounded-xl text-xs text-blue-700">
            마진율: <strong>{Math.round(((parseInt(form.price) - parseInt(form.cost)) / parseInt(form.price)) * 100)}%</strong>
            {' '}· 마진액: <strong>{(parseInt(form.price) - parseInt(form.cost)).toLocaleString()}원</strong>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">재고 *</label>
            <input
              type="number"
              placeholder="0"
              value={form.stock}
              onChange={e => set('stock', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">최소 재고</label>
            <input
              type="number"
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
  const customers = CustomerStore.getAll();

  const [form, setForm] = useState({
    customerId: '',
    quantity: '1',
    unitPrice: String(product.price),
    paymentMethod: '카드' as PaymentMethod,
    saleDate: new Date().toISOString().split('T')[0],
    staffName: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const qty = Math.max(1, parseInt(form.quantity) || 1);
  const unitPrice = parseInt(form.unitPrice) || 0;
  const totalPrice = qty * unitPrice;

  const selectedCustomer = customers.find(c => c.id === form.customerId);

  const handleSubmit = () => {
    if (!form.unitPrice || !form.quantity) {
      alert('수량과 단가를 입력해주세요.');
      return;
    }
    if (product.stock < qty) {
      alert(`재고가 부족합니다. (현재 재고: ${product.stock}${product.unit})`);
      return;
    }
    setSaving(true);
    ProductSaleStore.save({
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
              <span className="text-xs font-medium text-[#1a3a8f]">정가 {product.price.toLocaleString()}원</span>
              <span className="text-xs text-gray-400">·</span>
              <span className={clsx('text-xs font-medium', product.stock <= product.minStock ? 'text-red-500' : 'text-gray-500')}>
                재고 {product.stock}{product.unit}
              </span>
            </div>
          </div>
        </div>

        {/* Customer */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">고객 선택 (선택)</label>
          <select
            value={form.customerId}
            onChange={e => set('customerId', e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
          >
            <option value="">고객 선택 안함</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
            ))}
          </select>
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
              value={form.unitPrice}
              onChange={e => set('unitPrice', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
            />
          </div>
        </div>

        {/* Total Price */}
        <div className="px-4 py-3 bg-gray-50 rounded-xl flex items-center justify-between">
          <span className="text-sm text-gray-600">결제 금액</span>
          <span className="text-xl font-black text-[#1a3a8f]">{totalPrice.toLocaleString()}원</span>
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">결제수단</label>
          <div className="flex gap-2 flex-wrap">
            {PAYMENT_METHODS.map(m => (
              <button
                key={m}
                onClick={() => setForm(prev => ({ ...prev, paymentMethod: m }))}
                className={clsx(
                  'flex-1 py-2 text-sm font-medium rounded-xl border transition-all',
                  form.paymentMethod === m
                    ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a8f]/30'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">판매일</label>
          <input
            type="date"
            value={form.saleDate}
            onChange={e => set('saleDate', e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30"
          />
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
