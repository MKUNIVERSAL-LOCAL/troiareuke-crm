# 배포 기록 — 2026-09-22 v1.0.59 지점 가입 신청→어드민 승인 흐름

## 배경
- 오너 결정(2026-09-18): 발급제 → 지점 자체 신청(사업자등록증 사진 첨부) → 슈퍼어드민이 서류 확인 후 승인/거부. 국세청 API 자동검증은 추후.
- 노트북 세션(09-18~22)에서 코드 작성, 격리 규칙으로 배포 미실행 → 인수인계 문서(`docs/handoff/HANDOFF-2026-09-22-signup-approval.md`)로 회사 PC에 전달.

## 회사 PC(MKuni) 수행 내역 (2026-09-22 18:00~19:20)
1. 정본 클론 `C:\dev\troiareuke-crm` 최신화 후 노트북 패치 apply, TSC 0.
2. 코드 리뷰(에이전트) 8건 → 7건 수정:
   - HIGH 인증 없는 7MB 이미지 무제한 저장 → `signupLimiter`(성공 요청도 집계, 시간당 IP 5회, `SIGNUP_IP_LIMIT`) + 승인 대기 상한(`SIGNUP_PENDING_CAP`=100, 초과 시 503)
   - HIGH server smoke가 옛 403을 기대 → 신청→로그인 차단→거부→재신청→승인→로그인 전 흐름 테스트로 교체
   - `ALLOW_PUBLIC_SIGNUP` 죽은 설정 제거(.env.example·compose·README·ONBOARDING-STANDARD 갱신)
   - 거부된 신청 같은 이메일 재신청 허용(정보·서류 갱신 후 pending 복귀)
   - 어드민 검토 모달 장식 링크(`data:` 새 탭, Electron이 차단) 제거, 전체 탭 '신청 거부됨' 배지
   - 데드코드(`applicationStatus`, 도달 불가 세션 분기) 제거, 이미지 jpg·png·webp만(HEIC 차단)
   - 미수정: 없음 (LOW 8건 중 HEIC 포함 전부 반영)
3. E2E 회귀: 패치가 로컬/Supabase 모드 버튼 문구까지 '가입 신청하기'로 바꿔 스모크 실패 → 서버 모드에서만 바꾸도록 수정. Playwright 3/3 통과.
4. PR #49 (CI 7건 통과: server smoke 실 Postgres 포함) 머지 → PR #50 릴리스 히스토리 자동생성 커밋 머지.
5. `npm run release:all`: 게이트 3종·E2E·설치파일+포터블+zip 빌드·스테이징·GitHub Release v1.0.59 게시 성공. NAS 채널 게시는 SSH 키 미등록으로 실패(예상).
6. NAS: DSM 작업 스케줄러 `CRM-publish-update`·`CRM-server-update` 수동 실행(브라우저, 오너 DSM 로그인 후 Claude 수행). 두 작업 모두 **비활성 상태**였음(자동 실행 안 됨).
7. 어드민 exe: `release-admin\win-unpacked\` 재빌드(v1.0.59, isAdminBuild=true CDP PASS, asar 마커 3종 OK).

## 검증 결과
| 항목 | 결과 |
|------|------|
| `npm run verify:nas` | 5/5 PASS (헬스·브랜드·기능관리 401·로그인 4xx·채널 v1.0.59) |
| 채널 sha256 (exe/zip/설치파일) | 스테이징과 3종 일치 (be2c64c2 / 507d2152 / 38575b98) |
| 서버 새 코드 | `POST /api/auth/signup` 서류 없음 → 400 (구버전은 403) |
| 프로덕션 신청 스모크 | 201 pending(세션 없음) → 로그인 403 "심사 대기" → 중복 409 → 어드민 라우트 401 |
| 지점 exe CDP | isAdminBuild=false, v1.0.59 PASS |

## 남은 것
- **오너 UAT**: 어드민 exe(`C:\dev\troiareuke-crm\release-admin\win-unpacked\트로이아르케 CRM 어드민.exe`) → 사용자 관리 → [승인 대기] 탭에서 테스트 신청(`signup-test-0922@example.com`, 이름은 터미널 인코딩 탓에 깨져 보임 — 앱에서 넣은 신청은 정상) 확인 후 **거부**(사유: 테스트)로 정리.
- **48시간 내 구버전 지점 0곳** 확인(어드민 대시보드) — 릴리스 완료 조건.
- SSH 키 등록: 이 PC 공개키(`~/.ssh/id_ed25519.pub`, 주석 crm-deploy-claude)를 NAS `ys-lee0223` authorized_keys에 등록하면 다음 릴리스부터 채널 게시·서버 배포가 PC에서 자동 완료. DSM에 `ssh-key-setup` 작업이 이미 있음(내용 미확인).
- DSM 두 CRM 작업 "활성화됨" 체크 + 반복 "매일"로 설정하면 무인 경로 복구(현재 비활성).
- mobile-android 워크플로: setup-android 'tools' 패키지 소멸로 실패 → `packages: platform-tools`로 수정(이 커밋). 재실행으로 확인 필요.
- 바탕화면 바로가기 '트로이아르케 CRM.lnk'가 OneDrive 폴더의 없는 exe를 가리킴(죽은 링크) — 설치형(`%LOCALAPPDATA%\Programs\troiareuke-crm`)으로 교체 권장.
