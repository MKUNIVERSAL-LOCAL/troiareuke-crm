# 외부 코드·오픈소스 등록부 (THIRD-PARTY-CODE-REGISTER)

마스터 프롬프트 07절. 외부 프로젝트는 **A 코드 직접 재사용 / B 요구사항·아이디어 참고 독립 재구현 / C 공식 API 연동 / D 미도입** 으로 분류한다. A 는 저장소 URL·커밋·파일 경로·라이선스·목적·수정 내용·검증 결과를 반드시 기록하고 LICENSE 사본과 저작권 고지를 `THIRD-PARTY-NOTICES`(릴리스 자산)에 포함한다. GPL/AGPL/상용/불명확 코드는 복사하지 않는다(개념 참고 B 만). "별도 서비스 분리" 만으로 의무가 해결된다고 가정하지 않는다.

조사: 2026-11-24 글로벌 CRM 리서치 에이전트(GitHub API·raw 파일·공식 문서·보안 advisory). 상세 근거는 세션 기록. 아래 표는 확인일 기준이며 재검토 시 갱신한다.

## 1. 저장소 검증 요약 (확인일 2026-11-24)

| 저장소 | 라이선스 | 최신 커밋/릴리스 | 유지보수 | 보안 advisory | 분류 | 비고 |
|---|---|---|---|---|---|---|
| SGrappelli/pronto | MIT (Copyright 2026 Pronto Contributors) | 2026-10-22 / v1.2.1 | 활동 중, 소규모(★78) | 공개 CVE 없음(자체 RLS 수정 공개) | **A(일부) + B** | Supabase Auth/RLS/Storage/pg_cron/RPC 부분은 제외. 로열티·고급 분석은 클라우드 전용 |
| WebIdentity1/Prism-open | MIT | 2026-05-23(생성일 1회 덤프) / 없음 | 사실상 정지(★1) | 미확인 | **D** | 멤버십·로열티·캠페인이 얕음(수동 포인트, CRUD), 유료 외부 API 전제 |
| clawnify/OpenSalon | MIT (Copyright 2026 Clawnify) — 단 `@clawnify/app`·`@clawnify/db` 는 라이선스 미표기 | 2026-11-17 / 없음 | 활동 중, 단일 저자 | 미확인 | **A(scheduling.ts 한정)** | 서버 index.ts 는 Clawnify D1 전용 의존성 → 가져오지 않음 |
| alextselegidis/easyappointments | **GPL-3.0** | 2026-11-23 / 1.6.1 | 활발(★4.5k) | 2026 CVE 다수(인증 우회·CSRF·SSRF·XSS) | **B** | 가용시간 계산 규칙·API 리소스 설계·보안 교훈만 |
| mautic/mautic | **GPL-3.0** | 2026-11-24 / 7.2.2(보안 릴리스) | 활발 | 7.2.2 에서 8건(RCE 포함) | **B** | 세그먼트 필터 스키마·캠페인 이벤트 그래프·DNC·멱등키 개념 |
| metabase/metabase | **AGPL-3.0 + 상용(enterprise/)** | 2026-11-24 / v0.65.6 | 활발 | CVE-2026-72898(비인증 SQLi, 실악용) 등 | **B** | 기간 비교 Offset·필터 위젯·드릴다운 개념 |
| frappe/erpnext | **GPL-3.0**(ERPNext) / frappe 프레임워크는 MIT | 2026-11-24 / v15.126.0 | 활발 | 2026-11-21 권한 누락·SQLi 다수 | **B** | 낙관적 잠금(modified 비교)·docstatus 상태기계·반전 전표 환불·재고 원장 역전표 개념(frappe document.py 는 MIT 라 A 가능하나 Python→TS 재구현이 실용적) |
| twentyhq/twenty | **AGPL-3.0 + 앱 예외 + Enterprise 파일** (일부 패키지 MIT) | 2026-11-24 / v2.62.0 | 활발 | CVE-2026-46624(RCE) 등 | **B** | 활동 타임라인 엔티티·저장된 보기(filters/sorts/visibleFields)·워크플로우 분리 개념 |

### 추가 후보(허용적 라이선스)
| 저장소 | 라이선스 | 최신 커밋 | 용도 | 분류 |
|---|---|---|---|---|
| jkbrzt/rrule | BSD-3-Clause | 2026-11-23 | 정기 휴무·직원 반복 근무 예외·정기 캠페인을 RRULE 로 저장·전개(Electron·Capacitor·NAS 공통) | A 후보(의존성 추가는 번들·유지 검토 뒤) |
| Hexagon/croner | MIT | 2026-11-23 | NAS Express 의존성 0 스케줄러(캠페인·리마인더 배치) — 현 `setInterval + runExclusive` 로 충분하면 미도입 | 보류 |
| schedule-x/schedule-x | MIT(코어) + 유료 플러그인(리소스 뷰 등) | 2026-11-23 | 직원 열 캘린더 — 리소스 뷰가 유료라 자체 구현 유지 | D(현재) |
| dexie/Dexie.js | Apache-2.0 | 2026-11-16 | IndexedDB 래퍼 — 교체 이득 대비 비용 검토만 | 보류 |
| RFM 라이브러리 | — | — | 성숙한 TS 라이브러리 없음 → 순수 모듈 자체 구현 | 자체 |

## 2. A 분류 — 직접 재사용 대상(아직 반영 전, 반영 시 아래 열을 채운다)

| ID | 출처(URL·커밋·파일) | 라이선스·고지 | 목적 | 우리 위치 | 수정 내용 | 검증 | 상태 |
|---|---|---|---|---|---|---|---|
| TP-1 | clawnify/OpenSalon `src/server/scheduling.ts`(+ `scheduling.test.ts`) — 커밋 해시는 반영 시 기록 | MIT, "Copyright (c) 2026 Clawnify" 고지 유지 | 반개구간 겹침 판정·충돌 목록·설명 문구(순수 함수 ~60줄) | `src/lib/schedulingRule.ts`(신설 예정) | TS 타입·한국어 문구·분 단위 정규화 | lib-units 스펙으로 원 테스트 케이스 이식 | 예정(PHASE 2 예약 묶음) |
| TP-2 | SGrappelli/pronto `lib/booking-availability.ts` | MIT, "Copyright (c) 2026 Pronto Contributors" | 요일별 open/close/break 를 minutes-of-day 로 환산해 슬롯이 영업시간 안·휴게 밖인지 판정 | `src/lib/availabilityRule.ts`(신설 예정) | 우리 `businessHours`/`holidays` 모델에 맞춤, 직원 근무표·버퍼 확장 | lib-units | 예정(PHASE 2 예약·온라인 예약 묶음) |

## 3. B 분류 — 개념 참고(복사 금지) 적용 계획

| 출처 | 가져올 개념 | 우리 적용 | 단계 |
|---|---|---|---|
| Pronto `032_atomic_slot_allocation.sql` | (business, employee)/(business, service) 키 advisory lock → 겹침 수 vs capacity → `slot_already_booked` | NAS Express 에 직원별 뮤텍스(또는 Postgres advisory lock) + 서버 겹침 검사 + 409, 클라이언트 outbox 는 409 를 "거부"로 | PHASE 1(서버 변경 — 승인 B-2) |
| Easy!Appointments `Availability.php` | 근무표 → 특정일 예외 → 휴게 제거 → 차단 구간 → 기존 예약 → 간격 분할 → 사전 예약 마감 → 선예약 상한 | 순수 모듈 `availabilityRule.ts` 규칙 순서 그대로, 버퍼(before/after)는 자체 추가 | PHASE 2 |
| Easy!Appointments REST v1·2026 CVE | 리소스 설계(availabilities·blocked_periods·working_plan_exceptions·webhooks) / 예약 해시 노출·GET CSRF·인증 우회 교훈 | 공개 예약 API 설계 체크리스트 | PHASE 2 온라인 예약 |
| Mautic 세그먼트 필터 | `{glue, field, object, type, operator, value}` 배열 + 상대 날짜 | `src/lib/segments/` 타입 + 순수 평가 함수(고객 배열 필터), 저장된 세그먼트 | PHASE 2/4 |
| Mautic 캠페인 이벤트 | action/decision/condition 그래프, triggerMode(즉시/간격/날짜), 허용 요일·시간대, `unique(event_id, lead_id, rotation)` 멱등 | 캠페인 엔진 데이터 모델 + outbox 멱등키(campaignEventId, customerId, rotation) | PHASE 4 |
| Mautic DNC | 채널별 수신거부(reason: unsubscribed/bounced/manual) | 고객 `marketingConsent` + 채널별 거부 기록 + 080 안내 | PHASE 4(정통망법) |
| Metabase Offset·필터 위젯 | 동일 길이 직전 기간 비교, 필터 정의 JSON, 드릴다운 | 매출분석 "전기 대비" 순수 함수, 대시보드 숫자 → 상세 내역 이동 | PHASE 2 |
| ERPNext/frappe 낙관적 잠금 | 저장 전 modified 비교 → TimestampMismatch | 서버 PATCH `expectedUpdatedAt` + 412, 클라이언트 재조회·병합 | PHASE 1(승인 A-15c) |
| ERPNext docstatus·Credit Note·Stock Ledger | 작성/확정/취소 상태기계, 반전 전표 환불, 삭제 대신 역전표 | 결제·환불 모델(결정 #9), 재고 입출고 원장 | PHASE 2 |
| Twenty TimelineActivity | happensAt·이벤트명·properties diff·행위자 | 고객 활동 타임라인(기존 `customerTimeline.ts` 확장) | PHASE 2 |
| Twenty view/filter/sort 메타 | 저장된 보기 JSON | 고객 목록 "저장된 보기" | PHASE 2 |

## 4. C 분류 — 공식 API 연동(권한 확보 전에는 어댑터·Mock 까지)
네이버 예약(제휴 승인 필요, 결정 #5) · Google Calendar(OAuth 클라이언트, 결정 #6; 현재 implicit 토큰) · SOLAPI(계약, 결정 #2) · 카카오 알림톡(템플릿 심사) · 토스/포트원 PG(결정 #4) · OpenAI/Anthropic/Google AI(공식 API, 개인 키 BYOK 는 사용자 계약, 본사 키는 C-7).

## 5. D 분류 — 미도입
Prism-open(사유 위 표) · schedule-x 리소스 뷰(유료) · 각 GPL/AGPL 코드 본문.

## 6. 고지 의무 처리
A 반영 시 `docs/THIRD-PARTY-NOTICES.md`(신설)에 라이선스 전문과 저작권 줄을 넣고 릴리스 자산에 포함한다. `package.json` 의존성 추가는 `npm ls --json` 라이선스 스캔 결과를 이 문서에 첨부한다.
