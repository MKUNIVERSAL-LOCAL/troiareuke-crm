---
name: dermasolution-master-development
description: DERMASOLUTION(트로이아르케 CRM) 통합 개발 총괄 — 마스터 프롬프트(2026-11-24)의 7단계 로드맵·절대 원칙·보고 형식에 따라 묶음을 선정·구현·검증·기록한다. 세션 시작, 묶음 선정, 오너 보고, 세션 종료 기록 때 사용.
---

# DERMASOLUTION 통합 개발 총괄

## 목표
고객을 기록하는 CRM → 분석·추천·마케팅 실행·매출 성장을 돕는 AI 경영 플랫폼(AI-Powered Aesthetic Business OS). 순환: 데이터 수집 → 분석 → 문제 발견 → 행동 추천 → 마케팅 실행 → 방문 → 매출 → 성과 측정.

## 세션 시작 절차
1. `docs/NEXT-ACTION.md` → `docs/MASTER-DEVELOPMENT-STATUS.md` → `docs/OWNER-APPROVAL-QUEUE.md` 를 읽는다.
2. `git status`(미커밋 변경 보존), `git log --oneline -5`, PR 번호 확인. 노션 "Derma solution 데이터 저장소" 최근 항목은 참고용, 정본은 코드·git·테스트 결과.
3. CLAUDE.md 의 코어 잠금·배포 불변·재다운로드 금지·게이트 규칙을 그대로 적용한다. 이 스킬은 안전장치를 해제하지 않는다.

## 절대 원칙(요약 — 전문은 메모리 `dermasolution-master-prompt`, 마스터 프롬프트 04절)
재개발·전면 교체 금지 / 기존 데이터·구조(Electron·Capacitor·NAS·IndexedDB·outbox) 유지 / Supabase 재도입 금지 / 코어는 CORE_EDIT=1+오너 승인 / 인앱 업데이트만, 재다운로드 금지 / Feature Flag 로 단계 활성 / Pretendard·디자인 시스템 유지 / 실고객 PII 를 외부·노션·AI 에 보내지 않음 / 테스트 삭제·약화 금지 / 의존성 무분별 추가 금지 / 외부 비용·운영 서버·머지는 승인.

## 묶음 선정 우선순위
PHASE 1 안정성(P0) > PHASE 2 CRM 고도화 > PHASE 3 개인 AI(BYOK) > PHASE 4 마케팅·AI 비서 > PHASE 5 본사 AI 기반. 이전 단계의 필수 안정성 검증을 통과한 뒤 다음 단계; 서로 의존하지 않는 안전한 작업은 병행 가능. 승인 대기 항목 때문에 멈추지 않는다 — 비코어·무비용 작업을 계속한다.

## 묶음 실행 루프
구현 → `npx tsc --noEmit` + `npx tsc -p e2e --noEmit` → 표적 스펙 → 전체 게이트(scratchpad `gate1.sh N`: build·build:e2e·Playwright 워커 1·distribution·routes·updater·outbox·mobile:prepare) → 커밋(메시지 끝 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`) → 푸시 → 로드맵 P6·릴리스 노트·브리핑 갱신 → 재검증 N차 기록 → PR 본문 → 노션 한 줄 → exe 재빌드(오너 실행 중이면 생략). 독립 리뷰는 3묶음에 1회, 동기화·결제·권한 묶음은 즉시.

## 에이전트 운영
읽기 전용 조사·리뷰 에이전트는 한 번에 1~2개(작업 PC 메모리 중단 이력). 같은 파일을 동시에 수정하는 에이전트를 띄우지 않는다. 결과는 docs 에 기록하고 노션에는 요약 줄만.

## 오너 보고 형식(41절)
진행률(산정 근거) / 버전 / 단계 / 완료 기능 / 개선점 / 참고 CRM / 외부 코드·라이선스 / 테스트 결과 / 위험 / 해결한 문제 / 미완료 / 승인 필요 / 추가 비용 / 다음 작업 / 상용화 남은 조건. 구현·테스트·배포·상용화 완료를 구분하고, 실행하지 않은 테스트를 통과로 적지 않는다.

## 세션 종료 절차
`MASTER-DEVELOPMENT-STATUS.md`(완료·진행·미완료·브랜치·커밋·PR·테스트·문제·승인·다음)와 `NEXT-ACTION.md`(재개 지점·명령) 갱신 → 커밋·푸시. 메모리 부족으로 게이트가 중단되면 자동 재시작하지 않고 보고한다.

## 관련 스킬
`dermasolution-global-crm-evolution`(CRM 고도화·외부 코드), `dermasolution-ai-platform-development`(AI), `dermasolution-quality-security`(테스트·보안·라이선스).
