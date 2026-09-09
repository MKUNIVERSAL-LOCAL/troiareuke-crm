# NAS(DSM) 작업 자동화 스크립트

릴리스 파이프라인에서 남은 수동 단계(DSM 작업의 TAG/해시 수정)를 없애는 개선판. 2026-09-02 작성.

## 목표 파이프라인 (전자동)

```
PC에서: npm run release:all   (빌드 → 스테이징 → GitHub Release 게시, 원커맨드)
NAS에서: CRM-publish-update / CRM-server-update 가 최신 릴리스를 자동 조회해 게시·배포
         (매일 00:00 스케줄을 활성화하면 실행 클릭조차 불필요)
```

## 1회 적용 방법 (오너 직접 또는 권한 승인된 세션)

1. DSM(제어판 > 작업 스케줄러)에서 `CRM-server-update` 편집 > 작업 설정 →
   `CRM-server-update.sh` 내용 전체를 붙여넣기(기존 스크립트 대체).
2. `CRM-publish-update`는 기존 스크립트에서 `TAG=v…` 한 줄만 아래로 교체:
   `TAG=$(wget -qO- https://api.github.com/repos/MKUNIVERSAL-LOCAL/troiareuke-crm/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p')`
3. (선택) 두 작업의 '활성화됨' 체크 → 매일 00:00 자동 실행. 새 릴리스가 없으면 같은 버전 재게시라 무해. (✅ 2026-09-07 오너 활성화)
4. **v1.0.50부터 설치파일 추가 (오너 1회 수정 필요)**: `CRM-publish-update` 스크립트에서 `TroiareukeCRM-portable.exe`를
   내려받는 줄을 복사해 파일명만 `TroiareukeCRM-Setup.exe`로 바꾼 줄을 바로 아래에 추가한다 (sha 검증 줄이 있으면 그것도 같이).
   이 줄이 없으면 사이트 기본 다운로드 버튼(/portable/TroiareukeCRM-Setup.exe)이 404가 난다. 확인: `npm run verify:nas`.
4. (권장) 완전 자동화: 작업 PC 공개키를 NAS 계정 `~/.ssh/authorized_keys`에 등록하면
   이후 Claude가 DSM 로그인 없이 게시·배포·검증까지 직접 수행 가능.

## 채널 루트 정리 (1회, 2026-09-04 발견 — ✅ 2026-09-07 오너 실행 완료, 기록용)

루트에 7월 구버전 `트로이아르케 CRM.exe`(v1.0.25)와 `latest.json`이 남아 있어 옛 링크로 받으면 구버전이 설치된다.
SSH(`ssh ys-lee0223@mkcorp.familyds.com`) 또는 DSM 작업 스케줄러(사용자 ys-lee0223)에서 아래를 한 번 실행:

```sh
cd /volume1/CRM-UPDATES
mkdir -p _legacy-2026-07
mv "트로이아르케 CRM.exe" latest.json _legacy-2026-07/
ln -s portable/TroiareukeCRM-portable.exe "트로이아르케 CRM.exe"
ln -s portable/latest.json latest.json
# 검증 — 둘 다 HTTP 200이고 latest.json 버전이 portable/latest.json과 같아야 한다
curl -sI http://127.0.0.1:18080/latest.json | head -1
curl -s  http://127.0.0.1:18080/latest.json | grep version
curl -sI "http://127.0.0.1:18080/%ED%8A%B8%EB%A1%9C%EC%9D%B4%EC%95%84%EB%A5%B4%EC%BC%80%20CRM.exe" | head -1
```

심링크가 200이 아니면(정적 서버가 심링크를 안 따라가면) `ln -s` 대신 `cp portable/... ./`로 복사하고,
`CRM-publish-update` 스크립트 끝에 같은 `cp` 두 줄을 추가해 릴리스마다 루트도 갱신되게 한다.
결과는 docs/DISTRIBUTION-POLICY.md 규칙 9에 "완료"로 기록.

## 🔴 2026-09-09 사고 원인 — 반복 설정이 "매일"이 아니었다

NAS `/etc/crontab`(SSH로 읽기 가능)에 두 작업이 `0 0 7 9 * root synoschedtask --run id=13/14` 로 등록되어 있었다.
즉 **"2026-09-07 00:00 1회"** 로 저장된 상태 — 활성화 체크는 맞지만 반복이 "매일"이 아니어서 09-08 이후 영영 돌지 않음.

**오너 조치(2분)**: DSM > 제어판 > 작업 스케줄러 > `CRM-publish-update` 선택 > 편집 > **스케줄** 탭 >
"다음 날짜에 실행"에서 **매일** 선택(시간 00:00) > 확인. `CRM-server-update`도 동일.
검증: `ssh ys-lee0223@mkcorp.familyds.com "grep synoschedtask /etc/crontab"` 에서 id=13, id=14 줄이 `0 0 * * *` 이어야 한다.

**보조 경로(PC, 릴리스 순간)**: `release:all` 끝에 `scripts/publish-nas-channel.mjs`(채널 게시)와 `scripts/deploy-nas-server.mjs`(서버 재배포)가 자동 실행된다.
서버 재배포는 root 권한이 필요하므로 오너가 1회 `grant-deploy-sudo.sh`를 DSM(root 작업)으로 실행하면 이후 PC에서도 자동 완료된다.

## 주의

- 스크립트는 `.env`를 절대 덮어쓰지 않는다(rsync --exclude).
- 배포 전 자동 백업(`troiareuke-crm-server.bak-*`) 생성 — 롤백은 백업 폴더 복원 + 재빌드.
- 2026-09-02 현재 DSM의 두 작업 상태: publish는 v1.0.46으로 실행 완료(채널 라이브),
  server-update는 구버전(고정 해시 69b8cc1) — 이 개선판 적용 대기.
