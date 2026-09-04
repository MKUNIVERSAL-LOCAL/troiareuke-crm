/**
 * 업데이트 채널(배포 사이트) 정보 — 어드민 콘솔이 "현재 배포 중인 최신 버전"과
 * 지점별 실행 버전을 비교해 구버전으로 남은 지점을 보여주기 위한 최소 유틸.
 *
 * 배포 불변 원칙(docs/DISTRIBUTION-POLICY.md): 매장은 설치 1회, 이후 변경은 인앱 업데이트로만.
 * 지점 안내가 필요할 때 보내는 주소는 아래 INSTALL_SITE_URL 하나뿐이다 (파일 직접 전달 금지).
 */

export const INSTALL_SITE_URL = 'https://crm-update.mkcorp.familyds.com/';
export const CHANNEL_MANIFEST_URL = 'https://crm-update.mkcorp.familyds.com/portable/latest.json';

/** 신규 PC 설치 안내 표준 문구 (카톡·문자 복사용). 기존 PC에는 절대 보내지 않는다 — 자동 업데이트가 처리. */
export const INSTALL_GUIDE_MESSAGE = [
  '[더마솔루션 CRM 설치 안내]',
  '아래 주소에서 [무료 다운로드]를 눌러 설치해 주세요.',
  INSTALL_SITE_URL,
  '설치는 처음 한 번만 하시면 됩니다. 이후 새 기능은 프로그램이 스스로 업데이트합니다.',
  '(기존 PC는 다시 받으실 필요 없습니다 — 프로그램을 닫고 다시 켜면 최신 버전이 적용됩니다.)',
].join('\n');

export interface ChannelManifest {
  version: string;
  releaseDate?: string;
  notes?: string;
}

/** 'a.b.c' 비교 — a<b → -1, a==b → 0, a>b → 1. 비정상 문자열은 0으로 취급. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const parse = (v: string | null | undefined) => String(v || '0').split('-')[0].split('.').map(p => Number(p) || 0);
  const pa = parse(a), pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** 실행 버전이 최신 배포 버전보다 낮으면 true. 둘 중 하나라도 모르면 false(판단 유보). */
export function isOutdated(appVersion: string | null | undefined, latestVersion: string | null | undefined): boolean {
  if (!appVersion || !latestVersion) return false;
  return compareVersions(appVersion, latestVersion) < 0;
}

/** 마지막 접속이 days일보다 오래됐거나 기록이 없으면 true. */
export function isStale(lastSeenAt: string | null | undefined, days = 14): boolean {
  if (!lastSeenAt) return true;
  const t = Date.parse(lastSeenAt);
  if (Number.isNaN(t)) return true;
  return Date.now() - t > days * 24 * 60 * 60 * 1000;
}

let cached: { at: number; manifest: ChannelManifest | null } | null = null;

/** 채널 매니페스트(최신 배포 버전) — 5분 캐시, 실패 시 null (화면은 "확인 불가"로 표시). */
export async function fetchLatestChannelVersion(): Promise<ChannelManifest | null> {
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.manifest;
  try {
    const r = await fetch(`${CHANNEL_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const m = await r.json();
    const manifest: ChannelManifest | null = typeof m?.version === 'string'
      ? { version: m.version, releaseDate: m.releaseDate, notes: typeof m.notes === 'string' ? m.notes : undefined }
      : null;
    cached = { at: Date.now(), manifest };
    return manifest;
  } catch {
    cached = { at: Date.now(), manifest: null };
    return null;
  }
}

export const appModeLabel: Record<string, string> = {
  portable: '포터블',
  folder: '폴더형',
  admin: '어드민',
  web: '브라우저',
};
