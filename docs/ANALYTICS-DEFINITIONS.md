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

## 예정(마스터 로드맵 136~138·145)
RFM(최근성·빈도·금액 5분위, 매장 기준 조정) · 세그먼트(필터 조합) · 이탈 위험(개인 주기 대비 경과 비율) · 실현 매출(회차 사용 × 단가 + 단건 + 제품) · 객단가 · LTV(예측) · 재방문율 · 첫 방문→두 번째 방문 전환율 · 예약 취소율·노쇼율 · 가동률(예약 분 / 가용 분) · 전기 대비(동일 길이 직전 기간) · 목표 달성률 · 월말 예상(예측). 각 지표는 추가되는 순서대로 이 표에 행을 더한다.

## 원칙
- 데이터가 부족하면 값을 만들지 않는다(null → 화면은 "-" 또는 "매장 기준").
- 확정과 예측을 라벨로 구분한다("예상"·"추정").
- 공식을 바꾸면 이 문서와 lib-units 스펙을 같은 커밋에서 바꾼다.
