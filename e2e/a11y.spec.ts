import { defineA11yGate } from './a11y-shared';

// PC 폭(chromium 프로젝트) — 본문은 e2e/a11y-shared.ts
defineA11yGate('지점 화면 전부에 serious·critical 접근성 위반이 없다', 'AX');
