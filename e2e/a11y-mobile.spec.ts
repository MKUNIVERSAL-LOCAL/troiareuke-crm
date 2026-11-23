import { defineA11yGate } from './a11y-shared';

// 모바일 폭(mobile 프로젝트 — 파일명이 mobile.spec.ts 필터에 걸린다) — 본문은 e2e/a11y-shared.ts
defineA11yGate('모바일 폭에서도 지점 화면 전부에 serious·critical 접근성 위반이 없고 가로 넘침이 없다', 'AXM', { overflow: true });
