# 본사 AI 게이트웨이 아키텍처 (PHASE 5 — 160 설계, 2026-11-24)

> 목적: 지점이 자기 키를 넣는 BYOK(PHASE 3)에서 **본사가 키·비용·한도를 관리하는 Managed AI** 로 가는 서버 설계. 이 문서는 161(서버 모듈)·162(어드민 화면)·163(가격·원가) 의 정본이며, 서버 변경은 **승인 B-2(배포)·C-7(공식 API 프로젝트·예산)** 뒤에만 한다.
> 지금 코드로 들어간 것은 **순수 규칙 두 개**(`src/lib/ai/modelRouterRule.ts`, `src/lib/ai/creditLedgerRule.ts`)와 그 테스트다 — 서버·클라이언트 어디서든 같은 규칙을 쓰기 위한 참조 구현이고, 서버 배포 전까지 지점 화면 동작은 바뀌지 않는다.

## 1. 지금 상태(현 `/api/ai` 중계, server.js)
| 항목 | 현재 | 문제 |
|---|---|---|
| 인증 | `requireSession` + 분당 20회 rate limit | 유지 |
| 한도 | 지점당 **월 300회**(호출 수) `AI_MONTHLY_LIMIT_PER_BRANCH` | 호출 수는 비용과 무관(짧은 질문과 긴 브리핑이 같은 1회) |
| 라우팅 | OpenAI(`gpt-4o-mini`/`gpt-4o`) → 실패 시 Gemini(`gemini-1.5-flash`) 고정 | 작업 종류·플랜·비용에 따른 선택 없음, Claude 없음 |
| 계측 | `ai_usage(id, branch_id, user_id, kind, provider, created_at)` — **건수만** | 토큰·비용·모델이 없어 원가 분석·과금 불가 |
| 키 | 서버 `.env`(AI_OPENAI_API_KEY, AI_GEMINI_API_KEY) | 유지(지점으로 절대 내려가지 않음) |
| 지점 폴백 | 본사 키 없으면 503 → 지점 BYOK 경로 | 유지(Managed 가 꺼져도 지점은 동작) |

## 2. 목표 아키텍처
```
지점 앱(AiChat·브리핑·피부 분석·캠페인 문구)
   │  POST /api/ai/{chat|skin-analysis|...}  (세션 토큰, 본문은 가명·건수만 — AI-SECURITY-POLICY)
   ▼
┌─ AI Gateway (server/src/ai/*, 161) ───────────────────────────────┐
│ 1 인증·지점 스코프(aiScopeOf)            5 Provider Adapter(openai/gemini/claude)│
│ 2 구독·플래그 확인(plan, module.aiChat)   6 토큰·비용 계측(usage → USD → 크레딧) │
│ 3 크레딧 잔액·홀드(creditLedgerRule)      7 크레딧 확정 차감(멱등: request_id)   │
│ 4 Model Router(modelRouterRule)           8 감사 로그(본문 저장 금지, 길이·토큰만) │
└───────────────────────────────────────────────────────────────────┘
   ▼                                   ▼
 OpenAI / Google / Anthropic         Postgres: ai_usage(확장)·ai_credit_ledger·ai_catalog
```
원칙: **숫자는 서버가 계산**(토큰·비용·크레딧), 클라이언트는 표시만. 키는 서버 env 에만. 본문·이미지는 저장하지 않는다(길이·토큰·모델·결과 코드만).

## 3. Model Router (`modelRouterRule.ts`, 순수)
입력: 작업 종류(`chat`·`briefing`·`skin-analysis`·`campaign-copy`), 플랜(`trial`·`starter`·`pro`·`enterprise`), 비전 필요 여부, 사용 가능한 제공사(키가 있는 것), 카탈로그(`catalog.ts`, 어드민 플래그 `ai.catalog` 로 원격 갱신), 남은 크레딧.
규칙(결정적, 순서대로):
1. **티어 결정** — 플랜 기본 티어: trial·starter = economy, pro = standard, enterprise = premium. 작업 보정: `briefing`·`campaign-copy` 는 한 단계 위(문장 품질이 매출 설명·고객 문구에 직결), `skin-analysis` 는 비전 가능 모델 중에서만.
2. **크레딧 보호** — 남은 크레딧이 `LOW_CREDIT_THRESHOLD`(200) 미만이면 economy 로 내림(사유 표기). 0 이면 라우팅 거절(`reason: 'no-credits'`).
3. **후보 걸러내기** — 사용 가능한 제공사 ∩ (비전 필요 시 vision=true) ∩ 티어 가격 밴드(입력+출력 USD/1M: economy ≤ 1, standard ≤ 20, premium 전부).
4. **선택** — 밴드 안에서 **가장 비싼(품질 우선) 모델**을 primary, 나머지를 가격 내림차순으로 폴백, 밴드 밖(더 싼 쪽)도 폴백 뒤에 붙인다. 후보가 없으면 티어를 한 단계 내려 반복.
5. 산출: `{ primary, fallbacks, tier, reason }`. 서버는 primary → fallbacks 순으로 호출하고 실제 쓴 모델을 계측한다.

## 4. 크레딧 원장 (`creditLedgerRule.ts`, 순수 — 정본은 서버 테이블)
- **크레딧 단위**: 정수. `creditsForCost(usd, fx, margin)` = ceil(USD × 환율(월 고정, 어드민 설정) × 마진 배수) — 마진·요금은 163(가격 분석)·C-8 에서 확정. 기본 가정 환율 1,400원/USD, 마진 2.0 → 1크레딧 ≈ 원가 0.5원.
- **행 종류**: `grant`(월 지급·수동 지급), `hold`(호출 전 예상 비용 선점), `consume`(실제 비용 확정 차감), `release`(홀드 해제), `refund`(오류 환급), `expire`(월말 소멸).
- **불변식**: 잔액 = Σgrant + Σrefund − Σconsume − Σexpire ≥ 0; 가용 = 잔액 − 활성 홀드; `consume`·`hold` 는 가용을 넘을 수 없다; 같은 `requestId` 의 consume 은 한 번만(멱등); 금액은 양의 정수.
- **월 지급(가설, 163 확정)**: trial 300 / starter 1,000 / pro **4,500** / enterprise 10,000 크레딧 — 가정 사용량의 크레딧 환산(282 / 600 / 4,081 / 7,321)을 덮도록(165 리뷰 M-2). 미사용분은 월말 `expire`(이월 없음) — **활성 홀드는 남기고 가용(잔액 − 홀드)만 소멸**해 진행 중 호출의 consume 이 실패하지 않게 한다(165 리뷰 M-3). 같은 requestId 의 홀드 중복·열린 홀드 없는 release 는 거절(L-5).
- **서버 테이블**: `ai_credit_ledger(id uuid, branch_id, kind, amount int, balance_after int, request_id text unique nullable, model, provider, usd numeric, note, created_at)`, `ai_usage` 확장 열: `model, input_tokens, output_tokens, usd, credits, latency_ms, status, request_id`.

## 5. API 계약(161 에서 구현, 승인 뒤)
| 메서드 | 경로 | 응답 | 비고 |
|---|---|---|---|
| GET | `/api/ai/status` | `{ enabled, providers, plan, credits: { balance, available, monthlyGrant }, limits }` | 기존 응답 확장(하위호환) |
| POST | `/api/ai/chat` · `/api/ai/skin-analysis` | `{ text, provider, model, usage:{input,output}, credits:{charged,balance} }` | 기존 `{text, provider}` 유지 + 추가 필드 |
| GET | `/api/ai/credits?month=` | 지점의 원장 요약·행 50건 | 지점 설정 > AI 서비스 탭 "사용량" 카드가 읽음 |
| GET | `/api/admin/ai/summary?month=` | 전 지점 호출·토큰·USD·크레딧·지점 수·플랜별 | 어드민 162 |
| GET | `/api/admin/ai/branches?month=` | 지점별 사용·잔액·플랜·마지막 호출 | 어드민 162 |
| POST | `/api/admin/ai/credits/grant` | `{ branchId, amount, note }` → 원장 grant 행 | 어드민 162, 감사 로그 |
| PUT | `/api/admin/ai/catalog` | 카탈로그 배열(검증 `isAiModel`) → 서버가 `feature_flags.global['ai.catalog']` 에 저장(지점 소비자 `featureFlags.ts` 는 이미 이 키를 읽음) | **전용 엔드포인트 필요** — 기존 `PUT /api/admin/feature-flags/:scope` 는 `validateFlagsInput` 이 boolean 만 받아 배열을 400 으로 거절(165 리뷰 H-1) |

## 6. 어드민 화면 설계(162) — 구현됨 `src/pages/Admin/AiService.tsx`(`/admin/subscriptions?view=ai`), API 래퍼 `src/lib/adminAi.ts`
`/admin/ai` "AI 서비스 관리" — 메뉴 `구독/플랜 관리` 아래.
- 요약 카드(이달): 호출 수 · 입력/출력 토큰 · 추정 원가(USD·원) · 크레딧 차감 합 · 활성 지점 수 · **마진(크레딧 매출 − 원가, [추정])**.
- 지점 표: 지점 · 플랜 · 호출 · 토큰 · 원가 · 크레딧 사용/잔액 · 마지막 호출 · [크레딧 지급] 버튼(금액·사유 → grant).
- 모델 사용 분포(제공사·모델별 호출·원가), 실패율·폴백율.
- 카탈로그 편집(가격·기본 모델·비전) → `PUT /api/admin/ai/catalog`(161) — 162 에서 플래그 PUT 으로 만들었던 편집기는 서버가 배열을 거절해 삭제(165 리뷰 H-1), 161 과 함께 복원.
- 서버 모듈(161) 미배포 상태에서는 "서버 AI 모듈이 아직 배포되지 않았습니다(승인 B-2)" 를 표시하고 숫자를 만들지 않는다(가짜 성공 금지).

## 7. 보안·개인정보
- 키는 서버 env 만. 응답·로그에 키 꼴 스크럽(keyLeak 규칙을 서버에도 이식).
- 요청 본문·이미지는 저장하지 않는다. `ai_usage` 는 길이·토큰·모델·상태만.
- 지점 앱은 지금처럼 고객 실명 대신 건수·가명(briefingRule·pseudonymizeStaff)만 보낸다.
- 어드민 화면은 지점 이름·수치만 — 고객 데이터 없음.

## 8. 승인 요청(OWNER-APPROVAL-QUEUE 연동)
| 항목 | 내용 | 비용 | 미승인 시 |
|---|---|---|---|
| C-7 | OpenAI·Google·Anthropic 공식 조직 프로젝트 개설, 월 예산 상한(제안 10만 원부터), 키 발급 → 서버 env | 사용량 과금(163 실측 뒤 월 예상치) | Managed AI 불가, 지점 BYOK 유지 |
| B-2 | `server/src/ai/*` 모듈 + 테이블 2개 추가 배포(런북) | 0원 | 161·162 보류 |
| C-8 | 요금제·크레딧 지급량·마진 확정 | — | 가설값으로 시뮬레이션만(163) |

## 8-1. 원가·가격
`AI-PRICING-AND-COST-ANALYSIS.md`(163) — 플랜별 매장 원가·시나리오·목표 마진 요금·C-7 예산 상한 제안.

## 9. 단계
160 설계(이 문서 + 순수 규칙 2개 + 테스트) → 161 서버 모듈(승인 뒤; 그 전에는 서버 코드 초안을 `server/src/ai/` 에 두지 않고 설계만) → 162 어드민 화면(서버 미배포 상태 안내 포함, 어드민 NAS 흉내 E2E 로 계약 검증) → 163 원가·가격 분석(`AI-PRICING-AND-COST-ANALYSIS.md`, 순수 시뮬레이터).

## 10. 테스트·롤백
- 순수 규칙: lib-units(라우터 티어·비전·크레딧 보호·폴백 순서, 원장 불변식·멱등·만료).
- 서버(161): outbox 스타일 단위 테스트(원장 동시 차감·멱등), 어드민 NAS 흉내 E2E(162).
- 롤백: Gateway 는 기존 `/api/ai/*` 응답을 **상위 호환**으로 확장하므로 모듈을 비활성(`AI_GATEWAY=off`)하면 지금 중계로 돌아간다. 원장 테이블은 추가만(기존 테이블 변경 없음).
