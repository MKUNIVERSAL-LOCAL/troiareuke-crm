# 트로이아르케 CRM — NAS 자체 서버 구축 계획 (클라우드 없이 전부 NAS)

> **결정 (2026-07-13, 오너)**: 클라우드 안 쓰고 **NAS 한 대에 DB·백엔드·웹앱을 전부** 올려 운영. 수천~수만 고객이 되면 그때 클라우드로 이전.
> **방식**: **셀프호스팅 Supabase** (NAS Docker). 앱이 이미 Supabase로 말하므로 코드 재작성 없이 주소만 교체. 나중에 클라우드 Supabase로 이전 시에도 주소만 바꾸면 됨.

---

## 대상 아키텍처

```
                 mkcorp.familyds.com (DDNS, 이미 있음)
                          │  HTTPS(Let's Encrypt) + 역방향 프록시
        ┌─────────────────┴──────────────────┐
        ▼ NAS (Synology DSM, 24시간)          
  ┌──────────────────────────────────────────┐
  │ Docker (Container Manager / Docker 패키지) │
  │  ├ Supabase 스택                            │
  │  │   Postgres(DB) · GoTrue(로그인)          │
  │  │   PostgREST(API) · Realtime · Storage     │
  │  │   Kong(게이트웨이 :8000)                  │
  │  ├ 웹앱(nginx) — CRM 화면 서빙                │
  │  └ 발송·스케줄러(Node) — 엔포 SMS/카톡, 예약발송 │
  └──────────────────────────────────────────┘
        ▲ 폰 · 태블릿 · PC 브라우저(같은 로그인)
```

---

## 전제조건 (2개 — 이거 없으면 시작 불가)

| # | 필요 | 확인 방법 | 현재 상태 |
|---|------|----------|----------|
| P1 | **완전한 관리자 계정** | 주 메뉴에 **패키지 센터·제어판(정보센터)** 이 보임 | ✅ (2026-07-14) 오너가 최상위 관리자 권한 전부 보유 확인 |
| P2 | **Docker 지원 모델 + RAM 4GB↑** | 정보 센터에서 모델·메모리 확인 | ✅ (2026-07-14) Docker 구동중, **RAM 8GB**. 모델명만 미기록 |

> ⚠️ ARM 기반 엔트리 모델(j 시리즈 등)은 Docker 미지원. Intel/x86 모델이어야 함.
> ⚠️ DSM 7.2↑ = "Container Manager", DSM 7.1(현재 7.1.1) = 구 "Docker" 패키지. (업그레이드 권장)

---

## 구축 단계

### 0단계 — 관리자 로그인
제한 계정 로그아웃 → 관리자 계정 로그인 → 주 메뉴에 "패키지 센터" 확인.

### 1단계 — 모델·RAM 확인
제어판 → 정보 센터. 모델명·메모리 기록. (Docker 가능/불가, 스택 규모 판단)

### 2단계 — Docker 설치
패키지 센터 → "Container Manager"(7.2↑) 또는 "Docker"(7.1) 설치.

### 3단계 — Supabase 셀프호스팅 올리기
공식 self-hosting 사용:
```bash
# NAS SSH 또는 Container Manager 프로젝트로
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# .env에서 POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY,
#          DASHBOARD 계정 등 반드시 새로 설정
docker compose up -d
```
→ 내부적으로 Kong 게이트웨이가 `:8000`에 뜸.

### 4단계 — 외부 접속 + HTTPS
제어판 → 로그인 포털 → 고급 → **역방향 프록시**:
- 소스: `https://mkcorp.familyds.com:8443` (예)
- 대상: `http://localhost:8000`
제어판 → 보안 → 인증서: **Let's Encrypt 무료 인증서** 발급(도메인 mkcorp.familyds.com).

### 5단계 — CRM 연결 (코드 거의 안 바뀜)
`C:\dev\troiareuke-crm\.env`:
```
VITE_SUPABASE_URL=https://mkcorp.familyds.com:8443
VITE_SUPABASE_ANON_KEY=<3단계에서 만든 ANON_KEY>
```
→ `npm run build` → (데스크톱이면) `배포_런북.md` 절차대로 재빌드·배포.

### 6단계 — DB 스키마 적용
현재 라이브 Supabase의 스키마를 셀프호스트로 이관:
- 라이브에서 `pg_dump`(schema+data) → 셀프호스트 Postgres에 `psql`로 복원.
- (레거시 `schema.sql` 문서는 옛 버전이므로 신뢰하지 말고 라이브 덤프를 정본으로.)

### 7단계 — 웹앱 호스팅 (폰·태블릿·PC 접속)
- Web Station 또는 nginx 컨테이너로 `dist/` 서빙 → `https://mkcorp.familyds.com` 접속.
- PWA라 "홈 화면에 추가"로 앱처럼 설치 가능.

### 8단계 — 발송 게이트웨이 + 스케줄러 (24시간)
- 작은 Node 컨테이너: `messagingGateway`가 부를 `/send` 엔드포인트(엔포 SMS/카톡 중계).
- cron으로 예약 발송·생일·미방문 케어 자동 실행.
- CRM localStorage에 `crm_sms_gateway_url` = NAS 게이트웨이 주소, `crm_sms_gateway_key` 설정.

---

## 백업·안전 (자체 운영이라 필수)
- Hyper Backup(이미 설치됨)으로 **Postgres 볼륨 정기 백업** → 외장/클라우드 콜드백업 이중화.
- 정전 대비 UPS 권장. 디스크 이중화(SHR/RAID) 확인.
- 개인정보(고객 PII) 저장이므로 방화벽·2단계 인증·외부 포트 최소 노출.

---

## 미해결 / 다음 액션
- [ ] **P1 관리자 계정 확보** ← 지금 최우선. 이거 열리면 1단계부터 진행.
- [ ] P2 모델·RAM 확인.
- [ ] (관리자 확보 후) 각 단계 클릭 안내 + 이 문서에 실제 값·스크린샷 채우기.
