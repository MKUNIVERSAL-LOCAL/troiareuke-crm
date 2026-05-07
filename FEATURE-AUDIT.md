# 트로이아르케 CRM — 기능 인벤토리 & 오류 감사

> 최초 작성: 2026-04-20 (세션 2)
> 갱신: 2026-04-20 (인벤토리 완료)
> 근거: `F:\OneDrive\Desktop\클로드 작업폴더\십계명.md`
> 목적: 현재 구현된 모든 페이지·기능을 전수 조사하여 **무엇이 실제로 작동하는지** 파악. 원칙 IX(모든 구성요소 E2E) 선행 단계.

---

## 감사 프레임워크

각 페이지·기능을 5단계 상태로 분류:

| 상태 | 뜻 |
|---|---|
| 🟢 **작동** | 모든 기능이 의도대로 E2E 동작 |
| 🟡 **부분 작동** | 주요 경로는 되나 일부 버그·누락 있음 |
| 🔴 **미완성/고장** | 명백히 안 되는 기능·버그 |
| ⚪ **미구현** | UI 스텁만 있고 로직 없음 |
| ⚫ **죽은 코드** | 참조 안 되는 컴포넌트·함수 |

---

## 작업 진행

### 단계 A: 인벤토리 (완료)
- [x] 사용자 CRM 페이지 13개 스캔
- [x] Admin 콘솔 7개 + Layout 스캔
- [x] Auth 2개 스캔
- [x] 각 항목 상태 분류
- [x] 우선순위 선정

### 단계 B: 간결화 + 문서화 + GitHub (다음 세션)
- [ ] 죽은 코드 제거
- [ ] 중복 로직 통합
- [ ] `ARCHITECTURE.md` 작성
- [ ] 단계별 commit + push

### 단계 C: 기능별 E2E 검증 + 오류 수정 (후속)
- [ ] P0·P1 페이지 실제 브라우저 테스트
- [ ] 발견 오류 수정
- [ ] 원칙 X 통과 후 완료 선언

---

## 인벤토리 결과

### 사용자 CRM 페이지

### 🏠 대시보드 (`src/pages/Dashboard.tsx`)

**상태**: 🟢

**핵심 기능**:
- 4개 통계 카드 (이번 달 매출 / 오늘 예약 / 전체 고객 / VIP 고객)
- 시술·홈케어·결제건수 3분할 요약 (클릭 시 매출/제품 페이지 이동)
- 최근 7일 주간 매출 차트 (recharts BarChart, 시술/제품 스택)
- 최근 결제 5건 리스트 (클릭 → 매출 페이지)
- 오늘 예약 리스트 + 오늘 타임라인 (최대 4건)
- 재고 부족 알림 카드

**발견 이슈**:
- `useState(() => getDashboardData())` 초기 로드만 수행, 다른 페이지에서 데이터 변경 시 되돌아와도 리프레시 안 됨 (심각도: 중)
- `todayStr`, `thisMonthStr` 모듈 최상위 const — 앱이 자정 넘겨도 업데이트 안 됨 (심각도: 낮)
- 상단 Stat 카드를 `div onClick`으로 감싸서 접근성 불량 (button 아님) (심각도: 낮)

**의존성**:
- store: `PaymentStore`, `CustomerStore`, `ProductStore`, `ReservationStore`
- lib: 없음 (직접 store 호출)
- 컴포넌트: `Header`, `StatCard`, `StatusBadge`, `SourceBadge`, recharts

**우선순위**: P0
**이유**: 앱의 진입 랜딩 화면이며 다른 모든 기능으로 유입되는 허브.

---

### 👥 고객 (`src/pages/Customers/index.tsx`)

**상태**: 🟡

**핵심 기능**:
- 좌측 고객 리스트 (검색: 이름/전화/이메일, 등급 필터)
- 고객 추가 모달 (이름·전화·성별·등급·생일·피부타입·유입경로·메모)
- 고객 상세 (통계 4종 + 메모)
- 프로그램 등록 모달 (프로그램 선택 + 실 결제액 + 결제수단)
- 시술 기록 모달 (회차 차감 + 담당자 + 피부상태 + 다음 권장일)
- 등록된 프로그램 카드 (진행률 바, 만료 배지)
- 최근 시술 기록 5건

**발견 이슈**:
- **고객 수정/삭제 UI가 없음** — 한번 등록하면 그대로 (심각도: 높)
- `ProgramStore.getAll()`이 비어있으면 `ServiceStore`로 fallback하지만 totalSessions/validityDays 없음 → 프로그램 등록 시 회차·만료 정보 없이 저장됨 (심각도: 중)
- 상세창 라인 3의 `Minus`, `Phone`, `TrendingUp`, `ChevronDown` 등 다수 lucide icon import가 실제 미사용 (심각도: 낮)
- `customerPrograms` state와 `selected` useEffect 로직이 중복 (modal save 후 양쪽에서 갱신) (심각도: 낮)

**의존성**:
- store: `CustomerStore`, `ProgramStore`, `CustomerProgramStore`, `TreatmentLogStore`, `StaffStore`, `ServiceStore`
- lib: 없음
- 컴포넌트: 자체 인라인 모달 (공통 Modal 미사용)

**우선순위**: P0
**이유**: CRM의 핵심. 수정/삭제 누락은 치명적.

---

### 📅 예약 (`src/pages/Reservations/index.tsx`)

**상태**: 🟡

**핵심 기능**:
- 주간/일간/목록 3가지 뷰 전환
- 날짜 네비게이션 (이전/오늘/다음)
- 예약 추가 모달 (고객·직원·시술·날짜·시작시간·출처·메모)
- 예약 상세 모달 (취소/완료/삭제/"수정" 버튼)
- Google Calendar 연동 이벤트 병행 표시 (배지 + 링크)
- 시술 duration으로 endTime 자동 계산
- 예약 저장 시 Google Calendar에도 동시 추가 가능 (체크박스)

**발견 이슈**:
- **"수정" 버튼은 단순히 `onClose` 호출** — 실제 수정 로직 없음 (심각도: 높)
- "네이버 예약 동기화" 배지는 항상 초록으로 표시 — 실제 동기화 로직 없음 (연결 상태 하드코딩) (심각도: 중)
- AddReservationModal의 버튼 disabled 조건 없음 — 필수값 누락 시 조용히 리턴 (심각도: 낮)
- handleSaveReservation / handleUpdateReservation / handleDeleteReservation 세 함수가 거의 동일 (심각도: 낮)

**의존성**:
- store: `ReservationStore`, `StaffStore`, `ServiceStore`, `CustomerStore`
- lib: `googleCalendar` (isGoogleCalendarConnected, fetchCalendarEventsAsReservations, createCalendarEvent)
- 컴포넌트: `Header`, `StatusBadge`, `SourceBadge`, `Modal`

**우선순위**: P0
**이유**: CRM의 핵심. 수정 기능 누락은 실사용 불가 수준.

---

### 💆 시술 기록 (`src/pages/Treatments/index.tsx`)

**상태**: 🟡

**핵심 기능**:
- 시술 기록 리스트 + 검색 (고객명/시술내용/담당자/프로그램)
- 시술 기록 추가 모달 (고객·직원·프로그램 연결·시술항목 체크리스트·상세·피부상태·다음방문·메모·사진 업로드 UI)
- 시술 기록 상세 모달 (2단계 삭제 확인)
- 활성 프로그램과 연결 시 자동 회차 차감 (CustomerProgramStore 측에서)

**발견 이슈**:
- **"사진 추가" 버튼은 onClick이 없음** — 클릭해도 아무 일 없음, UI만 있음 (심각도: 중)
- AddTreatmentModal에서 `clsx` import만 있고 사용은 최하단 disabled 스타일 한 줄 (심각도: 낮)
- 상세 모달의 `programName`이 treatmentDetails와 같이 표시되면 중복 렌더링 가능 (심각도: 낮)
- 목록 정렬·필터 (날짜순/고객별) 없음 (심각도: 낮)

**의존성**:
- store: `TreatmentLogStore`, `CustomerStore`, `StaffStore`, `ServiceStore`, `CustomerProgramStore`
- lib: 없음
- 컴포넌트: `Header`, `Modal`

**우선순위**: P1
**이유**: 고객 페이지 내부에서도 등록 가능하므로 중복. 사진 기능은 현 단계에서 P3.

---

### 👨‍⚕️ 직원 (`src/pages/Staff/index.tsx`)

**상태**: 🟢

**핵심 기능**:
- 직원 카드 그리드 (오늘 예약 수 + 이번달 매출 표시)
- 직원 추가 카드 (점선 + 버튼 일체형)
- 직원 추가 모달 (이름·역할·전화·이메일·입사일·전문분야 다중선택·색상)
- 직원 상세 모달 (통계 + 수정 + 삭제, window.confirm)
- 수정 모드 전환 (editing state)
- "오늘 직원별 예약 현황" 하단 타임라인

**발견 이슈**:
- monthlyRevenue를 `ReservationStore.filter(r.totalPrice)`로 계산 — 취소·노쇼된 예약도 합산 (심각도: 중)
- `PaymentStore` import만 있고 미사용 (심각도: 낮)
- 삭제 시 해당 staffId로 묶인 예약·시술기록의 integrity 확인·경고 없음 (심각도: 중)

**의존성**:
- store: `StaffStore`, `ReservationStore`, `TreatmentLogStore`(미사용), `PaymentStore`(미사용)
- lib: 없음
- 컴포넌트: `Header`, `Modal`

**우선순위**: P1
**이유**: 예약·시술 연결되지만 CRUD는 완성도 높음.

---

### 🧴 제품/재고 (`src/pages/Products/index.tsx`)

**상태**: 🟢

**핵심 기능**:
- 요약 카드 4종 (전체 제품 / 재고 부족 / 총 판매건수 / 홈케어 누적 매출)
- 재고 부족 알림 배너
- 탭: 재고 현황 / 판매 기록
- 재고 테이블 (제품명·카테고리·판매가·원가·재고·상태·마진율·판매 버튼)
- 카테고리 필터 (8종)
- 검색 (제품명/브랜드)
- 제품 추가 모달 (마진율 실시간 프리뷰)
- 판매 모달 (고객 선택·수량·단가·총액·결제수단·판매일·담당자·메모, 재고 부족 시 alert)
- 판매 기록 탭 (테이블 + 합계)

**발견 이슈**:
- **제품 수정/삭제 UI 없음** — 등록 후 가격·재고 수정 불가 (심각도: 높)
- `ProductSaleStore.save` 호출 시 재고가 실제로 차감되는지 store 내부 확인 필요 (확인 필요)
- 판매 모달 저장 후 `setSaving(true)`만 찍고 false로 안 돌림 (즉시 onSaved 호출하므로 무해하지만 리팩토링 후보) (심각도: 낮)

**의존성**:
- store: `ProductStore`, `ProductSaleStore`, `CustomerStore`
- lib: 없음
- 컴포넌트: `Header`, `Modal`

**우선순위**: P1
**이유**: 재고 CRUD 불완전. 판매 기록은 유지 기능.

---

### 💰 매출 (`src/pages/Sales/index.tsx`)

**상태**: 🟢

**핵심 기능**:
- 월 선택 네비게이션 (좌우 이동)
- 요약 4카드 (총매출·시술매출·제품매출·결제건수·비중%)
- 전월 대비 성장률 (%, 상승/하락 아이콘)
- 일별 매출 스택 차트 (시술/제품)
- 결제수단 분포 (프로그레스 바)
- 최근 결제 5건
- 탭: 매출 현황 / 결제 내역 (그리드 6컬럼)
- 결제 등록 모달 (구분 3종: 단건 시술/제품/기타 · 고객 선택·금액 quick 버튼 4개·결제 방법·결제일·메모)

**발견 이슈**:
- 결제 등록 시 `program` 타입 옵션이 구분 버튼에 없음 — type 타입만 있고 UI는 3종뿐 (불일치) (심각도: 중)
- `ProductStore`, `ProductSaleStore` import만 있고 미사용 (심각도: 낮)
- `METHOD_ICONS` 변수 정의만 있고 미사용 (심각도: 낮)
- 결제 수정/삭제 UI 없음 (심각도: 중)
- 할인 로직(discountAmount) 저장은 하지만 UI 입력란 없음 (심각도: 중)

**의존성**:
- store: `PaymentStore`, `CustomerStore`, `ProductStore`(미사용), `ProductSaleStore`(미사용)
- lib: 없음
- 컴포넌트: 자체 인라인 모달 (공통 Modal 미사용)

**우선순위**: P1
**이유**: 매출 가시화는 잘 됐지만 CRUD·할인 입력 누락.

---

### 💬 메시지 (`src/pages/Messaging/index.tsx`)

**상태**: 🟡

**핵심 기능**:
- 상단 연동 상태 칩 4개 (엔포+, 카카오 채널, 카카오 오픈채팅, 네이버 톡톡)
- 탭: 발송하기 / 템플릿 관리 / 발송 이력
- 발송하기 탭: 수신 대상 4카드(전체/VIP/이번달 생일/60일+ 미방문)·자동 발송 토글 4개
- 템플릿 관리: 카테고리 필터·템플릿 카드 그리드·추가·삭제
- 발송 이력: 성공/실패 상태·성공·실패 명수·비용
- 메시지 발송 모달: 채널 4종·수신자 선택·템플릿 연결·제목(카카오 전용)·본문(글자수 제한)·비용 추정·발송 완료 애니메이션

**발견 이슈**:
- **실제 SMS/카카오 발송 로직 없음** — `MessageHistoryStore.save`만 호출, 모두 success로 하드코딩 (successCount = recipientCount, failCount = 0) (심각도: 높)
- "예약 발송" 버튼은 UI만 있고 클릭 시 아무 일 없음 (심각도: 중)
- 네이버 톡톡 상태 칩은 `connected={false}`로 하드코딩 (심각도: 낮)
- SendMessageModal에서 "custom" 모드 선택해도 실제 고객 선택 UI 없음 → recipientCount=0 (심각도: 중)
- MSG_TYPE_COLORS가 kakao-openchat 키 없음 → history 탭에서 해당 메시지 스타일 깨짐 (심각도: 낮)

**의존성**:
- store: `MessageTemplateStore`, `MessageHistoryStore`, `CustomerStore`, `SettingsStore`
- lib: 없음
- 컴포넌트: `Header`, `Modal`

**우선순위**: P2
**이유**: 외부 API 연동 전엔 구현 의미 제한적. 템플릿/이력 UI 유지 정도.

---

### 📋 프로그램 (`src/pages/Programs/index.tsx`)

**상태**: 🟢

**핵심 기능**:
- 프로그램 그리드 카드 (카테고리 필터·회차/기간제 구분)
- 요약 4카드 (전체·활성·최저가·최고가)
- 추가/수정 통합 모달 (프로그램명·카테고리·회차/기간제 토글·회차수·유효기간·판매가·원가·마진율 프리뷰·설명·캘린더 색상·활성 체크)
- 삭제 확인 모달 (고객 등록 회권에 영향 없음 안내)
- 유효기간 프리셋 버튼 (90/180/365)
- 빠른 가격 계산: 회당 가격 표시 (판매가 / 회차)
- 마진율 색상 코딩 (≥50 초록, ≥30 파랑, <30 주황)

**발견 이슈**:
- 유효기간 `validityDays = ''` 처리 — 빈 문자열을 parseInt하면 NaN → null 처리되지만 explicit check 없음 (심각도: 낮)
- import된 lucide 아이콘 일부 미사용 가능성 (확인 필요)

**의존성**:
- store: `ProgramStore`
- lib: 없음
- 컴포넌트: 자체 인라인 모달

**우선순위**: P1
**이유**: 핵심 기능이며 완성도 높음.

---

### ⚙️ 설정 (`src/pages/Settings/index.tsx`)

**상태**: 🟡

**핵심 기능**:
- 좌측 사이드바 탭 6개 (샵정보·영업시간·연동설정·알림설정·시술관리·구독/플랜)
- 샵 정보: 이름·유형·전화·주소·포인트 적립률
- 영업시간: 요일별 open/close/isOff 체크
- 연동설정: 네이버 예약 · 카카오 채널/오픈채팅 · Google Calendar (OAuth 실제 연결) · 엔포+ SMS
- 알림설정: 자동 발송 토글 4종
- 시술관리: 카테고리별 그룹·추가·수정·삭제(confirm)
- 구독/플랜: Supabase에서 로드·PLANS 리스트·결제(requestPayment) 또는 무료 체험 전환
- Toast (saved) 2초 자동 사라짐

**발견 이슈**:
- 네이버/카카오 "연동하기" 버튼은 **토글만 시킬 뿐 실제 연동 없음** (심각도: 높)
- `loadSubscription`의 `if (!currentSubscription)` 조건은 closure 문제로 항상 true 동작 (심각도: 중)
- 카카오 연동 해제 시 channelName, channelId 등 남은 데이터 처리 없음 (심각도: 낮)
- SMS "테스트 발송" 버튼 onClick 없음 (심각도: 중)
- payment.ts의 `requestPayment` 실제 PG 연결 여부 확인 필요 (확인 필요)
- form-input CSS의 `ring: 2px solid #c4b5fd` — CSS에 `ring` 속성 없음, 오타 (심각도: 낮)

**의존성**:
- store: `SettingsStore`, `ServiceStore`
- lib: `googleCalendar`, `supabase`, `payment` (requestPayment, PLANS), contexts/AuthContext
- 컴포넌트: `Header`, 인라인 SettingCard/FormRow

**우선순위**: P1
**이유**: 설정은 중요하나 다수 연동이 placeholder.

---

### 📖 API 가이드 (`src/pages/ApiGuide/index.tsx`)

**상태**: 🟢

**핵심 기능**:
- 진행률 표시 (연동완료 / 전체, %)
- 카테고리 필터 (예약·메시지·인증·결제·연동)
- API 카드 10개 (아코디언 펼침, 단계별 절차·공식 문서 링크·상태 토글)
- 상태 3단계 토글 (미시작 → 진행중 → 연동완료 → 미시작)
- 하단 SaaS 구독 결제 섹션 (Starter/Pro/Enterprise 가이드)

**발견 이슈**:
- 상태 토글은 localStorage 저장 없이 state만 변경 — 새로고침 시 초기화 (심각도: 낮)
- 모든 api.status 기본값은 static (pending/not-started) — 실제 연동 상태와 sync 없음 (심각도: 중, 설계 의도일 수 있음)

**의존성**:
- store: 없음
- lib: 없음
- 컴포넌트: `Header`

**우선순위**: P3
**이유**: 참고용 문서 페이지. 기능적 의존성 없음.

---

### 🤖 AI 챗봇 (`src/pages/AiChat/index.tsx`)

**상태**: 🟡

**핵심 기능**:
- 채팅 UI (유저/어시스턴트 말풍선·복사 버튼·타임스탬프·사용 AI 배지)
- 빠른 질문 8개
- API 키 설정 패널 (Claude/OpenAI/Gemini)
- Claude 우선 → 실패 시 자동 폴백
- Electron IPC 경로 (window.electronAPI.callClaudeApi)로 CORS 우회
- CRM 데이터 전체 context 주입 (고객·결제·직원·시술·제품·예약·시술기록)
- 이탈 고객(90일 이상) 자동 분석
- 초기화 버튼
- 하단 요약 3카드 (전체고객/이탈위험/재고부족)

**발견 이슈**:
- `(s: any)`, `(r: any)`, `(t: any)` 다수 any 사용 (심각도: 낮)
- `treatmentLogs` 포맷에 `t.services`, `t.totalAmount`, `t.date` 참조 — 실제 TreatmentLog 타입에 `services` 없고 `treatmentDate` 사용 → context 생성 실패 라인 발생 (심각도: 중)
- `selectProvider`의 `question` 파라미터가 사용되지 않음 (심각도: 낮)
- Web 폴백(브라우저 직접 호출)은 CORS로 실패 확실 — 안내 없음 (심각도: 낮)
- 하단 요약 카드가 매 렌더마다 `CustomerStore.getAll()` 두번 호출 (심각도: 낮)

**의존성**:
- store: 모든 7개 store
- lib: window.electronAPI (Electron 전용)
- 컴포넌트: `Header`

**우선순위**: P2
**이유**: 플래그십 기능이나 context 생성 버그 수정 필요. API 키 없어도 가이드 명확.

---

### 🎬 온보딩 (`src/pages/Onboarding/index.tsx`)

**상태**: 🟢

**핵심 기능**:
- 6단계 스텝 (샵정보·직원·시술항목·연동·플랜·완료)
- 스텝 인디케이터
- 시술 항목 3가지 등록 방식:
  1. 직접 입력 (동적 추가/삭제)
  2. 트로이아르케 공식 프로그램 4카테고리 체크리스트 (아코디언)
  3. 엑셀/CSV/TSV 파일 업로드
- 플랜 선택 (현재 trial만 가능, 유료는 disabled)
- 완료 후 branchId 고정 + localStorage 저장 + Supabase 백그라운드 + hash reload로 대시보드 이동
- ServiceStore + ProgramStore 양쪽에 저장 (시술+프로그램 중복 저장)

**발견 이슈**:
- `console.error('구독 저장 실패:', error)` 한 건 (심각도: 낮)
- ServiceStore + ProgramStore 중복 저장 — 동일 데이터 2곳에 저장 (심각도: 중, 설계 의도로 보이나 일관성 유지 필요)
- 엑셀 파서가 순수 .xlsx 바이너리는 못 읽음 — accept 속성엔 `.xlsx,.xls`도 있지만 실제론 CSV/TSV만 파싱 (심각도: 중, 오해 유발)
- `selectedPlan` state는 Starter/Pro 결제 분기 있으나 UI에서는 trial만 선택 가능 → 죽은 분기 (심각도: 낮)
- `window.location.hash = '#/'; window.location.reload()` 강제 리로드 — React Router navigate로 대체 가능 (심각도: 낮)

**의존성**:
- store: `StaffStore`, `ServiceStore`, `ProgramStore`
- lib: `supabase`, `payment`, `AuthContext`
- 컴포넌트: 인라인 StepWrapper/StepNav

**우선순위**: P1
**이유**: 신규 가입자 경험 좌우. 완성도 높음.

---

### Admin 콘솔

### 🏢 Admin 대시보드 (`src/pages/Admin/Dashboard.tsx`)

**상태**: 🟢

**핵심 기능**:
- 4카드 통계 (전체 지점·등록 사용자·오늘 로그인·성공률)
- 최근 로그인 20건 테이블 (이메일·지점·상태·시간)
- Supabase 우선, 로컬 fallback (`getLocalLogs`)
- "전체 보기" 앵커 태그 (`<a href>` → 페이지 리로드 발생)

**발견 이슈**:
- 로그인 성공률 계산이 "최근 20건 기준" — 실제 전체 통계가 아님 (심각도: 낮, 라벨 명시됨)
- `<a href="/admin/login-logs">`는 SPA navigate 아님 — 전체 리로드 (심각도: 낮)
- 오늘 로그인 카운트용 `gte('logged_in_at', today)` 의 today = 'YYYY-MM-DD' 문자열 비교 — timezone 이슈 가능 (심각도: 낮)

**의존성**:
- lib: `supabase`, `loginLog` (getLocalLogs)
- 컴포넌트: 없음 (Admin Layout 안에서 렌더)

**우선순위**: P2
**이유**: 슈퍼어드민 전용. 메인 유저 영향 없음.

---

### 🏬 Admin 지점 (`src/pages/Admin/Branches.tsx`)

**상태**: 🟡

**핵심 기능**:
- 지점 테이블 (지점명·유형·플랜·상태·등록일·수정·활성화 토글)
- 지점 추가 모달 (이름·주소·전화·유형·플랜·관리자 이메일·초기 비밀번호)
- 지점 수정 모달
- 지점 추가 시 Supabase Auth.admin.createUser로 관리자 계정 동시 생성
- 14일 trial_ends_at 자동 설정
- 로컬 fallback (localStorage에 branch + user 저장)

**발견 이슈**:
- `supabase.auth.admin.createUser`는 **Service Role Key 필요** — 프론트엔드에서 직접 호출은 보안상 매우 위험 (심각도: 높)
- 로컬 fallback의 `passwordHash: form.admin_password` — 해시 안 됨, 평문 저장 (심각도: 높)
- 지점 삭제 기능 없음 (비활성화만 가능, 의도적일 수 있음)
- `Trash2` import만 있고 미사용 (심각도: 낮)

**의존성**:
- lib: `supabase`
- 컴포넌트: 인라인 Field

**우선순위**: P2
**이유**: 관리자 전용이나 보안 이슈가 치명적.

---

### 💳 Admin 구독/플랜 (`src/pages/Admin/Subscriptions.tsx`)

**상태**: 🟡

**핵심 기능**:
- 요약 4카드 (전체 구독·활성·만료·월 예상 매출 MRR)
- 상태 필터 (all/active/expired/pending/cancelled)
- 구독 테이블 (지점·플랜·상태·금액·만료일·메모·수정)
- 수정 모달 (플랜·상태·금액·만료일·메모)
- branches 테이블 plan 동기화 (update 시)

**발견 이슈**:
- `if (!isSupabaseConfigured)` 시 빈 상태로만 렌더 — 로컬 fallback 없음 (심각도: 중)
- 구독 **추가** 기능 없음 (수정만 가능) — 어드민 UI에서 새 구독 생성 불가 (심각도: 중)
- `Plus` icon import 있으나 미사용 (심각도: 낮)
- `openEdit`에서 setShowModal(true) 호출하나 editTarget === null 체크 없음 (심각도: 낮)

**의존성**:
- lib: `supabase`
- 컴포넌트: 인라인 Field

**우선순위**: P2
**이유**: 어드민 전용. 읽기·수정만 필요하면 OK.

---

### 📢 Admin 공지사항 (`src/pages/Admin/Announcements.tsx`)

**상태**: 🟡

**핵심 기능**:
- 공지사항 리스트 (유형·게시상태·생성일·내용)
- 추가/수정/삭제/게시 토글
- 유형 4종 (info/update/warning/event)
- 요약 3카드 (전체·게시중·숨김)
- 즉시 게시 토글

**발견 이슈**:
- `isSupabaseConfigured` 체크 없이 **supabase 직접 호출** — Supabase 미연결 환경에서 모두 실패 (심각도: 높)
- 삭제 시 confirm 없음 — 클릭 한 번에 즉시 삭제 (심각도: 중)
- 공지를 표시할 사용자 측 UI 없음 — 만들어도 표시 안 됨 (심각도: 높)

**의존성**:
- lib: `supabase`
- 컴포넌트: 없음

**우선순위**: P2
**이유**: 사용자 측 렌더가 없어 현 단계 활용 불가.

---

### 📝 Admin 로그인 기록 (`src/pages/Admin/LoginLogs.tsx`)

**상태**: 🟢

**핵심 기능**:
- 최근 500건 로그인 로그 테이블
- 검색 (이메일/지점)
- 상태 필터 (all/success/failed)
- 페이지네이션 (50건씩)
- 요약 3카드 (전체·성공·실패)
- 새로고침 버튼
- 기기 정보 요약 (Windows/macOS/Linux/기타)
- Supabase 우선, 로컬 fallback

**발견 이슈**:
- `setLogs(local.map(l => ({ ...l })))` — 로컬 로그 타입이 LogEntry와 정확히 일치하는지 런타임 체크 없음 (심각도: 낮)

**의존성**:
- lib: `supabase`, `loginLog` (getLocalLogs)
- 컴포넌트: 없음

**우선순위**: P2
**이유**: 어드민 감사용. 완성도 높음.

---

### 👤 Admin 사용자 (`src/pages/Admin/Users.tsx`)

**상태**: 🟡

**핵심 기능**:
- 사용자 테이블 (이름·이메일·역할·지점·온보딩 완료 여부·가입일)
- 지점별 필터 버튼
- 역할 배지 (superadmin/admin/staff)
- Supabase auth.admin.listUsers + user_profiles join
- 로컬 fallback

**발견 이슈**:
- `supabase.auth.admin.listUsers` — **Service Role Key 필요**, 프론트엔드에서 직접 호출 위험 (심각도: 높)
- 사용자 **추가/수정/삭제 UI 없음** — 읽기만 가능 (심각도: 중)
- 역할 변경 기능 없음 (심각도: 중)

**의존성**:
- lib: `supabase`
- 컴포넌트: 없음

**우선순위**: P2
**이유**: 어드민 전용. 보안·기능 모두 불충분.

---

### 📊 Admin 통계 (`src/pages/Admin/Statistics.tsx`)

**상태**: 🟡

**핵심 기능**:
- 요약 4카드 (활성 지점·전체 사용자·전체 로그인·성공률)
- 최근 14일 로그인 추이 AreaChart (성공/실패 2선)
- 플랜 분포 PieChart (innerRadius 45 도넛)
- 지점 누적 증가 BarChart
- Supabase 미연결 시 빈 화면

**발견 이슈**:
- `!isSupabaseConfigured` 시 바로 loading=false 되고 모든 차트 데이터 비어 빈 화면만 표시 (심각도: 중)
- `startOfDay` import만 있고 미사용 (심각도: 낮)
- 지점 누적 데이터는 "생성된 날짜가 있는 날들"만 X축에 표시 — 날짜 빈 구간 스킵됨 (심각도: 낮)

**의존성**:
- lib: `supabase`, recharts
- 컴포넌트: 없음

**우선순위**: P2
**이유**: 어드민 분석. Supabase 연동 전제.

---

### 🗂 Admin Layout (`src/pages/Admin/Layout.tsx`)

**상태**: 🟢

**핵심 기능**:
- 슈퍼어드민 사이드바 네비게이션 (7개 링크)
- 로고 + 사용자 정보 + 로그아웃
- CRM 메인으로 이동 링크
- 다크 테마 slate-950

**발견 이슈**:
- 특별히 없음. 깔끔함.

**의존성**:
- lib: `AuthContext`
- 컴포넌트: `NavLink`, `Outlet`

**우선순위**: P2
**이유**: 어드민 전용 레이아웃.

---

### Auth·공통

### 🔐 로그인 (`src/pages/Auth/Login.tsx`)

**상태**: 🟢

**핵심 기능**:
- 좌측 마케팅 패널 (기능 체크리스트 5개)
- 우측 로그인 폼 (이메일·비밀번호·비밀번호 보기 토글)
- 자동 로그인 체크박스 (실제 동작 없음)
- 비밀번호 찾기 링크 (href="#")
- TroiareukeLogo 컴포넌트 export
- Admin 로그인 진입 링크
- 데모 계정 안내

**발견 이슈**:
- `href="#"` 비밀번호 찾기 링크는 빈 앵커 (심각도: 낮)
- 자동 로그인 체크박스는 상태 바인딩 없음 — 시각적 장식뿐 (심각도: 낮)
- 데모 계정 설명이 production 빌드에서도 보임 (심각도: 낮)

**의존성**:
- lib: `AuthContext`
- 컴포넌트: 자체 TroiareukeLogo (export하여 Signup에서 import)

**우선순위**: P0
**이유**: 모든 진입점.

---

### ✍️ 회원가입 (`src/pages/Auth/Signup.tsx`)

**상태**: 🟡

**핵심 기능**:
- 2단계 스텝 (계정 정보 → 플랜·약관)
- 이름·이메일·전화·비밀번호·확인 필드
- 비밀번호 8자 이상 검증
- 플랜 카드 3개 (trial만 활성, 나머지 "준비 중")
- 약관 체크박스 3개 (필수/필수/선택)
- 성공 시 /onboarding으로 navigate

**발견 이슈**:
- 비밀번호 "보기" 토글 버튼이 `<EyeOff size={16} />`만 하드코딩 — showPw state 따라 아이콘 안 바뀜 (심각도: 낮)
- 확인 비밀번호에는 showPw 토글 미적용 (심각도: 낮)
- 약관 체크박스 3개 중 "개인정보 처리방침"(i=1)은 필수인데 `onChange`로 agree state 안 건드림 — 2번 약관 체크해도 handleSubmit의 agree 체크 통과 불가 (심각도: 중, logic bug)
- 스텝 인디케이터 완료 표시 ("완료" 3번째) 실제로 도달 안 함 (step=2 max) (심각도: 낮)

**의존성**:
- lib: `AuthContext`
- 컴포넌트: `TroiareukeLogo` (Login에서 import)

**우선순위**: P0
**이유**: 가입 경로. 약관 로직 버그 수정 필요.

---

## 전체 종합

### 상태별 집계 (총 23개 파일 — Admin Layout 포함)

- 🟢 **작동**: 10개
  - Dashboard, Staff, Products, Sales, Programs, ApiGuide, Onboarding
  - Admin Dashboard, Admin LoginLogs, Admin Layout
  - Login
- 🟡 **부분 작동**: 13개
  - Customers, Reservations, Treatments, Messaging, Settings, AiChat
  - Admin Branches, Admin Subscriptions, Admin Announcements, Admin Users, Admin Statistics
  - Signup
- 🔴 **고장**: 0개
- ⚪ **미구현**: 0개
- ⚫ **죽은 코드**: 0개 (22개 page 파일 모두 App.tsx에서 import 확인)

### 가장 심각한 이슈 Top 5

1. **고객·제품·결제 수정/삭제 UI 누락** (Customers, Products, Sales) — CRM의 핵심 데이터를 등록한 후 되돌릴 수 없음. 실사용 불가 수준. (심각도: 높)

2. **예약 "수정" 버튼이 onClose만 호출** (Reservations L677) — 수정 기능이 UI상 있는 것처럼 보이나 실제로는 닫기 버튼. (심각도: 높)

3. **`supabase.auth.admin.*` 프론트엔드 직접 호출** (Admin Branches, Admin Users) — Service Role Key 필요. 보안상 치명적, Supabase Edge Function으로 분리 필수. 또한 로컬 fallback에서 비밀번호 평문 저장. (심각도: 높)

4. **메시지 발송이 가짜** (Messaging SendMessageModal) — `MessageHistoryStore.save`만 호출하고 `successCount = recipientCount`로 하드코딩. 실제 SMS/카카오 API 연결 없음. (심각도: 높)

5. **Signup 약관 체크 로직 버그** (Auth/Signup L115) — i===0 조건에서만 `set('agree')` 업데이트되어, 개인정보 처리방침(i=1)을 체크해도 agree state가 바뀌지 않음. 사용자가 혼란. (심각도: 중)

### 간결화(리팩토링) 기회 Top 5

1. **자체 인라인 모달 vs 공통 Modal 컴포넌트 혼재** — Customers, Sales, Programs, Settings, Signup, Onboarding은 `fixed inset-0 bg-black/40 ...`를 직접 쓰고, Reservations/Treatments/Staff/Products/Messaging은 공통 `Modal` 사용. 통일 필요.

2. **미사용 import 일괄 제거** — Staff(`PaymentStore`, `TreatmentLogStore`), Sales(`ProductStore`, `ProductSaleStore`, `METHOD_ICONS`), Admin Branches(`Trash2`), Admin Subscriptions(`Plus`), Admin Statistics(`startOfDay`), Customers(다수 lucide 아이콘).

3. **Admin 페이지의 `admin-input` CSS 중복** — Branches/Subscriptions/Announcements 세 파일이 동일한 `<style>` 블록을 각자 가짐. 공통 CSS 모듈 또는 Tailwind @apply로 통합.

4. **Supabase + localStorage fallback 패턴 중복** — Admin 5개 페이지가 거의 동일한 `if (isSupabaseConfigured) { ... } else { localStorage ... }` 구조. 유틸 함수로 추상화 가능.

5. **Dashboard의 getDashboardData() 일회성 계산** — 다른 페이지에서 CRUD 후 돌아와도 갱신 안 됨. 라우팅 focus 이벤트 또는 Zustand/Context 구독으로 개선.

### 권장 작업 순서 (단계 C 수정 시)

1. **P0 실사용 막힘 해결 (최우선)**
   - Customers: 고객 수정/삭제 UI 추가
   - Reservations: "수정" 버튼 실제 수정 모달 연결
   - Signup: 약관 체크 로직 버그 수정 (i=0,1 모두 필수 반영)
   - Products: 제품 수정/삭제 추가
   - Sales: 결제 수정/삭제 + 할인 UI 추가

2. **P0 보안 이슈 수정**
   - Admin Branches/Users: `auth.admin.*` 호출을 Supabase Edge Function으로 이전
   - Admin Branches 로컬 fallback의 `passwordHash: form.admin_password` 평문 저장 제거

3. **P1 Placeholder → 실작동 연결 또는 명시적 "미구현" 표시**
   - Messaging: 실제 SMS/카카오 발송 연결 또는 "준비 중" 뱃지 명시
   - Settings 연동 버튼들: OAuth 플로우 연결 또는 명시적 비활성화
   - Reservations 네이버 배지 하드코딩 제거
   - Treatments 사진 추가 버튼 onClick 연결 또는 비활성화
   - Messaging "예약 발송" 버튼 비활성화 또는 구현

4. **P1 데이터 정합성**
   - Dashboard 리프레시 전략 도입
   - Staff monthlyRevenue가 cancelled 예약 제외
   - AiChat의 treatmentLogs context 필드 수정 (`t.services` → `t.treatmentDetails` 등)
   - Onboarding의 ServiceStore+ProgramStore 이중 저장 정리
   - Settings `loadSubscription`의 closure 이슈 수정

5. **P2 간결화**
   - 인라인 모달 → 공통 Modal 통일
   - 미사용 import 일괄 제거
   - Admin Supabase fallback 유틸 추출
   - admin-input 공통 스타일 추출

6. **P3 부가**
   - ApiGuide 상태 localStorage 저장
   - Login href="#" 링크 제거 또는 실제 연결
   - Onboarding React Router navigate로 하드 리로드 대체
   - Admin Announcements를 사용자 측에 표시할 UI 구현

---

## 십계명 적용 체크 (단계 A)

- [x] I. 리서치: 각 파일 소스·연결 확인 (22개 파일 전수 + App.tsx 라우팅)
- [x] II. 교차 검증: UI(render)와 실제 동작(store·API) 일치 여부 교차 확인 (예: 예약 수정 버튼)
- [x] III. 반대 관점: "이 기능은 실제로 안 될 수 있다"는 전제로 비판적 검토
- [x] IV. 가상 파일럿: 데이터 없음·placeholder 시나리오 식별
- [x] V. 파일럿 후 재검토: Top 5 이슈·리팩토링 기회 도출
- [x] VI. 변경 용이성: 간결화 기회 Top 5 명시
- [x] VII. MD 기록: 이 문서
- [x] VIII. 코드 품질: 타입(any), 에러핸들링, 중복 평가
- [ ] IX. E2E: 단계 C에서 수행
- [ ] X. 오류 0개 보고: 단계 C 완료 후

---

## 인프라 라이브러리 (참고)

### `src/lib/store.ts` (1600줄)
- 지난 세션에서 RLS 호환성 확인 완료
- 이번 감사: 중복·데드코드·에러핸들링 세부 리뷰는 단계 B 범위

### `src/lib/payment.ts`
- 이니시스 테스트 모드. Phase 3까지 유지 예정.

### `src/lib/googleCalendar.ts`
- 지난 세션에서 REDIRECT_URI 수정 완료

### `src/lib/loginLog.ts`
- 간단한 로그 기록 유틸. 깨끗함.
