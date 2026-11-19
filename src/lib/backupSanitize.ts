// ═══════════════════════════════════════════════════════════════
// backupSanitize — 백업에 넣지 않는 비밀값 규칙 (순수 모듈, 저장소 의존 없음)
// ───────────────────────────────────────────────────────────────
// 백업 파일(fullBackup.buildBackup)과 Electron '지금 백업'(localStorage 전체 스냅샷) 두 경로가 같은 기준을 쓴다.
// 백업 폴더는 매장 PC·NAS에 그대로 놓이고 공유 시트·메일로도 흘러가는 파일이라 비밀값은 어느 경로에서도 빠져야 한다.
// 순수 모듈로 둔 이유: e2e/lib-units.spec.ts 가 브라우저 없이 직접 import 해 규칙을 검증한다 (리뷰 2026-11-20).
// ═══════════════════════════════════════════════════════════════

/** 파일에 넣지 않는 settings 필드 — 문자 API 키 */
export const SETTINGS_SECRET_FIELDS = ['smsApiKey'] as const;

/** 스냅샷에 넣지 않는 키 — 로컬 계정(평문 비밀번호)·세션 토큰·캘린더 토큰·문자 게이트웨이 키·앱 잠금 PIN. 복원 소비자가 없어 빼도 잃는 것이 없다 (리뷰 2026-11-19) */
const SNAPSHOT_SECRET_KEYS = new Set(['troiareuke_local_users', 'troiareuke_auth_token', 'troiareuke_auth_user', 'google_calendar_token', 'google_calendar_token_expiry', 'crm_sms_gateway_key', 'crm_app_lock']);

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** settings 객체에서 비밀 필드를 뺀 복사본 */
export function stripSettingsSecrets(value: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...value };
  for (const f of SETTINGS_SECRET_FIELDS) delete copy[f];
  return copy;
}

/** Electron '지금 백업' 스냅샷에서 비밀값을 뺀다 — AI 키(ai_key_*)·비밀 키 목록·설정의 문자 API 키 (UX 점검 2026-11-19) */
export function sanitizeStorageSnapshot(snapshot: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(snapshot)) {
    if (key.startsWith('ai_key_') || SNAPSHOT_SECRET_KEYS.has(key)) continue;
    if (key.endsWith('_settings')) {
      try {
        const v: unknown = JSON.parse(raw);
        if (isRecord(v)) { out[key] = JSON.stringify(stripSettingsSecrets(v)); continue; }
      } catch { /* JSON이 아니면 원문 유지 */ }
    }
    out[key] = raw;
  }
  return out;
}
