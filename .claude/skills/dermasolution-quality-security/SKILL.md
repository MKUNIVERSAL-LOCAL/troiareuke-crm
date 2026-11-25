---
name: dermasolution-quality-security
description: DERMASOLUTION 품질·보안·라이선스 게이트 — 묶음 완료 전 자동 테스트 기준, 독립 코드리뷰, 데이터 무결성(다중 기기·결제·회차권·재고) 점검, 개인정보·API 키 보안, 외부 코드 라이선스 검증, 배포·업데이트 검증. 묶음을 끝내거나 릴리스하기 전에 사용.
---

# 품질·보안 게이트

## 완료 보고 전 필수(CLAUDE.md 3절 + 37절)
1. `npx tsc --noEmit` 0 · `npx tsc -p e2e --noEmit` 0 · `npm run build` 통과.
2. 전체 게이트: `build:e2e`(dist-e2e + dist-e2e-nas) → Playwright 전체(chromium·mobile·admin-nas, 메모리 사정상 `--workers=1`) → `check:distribution` → `check:routes` → `test:updater` → `test:outbox` → `mobile:prepare`. 시스템이 메모리 부족으로 게이트를 죽이면 자동 재시작 금지, 오너 지시 뒤 재실행.
3. 순수 규칙 모듈은 `e2e/lib-units.spec.ts` 에 공식·경계·예외를 고정(store import 금지). 서버 동기화 계약은 `scripts/test-nas-outbox.mjs`.
4. 테스트를 삭제·약화해 통과율을 올리지 않는다. 실행하지 않은 테스트를 통과로 기록하지 않는다. 가짜 성공(서버 실패를 삼키는 토스트) 금지.
5. exe 는 빌드 후 asar 마커(NAS 3·Supabase 0·IndexedDB·버전·Pretendard)와 CDP 런타임(isAdminBuild 지점 false·어드민 true) 검증, 잔존 프로세스 0.

## 데이터 무결성 점검표(09절)
다중 기기 동시 예약·회차권 차감·재고 수정 / 중복 고객 / 삭제 부활 / 오프라인 충돌 / 최신 덮어쓰기 / 결제·환불 중복 / 역할 변경 즉시 반영 / 매장 격리 / 백업·복구 / 업데이트 실패·롤백 / GitHub-NAS 버전 불일치. 클라이언트 표시값 수정만으로 "해결"이라 하지 않는다 — 서버 트랜잭션·원자적 변경·고유 제약·Idempotency Key·낙관적 동시성·버전·tombstone·감사로그·outbox 재시도가 필요한 것은 설계·영향·테스트·롤백 계획과 함께 `OWNER-APPROVAL-QUEUE.md` 에.

## 독립 코드리뷰
3묶음에 1회(동기화·결제·권한·배포는 즉시). 읽기 전용 에이전트에 범위(커밋 해시)·관점(정확성·회귀·z-index·성능·E2E 실효성·데드코드·문구)을 주고 HIGH/MED/LOW + 정상 확인 + 코어 메모로 받는다. 반영은 다음 묶음에서, 미반영 항목은 사유 기록.

## 보안·개인정보
실고객 PII 를 공개 저장소·테스트·노션·미승인 AI 로 보내지 않는다(E2E 는 가짜 계정·가짜 번호). API 키·비밀번호·토큰 평문 저장 금지(21절), 로그·백업·진단에 포함되지 않는지 테스트. 매장별 격리는 서버가 검증. 역할(admin/staff/superadmin) 게이트는 `permissions.ts` 단일 소스. 변경 이력은 `privacyLog`·`loginLog` 유지.

## 외부 코드·라이선스
도입 전 `THIRD-PARTY-CODE-REGISTER.md` 에 등록(URL·커밋·파일·라이선스·목적·수정·검증). 허용적 라이선스도 고지 의무 준수. GPL/AGPL/상용/불명확은 복사 금지(개념 참고만). 의존성 추가는 라이선스·유지보수·취약점·번들 크기 확인 뒤.

## 배포·업데이트(38절)
GitHub Release 버전 = NAS 채널 버전 = 지점 실행 버전(어드민 대시보드 48시간 내 구버전 0) 확인. 매니페스트·해시·기존 데이터 보존·실패 복구·롤백. 신규 기능은 Feature Flag 로 파일럿 → 제한 → 전체. 운영 서버 변경·전체 배포는 오너 승인.

## 보고
테스트 결과는 실행 명령·통과 수·실패 내용 그대로. `GLOBAL-CRM-TEST-REPORT.md`·`AI-TEST-REPORT.md` 에 묶음별 기록, 재검증 N차는 로드맵 3-1.
