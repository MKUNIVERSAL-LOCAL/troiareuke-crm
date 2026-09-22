# 인수인계 — 노트북 → 회사 PC (2026-09-22)

지점 신청/승인 기능 배포. 노트북(격리 규칙)에서는 로컬 검증만 하고 여기서 멈춤. 회사 PC 세션에서 이어서 실행.

---

## 오늘 노트북 세션에서 검증한 것 (실행 X)

- ✅ TypeScript 컴파일 0 에러 (`npx tsc --noEmit`)
- ✅ 코드 변경 4개 파일 상태 확인 — 3일 전 세션(2026-09-18) 결과물 그대로 살아있음
  - `server/src/server.js` (+111/-32) — pending 저장, login 차단, 승인/거부 API 3개
  - `src/lib/authApi.ts` (+72/-3) — applyForAccount + admin 승인 함수 3개
  - `src/pages/Auth/Signup.tsx` (+74/-25) — 신청 폼 + 심사 대기 화면(step 3)
  - `src/pages/Admin/Users.tsx` (+238/-9) — 승인 대기 탭 + 검토 모달
- ✅ **NAS 서버 프로덕션은 여전히 옛 코드 확인** — `POST /api/auth/signup` 스모크에서 `HTTP 403 "관리자가 발급한 계정만…"` 응답. 새 코드였다면 `{pending:true}` 였음.
- ✅ 배포된 exe도 옛 화면일 것으로 추정 (재빌드 흔적 없음)

---

## 회사 PC 세션에서 이어갈 때 첫 명령

**대화창에 이렇게 붙여넣으세요:**

```
자비스, 노트북에서 어제 하다 만 지점 신청/승인 배포 이어가자.
docs/handoff/HANDOFF-2026-09-22-signup-approval.md 읽고,
현재 F:\dev\crm-claude 상태와 OneDrive 폴더 상태 비교해서
변경분 반영 안 됐으면 자동으로 apply해줘.
```

자비스가 자동으로 할 것:
1. 현재 폴더(`F:\dev\crm-claude` 또는 OneDrive)에서 `git status`로 변경분 존재 확인
2. 변경분 없으면 → OneDrive의 `docs/handoff/signup-approval-2026-09-22.patch`를 `git apply`
3. TSC 재검증
4. NAS 재배포 → exe 재빌드 → 채널 게시 순서로 진행

---

## 변경분 자동 반영 로직 (자비스가 실행할 판단)

**케이스 1** — 회사 PC를 `F:\dev\crm-claude`에서 여는 경우 (권장, CLAUDE.md 정본 경로)

```bash
cd F:\dev\crm-claude
git status
# 만약 4개 파일이 modified 아님 → 노트북 변경분 없음
git apply "C:\Users\99048\OneDrive\바탕 화면\06_개발프로젝트\전체 작업폴더\트로이아르케-CRM\docs\handoff\signup-approval-2026-09-22.patch"
git status  # 4개 파일 modified 확인
npx tsc --noEmit
```

**케이스 2** — OneDrive 폴더에서 그대로 이어가는 경우

- OneDrive 자동 동기화로 노트북 변경분이 이미 회사 PC에 반영되어 있음
- `git status`로 modified 4개 확인만 하고 바로 다음 단계로

**케이스 3** — 이미 변경분이 반영되어 있는 경우

- patch가 no-op이거나 conflict 나면 이미 반영된 것 → 다음 단계로 진행

---

## 배포 실행 순서 (회사 PC 전용)

### Phase A — NAS 서버 재배포

절차: `docs/NAS-REDEPLOY-RUNBOOK.md`

```powershell
# 1. server 소스 전송 (F:\dev\crm-claude 기준)
scp -r server ys-lee0223@mkcorp.familyds.com:/tmp/crm-server-update

# 2. NAS SSH 접속 후:
sudo -i
cp -a /volume1/docker/troiareuke-crm-server /volume1/docker/troiareuke-crm-server.bak-0922
rsync -a --exclude='.env' /tmp/crm-server-update/ /volume1/docker/troiareuke-crm-server/
cd /volume1/docker/troiareuke-crm-server
/usr/local/bin/docker-compose -p troiareuke-crm up -d --build auth-api

# 3. 검증
curl -s http://127.0.0.1:8787/health
# PC에서: curl -X POST https://crm-api.mkcorp.familyds.com/api/auth/signup ...
#         → 200 {pending:true} 이면 성공
```

**⚠️ SSH 이슈**: 노트북 SSH 키(`jarvis-mainpc-2026`)가 authorized_keys 등록 안 된 것으로 3일 전 확인. 회사 PC의 기존 SSH 키(`ys-lee0223`)는 살아있을 것으로 추정 — 회사 PC에서는 문제 없을 가능성 높음. 안 되면 DSM FileStation API 우회.

### Phase B — 어드민 exe 재빌드 + 배포

**⚠️ 사고 방지 필수 체크리스트** (`feedback_env_admin_build.md`)
1. 빌드 전 `.env.local` **삭제 필수** (v1.0.34 오염 exe 실사고)
2. `.env` 존재 + `VITE_AUTH_API_URL=https://crm-api.mkcorp.familyds.com` 확인
3. `npm run electron:build:admin` (또는 `electron:build:admin:dir`)
4. `release/win-unpacked/resources/app.asar` grep 검증:
   - Supabase 프로젝트 마커: `hmgxhrtqfbffqrleorxf`
   - NAS URL 마커: `crm-api.mkcorp.familyds.com`
5. CDP 런타임 검증 (`verify-build.mjs` 패턴) — `window.electronAPI.isAdminBuild === true`
6. OneDrive `트로이아르케-CRM-어드민/` 폴더에 배포 (robocopy, `/MIR` 절대 금지)

### Phase C — 지점(고객)용 exe 재빌드 + 채널 게시

**핵심**: `docs/DISTRIBUTION-POLICY.md` 배포 불변 원칙 준수 (재다운로드 금지, 인앱 자동 업데이트만)

1. `.env.local` 삭제 + `.env` 검증
2. `npm run electron:build` (지점용)
3. 채널용 매니페스트 준비: `scripts/prepare-portable-update.mjs`
4. asar grep 검증 (지점용은 `isAdminBuild === false`)
5. 채널 서버 업로드: `https://crm-update.mkcorp.familyds.com/`
6. `node scripts/check-distribution-invariants.mjs` 통과 확인
7. `npm run verify:nas`로 채널 라이브 확인
8. 48시간 후 어드민 대시보드에서 구버전 지점 0곳 확인

### Phase D — 스모크 (End-to-End)

1. 지점 exe 실행 → 회원가입 화면에서 사업자등록증 사진 첨부 → 신청 → step 3 심사 대기 화면 확인
2. 어드민 exe 실행 → 사용자 관리 → 승인 대기 탭 → 신청 발견 → 검토 모달 → 사업자등록증 확인 → 승인
3. 지점 exe에서 다시 로그인 시도 → 성공
4. 별도 계정 만들어 거부 테스트 → 다음 로그인 시 사유 표시 확인

### Phase E — 기록 & 커밋

1. `docs/DEPLOY-RECORD-2026-09-22-signup-approval.md` 작성
2. `git add -p` 후 커밋 (feat: 지점 신청/승인 흐름 배포)
3. `git push origin main`
4. 메모리 `project_signup_approval_wip.md` 삭제 (완료 후) 또는 이력 메모리로 갱신

---

## 참고 문서

- `docs/NAS-REDEPLOY-RUNBOOK.md` — NAS 도커 재배포 절차
- `docs/DISTRIBUTION-POLICY.md` — 배포 불변 원칙 (재다운로드 금지)
- `docs/BRANCH-INSTALL-GUIDE.md` — 지점 대응 카드
- `CLAUDE.md` — 코어 잠금, .env 검증, 3모드(로컬/NAS/Supabase) 검토 규칙
- 메모리: `feedback_env_admin_build.md`, `feedback_laptop_isolation.md`, `project_signup_approval_wip.md`

## 배경 (오너 결정, 2026-09-18)

기존 "발급제"에서 → 지점 자체 신청 → 사업자등록증 사진 업로드 → 어드민(mkclub21@gmail.com)이 서류 확인 후 승인/거부.
국세청 API 자동 검증은 추후 (오너가 공공데이터포털 키 발급 후).

## 남은 미해결

- **SSH 키 이슈** (노트북 한정) — 회사 PC에서는 기존 키로 정상일 것으로 추정
- **DSM 비번 노출** — 3일 전 전사록에 노출됨. 오너 비번 변경 권장

---

**작성**: 자비스 (노트북 세션, 2026-09-22)
**대상**: 다음 회사 PC 세션 자비스
**격리 규칙**: `feedback_laptop_isolation.md` 준수, 프로덕션 실행은 회사 PC에서만

---

## 작업내역 갱신 — 회사 PC 반영 (2026-09-22, MKuni)

### 노트북 작업 누적 요약 (2026-09-18 ~ 09-22)
| 날짜 | 장소 | 내용 |
|------|------|------|
| 09-18 | 노트북 | 오너 결정(발급제 → 지점 자체 신청 + 사업자등록증 첨부 + 어드민 승인/거부) 반영 코드 작성. 4파일 +444/-51 |
| 09-22 | 노트북 | TSC 0 확인, NAS 프로덕션이 옛 코드임을 스모크로 확인(403), 패치·인수인계 문서 작성. 격리 규칙으로 배포 미실행 |
| 09-22 | 회사 PC | 아래 반영 |

### 변경 내용 상세 (패치 기준)
- **DB**: `auth_users`에 `status text NOT NULL DEFAULT 'approved'`, `reject_reason text` 컬럼 추가(`ALTER TABLE ... IF NOT EXISTS`, 서버 기동 시 자동)
- **서버 API 신규 3개** (superadmin 전용): `GET /api/admin/users/:id/application`, `POST /api/admin/users/:id/approve`, `POST /api/admin/users/:id/reject`
- **서버 동작 변경**: signup → `status='pending'` 저장 후 `{pending:true}` 응답, login → pending/rejected 계정 차단(거부 사유 노출)
- **클라이언트 `authApi.ts`**: `applyForAccount`, `adminGetApplication`, `adminApproveUser`, `adminRejectUser`
- **화면**: 회원가입 신청 폼 + 심사 대기(step 3), 어드민 사용자 관리 '승인 대기' 탭 + 검토 모달

### 회사 PC에서 오늘 수행한 것
- ✅ `C:\dev\troiareuke-crm`(정본 클론) `git pull --ff-only` → 39cfb45 (origin/main 최신)
- ✅ 패치 `git apply` 성공 → 4파일 modified, OneDrive 작업본 diff와 바이트 단위 동일 확인
- ✅ `npx tsc --noEmit` 0 에러
- ✅ NAS `/health` ok, `POST /api/auth/signup` → 여전히 **403(옛 코드)** — 서버 미배포 상태 확정
- ⏸ 코드 커밋·NAS 재배포·exe 재빌드·채널 게시(Phase A~E)는 **미실행** (오너 지시 후 진행)

### 현재 상태 한 줄
코드는 정본(C:\dev)과 OneDrive 양쪽에 미커밋 상태로 동기화 완료, TSC 통과. 프로덕션(NAS·exe)은 아직 옛 코드.
