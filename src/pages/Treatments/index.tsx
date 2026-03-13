import { useState } from 'react';
import { Search, ClipboardList, Camera, ChevronRight } from 'lucide-react';
import Header from '../../components/layout/Header';
import Modal from '../../components/ui/Modal';
import { mockTreatments, mockCustomers, mockStaff, mockServices } from '../../data/mockData';
import type { TreatmentRecord } from '../../types';
import clsx from 'clsx';

const paymentColors: Record<string, string> = {
  '카드': 'bg-blue-100 text-blue-700',
  '현금': 'bg-green-100 text-green-700',
  '계좌이체': 'bg-orange-100 text-orange-700',
  '혼합': 'bg-purple-100 text-purple-700',
};

export default function Treatments() {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selected, setSelected] = useState<TreatmentRecord | null>(null);

  const filtered = mockTreatments.filter(t =>
    t.customerName.includes(search) || t.staffName.includes(search) || t.services.some(s => s.serviceName.includes(search))
  );

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="시술 기록"
        subtitle="고객 시술 이력 관리"
        action={{ label: '시술 기록 추가', onClick: () => setShowAddModal(true) }}
      />

      <div className="p-8 flex-1">
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="고객명, 시술명, 직원명 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-700">총 {filtered.length}건</p>
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full flex items-start gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm font-bold">{t.customerName[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-bold text-gray-900">{t.customerName}</p>
                    <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium', paymentColors[t.paymentMethod])}>
                      {t.paymentMethod}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{t.services.map(s => s.serviceName).join(', ')}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{t.date} · {t.staffName}</p>
                  {t.skinCondition && (
                    <p className="text-[11px] text-purple-600 mt-1">피부상태: {t.skinCondition}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900">{t.totalAmount.toLocaleString()}원</p>
                  {t.usedPoints > 0 && <p className="text-[11px] text-orange-500">-{t.usedPoints.toLocaleString()}P 사용</p>}
                  <p className="text-[11px] text-green-500">+{t.earnedPoints.toLocaleString()}P 적립</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 mt-1 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {showAddModal && <AddTreatmentModal onClose={() => setShowAddModal(false)} />}
      {selected && <TreatmentDetailModal treatment={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AddTreatmentModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal isOpen={true} onClose={onClose} title="시술 기록 추가" size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">고객 *</label>
            <select className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300">
              <option value="">고객 선택</option>
              {mockCustomers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">담당 직원 *</label>
            <select className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300">
              <option value="">직원 선택</option>
              {mockStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">시술 항목</label>
          <div className="space-y-2">
            {mockServices.slice(0, 4).map(s => (
              <label key={s.id} className="flex items-center gap-3 p-2.5 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" className="rounded text-purple-500" />
                <span className="text-sm text-gray-700 flex-1">{s.name}</span>
                <span className="text-sm font-medium text-gray-800">{s.price.toLocaleString()}원</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">결제 수단</label>
            <select className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300">
              <option value="카드">카드</option>
              <option value="현금">현금</option>
              <option value="계좌이체">계좌이체</option>
              <option value="혼합">혼합</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">포인트 사용</label>
            <input type="number" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300" placeholder="0" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">피부 상태</label>
          <input type="text" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300" placeholder="예: 건조함, 트러블, 모공 확장 등" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">다음 방문 권장일</label>
          <input type="date" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">메모</label>
          <textarea rows={3} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none" placeholder="시술 특이사항, 다음 방문 시 주의사항 등" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">시술 전후 사진</label>
          <button className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 flex flex-col items-center gap-2 text-gray-400 hover:border-purple-300 hover:text-purple-400 transition-colors">
            <Camera size={24} />
            <span className="text-sm">사진 추가</span>
          </button>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">취소</button>
          <button className="flex-1 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-md">저장</button>
        </div>
      </div>
    </Modal>
  );
}

function TreatmentDetailModal({ treatment: t, onClose }: { treatment: TreatmentRecord; onClose: () => void }) {
  return (
    <Modal isOpen={true} onClose={onClose} title="시술 기록 상세" size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
            <span className="text-white text-lg font-bold">{t.customerName[0]}</span>
          </div>
          <div>
            <p className="font-bold text-gray-900 text-base">{t.customerName}</p>
            <p className="text-xs text-gray-400">{t.date} · {t.staffName}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">시술 내역</p>
          {t.services.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700">{s.serviceName}</span>
              <span className="text-sm font-semibold text-gray-800">{s.price.toLocaleString()}원</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2 mt-1 bg-purple-50 rounded-xl px-3">
            <span className="text-sm font-bold text-gray-800">합계</span>
            <span className="text-sm font-bold text-purple-600">{t.totalAmount.toLocaleString()}원</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-400 mb-0.5">결제 수단</p>
            <p className="text-sm font-semibold text-gray-800">{t.paymentMethod}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-400 mb-0.5">포인트</p>
            <p className="text-sm font-semibold text-gray-800">사용 {t.usedPoints.toLocaleString()}P · 적립 {t.earnedPoints.toLocaleString()}P</p>
          </div>
        </div>

        {t.skinCondition && (
          <div className="bg-purple-50 rounded-xl p-3">
            <p className="text-[11px] text-purple-500 font-medium mb-0.5">피부 상태</p>
            <p className="text-sm text-purple-700">{t.skinCondition}</p>
          </div>
        )}

        {t.memo && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">메모</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{t.memo}</p>
          </div>
        )}

        {t.nextVisitRecommended && (
          <div className="flex items-center gap-2 bg-green-50 rounded-xl p-3">
            <ClipboardList size={14} className="text-green-600" />
            <p className="text-sm text-green-700">다음 방문 권장: <strong>{t.nextVisitRecommended}</strong></p>
          </div>
        )}
      </div>
    </Modal>
  );
}
