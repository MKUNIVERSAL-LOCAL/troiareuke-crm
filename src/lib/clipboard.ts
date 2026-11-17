// ═══════════════════════════════════════════════════════════════
// clipboard — 복사 공용 (비코어, 2026-11-18)
// ───────────────────────────────────────────────────────────────
// navigator.clipboard는 구형 Android WebView·비보안 컨텍스트에서 undefined이거나 reject한다.
// 숨김 textarea + execCommand('copy') 폴백까지 시도하고, 결과를 boolean으로 돌려 호출 쪽이 "복사됨"을 거짓으로 띄우지 않게 한다.
// ═══════════════════════════════════════════════════════════════

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 폴백으로 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
