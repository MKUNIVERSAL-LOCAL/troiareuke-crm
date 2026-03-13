import { useState, useEffect } from 'react';
import { Plus, Package, Edit2, Trash2, CheckCircle, XCircle, Tag, Clock, Calendar } from 'lucide-react';
import { ProgramStore } from '../../lib/store';
import type { Program } from '../../types';

const CATEGORIES = ['피부관리', '네일', '마사지', '왁싱', '복합', '기타'];
const COLORS = ['#1a3a8f', '#7c3aed', '#dc2626', '#059669', '#d97706', '#0891b2', '#be185d'];

const COLOR_LABELS: Record<string, string> = {
  '#1a3a8f': '블루', '#7c3aed': '퍼플', '#dc2626': '레드',
  '#059669': '그린', '#d97706': '오렌지', '#0891b2': '시안', '#be185d': '핑크',
};

function formatPrice(n: number) {
  return n.toLocaleString('ko-KR') + '원';
}

interface ProgramFormData {
  name: string;
  category: string;
  totalSessions: string;
  isTimed: boolean;
  validityDays: string;
  price: string;
  costPrice: string;
  description: string;
  color: string;
  isActive: boolean;
}

const defaultForm: ProgramFormData = {
  name: '', category: '피부관리', totalSessions: '10', isTimed: false,
  validityDays: '180', price: '', costPrice: '', description: '', color: '#1a3a8f', isActive: true,
};

export default function Programs() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Program | null>(null);
  const [form, setForm] = useState<ProgramFormData>(defaultForm);
  const [filterCategory, setFilterCategory] = useState('전체');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => { loadPrograms(); }, []);

  function loadPrograms() {
    setPrograms(ProgramStore.getAll());
  }

  function openCreate() {
    setEditTarget(null);
    setForm(defaultForm);
    setShowModal(true);
  }

  function openEdit(p: Program) {
    setEditTarget(p);
    setForm({
      name: p.name,
      category: p.category,
      totalSessions: p.totalSessions?.toString() || '10',
      isTimed: p.totalSessions === null,
      validityDays: p.validityDays?.toString() || '180',
      price: p.price.toString(),
      costPrice: p.costPrice.toString(),
      description: p.description || '',
      color: p.color,
      isActive: p.isActive,
    });
    setShowModal(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Omit<Program, 'id' | 'shopId' | 'createdAt'> = {
      name: form.name,
      category: form.category,
      totalSessions: form.isTimed ? null : parseInt(form.totalSessions) || 10,
      validityDays: form.validityDays ? parseInt(form.validityDays) : null,
      price: parseInt(form.price.replace(/,/g, '')) || 0,
      costPrice: parseInt(form.costPrice.replace(/,/g, '')) || 0,
      description: form.description,
      color: form.color,
      isActive: form.isActive,
    };

    if (editTarget) {
      ProgramStore.update(editTarget.id, data);
    } else {
      ProgramStore.save(data);
    }
    setShowModal(false);
    loadPrograms();
  }

  function handleDelete(id: string) {
    ProgramStore.delete(id);
    setDeleteConfirm(null);
    loadPrograms();
  }

  const filtered = filterCategory === '전체'
    ? programs
    : programs.filter(p => p.category === filterCategory);

  const activeCount = programs.filter(p => p.isActive).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">시술 프로그램 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">회원권, 패키지, 회차권 등 프로그램을 등록하고 관리하세요</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium hover:bg-[#152f75] transition-colors shadow-md shadow-blue-200"
        >
          <Plus size={16} />
          프로그램 추가
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 mb-1">전체 프로그램</p>
          <p className="text-2xl font-bold text-gray-900">{programs.length}개</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 mb-1">활성 프로그램</p>
          <p className="text-2xl font-bold text-green-600">{activeCount}개</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 mb-1">최저가</p>
          <p className="text-2xl font-bold text-gray-900">
            {programs.length > 0 ? formatPrice(Math.min(...programs.map(p => p.price))) : '-'}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 mb-1">최고가</p>
          <p className="text-2xl font-bold text-gray-900">
            {programs.length > 0 ? formatPrice(Math.max(...programs.map(p => p.price))) : '-'}
          </p>
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['전체', ...CATEGORIES].map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterCategory === cat
                ? 'bg-[#1a3a8f] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {cat}
            {cat !== '전체' && (
              <span className="ml-1 text-xs opacity-70">
                ({programs.filter(p => p.category === cat).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 프로그램 목록 */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Package size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">등록된 프로그램이 없어요</p>
          <p className="text-sm text-gray-300 mt-1">상단 버튼을 클릭해 첫 번째 프로그램을 추가하세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(program => {
            const margin = program.price > 0
              ? Math.round(((program.price - program.costPrice) / program.price) * 100)
              : 0;
            return (
              <div
                key={program.id}
                className={`bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow ${!program.isActive ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: program.color }} />
                    <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {program.category}
                    </span>
                    {!program.isActive && (
                      <span className="text-xs text-red-400 bg-red-50 px-2 py-0.5 rounded-full">비활성</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(program)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => setDeleteConfirm(program.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-gray-900 text-base mb-1">{program.name}</h3>
                {program.description && (
                  <p className="text-xs text-gray-400 mb-3 line-clamp-2">{program.description}</p>
                )}

                <div className="flex items-center gap-3 mb-3">
                  {program.totalSessions !== null ? (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Tag size={12} />
                      <span>{program.totalSessions}회권</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock size={12} />
                      <span>기간제</span>
                    </div>
                  )}
                  {program.validityDays && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar size={12} />
                      <span>{program.validityDays}일 유효</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-50 pt-3 flex items-end justify-between">
                  <div>
                    <p className="text-xl font-bold text-gray-900">{formatPrice(program.price)}</p>
                    {program.totalSessions && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        회당 {formatPrice(Math.round(program.price / program.totalSessions))}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">마진율</p>
                    <p className={`text-sm font-bold ${margin >= 50 ? 'text-green-500' : margin >= 30 ? 'text-yellow-500' : 'text-red-400'}`}>
                      {margin}%
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 삭제 확인 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-900 mb-2">프로그램 삭제</h3>
            <p className="text-sm text-gray-500 mb-5">
              이 프로그램을 삭제하면 복구할 수 없습니다. 고객에게 등록된 기존 회권에는 영향이 없습니다.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 프로그램 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg my-4">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editTarget ? '프로그램 수정' : '프로그램 추가'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* 프로그램명 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">프로그램명 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="예: 기본 피부관리 10회권"
                  required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 카테고리 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setForm(f => ({ ...f, category: cat }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        form.category === cat
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 회차 / 기간제 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">프로그램 유형</label>
                <div className="flex gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, isTimed: false }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      !form.isTimed ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    회차권 (N회)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, isTimed: true }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      form.isTimed ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    기간제 (무제한)
                  </button>
                </div>
                {!form.isTimed && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={form.totalSessions}
                      onChange={e => setForm(f => ({ ...f, totalSessions: e.target.value }))}
                      min="1"
                      max="100"
                      className="w-24 px-3 py-2 border border-gray-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-500">회</span>
                  </div>
                )}
              </div>

              {/* 유효기간 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">유효기간 (일)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={form.validityDays}
                    onChange={e => setForm(f => ({ ...f, validityDays: e.target.value }))}
                    placeholder="180"
                    min="1"
                    className="w-32 px-3 py-2 border border-gray-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-400">일 (비워두면 무제한)</span>
                </div>
                <div className="flex gap-2 mt-2">
                  {[90, 180, 365].map(d => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => setForm(f => ({ ...f, validityDays: d.toString() }))}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                    >
                      {d}일
                    </button>
                  ))}
                </div>
              </div>

              {/* 가격 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">판매가 *</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={form.price}
                      onChange={e => setForm(f => ({ ...f, price: e.target.value.replace(/[^0-9]/g, '') }))}
                      placeholder="0"
                      required
                      className="w-full pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-gray-400">원</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">원가 (선택)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={form.costPrice}
                      onChange={e => setForm(f => ({ ...f, costPrice: e.target.value.replace(/[^0-9]/g, '') }))}
                      placeholder="0"
                      className="w-full pl-3 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-gray-400">원</span>
                  </div>
                </div>
              </div>

              {/* 마진 미리보기 */}
              {form.price && form.costPrice && (
                <div className="bg-gray-50 rounded-xl p-3 text-sm flex items-center justify-between">
                  <span className="text-gray-500">예상 마진</span>
                  <span className="font-bold text-green-600">
                    {formatPrice(parseInt(form.price) - parseInt(form.costPrice))}
                    {' '}({Math.round(((parseInt(form.price) - parseInt(form.costPrice)) / parseInt(form.price)) * 100)}%)
                  </span>
                </div>
              )}

              {/* 설명 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">설명 (선택)</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="프로그램에 대한 간단한 설명을 입력하세요"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* 색상 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">캘린더 색상</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(color => (
                    <button
                      type="button"
                      key={color}
                      onClick={() => setForm(f => ({ ...f, color }))}
                      title={COLOR_LABELS[color]}
                      className={`w-8 h-8 rounded-lg transition-transform hover:scale-110 ${form.color === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* 활성 여부 */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">프로그램 활성화 (고객에게 판매 가능)</label>
              </div>

              {/* 버튼 */}
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-[#1a3a8f] text-white rounded-xl text-sm font-medium hover:bg-[#152f75] flex items-center justify-center gap-2"
                >
                  <CheckCircle size={14} />
                  {editTarget ? '수정 완료' : '프로그램 추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
