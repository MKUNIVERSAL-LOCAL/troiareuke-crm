# Codex 작업 인수인계 — 2026-07-16

## 작업 목적

- OneDrive 실행본에서 회원가입 시 `서버에 연결할 수 없습니다` 오류가 발생하는 문제를 점검·수정한다.
- 소스 정본은 `F:\dev\troiareuke-crm`, 실행본 배포 대상은 아래 OneDrive 폴더로 고정한다.
  - `F:\OneDrive\바탕 화면\06_개발프로젝트\전체 작업폴더\트로이아르케-CRM`

## 확인한 원인

1. NAS 인증 서버와 DB의 `/health`는 정상이었다.
2. 기존 실행본은 `VITE_AUTH_API_URL=https://crm-api.mkcorp.familyds.com`을 내장했지만, 프로덕션 CSP의 `connect-src`에 해당 호스트가 없어 브라우저 보안 정책이 요청을 차단했다.
3. NAS 인증을 사용하면 Supabase 세션이 생성되지 않지만 CRM 데이터 RLS는 `auth.uid()`에 의존한다. 계정 이전과 RLS 통합 전에는 NAS 인증을 기본값으로 사용할 수 없다.
4. 업데이트 manifest URL은 현재 404를 반환해 불필요한 업데이트 오류를 만들었다.

## 적용한 수정

- 기본 인증 제공자를 Supabase로 고정했다.
- `VITE_AUTH_PROVIDER=nas`를 명시한 경우에만 NAS 인증을 사용한다.
- 이전 NAS 시험 토큰을 Supabase 모드 시작 시 제거한다.
- Supabase 세션이 없는데 저장된 사용자 정보만 남아 인증된 것처럼 보이는 상태를 차단했다.
- CSP에 `https://crm-api.mkcorp.familyds.com`을 추가했다.
- 업데이트 manifest 404는 미게시 상태로 취급해 UI 오류를 보내지 않는다.
- 릴리스 워크플로와 환경변수 예시를 Supabase 기본값에 맞췄다.
- 앱 버전을 `1.0.26`으로 올렸다.
- OneDrive 삭제 없는 저동시성 배포 스크립트 `scripts/deploy-onedrive.ps1`과 npm 명령을 추가했다.

## 수행한 검증과 배포

- `npm ci` 성공(880 packages).
- TypeScript + Vite 프로덕션 빌드 성공.
- `electron-builder --win --dir` 성공.
- 빌드된 `app.asar` 내부 확인:
  - 버전 `1.0.26`
  - Supabase 호스트 포함
  - publishable key 포함
  - NAS API 호스트 및 CSP 허용 포함
- OneDrive 실행본으로 배포 완료.
- 빌드 원본과 배포된 EXE/app.asar의 SHA-256 일치 확인.
- `_deployment-version.txt` 기록:
  - version `1.0.26`
  - source `F:\dev\troiareuke-crm`

## 아직 확인해야 할 사항

- 사용자는 배포 후 `이전 버전이 적용 안 된 것 같다`고 보고했다. 이 보고 이후 추가 진단은 하지 못했다.
- 노트북에서 다음을 우선 확인한다.
  1. 실행 중인 모든 CRM 프로세스를 종료한다.
  2. OneDrive 동기화가 완료됐는지와 `_deployment-version.txt`가 `1.0.26`인지 확인한다.
  3. 실행 파일의 실제 경로가 위 OneDrive 배포 폴더인지 확인한다.
  4. 신규 이메일로 회원가입을 재현한다.
  5. 계속 실패하면 Electron 콘솔/네트워크 또는 NAS 서버 로그에서 실제 응답을 확인한다.
- 기존 NAS `auth_users` 계정과 Supabase Auth 계정의 자동 이전은 구현하지 않았다.
- NAS 인증을 정식 활성화하려면 Supabase JWT/RLS 연동 설계를 먼저 완료해야 한다.

## 노트북에서 이어가기

```bash
git fetch origin
git switch codex/crm-server-connection-v1.0.26
npm ci
```

노트북의 드라이브/OneDrive 경로가 다르면 `deploy:onedrive`의 대상 경로를 먼저 조정한다. Supabase 키나 기타 비밀값은 저장소에 커밋하지 말고 GitHub Actions secrets 또는 로컬 환경변수로 제공한다.
