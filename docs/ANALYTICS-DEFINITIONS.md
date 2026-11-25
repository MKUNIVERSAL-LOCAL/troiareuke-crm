# 분석 지표 정의 (ANALYTICS-DEFINITIONS)

마스터 프롬프트 12·13절: 분석 지표마다 **계산 공식·데이터 출처·분석 기간·예외·데이터 부족 조건**을 적고, 확정값과 예측값을 구분한다. 구현은 순수 모듈(`src/lib/*Rule.ts`, store 미참조)이고 `e2e/lib-units.spec.ts` 가 공식을 고정한다. 화면·엑셀·리마인더·AI 컨텍스트는 전부 여기 정의된 모듈을 쓴다(AI 가 직접 계산하지 않는다).

| 지표 | 정의(공식) | 출처 | 기간 | 예외·데이터 부족 | 확정/예측 | 모듈 | 도입 |
|---|---|---|---|---|---|---|---|
| 방문일 | 완료 예약 날짜 ∪ 시술 기록 날짜의 서로 다른 날 | reservations(status=completed).date, treatment_logs.treatmentDate | 전체 | 취소·노쇼·대기 예약 제외. 기록이 하나도 없으면 저장값 유지(하이드레이션 가드) | 확정 | customerStatsRule.buildStatsIndex / customerStats.collectVisitDates | 110~112 |
| 방문 횟수 | 방문일 수 | 위 | 전체 | 같은 날 두 번 기록해도 1회 | 확정 | customerStatsRule | 110 |
| 마지막 방문일 | 방문일 중 최대 | 위 | 전체 | 기록 없으면 손으로 적은 저장값 | 확정 | customerStatsRule | 110 |
| 누적 결제액 | 완료(completed) 결제 금액 합 | payments(status=completed).amount | 전체 | 환불·취소 제외. 회차권 판매액 포함(현금 유입 기준) | 확정 | customerStatsRule | 110 |
| **방문 주기(개인)** | 서로 다른 방문일을 오름차순 정렬 → 인접 간격(일)의 **중앙값** → 7~365일로 제한 | 방문일 | 전체 | 간격 2개 미만(방문 3회 미만)이면 산출하지 않고 **매장 기본 주기**(설정 > 알림, 기본 28일, 7~365) 사용. 0일 간격(같은 날)은 제외. 날짜 형식 불량은 무시 | 확정(기록 기반 통계) | visitCycleRule.personalCycleDays / resolveVisitCycle | **135** |
| 재방문 권장일 | ① 최근 시술 기록의 다음 방문 권장일(그 뒤 재방문 없을 때) ② 아니면 마지막 방문일 + 방문 주기(개인 → 매장) | 시술 기록 nextAppointment, 방문일, 방문 주기 | 전체 | 방문 이력 없음 → 없음. 미래 예약이 있으면 리마인더 대상에서 제외 | 예측(권장) | revisitRule.computeRevisitDue + reminderEngine | 2026-11-17, 135 에서 개인 주기 |
| 재방문 기한 지남(리마인더) | 오늘 − 권장일 > 0 이고 미래 예약 없음 | 위 | 오늘 | 샘플·익명화 고객 제외 | 예측 | reminderEngine.getRevisitDueCustomers | — |
| 회차권 사용 회차 | 시술 기록 중 해당 회차권에 연결된 sessionsUsed 합(근거 기록이 없으면 저장값) | treatment_logs.customerProgramId·sessionsUsed | 전체 | 음수·연결 없음 무시 | 확정 | programSessionsRule | 130 |
| 잔여 회차 | 총 회차 − 사용 회차(0 하한), 기간제는 없음 | 위 + customer_programs.totalSessions | 전체 | — | 확정 | programSessionsRule | 130 |
| **RFM 점수** | 최근 365일 기준 R=마지막 방문 뒤 지난 일수(작을수록 5), F=최근 365일 방문일 수(클수록 5), M=최근 365일 완료 결제 합(클수록 5). 점수는 **매장 안 상대 순위(백분위)** 1~5, 동점은 같은 점수 | 방문일·payments(completed) | 최근 365일 | 방문 기록 없는 고객은 '미방문'(백분위 계산 제외). 고객이 적으면 점수 폭이 좁아질 뿐 계산은 됨 | 확정(상대 순위) | rfmRule.quintileScores·scoreRfm | **136** |
| **고객 구분** | 미방문 / 신규(최근 365일 방문 1회·R≥4) / 충성(R≥4·F≥4) / 우수(R≥3·M≥4) / **이탈 우려**(R≤2·(F≥3 또는 M≥4)) / 휴면(R≤2) / 일반 — 위 순서로 첫 조건 | RFM 점수 | 최근 365일 | 규칙 기반(AI 아님), 수동 등급(VIP 등)과 별개 표시. '이탈 우려'(상대 순위)와 아래 '이탈 위험'(개인 주기 대비)은 다른 지표 | 확정(규칙) | rfmRule.segmentOf | 136, 139 |
| **이탈 위험** | 비율 = 마지막 방문 뒤 지난 일수 ÷ 그 고객의 방문 주기(개인 → 매장). ≥2.0 높음, ≥1.3 주의, 그 외 낮음. **다음 예약**(아래 정의)이 있으면 낮음 | 방문일·방문 주기·reservations | 전체 | 방문 기록 없음 → 판단 안 함(null). 고객 목록·상세·오늘 할 일은 136 부터 이 규칙(발송 화면의 "미방문 60일+" 세그먼트와 엑셀 "휴면 고객 60일"은 별도 — 통일 여부는 결정 대기) | 확정(규칙) | churnRule.churnRisk | 136, 139 |
| **다음 예약** | 취소·노쇼가 아니고, 오늘 이후 날짜이거나 오늘인데 아직 완료되지 않은 예약 | reservations | 오늘 기준 | 오늘 완료된 예약은 "다음 예약"이 아니다(재예약률이 방문 당일 부풀던 것). 재예약률·이탈 위험·재방문 리마인더가 같은 함수 | 확정 | upcomingRule.isUpcomingReservation | **139** |
| **90일 위험 매출** | 최근 365일 완료 결제 합 ÷ 365 × 90 | payments | 최근 365일 | 결제 없으면 0 | **예측** | churnRule.atRiskRevenue90 | **136** |
| **현금 유입(누적 결제)** | 완료 결제 합(회차권 판매액 포함) | payments(completed) | 전체 | 환불·대기 제외 | 확정 | customerValueRule.computeCustomerValue.cashCollected (= customerStats.totalSpent) | 137 |
| **실현 매출** | 회차권 아닌 완료 결제(단건·제품·기타) + 회차권 판매가 × 사용 회차 ÷ 총 회차(기간제는 전액) | payments·customer_programs·사용 회차(130) | 전체 | 초과 차감은 전액까지. 회차권 판매액은 여기서 다시 세지 않는다(판매/사용 중복 집계 방지). **연결 결제가 전부 환불된 회차권은 0**(139). 수동 완료로 소멸한 잔여 회차는 실현에 넣지 않는다(선수금 잔액으로 남음) | 확정 | customerValueRule.realizedProgramRevenue | 137, 139 |
| **객단가** | 실현 매출 ÷ 방문 횟수 | 위 + 방문일 | 전체 | 방문 0 → 없음 | 확정 | customerValueRule | **137** |
| **연간 기대 매출** | 객단가 × (365 ÷ 개인 방문 주기) | 위 + 방문 주기(135) | 전체 | 객단가 없음 또는 **개인 주기 없음(방문 3회 미만)이면 없음** — 매장 기본 주기로는 예측하지 않는다(139). "지금 리듬이 1년 이어진다면"의 추정 — 확정 아님, 화면에 (예측) 표기, 매출 열람 권한(sales.view)에만 | **예측** | customerValueRule | 137, 139 |
| **이달 방문 고객** | 이달에 방문일이 하나라도 있는 **집계 대상 고객**(샘플·익명화·삭제 제외) 수 | 방문일 | 이번 달 | todayTasks.getMonthlyKpis 가 isCountableCustomer 로 거른다(139) | 확정 | kpiRule.monthlyKpis | 138, 139 |
| **오늘 할 일(대시보드)** | 행동 목록 11종(208 부터 "미연동으로 나가지 않았던 문자 다시 보내기" — 가장 최근 성공 건 전의 미연동 건, 수신 고객 기록·30일 안): 이탈 위험 고객 연락(churnRule 높음)·재방문 권장일 지난 고객(revisitRule·visitCycleRule)·회차권 소진·만료 임박(programAlerts)·이번 달 생일(발송 모듈 켜짐)·지난 예약 완료·노쇼 처리(pendingCompletion)·내일 예약 확인(reservationReminder)·예약 요청함 처리 전(오늘 이후 요청, 188·191)·이달 방문 뒤 다음 예약 없음(kpiRule.noRebookIds, 184)·재고 부족(stockRule)·캠페인 발송 대상(campaignCandidates, 177·178) | 각 규칙 모듈 | 시점(오늘) | 0건인 줄은 숨김, 줄이 없고 이달 지표도 없을 때만 카드 없음(지표가 있으면 "밀린 일이 없습니다"). 모듈 게이팅: 고객 줄 4종은 고객 모듈, 생일·캠페인은 고객+발송 모듈, 재예약 없음은 고객+예약 모듈, 예약·요청함은 예약 모듈, 재고는 제품 모듈. 각 줄은 해당 목록·화면으로 연결(딥링크는 1회 캡처 뒤 URL 비움) | 확정 | todayTasks.buildTodayTasks | 138, 177, 184, 188, 195 |
| **재방문율(이달)** | 이달 방문 고객 중 이달 이전에도 방문 기록이 있는 고객 비율(%) | 방문일 | 이번 달 | 방문 고객 0 → 없음 | 확정 | kpiRule | **138** |
| **재예약률(이달)** | 이달 방문 고객 중 **다음 예약**(위 정의)이 있는 고객 비율(%) | 방문일·reservations | 이번 달 | 방문 고객 0 → 없음. 오늘 완료된 예약은 분자에 안 들어간다(139). 분모 − 분자(이달 방문·다음 예약 없음) 고객 목록은 고객 목록 `?norebook=1` — 대시보드 타일·오늘 할 일에서 진입(184) | 확정 | kpiRule(noRebookIds) | 138, 139, 184 |
| **가동률(이달)** | 오늘까지의 확정·완료 예약 시간 ÷ 활성 직원 근무 가용 시간(근무표 또는 영업시간, 매장 휴일·휴게 제외) × 100(%) | reservations·staffSchedules·businessHours·holidays | 이번 달(오늘까지) | 가용 0 → 없음. 대기·취소·노쇼 제외, 종료 없는 예약은 60분, 근무 외·휴일 예약도 예약 분에 들어가 100% 초과 가능(그대로 표시). 겹친 예약은 각각 센다. 준비·정리 버퍼는 가용 분에서 빼지 않는다(브리핑 "오늘 빈 시간" 은 버퍼 반영 — 기준이 다름). 분자는 담당자 무관(비활성·미지정 담당 예약 포함), 분모는 활성 직원만 | 확정 | utilizationRule(대시보드 타일·월 브리핑 [확정] 줄) | 180·181 |
| **이달 객단가(현금)** | 이달 완료 결제 합 ÷ 이달 방문 고객 수 | payments(completed, 이달)·방문일 | 이번 달 | 회차권 판매액 포함(현금 기준) — 고객 상세 객단가(실현)와 다름, 라벨 "(현금)" | 확정 | kpiRule | **138** |
| 월 매출 | 결제일이 그 달인 완료(completed) 결제 금액 합 | payments(status=completed) | 월 | 환불·대기 제외(매출 화면 "총 매출"과 같은 정의) | 확정 | revenueMetricsRule.monthMetrics.total | 147 |
| 전월/전년 동월 대비 | (이달 − 비교달) ÷ 비교달 × 100, 반올림 | 월 매출 | 월 | 비교달 0 이면 산출 안 함(—) | 확정 | monthMetrics.momPct/yoyPct | 147 |
| 목표 달성률 | 월 매출 ÷ 월 목표 × 100 | 설정 preferences.monthlyTargets | 월 | 목표 없으면 — | 확정 | monthMetrics.achievementPct | 147 |
| 신규 고객 매출 비중 | 그 달에 등록(registeredAt)한 고객의 결제 합 ÷ 월 매출 | payments.customerId, customers.registeredAt | 월 | 고객 없는 결제는 기존으로, 매출 0 이면 — | 확정 | monthMetrics.newSharePct | 147 |
| 할인 합계 | 완료 결제의 discountAmount 합 | payments | 월 | 음수는 0 | 확정 | monthMetrics.discount | 147 |
| 회원권 판매 | type=program 완료 결제 합(현금 유입) | payments | 월 | — | 확정 | monthMetrics.programSold | 147 |
| 회원권 실현(이달) | 그 달 시술 기록이 차감한 회차 × (결제액 ÷ 총 회차) | treatment_logs.customerProgramId·sessionsUsed, customer_programs | 월 | 기간제·총 회차 0 은 제외. 누적 실현은 customerValueRule(고객 가치) | 확정 | monthMetrics.programRealized | 147 |
| 미사용 회원권 잔액 | 진행 중(미완료) 회차권의 잔여 회차 × 회당 가격 합 | customer_programs | 시점 | 기간제 제외, 달과 무관 | 확정(시점값) | monthMetrics.unusedBalance | 147 |
| 손익분기 매출 | 판관비 ÷ (1 − 매출원가율), 원가율 = 매출원가(제품·소모품 매입) ÷ 월 매출 | expenses | 월 | 원가율 ≥ 1 이면 —, 매출 0·원가 0 이면 판관비 | 확정 | monthMetrics.breakEven | 147 |
| 영업시간·시간당 매출 | 휴무·지정 휴일이 아닌 날의 (마감 − 오픈) 합(이달은 오늘까지), 매출 ÷ 영업시간 | 설정 businessHours·holidays | 월 | 영업시간 설정 없으면 — | 확정 | revenueMetricsRule.openHoursInMonth, monthMetrics.perHour | 147 |
| 월말 예상 | 이달 매출 ÷ 지난 일수 × 그 달 일수 | 월 매출 | 이달 | 과거 달·매출 0 이면 — | **예측** | monthMetrics.projected | 147 |
| 캠페인 성과 | 고객별 첫 발송일 D 부터 D+14 안의 예약(취소·노쇼 제외) 고객 수, 완료 결제 고객 수·금액 합 | campaign_sends(이 기기 발송 성공), reservations, payments | 발송 뒤 14일 | 발송 0 이면 표시 없음; 창 안 발생 = 인과 아님 | **추정** | campaignPerformanceRule | 157 |
| **세그먼트 조건(저장 세그먼트)** | 등급·태그(하나 이상)·마지막 방문 뒤 일수 범위(미방문 제외)·방문 횟수 범위·누적 결제 이상·**최근 N일(기본 90, 양끝 포함) 완료 결제 합 이상(환불 행은 환불일에 차감 — 순액)·진행 중(미완료·만료 전) 회차권 유무**(175·178)·RFM 구분·이탈 위험·이달 생일·다음 예약 유무·광고 수신 상태 — 전부 AND, 빈 조건은 저장 불가, 금액·방문 횟수 최소는 1 이상 | customerStats·customerSegments·marketingConsent 로 만든 고객 사실(buildSegmentFacts) | 시점 | 자료 없는 항목(RFM null 등)은 그 조건에 불일치 | 확정(규칙) | segmentFilterRule.matchesSegment | 166·175·178 |
| **캠페인 대상·멱등키** | 트리거(11종)가 고른 고객 중 멱등키(캠페인·고객·회차 버킷) 미발송·광고면 수신 동의·채널 거부 아님·전화 10~11자리·변수 치환 완료·(선택)세그먼트 안 | campaignTriggers(reminderEngine·programAlerts·customerStats) | 오늘 | 제외 사유 6종 집계, 성공 발송만 기록(기기별) | 확정(규칙) | campaignRule.selectCandidates | 156, 167 |
| **목표 페이스** | 달성률 = 매출 ÷ 목표, 남은 일 = 그 달 일수 − 지난 일수, 하루 필요 = (목표 − 매출) ÷ 남은 일, 지금 속도 월말 = 매출 ÷ 지난 일수 × 그 달 일수 | monthMetrics | 이달 | 남은 일 0·지난 일 0 → 없음 | 확정 + **예측**(하루 필요·월말) | briefingRule.targetPace | 158 |
| **전월 대비 변화(원인 후보)** | 방문 고객·재방문 고객·신규 등록·(매출 권한) 객단가의 지난달 → 이달 값과 증감률 = (이달 − 지난달) ÷ 지난달 | kpiRule 을 두 달에 같은 입력으로 | 이달·지난달 | 지난달 0 이면 증감률 생략. 재예약률은 오늘 기준 미래 예약이라 지난달 값의 의미가 달라 제외(170) | 확정 | briefingRule.describeCause / briefing.monthCauses | 158, 170 |
| **파일럿 지표** | 초기 설정 완료율 = 6단계(매장 설정·직원 1·메뉴/프로그램 1·고객 5·첫 예약·첫 결제) 완료 수 ÷ 6; 활용률 = 7영역(고객·예약·결제·시술 기록·회차권·사진·문자) 사용 수 ÷ 7; 활동 상태 = 마지막 활동 7일 안 활동 중 / 30일 안 뜸함 / 그 밖 휴면 / 없음 | 서버 /api/admin/overview 컬렉션 건수 | 시점 | 지점 0 이면 평균 없음 | 확정 | pilotMetricsRule | 164 |

## 예정
LTV(예측, 연간 기대 × 기대 유지 기간 — 유지율 자료가 쌓인 뒤) · 첫 방문→두 번째 방문 전환율 · 캠페인 성과의 지점 전체 집계(서버 발송 기록 B-4 뒤) · AI 사용·원가 실측(161 뒤, `AI-PRICING-AND-COST-ANALYSIS.md` 2판). 세그먼트 필터 조합(저장 세그먼트)은 166 에서 구현됨.

## 규칙 모듈 색인(순수 `src/lib/*Rule.ts`·`src/lib/ai/*Rule.ts` 34개 + 보안 유틸 1개, store 미참조 — 공식은 위 표 또는 각 설계서)
| 모듈 | 무엇을 정하나 | 정의 문서 |
|---|---|---|
| customerStatsRule·visitCycleRule·revisitRule·upcomingRule·rfmRule·churnRule·customerValueRule·kpiRule·utilizationRule·revenueMetricsRule·programSessionsRule·campaignPerformanceRule·segmentFilterRule·pilotMetricsRule·ai/briefingRule(지표 서식·targetPace·describeCause) | 분석 지표·브리핑 라벨 서식 | 이 문서 표, `AI-TEST-REPORT.md` |
| schedulingRule·availabilityRule·staffScheduleRule·resourceRule·publicSlotsRule·reservationPolicyRule | 예약 겹침·가용 시각·근무 창·자원 상한·공개 슬롯·겹침 정책(allow/confirm/block) | `COMMERCIALIZATION-ROADMAP` 140~143 기록, `CUSTOMER-PORTAL-DESIGN-2026-11-24.md` |
| stockLedgerRule·stockRule·programLedgerRule·refundRule·backupSanitize(백업 비밀값 제거·테이블 모양 판정) | 재고 원장·안전 재고·회차 원장·환불 모델(결정 #9)·백업 파일 규칙 | 로드맵 145~148, `REFUND-MODEL-DESIGN-2026-11-24.md` |
| adComplianceRule·consentRule·campaignRule·duplicateRule·birthdayRule | 광고 표기·법정 시간·동의 태그·캠페인 대상/멱등키·중복 후보(한계: 국가번호 +82 표기와 010 표기는 다른 번호로 봄 — 뒷 4자리 사유로만 잡힘)·생일 | 로드맵 155~157·171, `AI-SECURITY-POLICY.md`(동의 관련 PII) |
| ai/modelRouterRule·ai/creditLedgerRule·ai/costSimulatorRule | 본사 AI 모델 선택·크레딧 원장·원가 시뮬레이션 | `AI-GATEWAY-ARCHITECTURE.md`, `AI-PRICING-AND-COST-ANALYSIS.md` |
| portalRule | 고객 포털 OTP 정책·노출 항목 | `CUSTOMER-PORTAL-DESIGN-2026-11-24.md` |
| ai/keyLeak(보안 유틸, Rule 파일 아님) | AI 키 꼴 탐지·스크럽 | `AI-SECURITY-POLICY.md` |

## 원칙
- 데이터가 부족하면 값을 만들지 않는다(null → 화면은 "-" 또는 "매장 기준").
- 확정과 예측을 라벨로 구분한다("예상"·"추정").
- 공식을 바꾸면 이 문서와 lib-units 스펙을 같은 커밋에서 바꾼다.
