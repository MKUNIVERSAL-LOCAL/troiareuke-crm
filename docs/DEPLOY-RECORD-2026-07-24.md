# 배포 기록 — 2026-07-24 v1.0.35 릴리스 + 어드민 애널리틱스

## v1.0.35 정식 릴리스 (완료)
- QA 5개 카테고리(110+ 시나리오) 전건 PASS 후 릴리스.
- **치명 수정**: 로컬 모드 logout()의 localStorage 전체 삭제가 유일한 저장소를 지워 데이터 영구 소실 → 로컬 모드는 세션 키만 제거(26d2fe6, CORE_EDIT). 재로그인 온보딩 재진입 수정(43599c2).
- 빌드 오염 가드(vite.config.ts, .env.local 존재 시 build throw) 추가.
- 검증: asar ENV 마커 True, CDP 런타임 2종 PASS, 채널 sha256 일치(06dc90e2…), exe HEAD 200.
- 배포: gh release v1.0.35 → DSM CRM-publish-update(TAG=v1.0.35) 실행 → crm-update 채널 라이브.
- 로컬: OneDrive 트로이아르케-CRM / 트로이아르케-CRM-어드민 / CRM-사용자배포용 exe / _deployment-version.txt 갱신.

## 어드민 지점별/전체 애널리틱스 (커밋 3ac2ae0)
- 서버: `GET /api/admin/analytics` (슈퍼어드민) — 고객(총/신규30일)·매출(누적/월별6개월/일별30일/환불)·예약(총/완료/예정)·시술 지점별 집계. 금액은 숫자 형식 가드 후 합산.
- 클라이언트: 통계/분석 화면이 NAS 모드에서 지점 선택 칩(전체/개별) + 요약 카드 4종 + 월별/일별 매출 차트 + 지점 비교 차트/표 렌더링. (기존: NAS 모드에서 Supabase 전용 안내판만 표시되던 공백 해소)
- 어드민 exe 재빌드 → OneDrive 어드민 폴더 재배포 완료 (2026-07-24 20:38).

## ⚠️ 남은 단계 (오너 액션 1개)
- **NAS 서버 재배포 미완**: classifier가 DSM 루트 스크립트 입력을 차단 → 오너가 DSM 작업 스케줄러 `CRM-server-update` 편집창에 스크립트 붙여넣기(커밋 SHA `3ac2ae0335daf9af8b2835306609adf31ba9d55f` 3곳) → 확인 → 실행 → (실행 후 비활성 유지). 전체 스크립트는 세션 대화 기록/아래 참조.
- 배포 전까지 어드민 통계 화면은 "통계를 불러오지 못했습니다" + 다시 시도 버튼 표시(에러 처리 정상 동작). 배포 후 검증: `/api/admin/analytics` 401(토큰 없이) → 어드민 로그인 → 통계 화면에서 아르케스파 고객 1,127명 표시 확인.

```sh
#!/bin/sh
LOG=/volume1/docker/crm-deploy-log.txt
{
echo "=== CRM server update start $(date) ==="
cd /tmp
rm -rf crm-src.tar.gz troiareuke-crm-3ac2ae0335daf9af8b2835306609adf31ba9d55f
wget -qO crm-src.tar.gz https://github.com/MKUNIVERSAL-LOCAL/troiareuke-crm/archive/3ac2ae0335daf9af8b2835306609adf31ba9d55f.tar.gz || { echo "download FAIL"; exit 1; }
tar xzf crm-src.tar.gz
SRC=/tmp/troiareuke-crm-3ac2ae0335daf9af8b2835306609adf31ba9d55f/server
[ -d "$SRC" ] || { echo "src dir missing - abort"; exit 1; }
cp -a /volume1/docker/troiareuke-crm-server /volume1/docker/troiareuke-crm-server.bak-$(date +%m%d%H%M)
rsync -a --exclude='.env' "$SRC"/ /volume1/docker/troiareuke-crm-server/
cd /volume1/docker/troiareuke-crm-server
/usr/local/bin/docker-compose -p troiareuke-crm up -d --build auth-api
sleep 8
echo "health: $(curl -s http://127.0.0.1:8787/health)"
echo "=== done $(date) ==="
} > "$LOG" 2>&1
```

## 기타 확인 사항 (같은 날)
- NAS 실데이터: 아르케스파 지점 — 고객 1,127건·상담 2·문자이력 1 (예약/결제/시술/직원/서비스/제품/설정 0건 → 샵 PC [기존 계정 데이터 가져오기]로 이관 가능).
- 어드민 검증 4중 완료(UI 17/17, 실서버 API, 빌드 분리, 배포본 exe 지점계정 차단 동작).
- 아르케스파 전달 준비 완료: CRM-사용자배포용 exe(v1.0.35) + airmarin1530 계정 + 가져오기 안내 + 구 프로그램 제거 안내.
