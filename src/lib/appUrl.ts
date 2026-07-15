const PUBLIC_APP_URL_ERROR =
  '비밀번호 재설정 주소가 설정되지 않았습니다. 관리자에게 문의해주세요.';

interface AppLocation {
  origin: string;
  protocol: string;
}

interface PasswordResetUrlOptions {
  publicAppUrl?: string;
  baseUrl?: string;
  location?: AppLocation;
  isElectron?: boolean;
}

export function isPasswordRecoveryHash(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get('type') === 'recovery' || params.get('error_code') === 'otp_expired';
}

function normalizePublicAppUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error(PUBLIC_APP_URL_ERROR);
    }
    url.pathname = `${url.pathname.replace(/\/$/, '')}/`;
    return url;
  } catch {
    throw new Error(PUBLIC_APP_URL_ERROR);
  }
}

export function getPasswordResetRedirectUrl(options: PasswordResetUrlOptions = {}) {
  const configuredUrl = (options.publicAppUrl ?? import.meta.env.VITE_PUBLIC_APP_URL ?? '').trim();
  const browserLocation = options.location ?? (typeof window !== 'undefined' ? window.location : undefined);
  const isElectron = options.isElectron ?? (
    browserLocation?.protocol === 'file:' ||
    (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron'))
  );

  let appUrl: URL;
  if (configuredUrl) {
    appUrl = normalizePublicAppUrl(configuredUrl);
  } else {
    if (isElectron || !browserLocation || !['http:', 'https:'].includes(browserLocation.protocol)) {
      throw new Error(PUBLIC_APP_URL_ERROR);
    }
    appUrl = normalizePublicAppUrl(
      new URL(options.baseUrl ?? import.meta.env.BASE_URL, `${browserLocation.origin}/`).toString(),
    );
  }

  return new URL('reset-password', appUrl).toString();
}
