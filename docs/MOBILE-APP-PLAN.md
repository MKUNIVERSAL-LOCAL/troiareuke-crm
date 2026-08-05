# 모바일 앱(Play 스토어 / App Store) 이식 계획

> 작성: 2026-08-05 · 대상 커밋 `0e05c49` · 오너 지시("지금 만든 프로그램을 그대로 앱으로")에 대한 코드 기준 실사 결과
> **결론: 가능하다.** 방식은 **Capacitor**(현재 웹 빌드를 iOS/Android 네이티브 셸로 감싸기).
> React Native·Flutter 재작성 불필요. 다만 "그대로"는 아니고 아래 P0 항목은 반드시 손봐야 한다.

## 왜 Capacitor인가
현 구조가 `React+Vite 웹앱`을 `Electron 셸`이 감싸는 형태라, 같은 웹 빌드를 모바일 셸로
한 번 더 감싸는 것이 자연스럽다. 화면 코드·상태관리·NAS REST 연동은 전부 재사용된다.
서버(NAS)는 손댈 것이 없다.

---

## ✅ 이미 되어 있는 것 (재사용)

| 항목 | 근거 |
|---|---|
| 모바일 셸 (하단 탭바 + 사이드바 오버레이) | `MobileTabBar.tsx` — safe-area 대응, 56px 터치타깃 / `Layout.tsx` |
| 4대 핵심 화면의 **모바일 전용 뷰가 이미 별도 구현** | `Dashboard:132` · `Customers:738` · `Reservations:243` · `Treatments:56` |
| 사진 촬영·선택 업로드 | `Treatments:446`, `Customers:1802` — `<input type=file accept=image/*>`로 카메라 접근 가능 |
| 오프라인 쓰기 큐 + 재시도 | `nasOutbox.ts`, `nasData.ts` |
| 구독 결제 비활성 상태 | `featureFlags.ts:15` `PAYMENT_ENABLED=false` — **Apple IAP 위반 경로가 현재 0개** |
| Electron 전용 기능의 안전한 폴백 | 백업(`App.tsx:136`), 캘린더(`googleCalendar.ts:67`) 모두 undefined 가드 존재 |

---

## 🔧 반드시 고쳐야 하는 것

### P0 — 데이터 유실·기능 파손 (착수 전 필수)

**1. 사진·오프라인 큐·로그인 토큰이 전부 localStorage에 있다**
- 사진: `photoStore.ts:16` — 1280px JPEG **base64**를 엔티티당 1키로 저장 (장당 200~400KB)
- 상담 사진: `consultationStore.ts` + `types:322` — 레코드 배열 통짜에 base64 혼입
- 미전송 큐: `nasOutbox.ts:13` / 인증 토큰: `authApi.ts:32`
- **문제**: 모바일 WebView의 localStorage는 오리진당 대략 5~10MB이고, **iOS는 저장공간이 부족하면 website data를 통째로 삭제할 수 있다.** 사진 15~25장이면 포화되고, 그 시점에 **미전송 매출·시술 기록과 로그인 세션이 함께 증발**한다.
- **조치**: 사진 → `@capacitor/filesystem`(또는 IndexedDB), 큐 → IndexedDB, 토큰 → `@capacitor/preferences`/Keychain. 총량 가드(`navigator.storage.estimate()`)와 장수 상한도 함께.
- 참고: 현재 가드는 `store.ts:74` `safeSetItem`의 **quota 초과 "감지·경고"뿐**이고 정리·예방 로직은 없다.

**2. 엑셀·PDF 내보내기가 iOS에서 아무 반응 없이 죽는다**
- `dataExport.ts:319` `XLSX.writeFile()`, `pdfExport.ts:82` `doc.save()`
- 둘 다 내부적으로 `<a download>`를 쓰는데 **iOS WKWebView는 download 속성을 무시**한다. 오류도 안 나고 그냥 아무 일이 없다 — 사용자 입장에서 최악의 버그 유형.
- **조치**: `XLSX.write({type:'base64'})` / `doc.output('datauristring')` → Filesystem 저장 → `@capacitor/share`로 넘기기.

**3. 빌드 설정 3종**
- `vite.config.ts:159` base가 `'/'` → 커스텀 스킴에서 asset 로드 실패. `BUILD_TARGET=capacitor → './'` 분기 필요 (v1.0.43 흰화면 사고와 동일 계열).
- `vite.config.ts:56` PWA/Service Worker가 Electron 빌드에서만 꺼짐 → 모바일에서도 꺼야 함(앱 번들 ↔ SW 이중 캐시 충돌).
- `vite.config.ts:20` CSP에 `capacitor://localhost`·`https://localhost` 추가, 죽은 `http://127.0.0.1:19876` 제거.

### P1 — 동작은 하나 사용성·심사에 걸림

| 항목 | 위치 | 조치 |
|---|---|---|
| 외부 링크가 앱 안에 갇힘(뒤로가기 불가) | `Dashboard:313`, `Reservations:593,695,760`, `ApiGuide:334,389,393` | `@capacitor/browser` 위임 헬퍼로 일괄 교체 |
| 라우터 분기가 Electron만 감지 | `App.tsx:162` · `Onboarding:331` · `main.tsx:12-36` | Capacitor 감지 추가. HashRouter 채택 시 절대경로 이동 전부 정리(온보딩 무한루프 함정 재발 주의) |
| Google 캘린더 연동 **모바일 불가** | `googleCalendar.ts:19` — redirect가 `127.0.0.1:19876` 로컬서버. 모바일은 리스닝 자체가 불가하고, 임베디드 WebView 로그인은 구글이 차단 | PKCE + 딥링크로 재작성하거나, 당분간 **기능 숨김**(현재도 "데스크톱 전용" 안내로 안전하게 비활성) |
| 비밀번호 재설정 메일 링크가 앱으로 안 돌아옴 | `main.tsx:12-18` | Universal Links / App Links 설정 |

### P2 — 화면 품질

- 표 위주 화면에 모바일 뷰 없음: `Sales:648,752`(min-w 720px), `Products:193,319`(900/760px) → Customers의 카드 리스트 패턴 재사용
- `Settings/index.tsx`(1,400줄, 8탭)에 반응형 클래스가 **1개**뿐 → 레이아웃 정리 필요
- 폰트 원격 로드(`index.html:14`) → 로컬 번들(오프라인 첫 실행 시 깨짐)
- `viewport-fit=cover` 누락(`index.html:8`) — safe-area CSS는 이미 있음

---

## ❌ 모바일 빌드에서 빼야 하는 것

| 항목 | 위치 | 사유 |
|---|---|---|
| 자체 업데이트 UI 전체 | `UpdateNotification.tsx`, `UpdateBanner.tsx` | **앱이 스스로 코드를 교체하는 것은 양대 스토어 정책 위반.** 스토어 자동 업데이트로 대체(재다운로드 금지 원칙과 오히려 부합) |
| 구독/플랜 탭 **(iOS)** | `Settings:85`, `:1146-1285`, `payment.ts:179` | Guideline 3.1.1. **가격 표기(29,000/59,000원)만으로도 외부 구매 유도로 지적될 수 있음.** iOS는 `PAYMENT_ENABLED` 영구 false 고정 |
| 경쟁 스토어 링크 **(iOS)** | `Dashboard:321`(Google Play), `:329`(App Store) | 외부 앱·스토어 유도 리젝 리스크 |
| 어드민 콘솔 라우트 | `Admin/Layout.tsx:66`(w-64 고정, 모바일 토글 없음) + Admin 8개 화면 반응형 0 | 데스크톱 전용 설계. 모바일 슈퍼어드민 로그인 시 레이아웃 파손 → 라우트 차단이 가장 싸고 안전 |
| iamport SDK 원격 스크립트 | `index.html:18` | 결제 미사용 + 불필요 외부 스크립트 |
| 데이터 백업(폴더 열기) 버튼 | `Settings:1406-1435` | 모바일에 폴더 개념 없음 |
| `electron/` 전체 + electron-updater | `package.json` | 번들 미포함 |

---

## 심사 통과 전략

**Apple 4.2 (최소 기능)** — "웹사이트를 감싸기만 한 앱"은 반려된다. 아래 네이티브 요소를
실제로 넣어 앱다움을 확보한다. 대부분 우리 업무에 자연스럽게 필요한 것들이다.
- 카메라 촬영(시술 전후 사진) — `@capacitor/camera`
- 오프라인 사용(이미 outbox 구조 있음) — 스토리지 이전과 함께 홍보 포인트화
- 예약 리마인더 로컬 알림 — `reminderEngine.ts` 로직 재활용
- 시스템 공유 시트(엑셀/PDF 내보내기) — P0-2와 동시 해결

**배포 경로** — 제휴 매장 전용 B2B 도구이므로:
1. **Unlisted(비공개 목록)** — 스토어에 있으나 검색 노출 없음, 링크로만 설치. **권장**
2. Apple Business Manager 커스텀 앱 — 조직 지정 배포, 4.2 심사 사실상 우회
3. 일반 공개 — 4.2 심사가 가장 빡셈

**건강 앱 신고** — Play는 건강 앱 선언 양식 작성 필요. AI 피부분석은 진단·치료 권장으로
읽히면 의료기기 소프트웨어(SaMD)로 분류되니 **"관리 참고용" 톤을 유지**한다(의료법 27조 대응과 동일 기조).

**개인정보** — 고객 PII + 피부상태·시술기록은 민감정보. 개인정보처리방침 URL 필수,
Play 데이터 안전 양식 작성, iOS Info.plist 권한 사유 문구(`NSCameraUsageDescription` 등) 필요.

---

## 계정·비용·기간

| 항목 | 내용 |
|---|---|
| Apple Developer Program | 연 $99. **법인은 D-U-N-S 번호 필요(발급 1~2주)** |
| Google Play Console | 최초 $25. 조직 계정으로 외부 공개 시 D-U-N-S 필요 |
| 심사 | Apple 1~3일 / Google 며칠~2주 |
| 개발 | P0+P1 기준 **2~3주** (P2 화면 품질까지면 +1~2주) |

> **D-U-N-S 발급이 임계경로다.** 개발과 무관하게 가장 먼저 신청해둘 것.

---

## ⚠️ 착수 전 선행 과제 — 코어 잠금

수정이 필요한 파일 상당수가 `🔒 CORE` 잠금 대상이다:
`src/App.tsx`, `src/main.tsx`, `src/lib/store.ts`, `src/lib/googleCalendar.ts`,
`src/lib/payment.ts`, `electron/preload.cjs`.

`docs/CORE-LOCK.md`의 `CORE_EDIT=1` 절차와 **오너 승인**이 선행되어야 한다.
가능한 부분은 비코어 파일(신규 `src/lib/platform.ts`, `src/lib/nativeBridge.ts` 등)로
분리해 코어 변경을 최소화한다.

---

## 권장 진행 순서

1. **D-U-N-S 신청** (오너, 즉시 — 개발과 병렬)
2. 배포 경로 결정 (Unlisted 권장)
3. P0 스토리지 이전 — 사진·큐·토큰 (가장 오래 걸리고 가장 위험)
4. P0 내보내기·빌드 설정
5. Capacitor 셸 붙이기 + 실기기 스모크
6. P1 외부링크·라우팅·딥링크
7. 네이티브 요소(카메라·로컬알림) 추가 → 4.2 대응
8. 스토어 등록 서류(개인정보·데이터안전·건강앱 선언) → 제출
