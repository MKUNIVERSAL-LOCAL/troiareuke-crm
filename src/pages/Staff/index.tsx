import { useState } from 'react';
import { Phone, Mail, Plus } from 'lucide-react';
import Header from '../../components/layout/Header';
import Modal from '../../components/ui/Modal';
import { mockStaff, mockReservations, mockTreatments } from '../../data/mockData';
import type { Staff } from '../../types';

export default function StaffPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selected, setSelected] = useState<Staff | null>(null);

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="직원 관리"
        subtitle={`총 ${mockStaff.length}명`}
        action={{ label: '직원 추가', onClick: () => setShowAddModal(true) }}
      />

      <div className="p-8 flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {mockStaff.map(staff => {
            const staffReservations = mockReservations.filter(r => r.staffId === staff.id);
            const todayReservations = staffReservations.filter(r => r.date === '2026-03-06');
            const monthlyRevenue = mockTreatments.filter(t => t.staffId === staff.id && t.date.startsWith('2026-03')).reduce((s, t) => s + t.totalAmount, 0);

            return (
              <div
                key={staff.id}
                onClick={() => setSelected(staff)}
                className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md cursor-pointer transition-all hover:-translate-y-0.5"
              >
                <div className="text-center mb-5">
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center text-white text-2xl font-bold shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${staff.color}, ${staff.color}cc)` }}
                  >
                    {staff.name[0]}
                  </div>
                  <h3 className="text-base font-bold text-gray-900">{staff.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{staff.role}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <p className="text-base font-bold text-gray-800">{todayReservations.length}</p>
                    <p className="text-[10px] text-gray-400">오늘 예약</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <p className="text-base font-bold text-gray-800">{(monthlyRevenue / 10000).toFixed(0)}만</p>
                    <p className="text-[10px] text-gray-400">이번달 매출</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {staff.specialty.map(s => (
                    <span key={s} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[11px] font-medium">{s}</span>
                  ))}
                </div>

                <div className="space-y-1.5 text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <Phone size={11} className="text-gray-400" />
                    {staff.phone}
                  </div>
                  {staff.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={11} className="text-gray-400" />
                      {staff.email}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add Staff Card */}
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-white rounded-2xl p-5 border-2 border-dashed border-gray-200 hover:border-purple-300 transition-colors flex flex-col items-center justify-center gap-3 text-gray-400 hover:text-purple-400 min-h-[280px]"
          >
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <Plus size={20} />
            </div>
            <span className="text-sm font-medium">직원 추가</span>
          </button>
        </div>

        {/* Staff Schedule Overview */}
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">오늘 직원별 예약 현황</h3>
          </div>
          <div className="p-6 space-y-4">
            {mockStaff.map(staff => {
              const todayRes = mockReservations.filter(r => r.staffId === staff.id && r.date === '2026-03-06');
              return (
                <div key={staff.id} className="flex items-center gap-4">
                  <div className="flex items-center gap-2 w-28 flex-shrink-0">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: staff.color }}></span>
                    <span className="text-sm font-medium text-gray-700">{staff.name}</span>
                  </div>
                  <div className="flex-1 flex gap-2 flex-wrap">
                    {todayRes.length === 0 ? (
                      <span className="text-xs text-gray-300">예약 없음</span>
                    ) : (
                      todayRes.map(r => (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                          style={{ backgroundColor: staff.color }}
                        >
                          <span>{r.startTime}</span>
                          <span>{r.customerName}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showAddModal && <AddStaffModal onClose={() => setShowAddModal(false)} />}
      {selected && <StaffDetailModal staff={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AddStaffModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal isOpen={true} onClose={onClose} title="직원 추가" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">이름 *</label>
            <input type="text" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300" placeholder="이름 입력" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">역할 *</label>
            <select className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300">
              <option value="원장">원장</option>
              <option value="피부관리사">피부관리사</option>
              <option value="네일아티스트">네일아티스트</option>
              <option value="스타일리스트">스타일리스트</option>
              <option value="매니저">매니저</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">전화번호 *</label>
          <input type="tel" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300" placeholder="010-0000-0000" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">이메일</label>
          <input type="email" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">입사일</label>
          <input type="date" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">취소</button>
          <button className="flex-1 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-md">저장</button>
        </div>
      </div>
    </Modal>
  );
}

function StaffDetailModal({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const staffReservations = mockReservations.filter(r => r.staffId === staff.id);
  const monthRevenue = mockTreatments.filter(t => t.staffId === staff.id && t.date.startsWith('2026-03')).reduce((s, t) => s + t.totalAmount, 0);

  return (
    <Modal isOpen={true} onClose={onClose} title="직원 상세" size="md">
      <div className="space-y-4">
        <div className="text-center">
          <div
            className="w-20 h-20 rounded-2xl mx-auto mb-3 flex items-center justify-center text-white text-3xl font-bold shadow-xl"
            style={{ background: `linear-gradient(135deg, ${staff.color}, ${staff.color}cc)` }}
          >
            {staff.name[0]}
          </div>
          <h3 className="text-lg font-bold text-gray-900">{staff.name}</h3>
          <p className="text-sm text-gray-400">{staff.role}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-purple-700">{staffReservations.length}</p>
            <p className="text-[11px] text-purple-400 mt-0.5">총 예약</p>
          </div>
          <div className="bg-pink-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-pink-700">{(monthRevenue / 10000).toFixed(0)}만</p>
            <p className="text-[11px] text-pink-400 mt-0.5">이번달 매출</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-blue-700">{staff.hireDate.split('-')[0]}</p>
            <p className="text-[11px] text-blue-400 mt-0.5">입사년도</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">전문 분야</p>
          <div className="flex flex-wrap gap-2">
            {staff.specialty.map(s => (
              <span key={s} className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-medium">{s}</span>
            ))}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-600"><Phone size={14} /> {staff.phone}</div>
          {staff.email && <div className="flex items-center gap-2 text-gray-600"><Mail size={14} /> {staff.email}</div>}
        </div>
      </div>
    </Modal>
  );
}
