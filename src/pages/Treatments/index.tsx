import { useState, useEffect, useRef } from 'react';
import { Search, ClipboardList, Camera, ChevronRight, Trash2, Pencil, X, Loader2 } from 'lucide-react';
import Header from '../../components/layout/Header';
import Modal from '../../components/ui/Modal';
import { TreatmentLogStore, CustomerStore, StaffStore, ServiceStore, CustomerProgramStore } from '../../lib/store';
import type { TreatmentLog } from '../../types';
import clsx from 'clsx';
import { maskPhone } from '../../lib/masking';
import { useAuth } from '../../contexts/AuthContext';
import { getPhotos, setPhotos as savePhotos, clearPhotos, resizeImageFile, makePhotoId, syncPhotosFromNas, type PhotoEntry } from '../../lib/photoStore';

export default function Treatments() {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<TreatmentLog | null>(null);
  const [selected, setSelected] = useState<TreatmentLog | null>(null);
  const [treatmentLogs, setTreatmentLogs] = useState<TreatmentLog[]>([]);

  const loadLogs = () => {
    setTreatmentLogs(TreatmentLogStore.getAll());
  };

  useEffect(() => {
    loadLogs();
    // 다른 기기에서 올린 사진을 NAS에서 내려받아 반영
    const keys = TreatmentLogStore.getAll().map(t => `treatment:${t.id}`);
    syncPhotosFromNas(keys).then(changed => {
      if (changed) setTreatmentLogs([...TreatmentLogStore.getAll()]);
    });
  }, []);

  const filtered = treatmentLogs.filter(t =>
    t.customerName.includes(search) ||
    (t.staffName && t.staffName.includes(search)) ||
    (t.treatmentDetails && t.treatmentDetails.includes(search)) ||
    (t.programName && t.programName.includes(search))
  ).sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate)); // 최신 시술 먼저

  const handleDelete = (id: string) => {
    TreatmentLogStore.delete(id);
    clearPhotos(`treatment:${id}`); // 연결된 사진도 정리
    setSelected(null);
    loadLogs();
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="시술 기록"
        subtitle="고객 시술 이력 관리"
        action={{ label: '시술 기록 추가', onClick: () => setShowAddModal(true) }}
      />

      {/* ── 모바일 뷰 (< lg) ── 타임라인 카드 */}
      <div className="block lg:hidden flex-1 flex flex-col">
        {/* 검색바 */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 shadow-sm">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="고객명, 시술명, 직원명 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ClipboardList size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">시술 기록이 없습니다</p>
              <p className="text-xs text-slate-400 mt-1">PC에서 시술 기록을 추가하세요</p>
            </div>
          ) : (
            filtered.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">{t.customerName[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{t.customerName}</p>
                      {t.programName && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          {t.programName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {t.treatmentDetails || t.programName || '시술 내역 없음'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.treatmentDate}{t.treatmentTime ? ` ${t.treatmentTime}` : ''} · {t.staffName || '담당자 미지정'}
                    </p>
                    {t.skinCondition && (
                      <p className="text-xs text-purple-600 mt-1">피부상태: {t.skinCondition}</p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── 데스크톱 뷰 (lg+) ── 기존 테이블 그대로 */}
      <div className="hidden lg:block p-8 flex-1">
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
            {filtered.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-gray-400">
                시술 기록이 없습니다. 새 기록을 추가해 주세요.
              </div>
            )}
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
                    {t.programName && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-100 text-purple-700">
                        {t.programName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t.treatmentDetails || t.programName || '시술 내역 없음'}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {t.treatmentDate}{t.treatmentTime ? ` ${t.treatmentTime}` : ''} · {t.staffName || '담당자 미지정'}
                  </p>
                  {t.skinCondition && (
                    <p className="text-[11px] text-purple-600 mt-1">피부상태: {t.skinCondition}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-gray-600">{t.sessionsUsed}회차</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 mt-1 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddTreatmentModal
          onClose={() => setShowAddModal(false)}
          onSave={() => {
            setShowAddModal(false);
            loadLogs();
          }}
        />
      )}
      {editing && (
        <AddTreatmentModal
          treatment={editing}
          onClose={() => setEditing(null)}
          onSave={() => {
            setEditing(null);
            loadLogs();
          }}
        />
      )}
      {selected && (
        <TreatmentDetailModal
          treatment={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onEdit={() => { setEditing(selected); setSelected(null); }}
        />
      )}
    </div>
  );
}

function AddTreatmentModal({ treatment: editing, onClose, onSave }: { treatment?: TreatmentLog | null; onClose: () => void; onSave: () => void }) {
  const { user: authUser } = useAuth();
  const isEdit = !!editing;
  const customers = CustomerStore.getAll();
  const staff = StaffStore.getAll();
  const services = ServiceStore.getAll();

  const [customerId, setCustomerId] = useState(editing?.customerId ?? '');
  const [customerProgramId, setCustomerProgramId] = useState(editing?.customerProgramId ?? '');
  const [staffName, setStaffName] = useState(editing?.staffName ?? '');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [treatmentDetails, setTreatmentDetails] = useState(editing?.treatmentDetails ?? '');
  const [skinCondition, setSkinCondition] = useState(editing?.skinCondition ?? '');
  const [staffNotes, setStaffNotes] = useState(editing?.staffNotes ?? '');
  const [nextAppointment, setNextAppointment] = useState(editing?.nextAppointment ?? '');

  // 사진 (시술 전/후) — 로컬 photoStore에 별도 저장
  const [photos, setPhotoList] = useState<PhotoEntry[]>(() => (editing ? getPhotos(`treatment:${editing.id}`) : []));
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get active programs for the selected customer
  const activePrograms = customerId ? CustomerProgramStore.getActive(customerId) : [];

  const toggleService = (name: string) => {
    setSelectedServices(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  };

  const handlePickPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const added: PhotoEntry[] = [];
      for (const file of files) {
        try {
          const dataUrl = await resizeImageFile(file);
          added.push({ id: makePhotoId(), dataUrl, takenAt: new Date().toISOString() });
        } catch {
          // 개별 파일 실패는 건너뜀
        }
      }
      setPhotoList(prev => [...prev, ...added]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhotoLocal = (id: string) => setPhotoList(prev => prev.filter(p => p.id !== id));

  const handleSave = () => {
    if (!customerId) return;

    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    const details = treatmentDetails || selectedServices.join(', ') || undefined;
    const linkedProgram = customerProgramId ? activePrograms.find(cp => cp.id === customerProgramId) : undefined;

    if (isEdit && editing) {
      TreatmentLogStore.update(editing.id, {
        customerId,
        customerName: customer.name,
        customerProgramId: customerProgramId || undefined,
        programName: linkedProgram?.programName || editing.programName || undefined,
        staffName: staffName || undefined,
        treatmentDetails: details,
        skinCondition: skinCondition || undefined,
        staffNotes: staffNotes || undefined,
        nextAppointment: nextAppointment || undefined,
      });
      try { savePhotos(`treatment:${editing.id}`, photos); } catch { alert('사진 저장 용량을 초과했습니다. 일부 사진을 줄여주세요.'); }
    } else {
      const saved = TreatmentLogStore.save({
        customerId,
        customerName: customer.name,
        customerProgramId: customerProgramId || undefined,
        programName: linkedProgram?.programName || undefined,
        staffName: staffName || undefined,
        treatmentDate: new Date().toISOString().slice(0, 10),
        treatmentTime: new Date().toTimeString().slice(0, 5),
        sessionsUsed: 1,
        treatmentDetails: details,
        skinCondition: skinCondition || undefined,
        staffNotes: staffNotes || undefined,
        nextAppointment: nextAppointment || undefined,
      });
      if (saved && photos.length > 0) {
        try { savePhotos(`treatment:${saved.id}`, photos); } catch { alert('사진 저장 용량을 초과했습니다. 일부 사진을 줄여주세요.'); }
      }
    }

    onSave();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={isEdit ? '시술 기록 수정' : '시술 기록 추가'} size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">고객 *</label>
            <select
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">고객 선택</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({maskPhone(c.phone, authUser?.role ?? 'staff')})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">담당 직원</label>
            <select
              value={staffName}
              onChange={e => setStaffName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">직원 선택</option>
              {staff.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 프로그램 연결 (회차 차감) */}
        {customerId && activePrograms.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">프로그램 연결 (회차 차감)</label>
            <select
              value={customerProgramId}
              onChange={e => setCustomerProgramId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">프로그램 미연결 (단건 시술)</option>
              {activePrograms.map(cp => (
                <option key={cp.id} value={cp.id}>
                  {cp.programName} ({cp.usedSessions}/{cp.totalSessions ?? '무제한'}회)
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">시술 항목</label>
          <div className="space-y-2">
            {services.map(s => (
              <label key={s.id} className="flex items-center gap-3 p-2.5 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedServices.includes(s.name)}
                  onChange={() => toggleService(s.name)}
                  className="rounded text-purple-500"
                />
                <span className="text-sm text-gray-700 flex-1">{s.name}</span>
                <span className="text-sm font-medium text-gray-800">{s.price.toLocaleString()}원</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">시술 상세 내용</label>
          <textarea
            rows={2}
            value={treatmentDetails}
            onChange={e => setTreatmentDetails(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
            placeholder="시술 내용을 상세히 기록하세요 (비워두면 선택한 시술 항목으로 자동 기록)"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">피부 상태</label>
          <input
            type="text"
            value={skinCondition}
            onChange={e => setSkinCondition(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
            placeholder="예: 건조함, 트러블, 모공 확장 등"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">다음 방문 권장일</label>
          <input
            type="date"
            value={nextAppointment}
            onChange={e => setNextAppointment(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">메모</label>
          <textarea
            rows={3}
            value={staffNotes}
            onChange={e => setStaffNotes(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
            placeholder="시술 특이사항, 다음 방문 시 주의사항 등"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">시술 전후 사진</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePickPhotos}
            className="hidden"
          />
          {photos.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-2">
              {photos.map(p => (
                <div key={p.id} className="relative group aspect-square">
                  <img src={p.dataUrl} alt="시술 사진" className="w-full h-full object-cover rounded-xl border border-gray-100" />
                  <button
                    type="button"
                    onClick={() => removePhotoLocal(p.id)}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    aria-label="사진 삭제"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 flex flex-col items-center gap-2 text-gray-400 hover:border-purple-300 hover:text-purple-400 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={24} className="animate-spin" /> : <Camera size={24} />}
            <span className="text-sm">{uploading ? '사진 처리 중...' : '사진 추가 (여러 장 가능)'}</span>
          </button>
          <p className="text-[11px] text-gray-400 mt-1">사진은 기기에 저장됩니다. (클라우드 동기화는 NAS 서버 연동 후 지원)</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">취소</button>
          <button
            onClick={handleSave}
            disabled={!customerId}
            className={clsx(
              'flex-1 py-2.5 text-sm font-medium text-white rounded-xl transition-all shadow-md',
              customerId
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                : 'bg-gray-300 cursor-not-allowed'
            )}
          >
            저장
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TreatmentDetailModal({
  treatment: t,
  onClose,
  onDelete,
  onEdit,
}: {
  treatment: TreatmentLog;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const photos = getPhotos(`treatment:${t.id}`);

  return (
    <Modal isOpen={true} onClose={onClose} title="시술 기록 상세" size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
            <span className="text-white text-lg font-bold">{t.customerName[0]}</span>
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-base">{t.customerName}</p>
            <p className="text-xs text-gray-400">
              {t.treatmentDate}{t.treatmentTime ? ` ${t.treatmentTime}` : ''} · {t.staffName || '담당자 미지정'}
            </p>
          </div>
        </div>

        {(t.treatmentDetails || t.programName) && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">시술 내역</p>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-sm text-gray-700">{t.treatmentDetails || t.programName}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-400 mb-0.5">사용 회차</p>
            <p className="text-sm font-semibold text-gray-800">{t.sessionsUsed}회</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-400 mb-0.5">시술일</p>
            <p className="text-sm font-semibold text-gray-800">{t.treatmentDate}</p>
          </div>
        </div>

        {t.skinCondition && (
          <div className="bg-purple-50 rounded-xl p-3">
            <p className="text-[11px] text-purple-500 font-medium mb-0.5">피부 상태</p>
            <p className="text-sm text-purple-700">{t.skinCondition}</p>
          </div>
        )}

        {t.staffNotes && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">메모</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{t.staffNotes}</p>
          </div>
        )}

        {t.nextAppointment && (
          <div className="flex items-center gap-2 bg-green-50 rounded-xl p-3">
            <ClipboardList size={14} className="text-green-600" />
            <p className="text-sm text-green-700">다음 방문 권장: <strong>{t.nextAppointment}</strong></p>
          </div>
        )}

        {photos.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">시술 전후 사진 ({photos.length})</p>
            <div className="grid grid-cols-4 gap-2">
              {photos.map(p => (
                <a key={p.id} href={p.dataUrl} target="_blank" rel="noreferrer" className="aspect-square">
                  <img src={p.dataUrl} alt="시술 사진" className="w-full h-full object-cover rounded-xl border border-gray-100 hover:opacity-90 transition" />
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
            >
              <Trash2 size={14} />
              삭제
            </button>
          ) : (
            <button
              onClick={() => onDelete(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors"
            >
              <Trash2 size={14} />
              정말 삭제
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all"
          >
            <Pencil size={14} />
            수정
          </button>
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">닫기</button>
        </div>
      </div>
    </Modal>
  );
}
