import { useEffect, useMemo, useState } from 'react';
import { Images, ArrowLeftRight } from 'lucide-react';
import { TreatmentLogStore } from '../lib/store';
import { getPhotos, syncPhotosFromNas, type PhotoEntry } from '../lib/photoStore';

interface DatedPhoto extends PhotoEntry {
  date: string; // 시술일 (YYYY-MM-DD)
}

/**
 * Before/After 타임랩스 뷰어 (킬러 기능 ②)
 * - 고객의 시술 사진(photoStore)을 시술일 순으로 모아 시간 흐름대로 비교.
 * - 스크러버로 시간 이동 + Before(최초)/After(선택) 나란히 비교.
 */
export default function TimelapseViewer({ customerId }: { customerId: string }) {
  // NAS 동기화로 사진이 바뀌면 재수집
  const [photoVersion, setPhotoVersion] = useState(0);

  useEffect(() => {
    const logs = TreatmentLogStore.getByCustomer(customerId);
    syncPhotosFromNas(logs.map(log => `treatment:${log.id}`)).then(changed => {
      if (changed) setPhotoVersion(v => v + 1);
    });
  }, [customerId]);

  // 고객의 모든 시술기록 사진을 날짜순(오래된→최신)으로 평탄화
  const photos = useMemo<DatedPhoto[]>(() => {
    const logs = TreatmentLogStore.getByCustomer(customerId); // 최신순
    const collected: DatedPhoto[] = [];
    // 오래된 순으로 뒤집어 수집
    [...logs].reverse().forEach(log => {
      getPhotos(`treatment:${log.id}`).forEach(p => {
        collected.push({ ...p, date: log.treatmentDate });
      });
    });
    return collected;
  }, [customerId, photoVersion]);

  const [idx, setIdx] = useState(0);
  const [compare, setCompare] = useState(false);

  if (photos.length === 0) return null;

  const current = photos[Math.min(idx, photos.length - 1)];
  const first = photos[0];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-1.5">
          <Images size={16} className="text-indigo-600" />
          Before / After 타임랩스
          <span className="ml-1 text-xs font-normal text-gray-400">사진 {photos.length}장</span>
        </h3>
        {photos.length >= 2 && (
          <button
            onClick={() => setCompare(v => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors ${compare ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <ArrowLeftRight size={12} />비교 보기
          </button>
        )}
      </div>

      {compare && photos.length >= 2 ? (
        // Before(최초) vs 현재 선택 나란히 비교
        <div className="grid grid-cols-2 gap-3">
          <figure>
            <img src={first.dataUrl} alt="최초" className="w-full aspect-square object-cover rounded-xl border border-gray-100" />
            <figcaption className="text-center text-xs text-gray-500 mt-1.5">Before · {first.date}</figcaption>
          </figure>
          <figure>
            <img src={current.dataUrl} alt="현재" className="w-full aspect-square object-cover rounded-xl border border-gray-100" />
            <figcaption className="text-center text-xs text-indigo-600 font-medium mt-1.5">After · {current.date}</figcaption>
          </figure>
        </div>
      ) : (
        // 스크러버 단일 뷰
        <div>
          <img src={current.dataUrl} alt="시술 사진" className="w-full max-h-80 object-contain rounded-xl border border-gray-100 bg-gray-50" />
          <p className="text-center text-xs text-gray-500 mt-2">{current.date} ({idx + 1}/{photos.length})</p>
        </div>
      )}

      {photos.length >= 2 && (
        <input
          type="range"
          min={0}
          max={photos.length - 1}
          value={Math.min(idx, photos.length - 1)}
          onChange={e => setIdx(Number(e.target.value))}
          className="w-full mt-3 accent-indigo-600"
          aria-label="사진 시간 이동"
        />
      )}

      {/* 썸네일 스트립 */}
      <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setIdx(i)}
            className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition ${i === idx && !compare ? 'border-indigo-500' : 'border-transparent opacity-70 hover:opacity-100'}`}
          >
            <img src={p.dataUrl} alt={`${p.date} 사진`} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
