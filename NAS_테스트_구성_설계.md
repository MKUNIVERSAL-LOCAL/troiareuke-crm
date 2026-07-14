# NAS 테스트 전용 Supabase 구성 설계

> 작성: 2026-07-14 · 상태: 설계 확정, 실행 대기
> **이 문서는 `NAS_서버_구축_계획.md`(전면 이관 계획)를 대체한다.** 전면 이관은 보류.

## 방침 (오너 지시, 2026-07-14)

1. **라이브 Supabase(클라우드)와 CRM 설정은 일절 변경하지 않는다.** 운영은 지금 그대로.
2. NAS에는 **테스트 전용** 스택만 올린다. `CRM-STORAGE`(데이터)·`CRM-BACKUP`(백업) 공유폴더 활용.
3. **외부 공개 포트·PostgreSQL 포트를 열지 않는다.** 루프백 바인딩 + SSH 터널로만 접근.
4. 설치 파일은 wget 타르볼이 아니라 **Git으로 공식 저장소의 특정 버전을 받아** 재현 가능하게.

## 아키텍처

```
[Windows PC]                          [NAS mkcorp.familyds.com]
 CRM dev/test 빌드                     ┌─ docker network: crm-test (내부 전용)
 .env.test →                           │   kong ──→ auth (GoTrue)
 http://localhost:8100                 │        └─→ rest (PostgREST)
      │                                │              └─→ db (supabase/postgres)
      └── ssh -L 8100:127.0.0.1:8100 ──┤   publish: 127.0.0.1:8100 → kong (유일)
          (SSH 22, 기존 접속 경로)      │   Postgres publish 없음 (내부만)
                                       ├─ /volume1/CRM-STORAGE/supabase-test/  ← 스택+DB볼륨
                                       └─ /volume1/CRM-BACKUP/supabase-test/   ← 일일 pg_dump
```

- **최소 스택 4컨테이너**: db + auth(GoTrue) + rest(PostgREST) + kong. Studio·Realtime·Storage·Analytics 제외 (RAM 8GB 제약 + CRM은 supabase-js의 auth/rest만 사용).
- **네트워크 격리**: 서비스 간 통신은 도커 내부 네트워크. 호스트에 publish되는 것은 `127.0.0.1:8100`(kong) 하나뿐 → NAS 밖에서는 어떤 포트로도 직접 접근 불가. 라우터·DSM 방화벽·포트포워딩 무변경.
- **PC 접근**: `ssh -N -L 8100:127.0.0.1:8100 ys-lee0223@mkcorp.familyds.com` 터널을 연 상태에서만 테스트 가능.

## 버전 고정 (재현성)

NAS에 git이 없으므로 **clone은 Windows PC에서** 수행하고 필요 파일만 전송한다.

```powershell
# PC에서 — 릴리즈 태그로 고정 clone (태그는 clone 시점의 최신 안정 릴리즈 선택)
git clone --depth 1 --branch <RELEASE_TAG> https://github.com/supabase/supabase.git C:\dev\supabase-pin
git -C C:\dev\supabase-pin rev-parse HEAD   # ← 커밋 SHA를 아래 '버전 기록'에 적는다
```

- 공식 repo에서 가져다 쓰는 것: `docker/.env.example`의 **이미지 태그**(그대로 옮겨 적기, `latest` 금지), `docker/volumes/api/kong.yml`, `docker/volumes/db/*.sql`(init 스크립트).
- **compose 파일은 그대로 쓰지 않는다**: NAS의 docker-compose가 v1.28.5라 공식 compose(v2 문법)는 실패 위험. file format **2.4**로 재작성한 자체 `docker-compose.yml`을 사용 (2.4는 healthcheck + `depends_on: condition` 지원, v1.28.5 호환).

### 버전 기록 (실행 시 기입)

| 항목 | 값 |
|---|---|
| supabase/supabase 태그 | (실행 시 기입) |
| 커밋 SHA | (실행 시 기입) |
| supabase/postgres 이미지 | (repo .env.example에서 옮겨 기입) |
| supabase/gotrue 이미지 | 〃 |
| postgrest/postgrest 이미지 | 〃 |
| kong 이미지 | 〃 |

## 저장 배치

| 경로 | 용도 |
|---|---|
| `/volume1/CRM-STORAGE/supabase-test/` | docker-compose.yml, .env, kong.yml, init sql |
| `/volume1/CRM-STORAGE/supabase-test/volumes/db/data/` | Postgres 데이터 볼륨 |
| `/volume1/CRM-BACKUP/supabase-test/` | 일일 `pg_dump` gzip (14일 보관) |

## 키·비밀값 (테스트 전용, 라이브와 완전 분리)

- `POSTGRES_PASSWORD`, `JWT_SECRET`: 새로 생성 (PC에서 `openssl rand -base64 32` 등).
- `ANON_KEY` / `SERVICE_ROLE_KEY`: 새 `JWT_SECRET`으로 서명한 JWT를 새로 발급.
- **라이브 Supabase의 키·비번을 어떤 형태로도 재사용하지 않는다.**
- 시드 데이터에 고객 PII가 포함되므로: CRM-BACKUP 덤프는 gzip 후 접근권한 최소화, 공유폴더 권한이 넓다면 폴더 암호화 또는 덤프 암호화(openssl enc) 적용 검토.

## 실행 로드맵 (8단계 → 이 문서 기준으로 재정의)

| # | 단계 | 내용 | 검증 |
|---|---|---|---|
| 0 | 전제 확인 | `ls /volume1`에서 CRM-STORAGE·CRM-BACKUP 존재, 여유 용량, 8100 포트 비어있음 재확인 | ls·netstat 출력 |
| 1 | 버전 고정 취득 | PC에서 태그 clone, SHA·이미지 태그를 본 문서에 기록 | 버전 기록 표 채움 |
| 2 | 구성 파일 작성 | PC에서 compose(2.4 문법)·.env·kong.yml 준비, 새 키 발급 | compose config 로컬 검사 |
| 3 | NAS 전송 | scp(또는 CRM-STORAGE SMB 복사)로 `/volume1/CRM-STORAGE/supabase-test/` 배치, 소유권·퍼미션 정리 | ls -la |
| 4 | 기동 | `sudo docker-compose up -d` → 4컨테이너 healthy | `docker ps`, kong `curl 127.0.0.1:8100` |
| 5 | 터널 스모크 | PC에서 SSH 터널 + `.env.test`로 dev 서버 띄워 supabase-js 로그인/CRUD 확인 | auth·rest 각 1건 성공 |
| 6 | 데이터 시드 | 라이브에서 `pg_dump`(읽기 전용) → 테스트 스택 복원 → 건수 대조 | 테이블별 row count 일치 |
| 7 | 백업 스케줄 | DSM 작업 스케줄러: 일일 pg_dump→CRM-BACKUP, 14일 로테이션 스크립트 | 수동 1회 실행 산출물 확인 |
| 8 | 운영 판단 게이트 | 테스트 안정성·성능 기록. **전면 이관은 별도 의사결정** (이 구성에서 자동 승격 없음) | — |

## 하지 않는 것 (명시)

- DSM 역방향 프록시, Let's Encrypt, 외부 도메인 노출 — ❌ (구 계획에서 폐기)
- Postgres 5433 등 어떤 DB 포트도 호스트 publish — ❌
- CRM 프로덕션 `.env`·빌드·OneDrive 배포본 변경 — ❌
- 라이브 Supabase 프로젝트 설정·데이터 변경 — ❌ (pg_dump 읽기만)
- NAS에 git 등 새 시스템 패키지 설치 — ❌ (clone은 PC에서)
