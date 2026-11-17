import { useEffect, useState } from 'react';
import { onPhotoCacheChange } from '../lib/photoStore';

/**
 * 사진 캐시(photoStore)가 비동기로 채워지거나(IndexedDB 최초 적재) NAS 동기화로 바뀌면 값이 올라간다.
 * getPhotos()를 렌더에서 읽는 화면은 이 값을 의존성에 넣어 다시 그린다 (2026-11-17 D4).
 */
export function usePhotoCacheVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => onPhotoCacheChange(() => setVersion(v => v + 1)), []);
  return version;
}
