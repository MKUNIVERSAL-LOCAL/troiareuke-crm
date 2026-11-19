// 공통 알림(토스트) — 흩어져 있던 window.alert 59곳을 한 체계로 통일 (2026-09-07, 파일럿 준비 4/5).
// 사용: notify('저장했습니다') / notify.error('실패했습니다') / notify.success(...) / notify.info(...)
// 톤을 지정하지 않으면 문구에서 추론한다(실패·오류·없습니다 → error, 완료·저장 → success, 그 외 info).
// ToastHost가 마운트되지 않은 화면(로그인 전 등)에서는 예전처럼 window.alert로 폴백한다.

export type NotifyTone = 'info' | 'success' | 'error' | 'warning';

export interface NotifyEvent {
  id: string;
  message: string;
  tone: NotifyTone;
  durationMs: number;
}

const EVENT = 'crm:notify';
let hostCount = 0;

export function registerNotifyHost(): () => void {
  hostCount += 1;
  return () => { hostCount = Math.max(0, hostCount - 1); };
}

// 톤 추론 — 전수 점검(2026-11-19, 104건)에서 "…입력해주세요/선택해주세요/필요합니다/못했습니다/이미 있는" 같은 검증 안내 26건이 info로,
// "…추가했습니다/익명화했습니다/처리했습니다" 같은 완료 안내 7건이 info로 읽혔다. error(화면 낭독기 role=alert) → warning → success 순.
function inferTone(message: string): NotifyTone {
  if (/실패|오류|없습니다|불가|초과|올바르|확인해|필수|부족|잘못|않았습니다|다릅니다|같습니다|취소에|입력해s?주세요|입력하세요|선택해s?주세요|선택하세요|해s?주세요|필요합니다|못했습니다|이미 (있|등록)|찾지 못|이상이어야 합니다|맞지 않습니다|받지 못해/.test(message)) return 'error';
  if (/주의|어긋|다시 시작|권장|없어|끊겨|돌아갑니다/.test(message)) return 'warning';
  if (/완료|저장했|성공|추가되|가져왔|등록했|발송했|추가했|익명화했|처리했|되돌렸|복구했|삭제했|변경했|바꿨|보냈|불러왔|병합했|내려받았|복원했|기록했|켰습니다|껐습니다|넣었습니다/.test(message)) return 'success';
  return 'info';
}

function emit(message: string, tone?: NotifyTone) {
  const text = String(message ?? '').trim();
  if (!text) return;
  const resolved = tone ?? inferTone(text);
  if (hostCount === 0 || typeof window === 'undefined') {
    try { window.alert(text); } catch { /* 비브라우저 환경 */ }
    return;
  }
  const event: NotifyEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    message: text,
    tone: resolved,
    durationMs: resolved === 'error' || resolved === 'warning' ? 6500 : 4000,
  };
  window.dispatchEvent(new CustomEvent<NotifyEvent>(EVENT, { detail: event }));
}

type NotifyFn = ((message: string, tone?: NotifyTone) => void) & {
  info: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
};

export const notify: NotifyFn = Object.assign(
  (message: string, tone?: NotifyTone) => emit(message, tone),
  {
    info: (message: string) => emit(message, 'info'),
    success: (message: string) => emit(message, 'success'),
    error: (message: string) => emit(message, 'error'),
    warning: (message: string) => emit(message, 'warning'),
  },
);

export function onNotify(cb: (event: NotifyEvent) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<NotifyEvent>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
