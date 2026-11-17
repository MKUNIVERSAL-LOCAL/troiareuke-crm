import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, SwitchCamera, Eye, EyeOff, Loader2, Images, RefreshCw } from 'lucide-react';
import { notify } from '../lib/notify';
import { angleLabel, type DatedPhoto } from '../lib/beforeAfter';
import { useOverlayClose } from '../lib/overlayStack';

/**
 * 촬영 가이드 카메라 (킬러② 잔여 항목, 2026-11-17)
 * - WebView/브라우저 getUserMedia 미리보기 위에 직전 시술 사진을 반투명으로 겹쳐 같은 각도·거리로 찍게 한다.
 * - 네이티브 플러그인 없이 동작(Capacitor Android는 CAMERA 권한을 WebView에 위임, iOS는 NSCameraUsageDescription).
 * - 카메라를 못 열면 오버레이 안에서 [앨범에서 선택]/[다시 시도]를 보여준다 — 프로미스 콜백에서 파일 input을 자동 클릭하면
 *   사용자 제스처가 만료돼 브라우저가 무시하므로(리뷰 2026-11-17) 반드시 버튼 탭 안에서 연다.
 * - 저장되는 사진은 전면 카메라여도 좌우 반전하지 않는다(기존 후면 촬영본과 비교 가능하게). 미리보기·가이드만 함께 반전.
 */
export interface CameraOverlayProps {
  references: DatedPhoto[];                 // 직전 시술 사진(각도별 최신) — 0장이면 가이드 없이 촬영만
  onCapture: (dataUrl: string, reference: DatedPhoto | null) => void;
  onClose: () => void;
  onPickFromAlbum: () => void;              // 사용자 탭 안에서 호출됨 — 부모가 앨범 input.click()
}

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.85;

export function isCameraPreviewSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && window.isSecureContext;
}

type Facing = 'environment' | 'user';

function describeError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError') return '카메라 권한이 거부되었습니다. 기기 설정에서 이 앱의 카메라 권한을 허용한 뒤 다시 시도하세요.';
    if (e.name === 'NotFoundError') return '사용할 수 있는 카메라가 없습니다.';
    if (e.name === 'NotReadableError') return '다른 앱이 카메라를 사용 중이라 열 수 없습니다.';
  }
  return '카메라 미리보기를 열 수 없습니다.';
}

export default function CameraOverlay({ references, onCapture, onClose, onPickFromAlbum }: CameraOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const switchingRef = useRef(false); // 사용자가 [카메라 전환]을 눌러 여는 중 — 실패하면 폴백이 아니라 이전 카메라로 되돌리기
  const shutterRef = useRef<HTMLButtonElement>(null);
  const [facing, setFacing] = useState<Facing>('environment');
  const [attempt, setAttempt] = useState(0); // [다시 시도]
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canSwitch, setCanSwitch] = useState(false);
  const [refIndex, setRefIndex] = useState(0);
  const [opacity, setOpacity] = useState(0.45);
  const [showGuide, setShowGuide] = useState(true);
  const reference = references[refIndex] ?? null;
  const mirrored = facing === 'user';

  // 스트림 열기 — facing·재시도가 바뀌면 다시 연다
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    const stop = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };
    const prevFacing: Facing = facing === 'user' ? 'environment' : 'user';
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        stop();
        streamRef.current = stream;
        switchingRef.current = false;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => { /* 자동재생 차단 시 아래 onLoadedMetadata로 ready */ });
        }
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setCanSwitch(devices.filter(d => d.kind === 'videoinput').length > 1);
        } catch { /* 열거 불가 — 전환 버튼 숨김 */ }
      } catch (e) {
        if (cancelled) return;
        stop();
        if (switchingRef.current) {
          // 전환 실패(HAL이 이전 카메라를 놓는 중 등) — 멀쩡하던 카메라를 버리지 말고 되돌린다. 한 번만(되돌리기도 실패하면 아래 오류 화면)
          switchingRef.current = false;
          notify('카메라를 전환할 수 없어 이전 카메라로 돌아갑니다.');
          setFacing(prevFacing);
          return;
        }
        // 백그라운드 복귀 재개·[다시 시도] 실패 — 전환 왕복 루프 대신 오류 화면([다시 시도]/[앨범에서 선택])
        setError(describeError(e));
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [facing, attempt]);

  // Esc·Android 뒤로가기 — 공용 스택이 가장 위의 이 오버레이만 닫는다 (아래 모달은 유지)
  useOverlayClose(true, onClose);
  useEffect(() => {
    // 포커스를 대화상자 안(촬영 버튼)으로 옮기고, 닫히면 열었던 버튼으로 되돌린다
    const opener = document.activeElement as HTMLElement | null;
    shutterRef.current?.focus();
    return () => { opener?.focus?.(); };
  }, []);

  // 백그라운드 복귀 — iOS WKWebView(와 일부 Android)는 앱이 뒤로 가면 카메라 트랙을 끝내 버린다(readyState 'ended').
  // 돌아왔을 때 멈춘 마지막 프레임이 미리보기로 남지 않게 다시 연다
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (streamRef.current?.getVideoTracks()[0]?.readyState === 'ended') setAttempt(n => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !ready) return;
    if (streamRef.current?.getVideoTracks()[0]?.readyState === 'ended') {
      // 트랙이 끝난 뒤의 <video>는 마지막 프레임을 보여주고 있어 그대로 찍으면 오래된 장면이 저장된다
      notify('카메라 연결이 끊겨 다시 엽니다. 잠시 후 다시 촬영해주세요.');
      setAttempt(n => n + 1);
      return;
    }
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      notify('카메라 영상이 아직 준비되지 않았습니다. 잠시 후 다시 눌러주세요.');
      return;
    }
    let { videoWidth: w, videoHeight: h } = video;
    if (w > MAX_DIM || h > MAX_DIM) {
      if (w >= h) { h = Math.round((h * MAX_DIM) / w); w = MAX_DIM; }
      else { w = Math.round((w * MAX_DIM) / h); h = MAX_DIM; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { notify('사진을 만들 수 없습니다.'); return; }
    // 의도적으로 반전하지 않는다 — 저장본은 후면 촬영본(가이드)과 같은 좌우 기준이어야 Before/After가 맞는다
    ctx.drawImage(video, 0, 0, w, h);
    onCapture(canvas.toDataURL('image/jpeg', JPEG_QUALITY), reference);
  }

  const flip = mirrored ? { transform: 'scaleX(-1)' } : undefined;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="카메라 촬영" className="fixed inset-0 z-[90] bg-black flex flex-col">
      {/* 상단 바 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 pt-safe text-white bg-black/60">
        <p className="text-sm font-medium truncate">
          {reference ? `가이드: ${reference.date}${reference.angle ? ` · ${angleLabel(reference.angle)}` : ''}` : '촬영'}
        </p>
        <div className="flex items-center gap-1.5">
          {reference && !error && (
            <button type="button" onClick={() => setShowGuide(v => !v)} aria-label={showGuide ? '가이드 숨기기' : '가이드 보이기'}
              className="p-2 rounded-lg hover:bg-white/15">
              {showGuide ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          )}
          {canSwitch && !error && (
            <button type="button" onClick={() => { switchingRef.current = true; setFacing(f => (f === 'environment' ? 'user' : 'environment')); }} aria-label="카메라 전환"
              className="p-2 rounded-lg hover:bg-white/15">
              <SwitchCamera size={18} />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="닫기" className="p-2 rounded-lg hover:bg-white/15">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* 미리보기 + 반투명 가이드 — 두 층을 같은 박스(object-contain)에 그려 중심·배율이 일치한다 */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setReady(true)}
          className="absolute inset-0 w-full h-full object-contain"
          style={flip}
        />
        {reference && showGuide && !error && (
          <img
            src={reference.dataUrl}
            alt="직전 시술 사진 가이드"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{ opacity, ...flip }} // 전면 카메라면 가이드도 같이 반전해 미리보기와 같은 좌우 기준으로
          />
        )}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm gap-2">
            <Loader2 size={18} className="animate-spin" />카메라 여는 중...
          </div>
        )}
        {error && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-white">
            <Camera size={36} className="text-white/60" />
            <p className="text-sm leading-relaxed">{error}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setAttempt(n => n + 1)}
                className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-medium flex items-center gap-1.5">
                <RefreshCw size={14} />다시 시도
              </button>
              <button type="button" onClick={onPickFromAlbum}
                className="px-4 py-2 rounded-xl bg-white text-gray-900 text-sm font-medium flex items-center gap-1.5">
                <Images size={14} />앨범에서 선택
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 하단: 가이드 선택·투명도·촬영 */}
      <div className="bg-black/70 text-white px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] space-y-2">
        {references.length > 1 && !error && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {references.map((r, i) => (
              <button key={r.id} type="button" onClick={() => setRefIndex(i)} aria-label={`가이드 사진 ${i + 1}`}
                className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 ${i === refIndex ? 'border-indigo-400' : 'border-transparent opacity-70'}`}>
                <img src={r.dataUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {reference && showGuide && !error && (
          <label className="flex items-center gap-2 text-[11px] text-white/80">
            가이드 투명도
            <input type="range" min={0.1} max={0.9} step={0.05} value={opacity} onChange={e => setOpacity(Number(e.target.value))} className="flex-1" aria-label="가이드 투명도" />
          </label>
        )}
        <div className="flex items-center justify-center">
          <button
            ref={shutterRef}
            type="button"
            onClick={capture}
            disabled={!ready || !!error}
            aria-label="촬영"
            className="w-16 h-16 rounded-full bg-white border-4 border-white/40 flex items-center justify-center text-gray-900 disabled:opacity-40 active:scale-95 transition-transform"
          >
            <Camera size={26} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
