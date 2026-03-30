import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Megaphone, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'update' | 'event';
  is_active: boolean;
  created_at: string;
}

const typeOptions = [
  { value: 'info', label: '일반 공지', color: 'bg-blue-500/10 text-blue-400', badge: 'bg-blue-500' },
  { value: 'update', label: '업데이트', color: 'bg-emerald-500/10 text-emerald-400', badge: 'bg-emerald-500' },
  { value: 'warning', label: '주의사항', color: 'bg-amber-500/10 text-amber-400', badge: 'bg-amber-500' },
  { value: 'event', label: '이벤트', color: 'bg-purple-500/10 text-purple-400', badge: 'bg-purple-500' },
];

const emptyForm = { title: '', content: '', type: 'info', is_active: true };

export default function Announcements() {
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    setList(data || []);
    setLoading(false);
  }

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(a: Announcement) {
    setEditTarget(a);
    setForm({ title: a.title, content: a.content, type: a.type, is_active: a.is_active });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    if (editTarget) {
      await supabase.from('announcements').update(form).eq('id', editTarget.id);
    } else {
      await supabase.from('announcements').insert(form);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from('announcements').delete().eq('id', id);
    load();
  }

  async function handleToggle(a: Announcement) {
    await supabase.from('announcements').update({ is_active: !a.is_active }).eq('id', a.id);
    load();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">공지사항 관리</h1>
          <p className="text-slate-400 text-sm mt-1">전체 샵에 공지 및 업데이트 내용을 발송하세요</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus size={16} />
          공지 작성
        </button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl px-5 py-4">
          <p className="text-2xl font-bold text-white">{list.length}</p>
          <p className="text-xs text-slate-400 mt-1">전체 공지</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl px-5 py-4">
          <p className="text-2xl font-bold text-emerald-400">{list.filter(a => a.is_active).length}</p>
          <p className="text-xs text-slate-400 mt-1">게시 중</p>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl px-5 py-4">
          <p className="text-2xl font-bold text-slate-500">{list.filter(a => !a.is_active).length}</p>
          <p className="text-xs text-slate-400 mt-1">숨김</p>
        </div>
      </div>

      {/* 목록 */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-16 text-center">
            <Megaphone size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">등록된 공지사항이 없습니다</p>
            <p className="text-slate-600 text-sm mt-1">"공지 작성" 버튼으로 첫 공지를 작성하세요</p>
          </div>
        ) : (
          list.map(a => {
            const type = typeOptions.find(t => t.value === a.type) || typeOptions[0];
            return (
              <div key={a.id} className={`bg-slate-900 border rounded-2xl p-5 transition-all ${a.is_active ? 'border-slate-700/50' : 'border-slate-800/30 opacity-50'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${type.color}`}>
                        {type.label}
                      </span>
                      {a.is_active ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                          <CheckCircle size={11} /> 게시 중
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-slate-500">
                          <XCircle size={11} /> 숨김
                        </span>
                      )}
                      <span className="text-[11px] text-slate-600 ml-auto">
                        {format(parseISO(a.created_at), 'yyyy.MM.dd HH:mm', { locale: ko })}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">{a.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{a.content}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(a)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                        a.is_active
                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                    >
                      {a.is_active ? '숨기기' : '게시하기'}
                    </button>
                    <button
                      onClick={() => openEdit(a)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 작성/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-700">
              <h2 className="text-base font-bold text-white">{editTarget ? '공지 수정' : '새 공지 작성'}</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">공지 유형</label>
                <div className="flex gap-2 flex-wrap">
                  {typeOptions.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setForm(f => ({ ...f, type: t.value }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        form.type === t.value ? t.color + ' border border-current' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">제목 *</label>
                <input
                  className="admin-input"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="공지 제목을 입력하세요"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">내용 *</label>
                <textarea
                  className="admin-input resize-none"
                  rows={5}
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="공지 내용을 입력하세요"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                  <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
                <span className="text-xs text-slate-400">즉시 게시</span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">취소</button>
              <button onClick={handleSave} disabled={saving || !form.title || !form.content} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                {saving ? '저장 중...' : '저장하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .admin-input { width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem; background: #0f172a; border: 1px solid #334155; border-radius: 0.75rem; color: #e2e8f0; outline: none; }
        .admin-input:focus { border-color: #3b82f6; }
      `}</style>
    </div>
  );
}
