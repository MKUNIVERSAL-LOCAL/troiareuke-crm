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
export async function saveOrShareFile(fileName: string, base64: string, mimeType: string): Promise<'shared' | 'saved'> {
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
