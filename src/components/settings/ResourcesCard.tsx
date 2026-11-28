// ResourcesCard — 설정 > 영업시간 탭의 베드·룸 자원 목록 (비코어, 142, GAP R-5)
// 추가·사용 중 토글·삭제는 즉시 저장(지정 휴일과 같은 태도). 앞으로의 예약에 배정된 자원은 확인 뒤에만 삭제.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { notify } from '../../lib/notify';
import { askConfirm } from '../../lib/confirmDialog';
import { josa } from '../../lib/josa';
import { describePrefLoss, describePrefRemovalLoss } from '../../lib/prefLandedRule'; // 저장이 정말 남았는지 (292·297)
import { prefSaveMode } from '../../lib/prefSaveMode';
import { allResources, saveResources, removeResource, newResourceId } from '../../lib/resourceStore';
import { RESOURCE_KIND_LABEL } from '../../lib/resourceRule';
import type { Resource } from '../../types';

const KINDS = Object.keys(RESOURCE_KIND_LABEL) as Resource['kind'][];

export default function ResourcesCard() {
  const [list, setList] = useState<Resource[]>(() => allResources());
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Resource['kind']>('bed');

  const add = () => {
    const n = name.trim();
    if (!n) { notify('자원 이름을 입력해주세요.'); return; }
    if (list.some(r => r.name === n)) { notify('같은 이름의 자원이 이미 있습니다.'); return; }
    const next = [...list, { id: newResourceId(), name: n, kind, isActive: true }];
    const lost = describePrefLoss(saveResources(next), '자원 목록', prefSaveMode());
    setList(next);
    setName('');
    if (lost) notify.error(lost); else notify.success(`${josa(n, '을/를')} 추가했습니다.`);
  };
  const toggle = (id: string) => {
    const next = list.map(r => (r.id === id ? { ...r, isActive: !r.isActive } : r));
    const lost = describePrefLoss(saveResources(next), '자원 목록', prefSaveMode());
    setList(next);
    if (lost) notify.error(lost); // 끈 자원이 다시 켜져 돌아오는 것을 말없이 두지 않는다
  };
  const remove = async (r: Resource) => {
    const first = removeResource(r.id);
    if (!first.removed) {
      const ok = await askConfirm({ title: '자원 삭제', confirmLabel: '삭제', cancelLabel: '닫기', message: `'${r.name}'은(는) 앞으로의 예약 ${first.upcoming}건에 배정돼 있습니다. 삭제하면 그 예약들은 자원 없이 남습니다. 삭제할까요?` });
      if (!ok) return;
      const forced = removeResource(r.id, true);
      setList(allResources());
      const lostForced = describePrefRemovalLoss(forced.landed, '자원', prefSaveMode()); // 297(리뷰 M-3)
      if (lostForced) notify.error(lostForced); else notify.info(`${josa(r.name, '을/를')} 삭제했습니다.`);
      return;
    }
    setList(allResources());
    const lost = describePrefRemovalLoss(first.landed, '자원', prefSaveMode()); // 297(리뷰 M-3)
    if (lost) notify.error(lost); else notify.info(`${josa(r.name, '을/를')} 삭제했습니다.`);
  };

  return (
    <div className="space-y-3" data-testid="resources-editor">
      <p className="text-xs text-gray-500">베드·룸·장비는 한 번에 예약 하나만 씁니다. 예약을 잡을 때 빈 자원을 자동 배정하고, 다 차 있으면 저장 전에 알려 줍니다. 목록 순서가 자동 배정 우선순위입니다.</p>
      {list.length === 0 ? (
        <p className="text-sm text-gray-500">등록된 자원이 없습니다 — 베드 수만큼 추가하면 같은 시간에 몇 명까지 받을 수 있는지 예약이 알아서 지킵니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          {list.map(r => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className={r.isActive ? 'font-medium text-gray-800' : 'text-gray-400 line-through'}>{r.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{RESOURCE_KIND_LABEL[r.kind]}</span>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={r.isActive} onChange={() => toggle(r.id)} className="rounded" aria-label={`${r.name} 사용 중`} />
                사용 중
              </label>
              <button type="button" onClick={() => void remove(r)} aria-label={`${r.name} 삭제`} className="p-1.5 rounded-lg text-red-700 hover:bg-red-50"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          aria-label="자원 이름"
          placeholder="예: 베드1, 2번 룸"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          className="flex-1 min-w-[10rem] px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300"
        />
        <select aria-label="자원 종류" value={kind} onChange={e => setKind(e.target.value as Resource['kind'])} className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-300">
          {KINDS.map(k => <option key={k} value={k}>{RESOURCE_KIND_LABEL[k]}</option>)}
        </select>
        <button type="button" onClick={add} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-[#1a3a8f] rounded-xl hover:bg-[#15306e]"><Plus size={14} />자원 추가</button>
      </div>
    </div>
  );
}
