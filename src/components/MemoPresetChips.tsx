import { useState } from 'react';
import { notify } from '../lib/notify';
import { memoPresets, saveMemoPreset, deleteMemoPreset } from '../lib/memoPresets';
import { appendPreset, removePresetLine, presetInMemo, toggleOneLine, oneLineHas, MAX_PRESET_LEN } from '../lib/memoPresetRule';
import { useDataRefreshed } from '../hooks/useDataRefreshed';

/**
 * 자주 쓰는 메모 문구 칩 (251 → 255 공용화) — 시술 기록뿐 아니라 **상담 소견·예약 메모·빠른 메모**에서도 쓴다.
 * 251 에서는 시술 기록 창에만 있어, 매장 공용 문구라고 안내하면서 한 창에서만 쓸 수 있는 혼란이 있었다(254 리뷰 L-5).
 *
 * - 칩을 누르면 한 줄 추가, 이미 있으면 그 줄을 뺀다(실제 토글 — 254 리뷰 M-4).
 * - 문구가 없으면 칩 줄도 없다(장식 UI 금지). 관리 패널은 manage 를 켠 곳에서만 보여 준다.
 * - 한 줄 입력칸(빠른 메모)에서는 줄바꿈 대신 공백으로 잇는다 — oneLine.
 */
export default function MemoPresetChips({ value, onChange, manage = false, oneLine = false, label = '자주 쓰는 문구' }: {
  value: string;
  onChange: (next: string) => void;
  /** 문구 추가·삭제 패널을 함께 보여 줄지 */
  manage?: boolean;
  /** 한 줄 입력칸이면 true — 줄바꿈 없이 공백으로 잇는다 */
  oneLine?: boolean;
  label?: string;
}) {
  const [presets, setPresets] = useState<string[]>(() => memoPresets());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  // 문구는 매장 설정이라 다른 창·다른 PC 에서 바뀐다 — 마운트 때 한 번만 읽으면 지워진 문구가 칩으로 남는다 (리뷰 L-3)
  useDataRefreshed(() => setPresets(memoPresets()));

  function toggle(t: string) {
    // 한 줄 칸은 문구 단위로 읽어 넣고 뺀다 — 문구에 ' · ' 가 들어가도 중복되지 않게 (리뷰 H-2)
    if (oneLine) { onChange(toggleOneLine(value, t, presets)); return; }
    onChange(presetInMemo(value, t) ? removePresetLine(value, t) : appendPreset(value, t));
  }

  function isOn(t: string): boolean {
    return oneLine ? oneLineHas(value, t, presets) : presetInMemo(value, t);
  }

  function handleAdd() {
    const r = saveMemoPreset(draft);
    setPresets(r.list);
    if (r.error) { notify(r.error); return; }
    setDraft('');
    notify.success('문구를 저장했습니다. 메모에서 눌러 넣을 수 있습니다.');
  }

  function handleDelete(t: string) {
    const r = deleteMemoPreset(t);
    setPresets(r.list);
    if (r.error) notify(r.error);
  }

  if (presets.length === 0 && !manage) return null;

  return (
    <div className="mt-2" data-testid="memo-preset-chips">
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={label} data-testid="memo-presets">
          {presets.map(t => {
            const on = isOn(t);
            return (
              <button key={t} type="button" onClick={() => toggle(t)} aria-pressed={on}
                title={on ? '다시 누르면 메모에서 뺍니다' : '메모에 넣기'}
                className={`px-3 py-2 min-h-[36px] rounded-full text-xs font-medium border transition-colors ${on ? 'bg-[#1a3a8f] text-white border-[#1a3a8f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {t}
              </button>
            );
          })}
        </div>
      )}
      {manage && (
        <>
          <button type="button" onClick={() => setOpen(v => !v)} data-testid="memo-preset-manage"
            className="mt-2 px-3 py-2 min-h-[36px] text-xs font-medium text-[#1a3a8f] bg-white border border-[#1a3a8f]/30 rounded-xl hover:bg-blue-50">
            {open ? '문구 관리 닫기' : '자주 쓰는 문구 관리'}
          </button>
          {open && (
            <div className="mt-2 p-3 bg-slate-50 rounded-xl space-y-2" data-testid="memo-preset-editor">
              <div className="flex gap-2">
                <input type="text" value={draft} onChange={e => setDraft(e.target.value)} maxLength={MAX_PRESET_LEN}
                  aria-label="새 문구" placeholder="예: 자극 없음 · 홈케어 안내"
                  className="flex-1 min-h-[44px] px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300" />
                <button type="button" onClick={handleAdd} className="px-4 min-h-[44px] rounded-xl bg-[#1a3a8f] text-white text-sm font-semibold hover:bg-[#15306e]">추가</button>
              </div>
              <p className="text-xs text-gray-400">문구는 매장 설정에 저장되어 모든 PC 가 함께 씁니다(시술 기록·상담·예약·고객 메모에서 같은 문구를 씁니다). 다른 PC 와 같은 시각(1분 안)에 설정을 바꾸면 드물게 한쪽이 덮일 수 있습니다.</p>
              {presets.length === 0 ? (
                <p className="text-xs text-gray-500">자주 쓰는 문장을 저장해 두면 눌러 넣을 수 있습니다({MAX_PRESET_LEN}자까지).</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {presets.map(t => (
                    <li key={t}>
                      <button type="button" onClick={() => handleDelete(t)} aria-label={`${t} 문구 삭제`}
                        className="px-3 py-2 min-h-[36px] rounded-full text-xs text-gray-600 bg-white border border-gray-200 hover:bg-rose-50 hover:text-rose-700">
                        {t} ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
