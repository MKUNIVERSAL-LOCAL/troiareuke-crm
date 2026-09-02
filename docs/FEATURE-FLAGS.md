# 기능 제어 (Feature Flags) 아키텍처

본사(슈퍼어드민)가 어드민 콘솔에서 CRM의 모든 기능을 전역/지점별로 켜고 끄는 구조. 2026-09-02 도입.

## 구조 (3계층)

```
┌ 어드민 콘솔 /admin/features (src/pages/Admin/Features.tsx)
│    전역 기본값 + 지점별 오버라이드 매트릭스 → PUT /api/admin/feature-flags/:scope
▼
┌ NAS 중앙 서버 feature_flags 테이블 (server/src/server.js)
│    scope('global' | branch_id) → flags JSONB { 기능id: boolean }
▼
┌ 지점 클라이언트
     Layout 마운트 시 GET /api/feature-flags → localStorage 캐시 → 오프라인 폴백
     해석 우선순위: 지점 오버라이드 > 전역 > 레지스트리 기본값 (> 기기 토글)
```

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `src/lib/featureRegistry.ts` | **기능 카탈로그 단일 소스** — 새 기능 추가는 여기 한 곳만 |
| `src/lib/featureFlags.ts` | 해석 엔진 + NAS 동기화 + 캐시 + 하위호환 API |
| `src/hooks/useFeature.ts` | React 구독 훅 (`useFeature`, `useFeatureAllowed`, `useFeatureFlagsTick`) |
| `src/components/FeatureGate.tsx` | Layout Outlet을 감싸는 라우트 게이트 (꺼진 모듈 → 안내 화면) |
| `src/pages/Admin/Features.tsx` | 슈퍼어드민 제어 UI (`/admin/features`) |
| `server/src/server.js` | `feature_flags` 테이블(자동 생성) + API 3종 |

## 적용 지점

- **메뉴 숨김**: `Sidebar.tsx`, `MobileTabBar.tsx` — 꺼진 모듈은 메뉴에서 제외
- **페이지 차단**: `Layout.tsx`의 `FeatureRouteGate` — URL 직접 접근도 안내 화면
- **부가 기능**: `RevisitReminderCard`(대시보드 카드), `customers.beacon`(Settings 토글 노출)
- **selfGated**: `module.aiChat`은 페이지 자체 Coming Soon 처리 — 메뉴에 SOON 배지로 남음

## 기기 토글 (deviceToggle)

`customers.beacon`처럼 어드민 허용 + 샵 관리자의 기기별 토글이 모두 켜져야 동작하는 기능.
localStorage 키는 기존 `feature_beacon_consultation` 그대로 유지(하위호환).

## 의도적으로 제외한 것

- `PAYMENT_ENABLED`(구독 실결제)는 하드코딩 유지 — PG 계약 전 원격 실수 방지.
- 대시보드/설정 페이지는 제어 대상 아님(항상 표시).

## 새 기능을 어드민 제어에 추가하는 법

1. `featureRegistry.ts`의 `FEATURES`에 항목 추가 (id/label/기본값, 모듈이면 route)
2. 페이지 내부 세부 기능이면 해당 컴포넌트에서 `useFeature('id')`로 분기
3. 끝 — 어드민 콘솔 UI·서버·동기화는 자동 반영

## 구버전/오프라인 동작

- NAS 서버가 구버전(엔드포인트 없음)이거나 오프라인 → 조용히 캐시/기본값으로 동작 (화면 깨짐 없음)
- NAS 미연동 빌드(Supabase/로컬) → 레지스트리 기본값 + 기기 토글만 (원격 제어 불가, /admin/features는 열람 전용)
