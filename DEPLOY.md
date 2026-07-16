# 트로이아르케 CRM — 배포 가이드

> 단독 실행 가능한 단계별 배포 매뉴얼 (한국어)  
> 최종 업데이트: 2026-05-07 | 대상: 사내 파일럿 → 외부 베타

---

## 사전 준비 — 반드시 먼저 할 것 (보안)

### PAT 정리 (git remote URL에 토큰이 박혀있음)

터미널(Git Bash 또는 명령 프롬프트)에서 프로젝트 디렉토리로 이동 후 실행:

```bash
# 현재 상태 확인 (ghp_ 토큰이 보이면 위험 상태)
git remote -v

# 토큰 제거
git remote set-url origin https://github.com/MKUNIVERSAL-LOCAL/troiareuke-crm.git

# 확인 (ghp_ 없으면 정상)
git remote -v
```

그런 다음 GitHub에서 기존 PAT 폐기:
```
GitHub → 우측 아이콘 → Settings → Developer settings
→ Personal access tokens → Tokens (classic)
→ 해당 토큰(ghp_pDBU...) → Delete
```

이후 `git push` 시 브라우저 인증 창이 뜨면 GitHub 계정으로 로그인합니다.

---

## STEP 1. Vercel PWA 배포 (최초 1회)

### 1-1. Vercel 계정 생성 및 저장소 연동

1. https://vercel.com 접속 → "Continue with GitHub" 로그인
2. "Add New..." → "Project"
3. "Import Git Repository" → `MKUNIVERSAL-LOCAL/troiareuke-crm` 선택
4. "Import" 클릭

### 1-2. 프로젝트 설정

Configure Project 화면에서:

| 항목 | 값 |
|------|---|
| Framework Preset | **Vite** (자동 감지됨) |
| Root Directory | `.` (변경 불필요) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |

Node.js 버전 설정 (중요):
- "Settings" 탭 → "General" → "Node.js Version" → **20.x** 선택

### 1-3. 환경변수 등록

"Environment Variables" 섹션에서 다음 두 항목을 반드시 입력:

```
VITE_SUPABASE_URL       = https://[프로젝트 ID].supabase.co
VITE_SUPABASE_ANON_KEY  = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Supabase 값 확인 경로:
```
https://app.supabase.com → 프로젝트 선택 → Settings → API
```

필요 시 추가:
```
VITE_GOOGLE_CLIENT_ID        = [Google Cloud Console에서 발급]
VITE_GOOGLE_REDIRECT_URI     = https://troiareuke-crm.vercel.app/google-callback
```

### 1-4. 배포 실행

"Deploy" 클릭 → 약 2~3분 후 배포 완료.

배포 완료 URL 예시: `https://troiareuke-crm.vercel.app`

### 1-5. PWA 자산 검증

배포 완료 후 터미널에서 실행:

```bash
BASE="https://troiareuke-crm.vercel.app"

curl -I "$BASE/sw.js"
# 기대값: HTTP/2 200, content-type: application/javascript

curl -I "$BASE/manifest.webmanifest"
# 기대값: HTTP/2 200, content-type: application/manifest+json

curl -I "$BASE/icons/icon-192.png"
# 기대값: HTTP/2 200, content-type: image/png
```

모두 200이면 PWA 배포 성공입니다.

---

## STEP 2. Supabase 환경변수 확인 및 도메인 허용

### 2-1. Supabase CORS 허용 도메인 추가

```
https://app.supabase.com → 프로젝트 → Authentication → URL Configuration
```

"Site URL" 및 "Redirect URLs"에 Vercel 도메인 추가:
```
https://troiareuke-crm.vercel.app
```

Google OAuth 사용 시 추가로:
```
https://troiareuke-crm.vercel.app/google-callback
```

### 2-2. 동일 Supabase 데이터 접근 검증

Electron(데스크톱)과 PWA(모바일)는 동일한 `VITE_SUPABASE_URL`을 바라봅니다.  
Supabase RLS가 정상 설정되어 있으면 두 클라이언트에서 같은 데이터를 볼 수 있습니다.

검증 방법:
1. Electron 앱에서 고객 1명 등록
2. 모바일에서 Vercel URL 접속 → 동일 계정으로 로그인 → 고객이 보이는지 확인

---

## STEP 3. GitHub Secrets 등록 (CI/CD용)

```
GitHub → 저장소 → Settings → Secrets and variables → Actions → New repository secret
```

등록할 항목:

| 이름 | 값 |
|------|---|
| `VITE_SUPABASE_URL` | Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_AUTH_PROVIDER` | 현재는 반드시 `supabase` |
| `VITE_AUTH_API_URL` | NAS 인증 시험 서버 URL(기본 인증에는 사용하지 않음) |

> `GITHUB_TOKEN`은 GitHub이 자동으로 제공합니다. 별도 등록 불필요.
> NAS 인증은 기존 계정 이전과 Supabase RLS 연동이 완료된 뒤에만 `nas`로 전환합니다.

등록 후 동작 확인:
- `main` 브랜치에 코드 push → GitHub Actions → "Auto Release EXE" 워크플로 실행 확인
- 약 10~15분 후 GitHub Releases 페이지에 새 버전 .exe 발행 확인

---

## STEP 4. 도메인 설정 (선택 — 외부 베타 시)

사내 파일럿에서는 `*.vercel.app` 임시 도메인으로 충분합니다.  
외부 베타 직전에 아래 순서로 진행합니다.

### 4-1. 도메인 구입

추천 등록처: 후이즈(whois.co.kr) 또는 가비아(gabia.com)

후보 도메인:
- `troiareuke-crm.com`
- `arkecrm.kr`
- `troiareuke.kr` (이후 `crm.troiareuke.kr` 서브도메인 활용)

### 4-2. Vercel 커스텀 도메인 연결

```
Vercel 대시보드 → 프로젝트 → Settings → Domains
→ 도메인 입력 → Add
→ DNS 설정 안내에 따라 가비아/후이즈에서 레코드 추가
```

DNS 전파 시간: 최대 24시간 (보통 30분~2시간).  
Vercel이 Let's Encrypt SSL 인증서를 자동 발급합니다.

### 4-3. 도메인 변경 후 필수 업데이트

- Supabase Authentication → URL Configuration 업데이트
- Google Cloud Console → OAuth 클라이언트 → 승인된 리디렉션 URI 업데이트
- `VITE_GOOGLE_REDIRECT_URI` 환경변수 Vercel에서 업데이트

---

## STEP 5. 사내 파일럿 직원 안내

### PWA (모바일·태블릿)

직원에게 안내할 내용:

```
트로이아르케 CRM 모바일 접속 방법

1. 스마트폰 Chrome(안드로이드) 또는 Safari(iPhone)으로 접속:
   https://troiareuke-crm.vercel.app

2. 로그인 후 "홈 화면에 추가":
   - 안드로이드: Chrome 우측 상단 ⋮ → "홈 화면에 추가"
   - 아이폰: Safari 하단 공유 아이콘(네모+위화살표) → "홈 화면에 추가"

3. 홈 화면의 아이콘을 탭하면 앱처럼 실행됩니다.
```

### Electron (데스크톱)

최신 버전 다운로드 링크:
```
https://github.com/MKUNIVERSAL-LOCAL/troiareuke-crm/releases/latest
```

- `troiareuke-crm-setup-X.X.X.exe` 다운로드 후 실행 (설치본)
- 또는 `troiareuke-crm-portable-X.X.X.exe` (설치 없이 실행)

업데이트는 자동입니다. 앱이 실행 중일 때 백그라운드에서 다운로드하며,  
앱 재시작 시 자동 설치됩니다.

---

## 롤백 절차

### PWA (Vercel)

```
Vercel 대시보드 → 프로젝트 → Deployments
→ 이전 정상 배포 → "..." → "Promote to Production"
→ 30초 내 이전 버전 복구
```

### Electron (GitHub Release)

```
GitHub → Releases → 이전 정상 버전 → Edit
→ "Set as latest release" 체크 → Save
→ 기존 앱이 10분 내 이전 버전으로 자동 다운그레이드
```

### DB 스키마 (긴급 시)

프로젝트 루트의 `supabase-rls-rollback.sql` 파일을 Supabase SQL Editor에서 실행합니다.

---

## 외부 베타 전 추가 작업

| 항목 | 예상 소요 | 비고 |
|------|----------|------|
| EV 코드 서명 인증서 | 1~2주 | SmartScreen 경고 제거, 비용 50~120만원/년 |
| 커스텀 도메인 등록 | 1~3일 | 도메인 구입 + DNS 전파 |
| Sentry 에러 모니터링 도입 | 반나절 | 무료 5K events/월 |
| 이용약관·개인정보처리방침 | 변호사 검토 포함 | D-5 결정 후 진행 |
| 외부 점주 계정 초대 방식 | 백엔드 설계 필요 | Supabase 이메일 초대 또는 초대 코드 |
