# 🔒 코어코드 보호장치 (CORE LOCK)

> 목적: **이후 어떤 작업을 해도 코어코드를 실수로 건드리지 못하게** 막는다.
> 코어가 깨지면 전 기능이 죽는다(회귀). 그래서 코어는 잠그고, 나머지(페이지)만 자유롭게 수정·최적화한다.

## 보호 대상 (코어)

`scripts/core-lock.mjs` 의 `CORE_FILES` / `CORE_DIRS` 가 **단일 소스**다. 현재 목록(350 에서 정본과 대조 — 그때까지 **배포 관련 세 파일이 이 표에만 빠져** 있었다. CLAUDE.md 6절은 적고 있었지만 상세로 가리키는 이 문서에 없어서, 이 문서만 본 세션은 "잠금이 아니다" 라고 믿을 수 있었다):

| 파일 | 역할 |
|---|---|
| `src/lib/store.ts` | 중앙 데이터 스토어(17개 Store 모듈) — 핵심 중의 핵심 |
| `src/lib/supabase.ts` | Supabase 클라이언트 + 핵심 타입 |
| `src/lib/payment.ts` | 결제 |
| `src/lib/loginLog.ts` | 로그인 로그 |
| `src/lib/masking.ts` | PII 마스킹 |
| `src/lib/googleCalendar.ts` | 캘린더 연동 |
| `src/contexts/AuthContext.tsx` | 인증·세션 |
| `src/App.tsx` | 라우팅 + 권한 가드 |
| `src/main.tsx` | 부트스트랩 + OAuth 콜백 |
| `electron/main.cjs`, `electron/preload.cjs` | Electron 코어(백업·IPC·autoUpdater) |
| `electron/portable-updater.cjs` | 포터블 exe 무인 업데이트(내려받기 → 종료 시 적용) — 재다운로드 금지 원칙의 핵심 |
| `scripts/prepare-portable-update.mjs` | 포터블·폴더형 업데이트 꾸러미 생성(하위호환 브리지) |
| `src/lib/updateChannel.ts` | 설치 안내 주소(`INSTALL_SITE_URL`·`INSTALL_GUIDE_MESSAGE` — 6절 "신규 설치는 배포 사이트로만" 의 유일한 출처)·채널 매니페스트 주소·버전 비교(`compareVersions`·`isOutdated`·`isStale`) |
| `supabase/**` | RLS·마이그레이션 SQL 전체 |

> **여기 없는 것**: 모바일 **필수 업데이트**(최소 지원 버전) 판정은 `src/lib/mobileUpdate.ts`·`src/components/ui/MobileUpdateBanner.tsx` 에 있고 **잠금이 아니다**. 352 에서 이 표가 그 기능을 `updateChannel.ts` 의 것으로 잘못 적어 두었던 것을 고쳤다(349~351 리뷰 M-3).

## 2중 차단 구조

1. **Claude Code 훅** (`.claude/settings.json` → `scripts/claude-core-guard.mjs`)
   - Claude Code 가 코어 파일을 Edit/Write/MultiEdit 하려 하면 **그 자리에서 거부**.
   - ⚠️ **이 폴더(`C:\dev\troiareuke-crm`)를 열고 작업할 때만** 작동한다. 다른 폴더에서 이 repo를 편집하면 훅이 안 걸린다.

2. **git pre-commit 훅** (`.githooks/pre-commit` → `scripts/core-lock.mjs`)
   - 코어 파일이 스테이징되면 **커밋 거부**. (Claude 외 다른 에디터·도구로 고쳐도 커밋 단계에서 차단)
   - 활성화: `git config core.hooksPath .githooks` (clone 직후 1회. 아래 setup 참조)

## 최초 설정 (clone 직후 1회)

```bash
git config core.hooksPath .githooks
```

> Claude 훅은 `.claude/settings.json` 이 repo에 포함되어 있어 별도 설정 불필요.

## 코어를 정말 고쳐야 할 때 (의도적 우회)

코어 수정은 회귀 위험이 크므로 **반드시 의식적으로** 한다:

- **커밋 우회**: `CORE_EDIT=1 git commit -m "core: ..."`
- **Claude 편집 우회**: 환경변수 `CORE_EDIT=1` 을 준 상태로 Claude Code 세션 실행
- 코어 수정 후에는 **반드시** `npm run build`(tsc 포함) + 전 기능 회귀 점검(CLAUDE.md 원칙 4).

## 목록 변경

보호 대상을 추가/제거하려면 `scripts/core-lock.mjs` 의 `CORE_FILES`/`CORE_DIRS` 만 수정하면 양쪽 훅에 동시 반영된다.
