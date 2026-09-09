// 모바일 앱 버전 안내(D6 1단계) — 비코어.
// PC exe는 스스로 교체되지만 스토어 앱은 스토어가 배포 주체다. 그래서 앱은
//  1) 현재 앱 버전과 채널의 mobile-latest.json을 비교해 "새 버전 있음"을 안내하고
//  2) minSupportedVersion 미만이면 강한 배너(서버 API가 바뀌었을 수 있음)를 띄운다.
// 매니페스트 주소 2곳: NAS 채널(정본) → 없으면 GitHub Release 최신 자산(백업). 필드는 추가만 허용(PC 매니페스트와 같은 원칙).
import { IS_MOBILE_APP, PLATFORM } from './platform';
import { getMobileAppVersion } from './mobileBridge';

export interface MobileManifest {
  version: string;
  minSupportedVersion: string;
  releasedAt?: string;
  notes?: string;
  android?: { storeUrl?: string; apkUrl?: string; apkSha256?: string };
  ios?: { storeUrl?: string; testflightUrl?: string };
}

export const MOBILE_MANIFEST_URLS = [
  'https://crm-update.mkcorp.familyds.com/mobile/latest.json',
  'https://github.com/MKUNIVERSAL-LOCAL/troiareuke-crm/releases/latest/download/mobile-latest.json',
] as const;

export type MobileUpdateState =
  | { kind: 'none' }
  | { kind: 'optional'; manifest: MobileManifest; current: string; url: string }
  | { kind: 'required'; manifest: MobileManifest; current: string; url: string };

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

async function fetchManifest(): Promise<MobileManifest | null> {
  for (const url of MOBILE_MANIFEST_URLS) {
    try {
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const json = (await res.json()) as Partial<MobileManifest>;
      if (typeof json.version === 'string' && /^\d+\.\d+\.\d+/.test(json.version)) {
        return { minSupportedVersion: '0.0.0', ...json, version: json.version };
      }
    } catch { /* 다음 주소 */ }
  }
  return null;
}

export function pickStoreUrl(manifest: MobileManifest): string {
  if (PLATFORM === 'ios') return manifest.ios?.storeUrl || manifest.ios?.testflightUrl || '';
  return manifest.android?.storeUrl || manifest.android?.apkUrl || '';
}

export async function checkMobileUpdate(): Promise<MobileUpdateState> {
  if (!IS_MOBILE_APP) return { kind: 'none' };
  const [manifest, current] = await Promise.all([fetchManifest(), getMobileAppVersion()]);
  if (!manifest || !current) return { kind: 'none' };
  const url = pickStoreUrl(manifest);
  if (compareVersions(current, manifest.minSupportedVersion) < 0) return { kind: 'required', manifest, current, url };
  if (compareVersions(current, manifest.version) < 0) return { kind: 'optional', manifest, current, url };
  return { kind: 'none' };
}
