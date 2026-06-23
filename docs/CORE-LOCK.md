# 🔒 코어코드 보호장치 (CORE LOCK)

> 목적: **이후 어떤 작업을 해도 코어코드를 실수로 건드리지 못하게** 막는다.
> 코어가 깨지면 전 기능이 죽는다(회귀). 그래서 코어는 잠그고, 나머지(페이지)만 자유롭게 수정·최적화한다.

## 보호 대상 (코어)

`scripts/core-lock.mjs` 의 `CORE_FILES` / `CORE_DIRS` 가 **단일 소스**다. 현재 목록:

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
| `supabase/**` | RLS·마이그레이션 SQL 전체 |

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
