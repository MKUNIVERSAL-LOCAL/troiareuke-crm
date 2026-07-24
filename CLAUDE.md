# 트로이아르케 CRM — 작업 규칙 (모든 AI 세션 공통)

## 1. 코어코드 잠금 (절대 규칙)
- 코어 파일은 **수정 금지**. 목록의 단일 소스: `scripts/core-lock.mjs` (store.ts, supabase.ts, payment.ts, loginLog.ts, masking.ts, googleCalendar.ts, AuthContext.tsx, App.tsx, main.tsx, electron/*, supabase/**)
- 코어를 정말 고쳐야 하면 **오너 승인 후 `CORE_EDIT=1`** 로만. 상세: `docs/CORE-LOCK.md`
- 코어에 손대지 않고 해결하는 우회 패턴 우선: 별도 lib 파일(consultationStore.ts 방식), 페이지 레벨 처리, 쿼리 파라미터 탭(`/admin/statistics?view=data` 방식)

## 2. 쓰레기코드 방지 (상시 규칙)
- **새 데드코드를 만들지 않는다**: 미사용 export·import·파일·주석처리 블록을 남기지 말 것. 기능을 빼면 관련 코드도 같이 삭제.
- **작업 중 발견한 데드코드는 그 자리에서 정리**한다 (단, 코어 내부는 기록만).
- 장식 UI 금지: onClick 없는 버튼, 저장 안 되는 입력, 상태와 무관한 배지 등 "동작하는 척"하는 요소를 만들지 않는다.
- 가짜 성공 금지: supabase 호출은 반드시 `{ error }` 확인, 실패를 사용자에게 알린다.
- 폐기된 문서는 삭제 대신 `docs/archive/`로 이동 (기록 보존).

## 3. 검증 없이 완료 보고 금지
- 수정 후: `npx tsc --noEmit` 0 에러 + `npm run build` 통과 확인.
- 사용자에게 "테스트해보세요" 전에: 백엔드 생존 확인(NAS `/health`, Supabase) + 가능하면 E2E/스모크.
- 회귀 점검: 변경 함수의 호출자 전수 추적 (상위 CLAUDE.md 원칙 4).

## 4. 기록
- 배포·수정 내역은 `docs/DEPLOY-RECORD-*.md` 등 .md로 남기고 git에 커밋한다.
- NAS 서버 배포는 `docs/NAS-REDEPLOY-RUNBOOK.md` 절차(작업 스케줄러, SSH 불필요)를 따른다.

## 5. 릴리스·빌드 함정 (2026-07-24 실사고 기록)
- **빌드 전 `.env.local` 삭제 필수** — QA용 오버라이드가 남으면 서버 연결이 빠진 오염 exe가 배포된다(v1.0.34 실사고). vite.config.ts가 빌드 시 존재하면 throw하는 가드 있음.
- **ENV 마커 검증은 `release/win-unpacked/resources/app.asar`에서** — 포터블 exe는 7z 압축이라 Select-String이 항상 False(오탐). 검사 패턴: `hmgxhrtqfbffqrleorxf`(Supabase)와 `crm-api.mkcorp.familyds.com`(NAS).
- **버전 범프·한글 파일 수정은 Edit 도구로만** — PowerShell `-replace | Set-Content`는 CP949로 한글을 파손시킨다.
- **exe는 빌드 후 CDP 런타임 검증**(scratchpad verify-build.mjs 패턴): `--remote-debugging-port` + `window.electronAPI.isAdminBuild` 확인 (일반=false, 어드민=true).
- **logout()의 localStorage wipe는 서버 모드 전용** — 로컬 모드에서 wipe하면 유일한 저장소가 지워져 데이터 영구 소실(QA⑤ 치명 버그로 수정됨). 로그아웃 관련 변경 시 로컬/NAS/Supabase 3모드 모두 검토.

## 참고 경로
- 편집 정본: GitHub `MKUNIVERSAL-LOCAL/troiareuke-crm` main + 로컬 `F:\dev\crm-claude`
- OneDrive `트로이아르케-CRM/`은 **빌드 배포본**(편집 금지), 배포는 robocopy(/MIR 절대 금지 — 고객 데이터 폴더 보존)
- 어드민 배포본: OneDrive `트로이아르케-CRM-어드민/`
