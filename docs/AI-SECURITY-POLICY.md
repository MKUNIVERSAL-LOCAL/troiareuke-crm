# AI 보안 정책 · 키 보관 개선 설계 (152, PHASE 3 BYOK 3/5)

작성 2026-11-24 · 마스터 프롬프트 21절(API 키 평문 금지·개인정보 외부 전송 금지) · GAP A-2 · 승인 D-13(결정)·A-17(코어 Electron IPC)

## 1. 정책 (지금부터 적용)
| 항목 | 규칙 | 구현 |
|---|---|---|
| 키 접근점 | 키 읽기/쓰기는 `src/lib/ai/keys.ts` 한 곳 | 150 |
| 화면 표시 | 전체 키를 다시 보여주지 않는다 — 앞 4·뒤 4 마스킹, 입력란은 password | 151 |
| 로그 | 키·토큰을 console/서버 로그/outbox 에 남기지 않는다(어댑터 오류 메시지는 제공사 문구만) | 150 |
| 백업·내보내기 | Electron 스냅샷·전체 백업에 `ai_key_*`·토큰 제외(`backupSanitize`) + 남은 값의 키 꼴 문자열 가림(`keyLeak.scrubKeyLike`, 전체 백업은 154). 엑셀 내보내기는 고객·결제 표만(키 저장소 아님) | 기존 + 152·154 |
| AI 컨텍스트 | 고객 메모 등 자유 텍스트에 붙여넣은 키 꼴 문자열은 제공사로 나가기 전에 가린다(`keyLeak.scrubKeyLike`) | 152 |
| 개인정보 | 전화 마스킹·고객 가명(`고객#N`)·직원 계정은 매출/직원 블록 제외 — 변경 없음 | 기존 |
| 권한 | 키 등록·삭제는 관리자(`ai.key`) | 기존 |
| Notion·GitHub | 키·전화·실명을 적지 않는다(작업 기록은 집계·구조만) | 운영 규칙 |
| 유출 의심 | 제공사 콘솔에서 revoke → 새 키 등록. 앱은 키를 서버로 보내지 않으므로 서버 측 조치 없음 | 안내(AI-USER-CONNECTION-GUIDE) |

## 2. 현재 상태와 문제
- 지점 키는 `localStorage['ai_key_<provider>']` **평문**. 같은 PC 의 다른 프로그램·백업 도구·개발자 도구에서 읽을 수 있다(21절 위반).
- 본사 AI 중계(NAS `.env` 키)는 서버에만 있어 지점 PC 에는 키가 없다 — 중계를 쓰는 매장은 위반 없음.

## 3. 보관 개선안 3가지 (D-13 결정 요청)
| 안 | 방식 | 바뀌는 것 | 승인 | 비용 | 위험 |
|---|---|---|---|---|---|
| **A. Electron safeStorage(권장, PC)** | 메인 프로세스가 `safeStorage.encryptString(key)` 로 암호화해 `userData/ai-keys.json` 에 저장, 렌더러는 IPC `ai-key:get/set/delete` 로만 접근(복호화는 메인에서만, 렌더러엔 호출 때 평문 전달). OS 키체인(Windows DPAPI/macOS Keychain) 기반 | `electron/main.cjs`·`preload.cjs`(**코어 → CORE_EDIT, A-17**), `keys.ts` 를 비동기 어댑터로(캐시: 앱 세션 동안 메모리) | A-17 | 0원 | 포터블 exe 는 userData 가 exe 옆 폴더 — DPAPI 는 같은 Windows 계정에서만 복호화되므로 PC 교체 시 재입력(안내 필요) |
| **B. 서버 암호화 보관(NAS 매장, 선택)** | 지점이 동의하면 키를 서버에 보내 서버 비밀로 암호화 저장(`branch_ai_keys`), 호출은 서버 `/api/ai/*` 가 지점 키로 대행 → PC 에 키 없음, 폰·브라우저에서도 Claude 사용 가능 | 서버 라우트·테이블(S-7 류, **B-2**), 클라이언트는 "내 키를 본사 서버에 맡기기" 동의 UI | B-2 + 동의 문구(정책) | 0원 | 서버 유출 시 전 지점 키 — 서버 비밀 관리·감사 로그 필수 |
| **C. 모바일 보안 저장소** | Capacitor `secure-storage`(Android Keystore/iOS Keychain) 플러그인 | 모바일 빌드 의존성 추가 | 의존성(오너 확인) | 0원 | 플러그인 유지보수 |

**권장**: A 를 먼저(PC 지점 대부분), NAS 매장은 B 를 선택지로, C 는 스토어 등록 단계에서. 결정 전까지는 1절 정책 + 키 꼴 탐지로 **새는 길**을 막고, 저장 자체의 평문은 D-13 뒤에 해결.

## 4. keys.ts 비동기 전환 설계 (A/B 공통)
```ts
export interface KeyVault { get(p): Promise<string>; set(p, v): Promise<boolean>; remove(p): Promise<boolean> }
// 구현: localVault(지금) → electronVault(IPC, A) → serverVault(B). 앱 시작 때 vault.get 으로 메모리 캐시 → 동기 getAiKey 는 캐시를 읽는다(화면 코드 변경 없음)
```
- 이관: 첫 실행 때 localStorage 의 `ai_key_*` 가 있으면 vault 에 넣고 localStorage 에서 지운다(1회). 실패하면 기존 값 유지하고 안내.
- 테스트: lib-units(키 꼴 탐지·스크럽), 평문 0 검사(`findKeyLikeEntries(localStorage 스냅샷)` 가 A 적용 뒤 빈 배열), E2E(저장 → 재시작 뒤 키 유지, 백업 파일에 없음).

## 5. 승인 요청 문구(큐)
- **D-13**: A(권장) / B / C 중 PC 우선안 결정 + "내 키를 본사 서버에 맡기기" 선택지를 둘지.
- **A-17**: `electron/main.cjs`·`preload.cjs` 에 `ai-key:get/set/delete` IPC + safeStorage 저장(코어 3곳, 각 20줄 안팎). 롤백은 IPC 미제공 → localVault 폴백.
