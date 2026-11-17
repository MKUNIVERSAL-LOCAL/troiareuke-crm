# 더마솔루션 CRM 상용화 로드맵 (2026-11-17 재시작)

오너 지시: "완벽하게 상용화할 수 있는 CRM 솔루션으로 작업 다시 시작."
근거: Codex 롤아웃 서머리 33건(2026-09-21~11-16), 노션 `Derma solution 데이터 저장소`(+하위 2페이지), 노션 `더마솔루션 다운로드·설치 안내`, 리포 docs 전수, 실서버·채널·CI 실측.

## 0. 한 줄 결론

제품 베이스(고객·예약·시술·매출·직원·제품·지출·사진·공지·기능관리·무인 자동 업데이트·백업/복원·가입 승인)는 v1.0.59로 **가동 중**이고 NAS 정본에 저장된다.
그러나 **2026-09-22 이후 8주간 개발이 멈췄고**, 그 사이 Supabase 폴백 프로젝트가 **소멸**(도메인 NXDOMAIN)했으며, 상용화의 3대 병목(발송사·PG·네이버)은 여전히 오너 계약 대기다.
상용화는 "코드로 되는 것"(이 문서 2절)과 "오너 결정·계약"(3절)을 분리해 병렬로 진행한다.

## 1. 실측 현황 (2026-11-17 15:50 KST)

| 항목 | 상태 | 근거 |
|---|---|---|
| 리포 main | 09bb64e (2026-09-22), origin 동기, 열린 PR·이슈 0 | `git log`, `gh pr list`, `gh issue list` |
| 타입검사 | tsc 0 에러 | `npx tsc --noEmit` |
| NAS 서버 | `/health` 200 `{"ok":true,"service":"troiareuke-auth"}` 0.28s | curl |
| 업데이트 채널 | `latest.json` v1.0.59, 설치파일·포터블·zip 3종 sha 게시 | curl |
| Supabase (폴백) | **소멸** — `hmgxhrtqfbffqrleorxf.supabase.co` Non-existent domain, curl exit 6 | nslookup, curl; GitHub `supabase-keepalive` 매일 실패(최소 09-21~11-17, 브리핑 서머리에 매일 기록) |
| CI | keepalive 외 워크플로는 릴리스 시에만 실행 | `gh run list` |
| NAS SSH 자동 게시 | 이 세션에서는 확인 불가(프로덕션 접근 차단) — 09-22 기록: 키 미등록으로 채널 게시 실패, DSM 두 작업 비활성 | DEPLOY-RECORD-2026-09-22 |
| 어드민 구버전 지점 0곳(릴리스 완료 조건) | **미확인** — 어드민 로그인 필요 | — |
| 파일럿(아르케스파) 피드백 | 09-22 이후 노션 기록 없음 | 노션 데이터 저장소 변경 이력 |

Codex 서머리에서 CRM에 직접 관련된 것은 (1) `F:\dev\troiareuke-crm` 경로 소멸로 일일 Git 백업 자동화가 2개월간 안전 중단(정본은 `C:\dev\troiareuke-crm`), (2) Supabase keepalive·GitHub Actions 실패 메일이 매일 브리핑에 잡힘, (3) 브랜드 톤(블루/화이트, Science-Based Derma Aesthetics)과 고객 여정 "모객-관리-상담-CRM", 파트너스 코칭(12월 시작) 두 가지다.

## 2. 코드로 되는 일 — 단계별

### P0. 위생·신뢰 (이번 PR, 2026-11-17)
- [x] NAS 모드에서 소멸한 Supabase를 호출하던 비코어 분기 차단 — Settings 구독 조회·플랜 전환 4곳(`SUPABASE_FALLBACK`), Onboarding 구독 기록 1곳. NAS 빌드는 `VITE_SUPABASE_*`가 함께 들어 있어 `isSupabaseConfigured`가 true였고, 플랜 전환이 "서버에 구독 저장 실패"로 막히는 결함이 있었다.
- [x] `supabase-keepalive` 워크플로 삭제 — 지킬 프로젝트가 없다. 2개월째 매일 실패 메일 발송 중이었다.
- [x] 어드민 콘솔 `alert` 23곳 → 공통 토스트(`notify.error`). 지점 화면(v1.0.56)과 통일.
- [x] API 연동 가이드 "연동 완료 %" → "확인 완료로 표시(자기 체크)" — 자기신고 체크박스를 연동 상태처럼 보이게 하던 문구 정정(FEATURE-REVIEW 6절).
- 검증(2026-11-17): tsc 0 / `npm run build` 성공 / 죽은 라우트 0(26라우트·42지점) / 배포 불변 원칙 전부 PASS / Playwright 3/3(PC 스모크·로그인 거부·모바일 Pixel 7).

### P1. Supabase 완전 제거 (오너 승인 → `CORE_EDIT=1`, 다음 PR) — ⛔ 2026-11-17 자동 모드에서 시도, 분류기 차단
- 시도 기록: AuthContext.tsx 재작성(Supabase 분기 제거, NAS/로컬 2모드)을 자동 모드 분류기가 "Security Weaken"으로 거부. 코어 잠금 파일은 **자동 모드가 아닌 세션에서 오너가 직접 승인**해야 진행 가능. 비코어 14파일만 먼저 걷어내는 반쪽 작업은 모드 분기 불일치만 만들어 보류.
- 전수 조사 결과(제거 범위): src 24파일(코어 store.ts 35곳·AuthContext 26곳 포함), `supabase/schema.sql`+루트 SQL 4종(→ docs/archive), vite.config CSP·SW 캐시 규칙, CI 3개 워크플로의 VITE_SUPABASE_* env, `@supabase/supabase-js` 의존성, ResetPassword 페이지·/reset-password 라우트·main.tsx 복구 리다이렉트, CORE-LOCK·core-lock.mjs 목록.
- 소멸한 백엔드 코드 경로 14파일(코어 4: supabase.ts·AuthContext·store.ts·App 경유)과 루트 SQL 4종, vite CSP/SW 캐시 규칙, `.env` 키 2개, `@supabase/supabase-js` 의존성 제거. 모드는 NAS·로컬 2개로 단순화.
- 영향: 번들 축소, 모드 분기 테스트 면 축소, CLAUDE.md §3·§5의 Supabase 마커 문구 갱신. 로컬 모드(e2e)는 그대로.
- 전제: 구버전(Supabase 전용) 지점이 0곳인지 어드민 텔레메트리로 확인.

### P2. 킬러 기능 ② Before/After 완성 (코드만으로 가능) — 1차 구현 2026-11-17
- [x] 사진 태그: 시술 전/후(`label`, 첫 사진 '전' 기본) + 촬영 각도(`angle`: 정면·좌·우·기타). 시술 기록 폼 썸네일 아래 선택, 상세·타임랩스 배지. 서버 `crm_photos`는 JSONB 통짜라 필드 추가만으로 저장(`PUT /api/photos` 검증은 id·dataUrl만).
- [x] 촬영 가이드(PC): 시술 기록 폼에 같은 고객의 직전 사진을 각도별 최신 1장씩 표시 — "같은 각도·거리·조명" 안내. 카메라 오버레이는 모바일 P3에서.
- [x] 타임랩스 뷰어: Before/After 각각 선택(기본 최초↔최신), 각도 필터, D+N 표시, 비교 이미지 PNG 합성(`src/lib/beforeAfter.ts`, 1200×750, 샵명·날짜·각도·주의문구) → PC 내려받기 / 모바일 공유 시트 / PC 클립보드 복사(카카오톡 PC 붙여넣기).
- [x] 2026-11-17 밤: 고객 상담 모달에서 Before/After 비교 이미지 생성·첨부 — Before/After 사진 선택(기본 최초↔최신), JPEG 압축 후 photoStore `consult:<id>`(NAS crm_photos)에 AI 분석 사진과 함께 저장, 상담 카드 썸네일 → 크게 보기(`PhotoLightbox`, 저장/공유), 상담 삭제 시 사진 정리, 다른 PC/앱에서 저장한 상담 사진 동기화. E2E(before-after.spec)로 생성→저장→새로고침 보존 검증.
- [x] 2026-11-17 밤: 피부 상담 결과지 PDF — `consultReport.ts`(jspdf+나눔고딕 지연 로드, A4 세로, 측정값 타일, 상담 사진·Before/After 비교 임베드, 면책 문구), 상담 카드 [결과지 PDF](PC 내려받기/모바일 공유). before-after E2E로 내려받기 검증.
- [x] 2026-11-17 밤: 모바일 카메라 촬영 시 직전 사진 반투명 오버레이(`CameraOverlay`, P3 항목 참조). P2 코드 항목 전부 완료.
- 사진 저장 구조는 그대로(NAS `crm_photos`), 중기 과제인 파일 스토리지 전환은 별도.

### P3. 모바일 앱 완성도 → 스토어 제출 가능 상태
- [x] 2026-11-17: 모바일 고객 등록 허용(모달 body 포털), 매출·제품 화면 모바일 카드 뷰, 모바일 E2E에 고객·제품·결제 등록 검증 추가.
- [x] 2026-11-17 시각 QA(스크린샷 세트 `SHOTS=1 npx playwright test e2e/screenshots.spec.ts`): 설정 2단 레이아웃이 412px에서 깨지던 문제(탭 칩 가로 스크롤·FormRow 세로 배치), 제품 헤더 "+ +" 중복, 모바일 고객 상세에 Before/After·최근 시술 기록 추가. 전 라우트 순회 안전망(e2e/routes.spec.ts).
- [x] 2026-11-17 저녁: 모바일 고객 정보 수정, 예약 상세 모달 검증, 카메라 바로 촬영(capture), 사진 캐시 용량 초과 자동 정리(NAS 모드), 설정 모바일 레이아웃, ErrorBoundary·모달 Esc. 어드민 콘솔 8화면 순회 안전망.
- [x] 2026-11-17 밤: 모바일 고객 상세 PC 동등화(피부 상담·시술 기록·프로그램 등록·정보 수정), 모바일 폭 전 화면 가로 넘침 전수 검사, 2차 코드리뷰 10건 반영(사진 캐시 dirty/전송 중 보호·서버 android/ios 모드 저장·중첩 모달 Esc·타임랩스 1회 마운트).
- [x] 2026-11-17 밤: 고객 상세 결제 내역(PC·모바일 공용 `CustomerPaymentHistory`, 완료 합계·건수·최근 10건·환불/대기 배지, [결제 등록] → 매출 등록 모달 고객 프리필). smoke E2E 8단계 검증.
- [x] 2026-11-17 밤 데드코드 점검(`tsc --noUnusedLocals --noUnusedParameters`): 비코어 미사용 import·매개변수 6건 정리(Sidebar·PaymentMethodPicker·Admin Layout·AiChat·Onboarding·mobileBridge saveOrShareFile mimeType). 코어 `store.ts` 2건은 기록만(코어 잠금): `objectToSnake`(108행)·`objectToCamel`(117행) 미사용 — P1 Supabase 제거 때 함께 삭제.
- [x] 2026-11-17 밤 스크린샷 UX 리뷰(에이전트, PC 45장+모바일 46장, 15건): 매출 일별 차트 첫 프레임 빈 막대(애니메이션 off), 고객 추가 모달 긴 폼 잘림, 신규 고객 "%" 표기, 320px 고객 헤더 버튼 줄바꿈, 방문 문구("오늘 방문")·금액 단위·예약 상태 라벨 통일, 영업시간 휴무 배지 세로 줄바꿈, 지출 모달 지불 수단 칩 1열, 직원 카드 빈 전화 행·타일 설명 툴팁, 자동 발송 설명 문구 통일, 가로 스크롤 칩 행 오른쪽 여백 — 전부 반영. **범위 밖(기록)**: 어드민 콘솔은 PC 전용 어드민 exe라 모바일 레이아웃 없음(사이드바 고정); 어드민 지점/구독 화면의 NAS 미연결 빈 상태 문구는 로컬 모드에서만 보임.
- [x] 2026-11-17 밤 시각 QA 5차(PC 대시보드 전체 페이지·고객 상세): 우측 알림 열에서 마감 요약 4열 타일이 잘리던 결함 → 2열 고정. 생성기에 `dashboard-full` 샷 추가.
- [x] 2026-11-17 밤 시각 QA 4차(보존기간 정책 ON 상태: 대시보드 안내·고객 화면 칩/익명화 막대·설정 카드, 모바일+PC): 결함 없음. 생성기에 정책 ON + 경과 고객 1명 시드(`customers-retention` 샷) 추가, 카메라 샷은 모바일 프로젝트 한정(PC 폭 숨김 버튼 대기 → 제한 초과 수정).
- [x] 2026-11-17 밤 시각 QA 3차(상담 모달·고객 상세 하단·결제 내역, PC+모바일): 결함 없음. 모바일 최근 시술 기록에 사진 썸네일 추가(PC 동등) + 썸네일 크게 보기(`TreatmentPhotoStrip`). 생성기에 `customer-detail-full`·`customer-detail-bottom`·`modal-consult` 샷 추가. 모바일 E2E: 시술 사진 업로드 → 상세 썸네일 → 크게 보기.
- [x] 2026-11-17 밤: 모바일 앱에서 조용히 실패하던 파일 내보내기 2곳(고객 목록 xlsx·업로드 양식) → `writeWorkbook` 공통 경로(PC 내려받기/모바일 공유 시트)로 통일. 전수 조사: `XLSX.writeFile`·`<a download>`·`createObjectURL` 호출은 이제 dataExport·mobileBridge 안에서만. smoke E2E에 xlsx 다운로드 회귀 추가.
- [x] 2026-11-17 밤: 고객 상세 [예약 추가](PC 헤더·모바일 3열 액션) → `/reservations?new=1&customer=` 고객 프리필. 모바일 시각 확인 완료. smoke E2E 9단계.
- [x] 2026-11-17 밤: 예약 상세 [시술 기록 작성] → `/treatments?new=1&customer=&date=&staff=&services=&reservation=` 프리필(존재하는 고객·담당자·메뉴만), 예약 결제(referenceId) 있으면 결제 연계 생략. 예약→완료→결제→시술 기록(사진)까지 한 흐름. 모바일 E2E 검증.
- [x] 2026-11-17 밤 3차 코드리뷰(오늘 커밋 6건, high 0/med 2/low 6) 전부 반영: 쿼리 프리필(?new=1&customer=…) 1회 캡처 후 URL 정리(수동 열기·뒤로가기에 이전 값 재부착 방지, Treatments·Reservations·Sales·Customers), 모바일 폭에서 데스크톱 상세 미렌더(사진 스트립·결제 내역 2중 실행 제거), 상담 모달 열기 단일 함수(이전 고객 AI 사진 플래시 제거), 첨부 제거 후 재저장 시 기록 사진도 삭제, 비교 이미지 .jpg 확장자, Before≥After 생성 차단, services 반복 키(쉼표 메뉴명), PhotoLightbox 포커스 이동·복원.
- [x] 2026-11-17 밤 D4 완료: 사진 로컬 캐시 localStorage(5~10MB) → IndexedDB(수백 MB) 이관. `photoStore` 백엔드 분리(IDB 기본, 열기 실패 시 localStorage 폴백), 동기 read-through 메모리 캐시 + `onPhotoCacheChange`/`usePhotoCacheVersion` 구독(Customers·Treatments·TimelapseViewer), 구버전 localStorage 사진은 첫 실행 때 읽기 확인 후 무손실 이관, NAS 동기화는 캐시 준비 후에만(이관 전 빈 로컬을 정본으로 올리지 않음). dirty·evicted·tombstone 메타키는 그대로. E2E: IDB 존재·localStorage 사진 키 0·이관 3장 검증.
- [x] 2026-11-18 새벽: 사진 장수 목록을 localStorage(`crm_photo_counts`)에 유지 — 시술 목록 첫 렌더가 사진 본문을 IndexedDB에서 읽지 않는다(모바일 성능). 이관·저장·동기화·로그아웃 때 함께 갱신, 모바일 E2E로 "사진 2장" 표시 검증.
- [x] 2026-11-17 밤 D4 전용 코드리뷰(high 1/med 4/low 5) 전부 반영: 수정 모달은 확정값(getPhotosAsync)을 읽기 전 사진 변경·저장 차단(빈 목록으로 서버 사진 덮어쓰기 사고 차단), IDB 읽기 실패는 캐시하지 않고 null(동기화 판단 보류), 트랜잭션 oncomplete 기준 확정 + 저장 실패 시 용량 초과 토스트, 메모리 LRU 64MB + 목록은 장수만(getPhotoCount), 로그아웃 시 로컬 사진 캐시 삭제(서버 모드, 비코어 5곳), BroadcastChannel 다중 탭 무효화, open 8초 타임아웃→폴백, 연결 강제 종료 시 재연결, 백업 탭 사진 미포함 안내.
- [x] 2026-11-17 밤: 촬영 가이드 카메라 `CameraOverlay` — 네이티브 플러그인 없이 WebView getUserMedia 미리보기 위에 직전 시술 사진을 반투명(투명도 슬라이더·숨김)으로 겹치고, 가이드 사진 선택·전/후면 전환·캔버스 캡처(1280px JPEG)·각도 상속. 미리보기를 못 열면 기존 `<input capture>` 폴백. Android `CAMERA` 권한 추가(Capacitor가 WebView에 위임). Playwright 모바일 프로젝트는 가짜 카메라 장치로 촬영 경로 실검증. iOS `Info.plist`에 `NSCameraUsageDescription`·`NSPhotoLibraryUsageDescription` 추가(리뷰에서 ios/ 프로젝트가 이미 존재함을 확인).
- [x] 2026-11-17 밤 카메라 오버레이 코드리뷰(high 1/med 3/low 3) 전부 반영: 권한 거부·실패 시 프로미스 콜백의 파일 input 자동 클릭(사용자 제스처 만료로 브라우저가 무시, Android는 CAMERA 재요청 루프) 제거 → 오버레이 안 [다시 시도]/[앨범에서 선택] 버튼(탭 안에서 동기 호출), 전면 카메라 가이드도 함께 반전(저장본은 의도적으로 비반전), 전환 실패 시 이전 카메라로 복귀, 비디오·가이드 동일 박스(object-contain) 정렬, videoWidth 0 안내, 포커스 이동·복원.
- [x] 2026-11-17 밤: E2E는 IndexedDB 커밋을 확인한 뒤 page.goto/reload — 전체 새로고침이 비동기 저장을 끊는 레이스 제거(앱 내 SPA 이동은 해당 없음).
- [ ] 스토어 등록 준비는 오너 지시로 맨 마지막.
- 오너 준비물: Play 개발자 계정, Apple Developer(D-U-N-S), 아이콘 1024, 스크린샷, 개인정보처리방침 URL.

### P4. 운영·법규 자동화
- [x] 2026-11-17 서버: 구버전 지점 자동 경보 — 매일 채널 `latest.json`과 최근 7일 접속 지점 PC 버전을 대조해 `outdated_branches` 운영 경보 메일(`OPS_ALERT_EMAIL`, 모바일 앱 제외). 릴리스 완료 조건(48시간 내 0곳)을 사람이 대시보드를 열지 않아도 확인. NAS 서버 재배포 후 가동.
- [x] 2026-11-17 밤: 개인정보 보존기간 정책 — 설정 > 알림 설정 `RetentionPolicyCard`(기본 OFF, 1~10년, 지점 환경설정 서버 동기 `preferences.retentionPolicy`), 마지막 활동(방문·등록 중 늦은 날) 후 기간 경과 고객을 대시보드 `RetentionNoticeCard` + 고객 화면 `?retention=1` 칩/목록으로 모아 **사람이 확인 후 일괄 익명화**(이름→탈퇴고객, 전화·이메일·주소·생년월일·메모·태그·동의 삭제, 방문·결제 통계와 기록 연결은 유지). 자동 삭제는 하지 않음(분쟁 방지). smoke E2E 10단계. **오너 결정: 기간(년)과 켜기 — 기본 3년.** 리뷰(med 3/low 4/info 1) 반영: 익명화가 예약·시술·프로그램·결제·상담 기록의 이름(예약은 전화)과 시술·상담 사진(NAS tombstone 포함)까지 파기, 익명화 고객은 재방문 리마인더·예약/결제링크/발송 대상에서 제외(`isActive=false`), sample_ 제외, 정책 끄기 입력칸 무관, 상세의 동의 표시 "익명화됨". **남은 한계: 제품 판매 기록(`ProductSale.customerName`)은 수정 API가 없어 이름이 남음 — 코어 `store.ts`에 `ProductSaleStore.update` 추가 필요(오너 승인·CORE_EDIT=1).**
- [ ] 사업자등록번호 국세청 진위확인 API(공공데이터포털 키 필요, 무료) → 가입 승인 보조.

### P4-2. 보안 (2026-11-18 새벽 추가)
- [x] 앱 잠금(PIN) — `appLock.ts`(기기별 localStorage, SHA-256 해시, 즉시/1/5/15분), `AppLockOverlay`(visibilitychange·blur/focus, 화면 전체 덮기, 잊으면 로그아웃/잠금 끄기), 설정 > 데이터 백업 `AppLockCard`. 기본 OFF. 모바일 E2E로 켜기→잠금→오답→해제→새로고침 재잠금→끄기 검증. 리뷰(med 3/low 5) 반영: 시작·새로고침 때도 잠금, 이벤트 순서 무관 복귀 판정, 잠금 중 #root inert(키보드 우회 차단), Capacitor appStateChange 병행, 오답 5회 30초 대기, 로컬 모드는 미제공(E2E 빌드만 예외), 로그아웃 시 해제 문구. **코어 메모**: AuthContext 로그아웃이 crm_app_lock도 지움(기기별 유지하려면 LOGOUT_PRESERVE 추가 — 오너 승인).

### P4-1. 매출 누수 방지 (2026-11-17 밤 추가)
- [x] 카드 2종 코드리뷰(med 2/low 5) 반영: 회차권 날짜 기준을 지역 날짜로 통일(UTC 하루 오차), 마지막 회차 사용으로 완료된 프로그램도 소진 알림(재구매 핵심 순간, 이미 재구매했으면 제외), 대시보드 포커스 복귀 시 카드 재계산(refreshKey), 복사 피드백 분리, 생성기 회차권 시드 실제 삽입, 접근성 라벨·E2E 선택자.
- [x] 마감 요약·결과지 PDF 리뷰(med 1/low 4) 반영: 신규 고객은 registeredAt(UTC)을 지역 날짜로 변환해 비교, 결제 건수는 referenceId 기준(분할 결제 1건), 환불은 "오늘 결제분 중 환불"로 표기(Payment에 환불일 없음 — 코어), 매출 0이어도 환불·지출 표시, PDF 꼬리말을 모든 페이지 하단 여백에·제목 고아 방지.
- [x] 생일 임박 고객 — `birthdayAlerts.ts`(7일 이내, 연말 경계, 익명화 제외) + 대시보드 `BirthdayCard`(축하 안내 초안 복사/공유, 고객 상세 열기). smoke E2E 6-3.
- [x] 오늘 마감 요약 — `dailyClose.ts`(오늘 완료 결제 합계·건수·수단별·구분별, 환불, 지출, 시술 수, 신규 고객, 예약 결과) + 대시보드 `DailyCloseCard`(복사/공유, 매출 모듈 OFF면 숨김). smoke E2E 6-2(클립보드 본문 검증).
- [x] 내일 예약 안내 — `reservationReminder.ts`(내일 확정·대기 예약, 익명화 고객 제외), 대시보드 `TomorrowReservationCard`(고객별/전체 안내 초안 복사·공유, 항목 → 예약 상세). 설정의 "예약 리마인더 자동 발송"은 발송사 연동 후 서버가 담당. smoke E2E 6-1.
- [x] 회차권 소진·만료 임박 알림 — `programAlerts.ts`(잔여 0/1회, 만료 지남/14일 이내, 긴급 순), 대시보드 `ProgramAlertCard`(PC·모바일, 재구매 안내 초안 복사/공유, 항목 → `/customers?open=<id>` 고객 상세 바로 열기). smoke E2E 7-0.

### P4-3. 고객 관리 완성도 (2026-11-18 새벽 추가, 코어 무수정)
- [x] 고객 목록 정렬 — 최근 방문순(기본)·이름순·최근 등록순·누적 결제순, PC·모바일 칩 행. smoke E2E.
- [x] 빠른 메모 — 고객 상세(PC·모바일)에서 수정 모달 없이 `[날짜] 한 줄`을 메모에 덧붙임, 메모 줄바꿈 표시. 모바일 E2E.
- [x] 중복 고객 병합 — `src/lib/customerMerge.ts` + `CustomerMergeModal`(PC [병합]·모바일 [중복 고객 병합]). 남길 고객(현재 상세)으로 흡수 고객의 예약·시술·프로그램·결제·상담 기록을 각 스토어 `update`로 이동(결제는 `PaymentStore.update`가 누적 결제액을 양쪽 반영, 사진은 기록 id에 묶여 그대로), 방문 횟수·마지막 방문·태그·메모 합산, 빈 정보(이메일·주소·생년월일·피부타입·알레르기·유입경로·동의)는 흡수 고객 값으로 보충, 그 뒤 흡수 고객 삭제. 샘플·익명화 고객 제외, 확인 2단계. smoke E2E 9-1(예약·시술·결제 재연결, 흡수 id 잔존 0, 회차 불변, 방문·누적 결제·메모·등급·등록일 합산 검증). **남은 한계: 제품 판매 기록(`ProductSale.customerId`)은 수정 API가 없어 흡수 고객 id가 남음 — 위 P4 코어 메모(`ProductSaleStore.update`)와 같은 건. 서버 결제 요청(payment_requests.customer_id)도 재배정 API 없음 — 미결 요청이 있으면 모달이 병합을 막고 안내.**
- [x] 직원별 월 실적 — `src/lib/staffPerformance.ts`(예약은 staffId, 시술·제품 판매는 staffName으로 연결; 완료 예약 건수·예약액, 예정 예약, 시술 건수, 제품 판매액, 응대 고객 수(중복 제거); 취소·노쇼 제외; 담당 미지정·퇴사 직원 기록은 건수만 안내) + `StaffPerformanceCard`(달 선택 6개월, 표, 보고 문구 복사/공유 — 공용 MessageDraftPanel). 결제(Payment)에 담당 직원이 없어 "예약액 기준, 실입금과 다를 수 있음"을 화면·문구에 명시. smoke 9-3. 리뷰(high 2/med 4/low 4/info 3) 반영: 같은 이름 직원은 재직자 우선·재직자끼리 겹치면 '구분 불가'로 집계 + 직원 추가/수정에서 같은 이름 재직자 금지, 제품 판매 담당자를 자유 입력 → 재직 직원 select(판매일 기본값도 지역 날짜), 직원 이름 변경 시 시술 기록 담당자 일괄 변경(제품 판매는 코어 API 없음 — 안내), 지난 달 미완료 예약은 '남은 일정'이 아니라 '미완료 N'으로 표시 + 완료 처리 안내, 카드 "월 예약액(예정 포함)" vs 표 "완료 예약액"으로 라벨 분리, 보고 문구는 report 메모(직원 수정 후 stale 방지), 첫 열 sticky·th scope·aria-expanded, E2E 셀 단위 단언.
- [x] 활동 타임라인 — `src/lib/customerTimeline.ts`(예약·시술·상담·프로그램·결제를 날짜·시간 역순 병합, 취소/노쇼/환불 강조, 결제·프로그램 금액) + `CustomerTimeline`(종류 칩 필터, 12건씩 더 보기, 예약은 `/reservations?open=`, 시술은 새로 추가한 `/treatments?open=`으로 이동). PC는 결제 내역 아래, 모바일은 상담 이력 아래(compact). smoke 9-2(필터 건수·시술 열기), 모바일 E2E. 리뷰(med 3/low 5/info 6) 반영: 프로그램 등록 행의 금액 제거(자동 생성 결제 행과 이중 표시) → 상세 문구로, 상담 삭제 시 타임라인 갱신, 걸러 둔 종류가 사라지면 '전체'로 복귀, 고객 전환 시 필터·펼침 초기화(key), 종류 칩을 tablist 대신 aria-pressed 토글로, button 안 p/div → span, 날짜 5종 모두 YYYY-MM-DD 정규화, 환불은 금액 취소선, E2E는 걸러진 보기에서 단언(12건 페이지 한계).
- [x] 중복 의심 안내 — `findSamePhoneCustomers`(전화 숫자 8자리 이상 일치, 샘플·익명화 제외) → 고객 상세(PC·모바일) "같은 전화번호 고객 N명 — 병합하기" 버튼이 전화번호가 입력된 병합 창을 연다. smoke 9-1이 이 경로로 병합.
- [x] 병합 코드리뷰(high 1/med 2/low 6/info 2) 반영: 익명화 고객을 target/source로 병합 금지(익명 레코드에 개인정보가 들어가 영구 미파기되는 경로 차단, 버튼·실행 동일 규칙 `mergeBlockReason`), 제품 판매 미이동 건수·완료 결제 기준 금액(화면 누적과 다르면 경고)·미결 결제 링크(서버 조회 실패 시 실행 금지) 안내, isActive OR·등급 높은 쪽·등록일 이른 쪽·성별 보충, 모달 Escape/배경 클릭 닫기·검색칸 자동 포커스·후보 50명 초과 안내·iOS select 대신 라디오 목록, E2E 픽스처를 명시 구성(예약·시술 추가).

### P5. 가격·플랜 반영
- RESEARCH-MESSAGING-BILLING 6절 오너 가격안(첫 1년 9,900 → Start 24,900 → AI Pro 59,000) 확정 시: 플랜별 발송 제공량·잔여 표시·어드민 청구액 표. PG 개통 전에는 "청구 예정액" 표시까지만.

## 3. 오너 결정·계약 (코드로 못 푸는 것)

| # | 결정 | 효과 | 비용·소요 |
|---|---|---|---|
| 1 | **Supabase 완전 제거 승인**(P1) | 죽은 경로 제거, 모드 2개로 단순화 | 0원, 1 PR |
| 2 | 발송사 계약(SOLAPI) → `.env` 3개 + `REMINDER_ENABLED=true` | 문자·알림톡 실발송, 자동 재방문 알림(킬러③) 가동 | 월 기본료 0, 알림톡 13원/SMS 18원 |
| 3 | 본사 AI 키 `.env` 투입 | AI 피부분석·챗봇(킬러①) 지점 키 없이 가동 | 사용량 과금 |
| 4 | PG 계약(토스/포트원) → 빌드 env 2 + 서버 TOSS_* | 결제 링크·구독 실결제 | 계약 심사 1~2주 |
| 5 | 네이버 제휴 제안 제출(`docs/NAVER-PARTNERSHIP-PROPOSAL.md`) | 네이버 예약 동기화 | 검토 5일+ |
| 6 | Google Cloud OAuth 클라이언트 생성 | Google 캘린더 연동 활성 | 무료, 반나절 |
| 7 | NAS SSH 키 등록 + DSM 두 작업 "매일 00:00" 활성 | 릴리스 전자동(PC→채널→서버) 복구 | 2분 |
| 8 | 아르케스파 파일럿 피드백 기록 재개 | 우선순위의 실측 근거 | — |

## 3-1. v1.0.60 릴리스 준비 상태 (2026-11-17 밤 실측)
- 지점 exe(`electron:build:dir`)·어드민 exe(`electron:build:admin:dir`) 빌드 성공. asar 마커: NAS 3건 / Supabase 0건 / 버전 1.0.60. CDP 런타임: 지점 `isAdminBuild=false`(로그인 화면), 어드민 `isAdminBuild=true`(어드민 로그인).
- 2026-11-17 21:35 재검증(오늘 밤 커밋 전부 반영 후): `check:routes` 26라우트·43지점 죽은 라우트 0 / 배포 불변 원칙 전부 PASS / 업데이터 헬퍼 테스트 통과 / `build:mobile`(Capacitor 번들) 성공 / Playwright 5/5. 지점 exe·어드민 exe 재빌드: asar NAS 3·Supabase 0·IndexedDB 마커 3·v1.0.60, CDP 런타임 지점 `isAdminBuild=false`(#/login)·어드민 `true`(#/admin/login), IndexedDB 사용 가능. (주의: 저녁 CDP 검증 후 남은 Electron 프로세스 8개가 빌드 폴더를 잠가 첫 빌드가 실패했음 — 검증 스크립트는 taskkill /T로 종료, 메모리에 기록.)
- 2026-11-17 23:31 재검증 2차(마감 요약·생일·회차권·내일 예약·결과지 PDF·보존기간까지 반영 후): 게이트 3종 PASS / `build:mobile` 성공 / Playwright 5/5 / 지점·어드민 exe 재빌드 asar NAS 3·Supabase 0·IDB 3·v1.0.60(신규 문자열 마감 요약·생일 고객 포함) / CDP 지점 false(#/login)·어드민 true(#/admin/login) / 잔존 프로세스 0. PR #54 CI 전부 통과.
- 2026-11-18 00:22 `npm run mobile:prepare` 사전 실행 성공: build:mobile → 버전 동기(android versionCode 1000060/1.0.60, ios 1000060/1.0.60 — 커밋됨) → `cap sync android`(플러그인 6종) → mobile-latest.json v1.0.60(minSupported 1.0.58).
- 2026-11-18 00:33 플래키 점검: Playwright 전체 5개 연속 3회 모두 통과(각 ~26초). 재방문 리마인더 카드도 refreshKey 재계산으로 통일.
- 2026-11-18 01:35 3차 재검증(병합·중복 안내·타임라인 반영 후, HEAD 65e1634): check:distribution·check:routes·test:updater·build:mobile 통과, 지점·어드민 exe 재빌드(asar 01:33/01:34) → asar NAS 3/Supabase 0/IndexedDB 3/타임라인·병합 포함/v1.0.60, CDP 런타임 지점 isAdminBuild=false(#/login)·어드민 true(#/admin/login), 검증 후 Electron 잔존 프로세스 0.
- 남은 것: PR #54 머지 → `npm run release:all`(게이트 전부 통과 상태) → NAS 채널 게시·서버 재배포(오너).

## 4. 릴리스 운영 원칙 (변경 없음)
- `npm run release:all` 게이트(라우트·불변 원칙·업데이터 테스트·E2E PC+모바일) 통과 후에만 릴리스. 재다운로드 금지. 릴리스 완료 = 채널 라이브 + `verify:nas` 5/5 + 48시간 내 구버전 지점 0곳.
- 코어 잠금 파일은 오너 승인 + `CORE_EDIT=1`로만.

## 5. 다음 세션 착수 순서 (2026-11-18 아침용 — 요약은 `docs/OWNER-BRIEFING-2026-11-18.md`)
1. **오너**: PR #54 머지 → `npm run release:all`(v1.0.60) → NAS 채널 게시(SSH 키 또는 DSM 두 작업) → 서버 재배포(구버전 지점 경보 가동) → 48시간 뒤 경보 메일/대시보드로 구버전 0곳 확인.
2. **오너**: Codex 자동화 `crm-10-git` 경로 F:→C: 수정, DSM 두 작업 "매일" 활성, P1(코어 Supabase 제거) 승인 — 자동 모드가 아닌 세션에서 `CORE_EDIT=1`.
3. 다음 개발: P3 D4 사진 저장 이관(Capacitor Filesystem) → 안드로이드 서명 키 → Play 내부 테스트. P4 보존기간 정책은 오너 기간 결정 후.
4. 시각 QA 루틴: 릴리스 전 `SHOTS=1 SHOTS_DIR=<밖의 폴더> npx playwright test e2e/screenshots.spec.ts --project=mobile` 로 모바일 세트 확인.
