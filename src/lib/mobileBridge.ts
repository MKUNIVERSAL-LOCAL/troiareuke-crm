// 모바일 앱(Capacitor) 브리지 — 비코어.
// 웹 코드가 그대로 동작하지 않는 세 지점을 여기서만 처리한다:
//  1) 외부 링크(target=_blank / window.open) → 시스템 브라우저 (iOS WKWebView는 기본으로 무반응)
//  2) 파일 내려받기(xlsx/pdf) → 캐시 폴더 저장 후 공유 시트 (WebView는 <a download> 미지원)
//  3) Android 하드웨어 뒤로가기 → 라우터 back, 루트에서는 앱 최소화(종료 아님)
import { IS_MOBILE_APP } from './platform';

const EXTERNAL_LINK_RE = /^https?:\/\//i;

export function installMobileBridge(): void {
  if (!IS_MOBILE_APP) return;

  // 1) 외부 링크 → 시스템 브라우저
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (!EXTERNAL_LINK_RE.test(href)) return;
    if (new URL(href, location.href).origin === location.origin) return;
    event.preventDefault();
    void openExternal(href);
  }, true);

  const nativeOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = String(url ?? '');
    if (EXTERNAL_LINK_RE.test(href)) { void openExternal(href); return null; }
    return nativeOpen(url, target, features);
  }) as typeof window.open;

  // 3) Android 뒤로가기
  void import('@capacitor/app').then(({ App }) => {
    App.addListener('backButton', ({ canGoBack }) => {
      const atRoot = /^#?\/?(dashboard)?$/.test(location.hash.replace(/^#/, '')) || !canGoBack;
      if (atRoot) void App.minimizeApp();
      else history.back();
    });
  }).catch(() => {});
}

export async function openExternal(url: string): Promise<void> {
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
  } catch {
    location.href = url;
  }
}

/**
 * 파일 저장/공유 — 모바일 앱에서는 캐시에 쓰고 공유 시트를 띄운다(카카오톡·메일·파일 앱으로 보냄).
 * @param base64 파일 본문(base64, data: 접두어 없음)
 */
export async function saveOrShareFile(fileName: string, base64: string): Promise<'shared' | 'saved'> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
  try {
    await Share.share({ title: fileName, url: written.uri, dialogTitle: '내보낸 파일 공유' });
    return 'shared';
  } catch {
    // 사용자가 공유 시트를 닫은 경우 — 파일은 캐시에 남아 있음
    return 'saved';
  }
}

/**
 * 파일 내보내기 공통 경로 — 모바일 앱은 캐시 저장 + 공유 시트, PC/브라우저는 <a download>.
 * (beforeAfter 비교 이미지, 어드민 반출 JSON 등이 같은 결정을 반복하지 않도록 한 곳에 둔다)
 */
export async function exportFile(fileName: string, blob: Blob): Promise<'shared' | 'saved' | 'downloaded'> {
  if (IS_MOBILE_APP) return saveOrShareFile(fileName, await blobToBase64(blob));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** 텍스트 공유 가능 여부 — 모바일 앱(공유 시트) 또는 Web Share API가 있는 브라우저 */
export const canShareText = IS_MOBILE_APP || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

/**
 * 텍스트 공유 — 모바일 앱은 시스템 공유 시트(카카오톡·문자 앱으로 보냄), 브라우저는 Web Share API.
 * 둘 다 없으면 false (호출 측이 복사로 폴백). 사용자가 시트를 닫으면 false.
 */
export async function shareText(text: string, title = '더마솔루션'): Promise<boolean> {
  try {
    if (IS_MOBILE_APP) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, dialogTitle: '보낼 앱 선택' });
      return true;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, text });
      return true;
    }
  } catch {
    /* 사용자가 공유 시트를 닫았거나 공유 불가 */
  }
  return false;
}

/** data URL → Blob — 저장된 사진(base64)을 파일로 내보낼 때. fetch('data:')는 CSP connect-src에 걸릴 수 있어 직접 디코드한다 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, comma);
  const mime = /^data:([^;,]+)/.exec(meta)?.[1] || 'application/octet-stream';
  const body = dataUrl.slice(comma + 1);
  const bin = /;base64/i.test(meta) ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;base64,/, ''));
    reader.readAsDataURL(blob);
  });
}

/** 앱 표시 버전 (스토어 빌드 버전) — 웹/PC에서는 빌드 상수 */
export async function getMobileAppVersion(): Promise<string> {
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return info.version;
  } catch {
    return String(import.meta.env.VITE_APP_VERSION || '');
  }
}
