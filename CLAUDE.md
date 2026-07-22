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

## 참고 경로
- 편집 정본: GitHub `MKUNIVERSAL-LOCAL/troiareuke-crm` main + 로컬 `F:\dev\crm-claude`
- OneDrive `트로이아르케-CRM/`은 **빌드 배포본**(편집 금지), 배포는 robocopy(/MIR 절대 금지 — 고객 데이터 폴더 보존)
- 어드민 배포본: OneDrive `트로이아르케-CRM-어드민/`
