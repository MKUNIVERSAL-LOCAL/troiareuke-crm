# NAS 중앙 서버 — 계정 · 비밀번호 재설정 · CRM 데이터 저장 · 메시지 발송

이 서버는 고객 PC가 아닌 NAS에서 다음을 관리합니다.

1. **회원 계정** — 관리자(슈퍼어드민)가 발급하는 계정, bcrypt 해시 비밀번호, 로그인 세션
2. **비밀번호 재설정** — 30분 유효 · 1회용 토큰, 이메일 발송
3. **CRM 사용 데이터** — 고객/예약/시술/결제 등 13종 데이터가 지점(branch) 단위로 PostgreSQL에 쌓임 (`crm_records`)
4. **메시지 발송** — SMS·카카오 발송 게이트웨이(발송사 키는 서버에만), 예약 발송 큐, 시간당 한도, 건별 발송 로그
5. **재방문 자동 리마인더** — 매일 지정 시각에 재방문 권장일 경과 고객에게 자동 발송 (7일 쿨다운)

> **발송사 미계약 상태의 동작**: `SMS_PROVIDER=none`(기본)이면 어떤 메시지도 실제로 나가지 않으며,
> 앱에는 "발송사 미설정"으로 정직하게 표시·기록됩니다. 엔포 등 발송사 계약 후
> `SMS_PROVIDER=http` + `SMS_HTTP_URL/KEY`만 설정하면 즉시 실발송으로 전환됩니다.

## NAS 배포 순서 (Synology)

1. 패키지 센터에서 **Container Manager**를 설치합니다.
2. 이 `server` 폴더를 NAS의 예: `/volume1/docker/troiareuke-crm-server`에 올립니다.
3. `.env.example`을 `.env`로 복사한 뒤 값을 입력합니다.
   - `POSTGRES_PASSWORD`, `DATABASE_URL` — 긴 랜덤 비밀번호 (두 곳 동일하게)
   - `PUBLIC_BASE_URL` — 외부에서 접근할 HTTPS 주소 (예: `https://crm-api.mkcorp.familyds.com`)
   - `ALLOWED_ORIGINS` — `http://localhost:5173,null` (데스크톱 앱은 `null` 오리진)
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — **최초 슈퍼어드민 계정** (첫 기동 시 자동 생성)
   - `ALLOW_PUBLIC_SIGNUP=false` — 관리자 발급제 (앱의 무료가입을 열려면 true)
   - SMTP — 회사 메일 또는 NAS MailPlus SMTP (비밀번호 재설정 메일 발송용)
4. Container Manager의 **프로젝트**에서 `docker-compose.yml`로 실행합니다.
5. DSM 제어판 → 로그인 포털 → 고급 → **역방향 프록시**: 외부 HTTPS 주소 → `http://127.0.0.1:8787`, Let's Encrypt 인증서 적용.
6. `https://외부주소/health`가 `{"ok":true}`를 반환하는지 확인합니다.

## 클라이언트(CRM 앱) 연결

CRM 앱 빌드 시 `.env`에 아래를 설정하면 로그인·계정·데이터가 모두 이 서버로 연결됩니다.

```
VITE_AUTH_API_URL=https://외부주소
```

- 이 값이 설정되면 Supabase 대신 NAS가 사용됩니다 (인증 + 데이터 모두).
- 어드민 → 지점 관리에서 지점 생성 시 관리자 이메일을 입력하면 계정이 즉시 발급되고 **임시 비밀번호가 1회 표시**됩니다.

## 검증

- GitHub Actions `server-ci`가 push마다 실제 PostgreSQL로 통합 테스트(`test/smoke.mjs`)를 실행합니다: 가입 차단, 어드민 발급, 로그인, 데이터 저장·격리, 비밀번호 재설정 1회용 토큰, 세션 무효화.
- NAS 배포 직후 수동 확인: `/health` → 어드민 로그인 → 지점 계정 발급 → 발급 계정으로 CRM 로그인 → 고객 등록 → DSM에서 `crm_records` 행 확인.

SMTP는 회사 메일 또는 NAS MailPlus SMTP 정보를 사용합니다. 고객이 비밀번호 찾기를 누르면 계정 존재 여부와 관계없이 동일한 안내가 표시되며, 실제 가입 고객에게만 30분 유효·1회용 링크가 전송됩니다.
