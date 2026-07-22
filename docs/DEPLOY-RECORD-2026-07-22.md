# 배포 기록 — 2026-07-22 NAS 서버 재배포 (어드민 데이터 API)

## 무엇을 배포했나
- 커밋: `0f66302b23a08c19d8f29f9e5c724a34ace9e97d` (feat/nas-central-backend, 72h 스프린트 최종)
- 슈퍼어드민 전 데이터 조회 API 4종: `/api/admin/overview`, `/api/admin/data/:branchId/:collection`, `/api/admin/messages/:branchId`, `/api/admin/photos/:branchId`
- `consultations` 컬렉션 허용 (피부상담 NAS 동기화)
- 예약발송 디스패처 크래시 시 이중발송 방지
- Electron file:// Origin CORS 허용 (f38789b 포함)

## 어떻게 배포했나 (SSH 비밀번호 없이 — 표준 경로로 채택)
1. 오너가 DSM(`mkcorp.familyds.com:5001`)에 브라우저 로그인 → Claude가 브라우저 조작
2. **제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 정의 스크립트**
   - 작업명 `CRM-server-update`, 사용자 **root**
   - 스크립트: GitHub 커밋 타르볼 wget → `/volume1/docker/troiareuke-crm-server.bak-<날짜>` 백업 → `rsync -a --exclude='.env'`로 소스 교체 → `/usr/local/bin/docker-compose -p troiareuke-crm up -d --build auth-api`
3. 작업 선택 → **실행** (빌드 약 2분)
4. 실행 후 작업 **비활성화** ← ⚠️ 기본 일정이 매일 00:00이라 방치하면 야간마다 재배포됨. 반드시 끌 것.

## 검증 결과
- `GET /health` → `{"ok":true,"service":"troiareuke-auth"}` ✅
- `GET /api/admin/overview` (토큰 없이) → **401** (라우트 존재 + 슈퍼어드민 가드 작동) ✅ — 배포 전엔 404였음
- `GET /api/admin/data/x/customers` → 401 ✅
- `GET /api/data/consultations` → 401 ✅
- 배포 로그: `/volume1/docker/crm-deploy-log.txt`
- 롤백 필요 시: 백업 폴더를 rsync로 되돌린 후 같은 compose 명령 재실행 (docs/NAS-REDEPLOY-RUNBOOK.md 참조)

## 다음 배포 절차 (요약)
작업 스케줄러의 `CRM-server-update` 작업 편집 → 스크립트의 커밋 SHA 2곳 교체 → 활성화 → 실행 → 비활성화.
상세 절차·전체 스크립트: `docs/NAS-REDEPLOY-RUNBOOK.md`

## 남은 배포 체인
- [ ] PR #6 → main 머지
- [ ] 클라이언트 exe 재빌드 (NAS 연동 빌드 여부는 `.env`의 `VITE_AUTH_API_URL`로 결정 — 컷오버는 오너 결정)
- [ ] 슈퍼어드민 exe(release-admin)도 NAS 연동 빌드로 재빌드 → "전체 데이터" 사용 가능
- [ ] SMTP·SMS 발송사 설정 (코드 밖 절차)
