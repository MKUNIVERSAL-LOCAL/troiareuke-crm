---
name: dermasolution-global-crm-evolution
description: 글로벌 CRM(Fresha·Zenoti·Boulevard·Mindbody·Vagaro, 오픈소스 Pronto·OpenSalon·Easy!Appointments·Mautic·Metabase·ERPNext·Twenty)의 검증된 기능을 DERMASOLUTION 에 선별 도입하는 절차 — GAP 분석, 외부 코드 활용 분류(A/B/C/D), 고객 360·예약·분석·마케팅 자동화 묶음 설계 때 사용.
---

# 글로벌 CRM 고도화

## 원칙
- 전체 프로그램을 가져오지 않는다. 검증된 기능·알고리즘·데이터 구조·UX 의 장점만 선별한다.
- 이미 구현된 기능을 중복 개발하지 않는다 — 먼저 `docs/GLOBAL-CRM-GAP-ANALYSIS.md` 의 기존 구현 위치를 확인하고 기존 화면·모듈을 확장한다.
- 한국 에스테틱 현장 우선: 네이버 예약·카카오 알림톡·문자·국내 PG·회차권/정액권·관리 전후 사진·홈케어 재구매·1인 매장.
- UI: 기존 디자인 시스템·Pretendard 유지, 핵심 기능 최소 클릭, 전체 화면 일괄 교체 금지, 원장님이 다음 행동을 바로 알 수 있게.

## 외부 코드 활용 분류 (마스터 프롬프트 07절)
| 분류 | 조건 | 기록 |
|---|---|---|
| A 코드 직접 재사용 | MIT/Apache 등 허용적 라이선스 + 저작권 고지 + 파일 단위 라이선스 확인 | `docs/THIRD-PARTY-CODE-REGISTER.md` 에 저장소 URL·커밋·파일 경로·라이선스·목적·수정 내용·검증 결과 |
| B 요구사항·아이디어 참고 독립 재구현 | GPL/AGPL/상용/불명확 라이선스는 반드시 B | 참고 출처와 "복사하지 않았음"을 등록부에 명시 |
| C 공식 API 연동 | 공식 OAuth/API·제휴 권한 확보 시에만 실제 연동, 전에는 어댑터·Mock 까지 | 승인 대기열 C |
| D 미도입 | 기술 부채·보안·라이선스·호환성 | 사유 기록 |
GPL·AGPL 코드를 복사하거나 "별도 서비스 분리" 만으로 의무가 해결된다고 가정하지 않는다.

## 도입 전 검증 항목
저장소 실재·최신 커밋·릴리스·유지보수·LICENSE 파일·의존성 라이선스·상업적 사용·공개 의무·고지 의무·보안 advisory·테스트 코드·실제 구현 수준·유료 전용 여부·Electron/Capacitor/NAS/IndexedDB 호환성·장기 유지 비용.

## 묶음 설계 규칙
- 분석 지표(RFM·재방문율·LTV·가동률·손익)는 **순수 모듈** `src/lib/analytics/*` 로 만들고 lib-units 스펙으로 공식·예외·데이터 부족 조건을 고정한다. 확정 데이터와 예측을 구분하고, 데이터가 부족하면 결과를 만들지 않는다.
- 회원권: 판매 시점(현금 유입)과 사용 시점(실현 매출)을 구분해 중복 집계를 막는다.
- 예약: 가용 슬롯 계산(근무시간·휴게·휴무·시술 소요·버퍼·자원)은 순수 규칙 모듈로, 서버 측 충돌 방지는 승인 대기열(서버 변경)과 함께.
- 마케팅 자동화: 대상·조건·시점·템플릿·반복을 설정으로, 초기 기본은 "추천 대상 확인 + 관리자 승인 발송". 수신 동의·거부·광고 표기·법정 시간·중복 방지·비용 한도를 설계에 포함. 실고객 발송은 승인 전 금지.
- 모든 묶음은 PC·모바일 동등성, 접근성 게이트, 기존 E2E 유지.

## 산출물
`GLOBAL-CRM-GAP-ANALYSIS.md`(상태 6분류·항목별 18열), `GLOBAL-CRM-INTEGRATION-ROADMAP.md`, `THIRD-PARTY-CODE-REGISTER.md`, `GLOBAL-CRM-PROGRESS.md`, `GLOBAL-CRM-TEST-REPORT.md`. 기존 정본(`COMMERCIALIZATION-ROADMAP-2026-11-17.md`)과 중복되는 기록은 링크로 대신한다.
