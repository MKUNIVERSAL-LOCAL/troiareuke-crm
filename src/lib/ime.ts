import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Enter가 한글(IME) 조합 확정인지 — 이때 Enter는 "글자 확정"이지 "전송/검색/추가"가 아니다.
 * Chrome·Firefox는 조합 중 keydown에 isComposing=true로 오고, Safari·WKWebView(아이폰 앱)는 compositionend 뒤에
 * isComposing=false·keyCode 229로 한 번 더 온다 — 두 경우를 함께 걸러야 반쪽 글자가 나가지 않는다 (리뷰 2026-11-18).
 * keyCode는 deprecated지만 WebKit에서 이 신호를 대신할 것이 없다.
 */
export const isImeKey = (e: ReactKeyboardEvent): boolean => e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
