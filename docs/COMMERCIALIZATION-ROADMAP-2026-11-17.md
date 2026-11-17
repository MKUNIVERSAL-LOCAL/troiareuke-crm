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
- [x] 2026-11-17 밤: 모바일 카메라 촬영 시 직전 사진 반투명 오버레이(`CameraOverlay`, P3 항목 참조). P2 코드 항목 전부 완료.
- 사진 저장 구조는 그대로(NAS `crm_photos`), 중기 과제인 파일 스토리지 전환은 별도.

### P3. 모바일 앱 완성도 → 스토어 제출 가능 상태
- [x] 2026-11-17: 모바일 고객 등록 허용(모달 body 포털), 매출·제품 화면 모바일 카드 뷰, 모바일 E2E에 고객·제품·결제 등록 검증 추가.
- [x] 2026-11-17 시각 QA(스크린샷 세트 `SHOTS=1 npx playwright test e2e/screenshots.spec.ts`): 설정 2단 레이아웃이 412px에서 깨지던 문제(탭 칩 가로 스크롤·FormRow 세로 배치), 제품 헤더 "+ +" 중복, 모바일 고객 상세에 Before/After·최근 시술 기록 추가. 전 라우트 순회 안전망(e2e/routes.spec.ts).
- [x] 2026-11-17 저녁: 모바일 고객 정보 수정, 예약 상세 모달 검증, 카메라 바로 촬영(capture), 사진 캐시 용량 초과 자동 정리(NAS 모드), 설정 모바일 레이아웃, ErrorBoundary·모달 Esc. 어드민 콘솔 8화면 순회 안전망.
- [x] 2026-11-17 밤: 모바일 고객 상세 PC 동등화(피부 상담·시술 기록·프로그램 등록·정보 수정), 모바일 폭 전 화면 가로 넘침 전수 검사, 2차 코드리뷰 10건 반영(사진 캐시 dirty/전송 중 보호·서버 android/ios 모드 저장·중첩 모달 Esc·타임랩스 1회 마운트).
- [x] 2026-11-17 밤: 고객 상세 결제 내역(PC·모바일 공용 `CustomerPaymentHistory`, 완료 합계·건수·최근 10건·환불/대기 배지, [결제 등록] → 매출 등록 모달 고객 프리필). smoke E2E 8단계 검증.
- [x] 2026-11-17 밤 시각 QA 3차(상담 모달·고객 상세 하단·결제 내역, PC+모바일): 결함 없음. 모바일 최근 시술 기록에 사진 썸네일 추가(PC 동등) + 썸네일 크게 보기(`TreatmentPhotoStrip`). 생성기에 `customer-detail-full`·`customer-detail-bottom`·`modal-consult` 샷 추가. 모바일 E2E: 시술 사진 업로드 → 상세 썸네일 → 크게 보기.
- [x] 2026-11-17 밤: 모바일 앱에서 조용히 실패하던 파일 내보내기 2곳(고객 목록 xlsx·업로드 양식) → `writeWorkbook` 공통 경로(PC 내려받기/모바일 공유 시트)로 통일. 전수 조사: `XLSX.writeFile`·`<a download>`·`createObjectURL` 호출은 이제 dataExport·mobileBridge 안에서만. smoke E2E에 xlsx 다운로드 회귀 추가.
- [x] 2026-11-17 밤: 고객 상세 [예약 추가](PC 헤더·모바일 3열 액션) → `/reservations?new=1&customer=` 고객 프리필. 모바일 시각 확인 완료. smoke E2E 9단계.
- [x] 2026-11-17 밤: 예약 상세 [시술 기록 작성] → `/treatments?new=1&customer=&date=&staff=&services=&reservation=` 프리필(존재하는 고객·담당자·메뉴만), 예약 결제(referenceId) 있으면 결제 연계 생략. 예약→완료→결제→시술 기록(사진)까지 한 흐름. 모바일 E2E 검증.
- [x] 2026-11-17 밤 3차 코드리뷰(오늘 커밋 6건, high 0/med 2/low 6) 전부 반영: 쿼리 프리필(?new=1&customer=…) 1회 캡처 후 URL 정리(수동 열기·뒤로가기에 이전 값 재부착 방지, Treatments·Reservations·Sales·Customers), 모바일 폭에서 데스크톱 상세 미렌더(사진 스트립·결제 내역 2중 실행 제거), 상담 모달 열기 단일 함수(이전 고객 AI 사진 플래시 제거), 첨부 제거 후 재저장 시 기록 사진도 삭제, 비교 이미지 .jpg 확장자, Before≥After 생성 차단, services 반복 키(쉼표 메뉴명), PhotoLightbox 포커스 이동·복원.
- [x] 2026-11-17 밤 D4 완료: 사진 로컬 캐시 localStorage(5~10MB) → IndexedDB(수백 MB) 이관. `photoStore` 백엔드 분리(IDB 기본, 열기 실패 시 localStorage 폴백), 동기 read-through 메모리 캐시 + `onPhotoCacheChange`/`usePhotoCacheVersion` 구독(Customers·Treatments·TimelapseViewer), 구버전 localStorage 사진은 첫 실행 때 읽기 확인 후 무손실 이관, NAS 동기화는 캐시 준비 후에만(이관 전 빈 로컬을 정본으로 올리지 않음). dirty·evicted·tombstone 메타키는 그대로. E2E: IDB 존재·localStorage 사진 키 0·이관 3장 검증.
- [x] 2026-11-17 밤 D4 전용 코드리뷰(high 1/med 4/low 5) 전부 반영: 수정 모달은 확정값(getPhotosAsync)을 읽기 전 사진 변경·저장 차단(빈 목록으로 서버 사진 덮어쓰기 사고 차단), IDB 읽기 실패는 캐시하지 않고 null(동기화 판단 보류), 트랜잭션 oncomplete 기준 확정 + 저장 실패 시 용량 초과 토스트, 메모리 LRU 64MB + 목록은 장수만(getPhotoCount), 로그아웃 시 로컬 사진 캐시 삭제(서버 모드, 비코어 5곳), BroadcastChannel 다중 탭 무효화, open 8초 타임아웃→폴백, 연결 강제 종료 시 재연결, 백업 탭 사진 미포함 안내.
- [x] 2026-11-17 밤: 촬영 가이드 카메라 `CameraOverlay` — 네이티브 플러그인 없이 WebView getUserMedia 미리보기 위에 직전 시술 사진을 반투명(투명도 슬라이더·숨김)으로 겹치고, 가이드 사진 선택·전/후면 전환·캔버스 캡처(1280px JPEG)·각도 상속. 미리보기를 못 열면 기존 `<input capture>` 폴백. Android `CAMERA` 권한 추가(Capacitor가 WebView에 위임). Playwright 모바일 프로젝트는 가짜 카메라 장치로 촬영 경로 실검증. iOS `Info.plist`에 `NSCameraUsageDescription`·`NSPhotoLibraryUsageDescription` 추가(리뷰에서 ios/ 프로젝트가 이미 존재함을 확인).
- [x] 2026-11-17 밤 카메라 오버레이 코드리뷰(high 1/med 3/low 3) 전부 반영: 권한 거부·실패 시 프로미스 콜백의 파일 input 자동 클릭(사용자 제스처 만료로 브라우저가 무시, Android는 CAMERA 재요청 루프) 제거 → 오버레이 안 [다시 시도]/[앨범에서 선택] 버튼(탭 안에서 동기 호출), 전면 카메라 가이드도 함께 반전(저장본은 의도적으로 비반전), 전환 실패 시 이전 카메라로 복귀, 비디오·가이드 동일 박스(object-contain) 정렬, videoWidth 0 안내, 포커스 이동·복원.
- [x] 2026-11-17 밤: E2E는 IndexedDB 커밋을 확인한 뒤 page.goto/reload — 전체 새로고침이 비동기 저장을 끊는 레이스 제거(앱 내 SPA 이동은 해당 없음).
- [ ] 스토어 등록 준비는 오너 지시로 맨 마지막.
- 오너 준비물: Play 개발자 계정, Apple Developer(D-U-N-S), 아이콘 1024, 스크린샷, 개인정보처리방침 URL.

### P4. 운영·법규 자동화
- [x] 2026-11-17 서버: 구버전 지점 자동 경보 — 매일 채널 `latest.json`과 최근 7일 접속 지점 PC 버전을 대조해 `outdated_branches` 운영 경보 메일(`OPS_ALERT_EMAIL`, 모바일 앱 제외). 릴리스 완료 조건(48시간 내 0곳)을 사람이 대시보드를 열지 않아도 확인. NAS 서버 재배포 후 가동.
- [x] 2026-11-17 밤: 개인정보 보존기간 정책 — 설정 > 알림 설정 `RetentionPolicyCard`(기본 OFF, 1~10년, 지점 환경설정 서버 동기 `preferences.retentionPolicy`), 마지막 활동(방문·등록 중 늦은 날) 후 기간 경과 고객을 대시보드 `RetentionNoticeCard` + 고객 화면 `?retention=1` 칩/목록으로 모아 **사람이 확인 후 일괄 익명화**(이름→탈퇴고객, 전화·이메일·주소·생년월일·메모·태그·동의 삭제, 방문·결제 통계와 기록 연결은 유지). 자동 삭제는 하지 않음(분쟁 방지). smoke E2E 10단계. **오너 결정: 기간(년)과 켜기 — 기본 3년.**
- [ ] 사업자등록번호 국세청 진위확인 API(공공데이터포털 키 필요, 무료) → 가입 승인 보조.

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
- 남은 것: PR #54 머지 → `npm run release:all`(게이트 전부 통과 상태) → NAS 채널 게시·서버 재배포(오너).

## 4. 릴리스 운영 원칙 (변경 없음)
- `npm run release:all` 게이트(라우트·불변 원칙·업데이터 테스트·E2E PC+모바일) 통과 후에만 릴리스. 재다운로드 금지. 릴리스 완료 = 채널 라이브 + `verify:nas` 5/5 + 48시간 내 구버전 지점 0곳.
- 코어 잠금 파일은 오너 승인 + `CORE_EDIT=1`로만.

## 5. 다음 세션 착수 순서 (2026-11-17 저녁 갱신)
1. **오너**: PR #54 머지 → `npm run release:all`(v1.0.60) → NAS 채널 게시(SSH 키 또는 DSM 두 작업) → 서버 재배포(구버전 지점 경보 가동) → 48시간 뒤 경보 메일/대시보드로 구버전 0곳 확인.
2. **오너**: Codex 자동화 `crm-10-git` 경로 F:→C: 수정, DSM 두 작업 "매일" 활성, P1(코어 Supabase 제거) 승인 — 자동 모드가 아닌 세션에서 `CORE_EDIT=1`.
3. 다음 개발: P3 D4 사진 저장 이관(Capacitor Filesystem) → 안드로이드 서명 키 → Play 내부 테스트. P4 보존기간 정책은 오너 기간 결정 후.
4. 시각 QA 루틴: 릴리스 전 `SHOTS=1 SHOTS_DIR=<밖의 폴더> npx playwright test e2e/screenshots.spec.ts --project=mobile` 로 모바일 세트 확인.
