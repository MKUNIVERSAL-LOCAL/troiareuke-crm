import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, SwitchCamera, Eye, EyeOff, Loader2 } from 'lucide-react';
import { notify } from '../lib/notify';
import { angleLabel, type DatedPhoto } from '../lib/beforeAfter';

/**
 * 촬영 가이드 카메라 (킬러② 잔여 항목, 2026-11-17)
 * - WebView/브라우저 getUserMedia 미리보기 위에 직전 시술 사진을 반투명으로 겹쳐 같은 각도·거리로 찍게 한다.
 * - 네이티브 플러그인 없이 동작(Capacitor Android는 CAMERA 권한 + WebView 권한 위임, iOS 14.3+ WKWebView).
 * - 카메라를 못 열면 onUnavailable → 호출 측이 기존 <input capture> 경로로 폴백한다.
 */
export interface CameraOverlayProps {
  references: DatedPhoto[];                 // 직전 시술 사진(각도별 최신) — 0장이면 가이드 없이 촬영만
  onCapture: (dataUrl: string, reference: DatedPhoto | null) => void;
  onClose: () => void;
  onUnavailable: () => void;
}

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.85;

export function isCameraPreviewSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && window.isSecureContext;
}

export default function CameraOverlay({ references, onCapture, onClose, onUnavailable }: CameraOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);
  const [refIndex, setRefIndex] = useState(0);
  const [opacity, setOpacity] = useState(0.45);
  const [showGuide, setShowGuide] = useState(true);
  const reference = references[refIndex] ?? null;

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  // 스트림 열기 — facing이 바뀌면 다시 연다
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const stop = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        stop();
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => { /* 자동재생 차단 시 아래 onLoadedMetadata로 ready */ });
        }
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setCanSwitch(devices.filter(d => d.kind === 'videoinput').length > 1);
        } catch { /* 열거 불가 — 전환 버튼 숨김 */ }
      } catch (e) {
        if (cancelled) return;
        stop();
        notify(e instanceof DOMException && e.name === 'NotAllowedError'
          ? '카메라 권한이 거부되어 기본 카메라 앱으로 엽니다.'
          : '카메라 미리보기를 열 수 없어 기본 카메라 앱으로 엽니다.');
        unavailableRef.current();
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [facing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !ready || video.videoWidth === 0) return;
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
    ctx.drawImage(video, 0, 0, w, h);
    onCapture(canvas.toDataURL('image/jpeg', JPEG_QUALITY), reference);
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="카메라 촬영" className="fixed inset-0 z-[90] bg-black flex flex-col">
      {/* 상단 바 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-white bg-black/60">
        <p className="text-sm font-medium truncate">
          {reference ? `가이드: ${reference.date}${reference.angle ? ` · ${angleLabel(reference.angle)}` : ''}` : '촬영'}
        </p>
        <div className="flex items-center gap-1.5">
          {reference && (
            <button type="button" onClick={() => setShowGuide(v => !v)} aria-label={showGuide ? '가이드 숨기기' : '가이드 보이기'}
              className="p-2 rounded-lg hover:bg-white/15">
              {showGuide ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          )}
          {canSwitch && (
            <button type="button" onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))} aria-label="카메라 전환"
              className="p-2 rounded-lg hover:bg-white/15">
              <SwitchCamera size={18} />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="닫기" className="p-2 rounded-lg hover:bg-white/15">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* 미리보기 + 반투명 가이드 */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setReady(true)}
          className="max-w-full max-h-full object-contain"
          style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
        />
        {reference && showGuide && (
          <img
            src={reference.dataUrl}
            alt="직전 시술 사진 가이드"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{ opacity }}
          />
        )}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm gap-2">
            <Loader2 size={18} className="animate-spin" />카메라 여는 중...
          </div>
        )}
      </div>

      {/* 하단: 가이드 선택·투명도·촬영 */}
      <div className="bg-black/70 text-white px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] space-y-2">
        {references.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {references.map((r, i) => (
              <button key={r.id} type="button" onClick={() => setRefIndex(i)} aria-label={`가이드 사진 ${i + 1}`}
                className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 ${i === refIndex ? 'border-indigo-400' : 'border-transparent opacity-70'}`}>
                <img src={r.dataUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {reference && showGuide && (
          <label className="flex items-center gap-2 text-[11px] text-white/80">
            가이드 투명도
            <input type="range" min={0.1} max={0.9} step={0.05} value={opacity} onChange={e => setOpacity(Number(e.target.value))} className="flex-1" aria-label="가이드 투명도" />
          </label>
        )}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={capture}
            disabled={!ready}
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
