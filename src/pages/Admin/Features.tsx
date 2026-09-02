import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, Save, RotateCcw, Globe, Building2 } from 'lucide-react';
import clsx from 'clsx';
import { isAuthApiConfigured, adminListUsers } from '../../lib/authApi';
import { adminGetFeatureFlags, adminSaveFeatureFlags, type FeatureFlagMap } from '../../lib/adminApi';
import { FEATURES, FEATURE_CATEGORIES, type FeatureDef } from '../../lib/featureRegistry';

// 기능 플래그 원격 저장소는 NAS 중앙 서버(feature_flags 테이블) 전용.
// NAS 미연동 빌드에서는 레지스트리 열람만 가능하다.
const NAS_MODE = isAuthApiConfigured;

interface BranchOption {
  id: string;
  name: string;
}

const GLOBAL_SCOPE = 'global';

export default function AdminFeatures() {
  const [scopes, setScopes] = useState<Record<string, FeatureFlagMap>>({});
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selected, setSelected] = useState<string>(GLOBAL_SCOPE);
  const [draft, setDraft] = useState<FeatureFlagMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    if (!NAS_MODE) { setLoading(false); return; }
    setLoading(true);
    try {
      const [flagsRes, users] = await Promise.all([adminGetFeatureFlags(), adminListUsers()]);
      setScopes(flagsRes.scopes || {});
      // 지점 목록: 지점 계정(admin/staff)의 branchId를 중복 제거해 구성
      const map = new Map<string, string>();
      for (const u of users) {
        if (u.role === 'superadmin' || !u.branchId) continue;
        if (!map.has(u.branchId)) map.set(u.branchId, u.branchName || u.shopName || u.branchId);
      }
      setBranches([...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ko')));
    } catch (e: any) {
      alert(`기능 설정을 불러오지 못했습니다: ${e?.message || '서버 오류'}`);
    }
    setLoading(false);
  }

  // 스코프 전환 시 서버 값으로 초안 리셋
  useEffect(() => {
    setDraft({ ...(scopes[selected] || {}) });
    setSavedAt(null);
  }, [selected, scopes]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(scopes[selected] || {}),
    [draft, scopes, selected],
  );

  /** 어드민 관점 유효값: 초안 → (지점이면 전역) → 레지스트리 기본값 */
  function effectiveOf(def: FeatureDef): boolean {
    if (draft[def.id] !== undefined) return draft[def.id];
    if (selected !== GLOBAL_SCOPE && scopes[GLOBAL_SCOPE]?.[def.id] !== undefined) {
      return scopes[GLOBAL_SCOPE][def.id];
    }
    return def.defaultOn;
  }

  function stateOf(def: FeatureDef): 'inherit' | 'on' | 'off' {
    const v = draft[def.id];
    return v === undefined ? 'inherit' : v ? 'on' : 'off';
  }

  function setState(def: FeatureDef, state: 'inherit' | 'on' | 'off') {
    setDraft((prev) => {
      const next = { ...prev };
      if (state === 'inherit') delete next[def.id];
      else next[def.id] = state === 'on';
      return next;
    });
  }

  async function handleSave() {
    if (!NAS_MODE || saving) return;
    setSaving(true);
    try {
      const res = await adminSaveFeatureFlags(selected, draft);
      setScopes((prev) => ({ ...prev, [selected]: res.flags }));
      setSavedAt(Date.now());
    } catch (e: any) {
      alert(`저장에 실패했습니다: ${e?.message || '서버 오류'}`);
    }
    setSaving(false);
  }

  const inheritLabel = (def: FeatureDef) =>
    selected === GLOBAL_SCOPE
      ? `기본값 (${def.defaultOn ? '켜짐' : '꺼짐'})`
      : '전역 설정 따름';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">기능 관리</h1>
          <p className="text-slate-400 text-sm mt-1">
            CRM의 모든 기능을 전역 또는 지점별로 켜고 끕니다. 지점 화면에는 재접속(또는 새로고침) 시 반영됩니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !dirty && (
            <span className="text-xs text-emerald-400">저장됨</span>
          )}
          {dirty && <span className="text-xs text-amber-300">저장되지 않은 변경</span>}
          <button
            onClick={() => setDraft({ ...(scopes[selected] || {}) })}
            disabled={!dirty}
            className="flex items-center gap-2 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={14} />
            되돌리기
          </button>
          <button
            onClick={handleSave}
            disabled={!NAS_MODE || !dirty || saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {!NAS_MODE && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 text-sm text-amber-200">
          NAS 중앙 서버가 이 빌드에 연결되어 있지 않아 원격 기능 제어를 사용할 수 없습니다. (아래는 기능 목록 열람만 가능)
        </div>
      )}

      {/* 스코프 선택: 전역 + 지점 */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setSelected(GLOBAL_SCOPE)}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
            selected === GLOBAL_SCOPE
              ? 'bg-blue-600 text-white'
              : 'bg-slate-900 border border-slate-700/50 text-slate-300 hover:bg-slate-800',
          )}
        >
          <Globe size={14} />
          전역 기본값
        </button>
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelected(b.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
              selected === b.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 border border-slate-700/50 text-slate-300 hover:bg-slate-800',
            )}
          >
            <Building2 size={14} />
            {b.name}
            {Object.keys(scopes[b.id] || {}).length > 0 && (
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" title="지점 오버라이드 있음" />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {FEATURE_CATEGORIES.map((category) => (
            <section key={category}>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">
                <SlidersHorizontal size={14} className="text-slate-500" />
                {category}
              </h2>
              <div className="bg-slate-900 border border-slate-700/50 rounded-2xl divide-y divide-slate-800">
                {FEATURES.filter((f) => f.category === category).map((def) => {
                  const effective = effectiveOf(def);
                  const state = stateOf(def);
                  return (
                    <div key={def.id} className="flex items-center gap-4 px-5 py-4">
                      <span
                        className={clsx(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          effective ? 'bg-emerald-400' : 'bg-slate-600',
                        )}
                        title={effective ? '사용 중' : '꺼짐'}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">
                          {def.label}
                          {def.deviceToggle && (
                            <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full align-middle">
                              샵에서 추가 토글
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 truncate" title={def.description}>{def.description}</p>
                      </div>
                      <span className={clsx('text-xs font-semibold w-14 text-right', effective ? 'text-emerald-400' : 'text-slate-500')}>
                        {effective ? '사용 중' : '꺼짐'}
                      </span>
                      <select
                        value={state}
                        onChange={(e) => setState(def, e.target.value as 'inherit' | 'on' | 'off')}
                        disabled={!NAS_MODE}
                        className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <option value="inherit">{inheritLabel(def)}</option>
                        <option value="on">켜짐</option>
                        <option value="off">꺼짐</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <p className="text-xs text-slate-500 leading-relaxed">
            우선순위: <strong className="text-slate-400">지점 설정 &gt; 전역 기본값 &gt; 프로그램 기본값</strong>.
            &lsquo;샵에서 추가 토글&rsquo; 표시가 있는 기능은 여기서 허용해도 샵 관리자가 설정 화면에서 기기별로 켜야 표시됩니다.
            지점 프로그램은 오프라인에서 마지막으로 받은 설정으로 동작합니다.
          </p>
        </div>
      )}
    </div>
  );
}
