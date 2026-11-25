# AI 제공사 연동 구조 (150, PHASE 3 BYOK 1/5)

갱신 2026-11-24 · 마스터 프롬프트 11~13·21절 · GAP A-1·A-2

## 1. 한 장 요약
- 지점이 자기 키(BYOK)로 Claude·ChatGPT·Gemini 를 쓰는 경로를 **어댑터 한 층**(`src/lib/ai/`)으로 모았다. 화면(AI 챗봇·피부 분석·설정)은 제공사 이름을 몰라도 된다.
- **AI 는 숫자를 계산하지 않는다.** 숫자는 내부 엔진(`src/lib/*Rule.ts`, `ANALYTICS-DEFINITIONS.md`)이 만들고, AI 는 가명화된 `<data>` 블록을 읽고 해석·추천만 한다. 응답의 숫자가 자료와 다르면 자료가 정본.
- 키는 `keys.ts` 한 곳에서만 읽고 쓴다. 지금은 localStorage `ai_key_*` **평문(21절 위반 — 승인 D-13 대기)**. 보관 방식이 바뀌면 그 파일의 두 함수만 바뀐다. 키는 로그·백업(`backupSanitize` 가 `ai_key_*` 제외)·AI 컨텍스트·Notion·GitHub 에 절대 넣지 않는다.
- 본사 AI 중계(`aiProxy.ts`, NAS `/api/ai/*`)가 켜져 있으면 지점 키 없이 1순위로 쓰고, 실패·꺼짐이면 지점 키 경로(어댑터)로.

## 2. 파일
| 파일 | 역할 |
|---|---|
| `src/lib/ai/types.ts` | `AiAdapter`(chat·testConnection), `ChatRequest/Result`, `TokenUsage(estimated)`, `AiAdapterError(code: no-key/cors/auth/rate/network/response)` |
| `src/lib/ai/catalog.ts` | 모델 카탈로그(기본값 + 본사 원격 갱신 `setCatalogOverride` — 기능 플래그 payload `global['ai.catalog']` 배열을 `featureFlags` 가 받을 때 적용, 검증 `isAiModel`), 가격 참고값(`PRICING_AS_OF`) |
| `src/lib/ai/adapters.ts` | Claude(Electron IPC `call-claude-api` — 코어가 모델 고정, 브라우저는 CORS), OpenAI(`/v1/chat/completions`), Gemini(`generateContent`, 키는 헤더) |
| `src/lib/ai/chat.ts` | `selectProvider`(Claude 우선) → `chatWithFallback`(키 있는 다른 제공사로 폴백) → 사용량 기록 |
| `src/lib/ai/usage.ts` | 토큰 추정(한글 1.5자·기타 4자/토큰), USD 추정, 이 기기 일별 사용량(`crm_ai_usage_log`, 90일) |
| `src/lib/ai/keys.ts` | `getAiKey/setAiKey/getAllAiKeys/maskAiKey/looksLikeKey` |
| `src/pages/AiChat/index.tsx` | 컨텍스트 생성(가명화·권한별 블록) + `chatWithFallback` 호출 — 동작 불변 |
| `src/lib/skinAnalysis.ts` | 비전 분석 — 키는 `keys.ts` 로(151 에서 어댑터 vision 경로로 이관 예정) |

## 3. 호출 순서
1. 화면이 컨텍스트를 만든다(`buildCrmContext`: 전화 마스킹, 고객 가명 `고객#N`, 직원 계정은 매출·직원 블록 제외, `<data>` 지시 무시 가드).
2. 본사 중계가 켜져 있으면 `aiProxyChat` → 성공 시 끝.
3. 아니면 `chatWithFallback({ keys, system, context, messages })` → `selectProvider` 가 Claude > OpenAI > Gemini 순으로 키 있는 첫 제공사 → 실패하면 나머지로 폴백 → 전부 실패면 "모든 AI API 호출에 실패했습니다…" (CORS 원인은 메시지에 `CLAUDE_CORS_BLOCKED` 가 남아 화면이 브라우저 안내로 바꿈).
4. 응답은 `deAlias` 로 가명을 이름으로 되돌려 표시. 사용량은 `recordUsage`(추정 표시).

## 4. 제공사별 주의
- **Claude**: 브라우저(웹·PWA·모바일)에서는 CORS 로 직접 호출 불가 → Electron 앱에서만. 모델은 코어 `electron/main.cjs` 가 `claude-sonnet-4-20250514` 로 고정(변경은 CORE_EDIT). 사용량은 IPC 가 usage 를 안 돌려줘 추정.
- **OpenAI**: 브라우저 가능. `usage.prompt_tokens/completion_tokens` 사용. 401/403 → `auth`, 429 → `rate`.
- **Gemini**: 브라우저 가능. 키는 URL 이 아니라 `x-goog-api-key` 헤더. `usageMetadata` 사용. 첫 사용자 메시지에 `[CRM 데이터]` 블록을 붙인다.

## 5. 비용·사용량
- 가격은 카탈로그 참고값(USD/100만 토큰, 2026-11 기준) — 실제 청구는 제공사 콘솔이 정본. 화면은 항상 "추정".
- 서버 크레딧 원장(PHASE 5)이 생기면 `recordUsage` 를 서버 기록으로 교체(이 기기 기록은 보조).

## 6. 다음 묶음
- 본사 Managed AI(게이트웨이·모델 라우터·크레딧 원장): `AI-GATEWAY-ARCHITECTURE.md`(160). 순수 규칙 `ai/modelRouterRule.ts`·`ai/creditLedgerRule.ts`.
- 151 설정 → AI 서비스 탭(이용 방식 4종·제공사·모델·키·연결 테스트·한국어 마법사·FAQ) + `AI-USER-CONNECTION-GUIDE.md`
- 152 키 보관 개선 설계(D-13) + 평문 저장 0 테스트 + `AI-SECURITY-POLICY.md`
- 153 AI 경영 브리핑 1차(내부 엔진 결과 → 컨텍스트, 근거·기간·불확실성 표시)
- 154 리뷰 + `AI-TEST-REPORT.md`
