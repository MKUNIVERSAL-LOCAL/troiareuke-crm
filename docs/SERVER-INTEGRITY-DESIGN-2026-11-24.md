# 서버·코어 데이터 무결성 변경 설계서 (묶음 133 — 승인 요청 A-15 / B-2 근거)

작성 2026-11-24. 대상: `server/src/server.js`(NAS, 비코어이지만 **운영 배포는 오너 승인**)와 코어 `src/lib/store.ts`(CORE_EDIT=1). 마스터 프롬프트 09절 "클라이언트 표시값 수정만으로 근본 해결이라 판단하지 말 것"에 따라, 128~131 에서 비코어로 우회한 항목의 근본 해결안이다. 승인 전에는 구현하지 않는다(설계·테스트 계획·롤백만).

## 0. 현재 구조(사실)
- 저장: `crm_records(branch_id, collection, id, data JSONB)`; `PUT /api/data/:collection` 행 전체 upsert(bulk), `PATCH /:id` 는 `data || updates` JSON 병합, `DELETE /:id` 하드 삭제. `requireCollection` 화이트리스트 15종. 인증은 `requireSession`(지점 스코프)·`requireSuperadmin` 2단계. `updated_at`/버전 비교 없음 → 마지막 쓰기 승.
- 클라이언트: outbox FIFO 재시도(PUT/PATCH/DELETE 멱등), 코어 카운터(방문 수·회차 사용·재고·누적액)는 캐시 기준 **절대값 PATCH**. 재조회(liveRefresh)는 reset+initializeStores 재호출, 재조회 전 probe GET 12건(코어의 "서버 0건 → 로컬 이관" 재실행 방지).

## 1. 변경 항목

### S-1 낙관적 잠금 (A-15c)
- 서버: 모든 쓰기에서 `data.updated_at`(ISO)을 서버가 기록. PATCH 본문에 선택 필드 `expectedUpdatedAt` 가 오면 현재 행의 `updated_at` 과 비교, 다르면 **412 Precondition Failed** + 현재 행 반환. 없으면 종전처럼 병합(구버전 클라이언트 호환).
- 클라이언트(코어): `toDb*` 에 `updated_at` 포함, `sbUpdate` 가 캐시의 `updatedAt` 을 `expectedUpdatedAt` 으로 전송. outbox 는 412 를 "영구 거부"가 아닌 **재조회 후 재적용** 분기로(현재 칸 단위 PATCH 라 대부분 자동 병합; 같은 칸 충돌만 사용자 확인).
- 테스트: `scripts/test-nas-outbox.mjs` 에 412 경로, branch-nas E2E 에 두 컨텍스트 동시 수정.
- 롤백: 서버 플래그 `INTEGRITY_OPTIMISTIC_LOCK=false` 로 비교 생략.

### S-2 카운터 delta ($inc) (A-15a)
- 서버: PATCH 본문 `inc: { used_sessions: 1, stock: -2, total_visits: 1, total_spent: 30000 }` 을 원자적으로 적용(`jsonb_set(data, '{k}', to_jsonb(COALESCE((data->>k)::numeric,0) + v))`, 한 UPDATE 문). `updates` 와 함께 와도 한 트랜잭션.
- 코어: `useSession`·`adjustStock`·`incrementVisit`·`PaymentStore.save(totalSpent)`·`updateStatus(totalVisits)` 가 절대값 대신 `inc` 전송(로컬 캐시 갱신은 그대로). 구버전 서버에는 `inc` 가 무시되므로 **서버 먼저 배포 → 클라이언트 릴리스** 순서 고정.
- 테스트: 두 outbox 가 각각 +1 → 서버 +2 (test:outbox 모의 서버 확장), lib 단위 스펙.
- 롤백: 서버가 `inc` 를 무시하도록 플래그 → 클라이언트는 절대값으로 되돌리는 핫픽스(코어) 필요 → 그래서 S-2 는 S-1 보다 늦게.

### S-3 삭제 tombstone (A-15e)
- 서버: `crm_tombstones(branch_id, collection, id, deleted_at)`; DELETE 시 기록; PUT/PATCH 에 tombstone id 가 오면 **409 `{ reason: 'deleted' }`**(복원 의도면 `?restore=1`). GET 응답에 `deleted: [ids since=…]` 선택 포함(델타 동기 1단계).
- 클라이언트: outbox 가 409 deleted 를 "다른 기기에서 삭제된 기록" 으로 배너 표시(현재 404 PATCH 문구 재사용). 보존 90일 뒤 정리(cleanup 스케줄러).
- 테스트: 지출 수정 PUT ↔ 삭제 경쟁 재현(test:outbox).

### S-4 지점 내 전화번호 유일성 (A-15f)
- 서버: customers PUT/PATCH 시 `normalizePhone` 동일 행이 다른 id 로 존재하면 409 `{ reason: 'duplicate_phone', existingId }`. 기존 중복 데이터는 차단하지 않고 어드민 리포트로(마이그레이션 없음).
- 클라이언트: 409 → "이미 등록된 번호" 안내 + 병합 유도(현 로컬 검사와 같은 문구).

### S-5 역할 변경 시 세션 철회 + 프로필 라이브 (A-15d)
- 서버: `PATCH /api/admin/users/:id` 에서 `role` 변경 시 해당 사용자 세션 삭제(현재 비활성화·비번·사용기간만 철회). `GET /api/auth/me` 는 이미 존재 → 클라이언트가 가시성 복귀마다 호출해 role/plan/serviceEndsAt 비교.
- 코어(AuthContext): 프로필 갱신 API 노출(`refreshProfile()`), 역할이 바뀌면 안내 후 재로그인 유도(비코어 Layout 에서 호출).

### S-6 이관 1회 제한 + reloadStores (A-15b)
- 코어: `loadFromSupabase` 의 "서버 0건 + 로컬 행 → bulk upsert" 를 `localStorage crm_<branch>_nas_migrated` 플래그로 최초 1회만. `reloadStores()` 공개(reset+init 를 한 함수로, 서버 로드 실패 시 캐시를 비우지 않고 false 반환) → liveRefresh 의 probe 12 GET 제거.
- 테스트: branch-nas E2E 의 online 단계에서 PUT 0건 단언 추가.

### S-7 컬렉션 화이트리스트 확장 (B-2, PHASE 2 선행)
~~`staff_schedules`~~(141 에서 설정 행 `preferences.staffSchedules` 로 대체 — 불필요), `resources`(베드/룸), `stock_ledger`, `program_ledger`, `segments`, `campaigns`, `campaign_runs`, `consents`(마케팅 수신 동의·거부), `settings_audit`. 전부 `crm_records` 구조 그대로(스키마 변경 없음) — 추가는 `requireCollection` 배열 1줄.

### S-8 서버 측 PII 마스킹·접근 로그 (Q-2)
- `GET /api/data/customers` 에서 세션 role 이 `staff` 면 phone/email/address/birth_date 를 마스킹해 반환(클라이언트 `pii.ts` 와 같은 규칙). 원문이 필요한 관리자 동작은 admin 세션만. 접근 로그 `data_access_log(user, collection, count, at)` 180일.

## 2. 배포 순서·호환
1) 서버 S-1·S-3·S-4·S-7·S-8 (구버전 클라이언트 영향 없음: 선택 필드/추가 테이블) → NAS 재배포(런북) → `verify:nas`.
2) 클라이언트 비코어: 412/409 처리·배너 문구(릴리스 v1.0.6x).
3) 서버 S-2·S-5 + 코어 CORE_EDIT PR(S-2 delta·S-5 refreshProfile·S-6) → 릴리스. 구버전 지점이 48시간 내 0 이 될 때까지 서버는 절대값 PATCH 도 계속 수용.

## 3. 테스트 계획
- `server/test/`(현재 자동 테스트 0건) 에 node:test + supertest 로 S-1~S-4·S-8 라우트 테스트 신설(Postgres 는 docker-compose 또는 pg-mem 검토 — 의존성 추가는 등록부 기록).
- `scripts/test-nas-outbox.mjs` 412/409 경로, lib-units delta 규칙, branch-nas E2E 두 컨텍스트.

## 4. 위험·롤백
- 412 폭주(시계 어긋남·초 단위 충돌): `updated_at` 은 서버 시계만 사용, 클라이언트는 전달만. 플래그로 즉시 비활성.
- `$inc` 와 절대값 혼재 기간: 서버가 둘 다 수용, 클라이언트는 버전별 1종만 전송.
- tombstone 정리 전 복원 요청: `?restore=1` 로 명시 복원만 허용.

## 5. 승인 요청 요약(오너용)
| 항목 | 필요 이유 | 미승인 영향 | 비용 | 위험 | 추천 |
|---|---|---|---|---|---|
| 서버 S-1·S-3·S-4·S-7·S-8 + NAS 재배포 | 동시 수정 충돌·삭제 부활·중복 등록을 서버가 막음, PHASE 2 컬렉션 | 현 우회(probe·칸 단위) 유지, 두 기기 동시 같은 칸 수정은 마지막 승 | 0원, 서버 PR 1 + 재배포 1회 | 낮음(선택 필드·추가 테이블) | **승인 권장** |
| 코어 S-2·S-5·S-6 (CORE_EDIT) | 카운터 유실 근본 해결, 역할 즉시 반영, probe 비용 제거 | 회차권은 파생으로 OK, 재고·방문 수는 유실 가능 | 0원, 코어 PR 1 | 중(배포 순서 의존) | 서버 배포 뒤 승인 |
