import { useEffect, useMemo, useState } from 'react';
import { Images, ArrowLeftRight, Download, Copy, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { TreatmentLogStore } from '../lib/store';
import { syncPhotosFromNas, PHOTO_ANGLES, type PhotoAngle } from '../lib/photoStore';
import {
  collectCustomerPhotos, photoCaption, daysBetween,
  renderComparison, exportComparison, comparisonFileName, canCopyImage, copyImageToClipboard,
  type DatedPhoto,
} from '../lib/beforeAfter';
import { notify } from '../lib/notify';
import { IS_MOBILE_APP } from '../lib/platform';

/**
 * Before/After 타임랩스 뷰어 (킬러 기능 ②)
 * - 고객의 시술 사진(photoStore)을 시술일 순으로 모아 시간 흐름대로 비교.
 * - 스크러버로 시간 이동 + Before/After를 각각 골라 나란히 비교 (기본: 최초 ↔ 최신).
 * - 촬영 각도 태그가 있으면 같은 각도끼리만 비교할 수 있다.
 * - 비교 이미지를 PNG 1장으로 합성해 저장(PC) / 공유(모바일) / 클립보드 복사(PC, 카카오톡 PC 붙여넣기).
 */
export default function TimelapseViewer({ customerId, customerName }: { customerId: string; customerName?: string }) {
  // NAS 동기화로 사진이 바뀌면 재수집
  const [photoVersion, setPhotoVersion] = useState(0);
  useEffect(() => {
    const logs = TreatmentLogStore.getByCustomer(customerId);
    syncPhotosFromNas(logs.map(log => `treatment:${log.id}`)).then(changed => {
      if (changed) setPhotoVersion(v => v + 1);
    });
  }, [customerId]);

  const allPhotos = useMemo<DatedPhoto[]>(() => collectCustomerPhotos(customerId), [customerId, photoVersion]);
  const angles = useMemo(() => PHOTO_ANGLES.filter(a => allPhotos.some(p => p.angle === a.id)), [allPhotos]);
  const [angleFilter, setAngleFilter] = useState<PhotoAngle | 'all'>('all');
  // 고객이 바뀌면 필터 초기화. 선택한 각도의 사진이 사라지면(동기화·삭제) '전체'로 폴백 — 빈 화면에 갇히지 않게
  useEffect(() => setAngleFilter('all'), [customerId]);
  const effectiveFilter: PhotoAngle | 'all' =
    angleFilter !== 'all' && !angles.some(a => a.id === angleFilter) ? 'all' : angleFilter;
  const photos = useMemo(
    () => (effectiveFilter === 'all' ? allPhotos : allPhotos.filter(p => p.angle === effectiveFilter)),
    [allPhotos, effectiveFilter],
  );

  // null = 기본값(Before: 최초, After: 최신). 사진 수·필터가 바뀌면 기본값으로 복귀
  const [beforeSel, setBeforeSel] = useState<number | null>(null);
  const [afterSel, setAfterSel] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);
  const [target, setTarget] = useState<'before' | 'after'>('after');
  const [busy, setBusy] = useState<null | 'save' | 'copy'>(null);
  useEffect(() => { setBeforeSel(null); setAfterSel(null); }, [effectiveFilter, photos.length]);

  if (allPhotos.length === 0) return null;

  const last = Math.max(photos.length - 1, 0);
  const afterIdx = Math.min(afterSel ?? last, last);
  const beforeIdx = Math.min(beforeSel ?? 0, last);
  const after = photos[afterIdx];
  const before = photos[beforeIdx];
  const current = compare && target === 'before' ? before : after;
  const currentIdx = compare && target === 'before' ? beforeIdx : afterIdx;
  const days = before && after ? daysBetween(before.date, after.date) : 0;

  const pick = (i: number) => {
    if (compare && target === 'before') setBeforeSel(i);
    else setAfterSel(i);
  };

  const buildImage = () => renderComparison({ before, after, customerName });

  async function handleSave() {
    setBusy('save');
    try {
      const result = await exportComparison(await buildImage(), comparisonFileName(customerName));
      notify.success(
        result === 'shared' ? '비교 이미지를 공유했습니다.'
          : result === 'saved' ? '비교 이미지를 저장했습니다.'
            : '비교 이미지를 내려받았습니다.',
      );
    } catch (e: any) {
      notify.error(`비교 이미지 생성 실패: ${e?.message || '알 수 없는 오류'}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy() {
    setBusy('copy');
    try {
      await copyImageToClipboard(await buildImage());
      notify.success('비교 이미지를 복사했습니다. 카카오톡 대화창에 붙여넣기(Ctrl+V) 하세요.');
    } catch (e: any) {
      notify.error(`복사 실패: ${e?.message || '클립보드를 사용할 수 없습니다.'}`);
    } finally {
      setBusy(null);
    }
  }

  const caption = photoCaption;
  const labelBadge = (p: DatedPhoto) => (p.label === 'before' ? '전' : p.label === 'after' ? '후' : '');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-1.5">
          <Images size={16} className="text-indigo-600" />
          Before / After 타임랩스
          <span className="ml-1 text-xs font-normal text-gray-400">사진 {allPhotos.length}장</span>
        </h3>
        <div className="flex items-center gap-1.5">
          {angles.length > 0 && (
            <div className="flex items-center gap-1 mr-1" role="group" aria-label="촬영 각도 필터">
              {[{ id: 'all' as const, label: '전체' }, ...angles].map(a => (
                <button
                  key={a.id}
                  onClick={() => setAngleFilter(a.id)}
                  className={clsx('text-[11px] px-2 py-1 rounded-lg font-medium transition-colors',
                    effectiveFilter === a.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
          {photos.length >= 2 && (
            <button
              onClick={() => setCompare(v => !v)}
              className={clsx('text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors',
                compare ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
            >
              <ArrowLeftRight size={12} />비교 보기
            </button>
          )}
        </div>
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">이 각도로 찍은 사진이 없습니다.</p>
      ) : compare && photos.length >= 2 ? (
        <div>
          {/* Before(선택) vs After(선택) 나란히 비교 */}
          <div className="grid grid-cols-2 gap-3">
            <figure>
              <button
                type="button"
                onClick={() => setTarget('before')}
                className={clsx('block w-full rounded-xl ring-offset-2 transition', target === 'before' ? 'ring-2 ring-gray-800' : 'ring-0')}
                title="아래 썸네일에서 Before 사진을 고릅니다"
              >
                <img src={before.dataUrl} alt="Before" className="w-full aspect-square object-cover rounded-xl border border-gray-100" />
              </button>
              <figcaption className="text-center text-xs text-gray-500 mt-1.5">Before · {caption(before)}</figcaption>
            </figure>
            <figure>
              <button
                type="button"
                onClick={() => setTarget('after')}
                className={clsx('block w-full rounded-xl ring-offset-2 transition', target === 'after' ? 'ring-2 ring-indigo-500' : 'ring-0')}
                title="아래 썸네일에서 After 사진을 고릅니다"
              >
                <img src={after.dataUrl} alt="After" className="w-full aspect-square object-cover rounded-xl border border-gray-100" />
              </button>
              <figcaption className="text-center text-xs text-indigo-600 font-medium mt-1.5">After · {caption(after)}</figcaption>
            </figure>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className={clsx('px-2 py-1 rounded-lg font-semibold', days > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500')}>
                D+{days}
              </span>
              <span>
                선택 대상:
                <button type="button" onClick={() => setTarget('before')} className={clsx('ml-1 px-1.5 py-0.5 rounded font-medium', target === 'before' ? 'bg-gray-800 text-white' : 'hover:bg-gray-100')}>Before</button>
                <button type="button" onClick={() => setTarget('after')} className={clsx('ml-1 px-1.5 py-0.5 rounded font-medium', target === 'after' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-100')}>After</button>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {canCopyImage && (
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={busy !== null}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
                  title="비교 이미지를 클립보드에 복사 (카카오톡 PC에 붙여넣기)"
                >
                  {busy === 'copy' ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}복사
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={busy !== null}
                className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
              >
                {busy === 'save' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {IS_MOBILE_APP ? '이미지 공유' : '이미지 저장'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        // 스크러버 단일 뷰
        <div>
          <img src={current.dataUrl} alt="시술 사진" className="w-full max-h-80 object-contain rounded-xl border border-gray-100 bg-gray-50" />
          <p className="text-center text-xs text-gray-500 mt-2">
            {caption(current)} ({currentIdx + 1}/{photos.length})
            {labelBadge(current) && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">시술 {labelBadge(current)}</span>}
          </p>
        </div>
      )}

      {photos.length >= 2 && !compare && (
        <input
          type="range"
          min={0}
          max={last}
          value={afterIdx}
          onChange={e => setAfterSel(Number(e.target.value))}
          className="w-full mt-3 accent-indigo-600"
          aria-label="사진 시간 이동"
        />
      )}

      {/* 썸네일 스트립 — 비교 모드에서는 선택 대상(Before/After)에 배정 */}
      {photos.length > 0 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {photos.map((p, i) => {
            const isBefore = compare && i === beforeIdx;
            const isAfter = i === afterIdx;
            return (
              <button
                key={p.id}
                onClick={() => pick(i)}
                className={clsx('relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition',
                  isBefore ? 'border-gray-800' : isAfter ? 'border-indigo-500' : 'border-transparent opacity-70 hover:opacity-100')}
                title={caption(p)}
                aria-label={`${caption(p)} 사진 선택`}
              >
                <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                {labelBadge(p) && (
                  <span className={clsx('absolute bottom-0 left-0 px-1 text-[9px] font-bold text-white', p.label === 'after' ? 'bg-indigo-600/90' : 'bg-gray-800/80')}>
                    {labelBadge(p)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
