import { useState } from 'react';
import { notify } from '../lib/notify';
import { saveMemoPreset, deleteMemoPreset } from '../lib/memoPresets';
import { MAX_PRESET_LEN, MAX_PRESETS } from '../lib/memoPresetRule';

/**
 * 자주 쓰는 메모 문구 **관리 패널** (259) — 추가·삭제만 하는 공용 조각.
 *
 * 251~255 에서는 이 패널이 시술 기록 창 안에만 있어, 상담 소견·예약 메모·고객 한 줄 메모에서
 * 문구를 쓰려면 "시술 기록 창을 열어 관리하라" 는 길밖에 없었다(리뷰 L-4 — 나머지 세 곳은 막다른 길).
 * 이제 같은 패널을 **설정 > 매장 정보**에도 두고, 시술 기록 창에서도 그대로 쓴다.
 *
 * 목록은 부모가 들고 있다(칩 줄과 같은 상태를 써야 눌림 표시가 어긋나지 않는다).
 */
export default function MemoPresetManager({ presets, onChange, beforeSave }: {
  presets: string[];
  onChange: (list: string[]) => void;
  /** 저장 직전에 할 일 — 설정 화면은 다른 PC 가 바꾼 설정 행을 먼저 받아 온다(행 전체 PUT이라) (262, 리뷰 M-5) */
  beforeSave?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState('');

  async function handleAdd() {
    if (beforeSave) await beforeSave();
    const r = saveMemoPreset(draft);
    onChange(r.list);
    if (r.error) { notify(r.error); return; } // 저장 실패·거절 사유를 조용히 버리지 않는다
    setDraft('');
    notify.success('문구를 저장했습니다. 메모에서 눌러 넣을 수 있습니다.');
  }

  async function handleDelete(t: string) {
    if (beforeSave) await beforeSave();
    const r = deleteMemoPreset(t);
    onChange(r.list);
    if (r.error) notify(r.error);
  }

  return (
    <div className="p-3 bg-slate-50 rounded-xl space-y-2" data-testid="memo-preset-editor">
      <div className="flex gap-2">
        <input type="text" value={draft} onChange={e => setDraft(e.target.value)} maxLength={MAX_PRESET_LEN}
          aria-label="새 문구" placeholder="예: 자극 없음 · 홈케어 안내"
          className="flex-1 min-w-0 min-h-[44px] px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300" />
        <button type="button" onClick={() => void handleAdd()} className="px-4 min-h-[44px] rounded-xl bg-[#1a3a8f] text-white text-sm font-semibold hover:bg-[#15306e]">추가</button>
      </div>
      <p className="text-xs text-gray-400">문구는 매장 설정에 저장되어 모든 PC 가 함께 씁니다(시술 기록·상담·예약·고객 메모에서 같은 문구를 씁니다). 다른 PC 와 같은 시각(1분 안)에 설정을 바꾸면 드물게 한쪽이 덮일 수 있습니다.</p>
      {presets.length === 0 ? (
        <p className="text-xs text-gray-500">자주 쓰는 문장을 저장해 두면 눌러 넣을 수 있습니다({MAX_PRESET_LEN}자까지, {MAX_PRESETS}개).</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {presets.map(t => (
            <li key={t}>
              <button type="button" onClick={() => void handleDelete(t)} aria-label={`${t} 문구 삭제`}
                className="px-3 py-2 min-h-[36px] rounded-full text-xs text-gray-600 bg-white border border-gray-200 hover:bg-rose-50 hover:text-rose-700">
                {t} ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
