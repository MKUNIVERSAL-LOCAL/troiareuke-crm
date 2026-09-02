// 기능 플래그 React 구독 훅 (비코어)
import { useEffect, useState } from 'react';
import { isFeatureAllowed, isFeatureEnabled, onFeatureFlagsChanged } from '../lib/featureFlags';

/** 최종 사용 여부(어드민 허용 && 기기 토글)를 반응형으로 구독 */
export function useFeature(id: string): boolean {
  const [on, setOn] = useState(() => isFeatureEnabled(id));
  useEffect(() => {
    setOn(isFeatureEnabled(id));
    return onFeatureFlagsChanged(() => setOn(isFeatureEnabled(id)));
  }, [id]);
  return on;
}

/** 어드민 허용 여부만(기기 토글 무시) 반응형으로 구독 — 설정 화면의 토글 노출 판단용 */
export function useFeatureAllowed(id: string): boolean {
  const [on, setOn] = useState(() => isFeatureAllowed(id));
  useEffect(() => {
    setOn(isFeatureAllowed(id));
    return onFeatureFlagsChanged(() => setOn(isFeatureAllowed(id)));
  }, [id]);
  return on;
}

/** 플래그 변경 시마다 리렌더만 트리거 — 여러 플래그를 한 컴포넌트에서 쓸 때 */
export function useFeatureFlagsTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => onFeatureFlagsChanged(() => setTick((t) => t + 1)), []);
  return tick;
}
