import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Download } from 'lucide-react';
import { exportFile, dataUrlToBlob } from '../lib/mobileBridge';
import { notify } from '../lib/notify';
import { IS_MOBILE_APP } from '../lib/platform';
import { useFocusTrap, useOverlayClose } from '../lib/overlayStack';

export interface LightboxPhoto {
  dataUrl: string;
  caption?: string;
  fileName?: string; // 저장/공유 파일명 (없으면 photo.jpg)
}

/**
 * 사진 크게 보기 (상담 사진·Before/After 비교 이미지 공용)
 * - body 포털 + 최상위 z-index: 모바일 상세 패널 안의 썸네일에서도 화면 전체로 뜬다.
 * - Esc·배경 탭으로 닫기, 저장(PC 내려받기)/공유(모바일 공유 시트).
 */
export default function PhotoLightbox({ photo, onClose }: { photo: LightboxPhoto; onClose: () => void }) {
  // Esc·Android 뒤로가기 — 공용 스택이 가장 위의 이 라이트박스만 닫는다 (아래 모달은 유지)
  useOverlayClose(true, onClose);
  // 포커스를 닫기 버튼(data-autofocus)으로 옮기고 Tab을 안에서 순환, 닫히면 열었던 썸네일로 되돌린다 — 자체 effect 대신 공용 트랩 (55)
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, rootRef);

  async function handleExport() {
    try {
      // 확장자는 실제 데이터(MIME) 기준 — 저장된 비교 이미지는 JPEG라 .png 이름이 들어와도 .jpg로 바로잡는다
      const blob = dataUrlToBlob(photo.dataUrl);
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const fileName = (photo.fileName || 'photo').replace(/\.(png|jpe?g|webp)$/i, '') + '.' + ext;
      const result = await exportFile(fileName, blob);
      if (result === 'downloaded') notify('사진을 내려받았습니다.');
      else if (result === 'cancelled') notify.info('공유를 취소했습니다 — 사진은 저장되지 않았습니다.'); // 사용자가 취소한 것은 오류가 아니다
    } catch (e) {
      notify(e instanceof Error ? e.message : '사진을 내보내지 못했습니다.');
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      ref={rootRef}
      className="fixed inset-0 z-[80] bg-black/85 flex flex-col outline-none"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={e => e.stopPropagation()}>
        <p className="text-sm truncate">{photo.caption || '사진'}</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium flex items-center gap-1.5"
          >
            <Download size={14} />{IS_MOBILE_APP ? '공유' : '저장'}
          </button>
          <button data-autofocus type="button" onClick={onClose} aria-label="닫기" className="p-1.5 rounded-lg hover:bg-white/15">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-3">
        <img src={photo.dataUrl} alt={photo.caption || '사진'} className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
      </div>
    </div>,
    document.body,
  );
}
