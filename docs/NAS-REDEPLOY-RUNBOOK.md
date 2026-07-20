# NAS 서버 재배포 런북 — 2026-07-20 어드민 데이터 API 반영

> 대상: `https://crm-api.mkcorp.familyds.com` (DSM 역방향프록시 → 127.0.0.1:8787)
> 설치 위치: `/volume1/docker/troiareuke-crm-server`
> 이번 배포로 추가되는 것: 슈퍼어드민 전 데이터 조회 API 4종(`/api/admin/overview`,
> `/api/admin/data/:branchId/:collection`, `/api/admin/messages/:branchId`,
> `/api/admin/photos/:branchId`), `consultations` 컬렉션 허용, 예약발송 크래시 이중발송 방지.
> ⚠️ 전부 추가/방어 변경 — 기존 클라이언트와 하위호환. `.env`·DB 데이터는 건드리지 않음.

## 사전 확인
```powershell
# PC에서 — 현재 서버 생존 확인
Invoke-WebRequest https://crm-api.mkcorp.familyds.com/health -UseBasicParsing
# → {"ok":true,"service":"troiareuke-auth"}
```

## 배포 절차 (SSH: ys-lee0223@mkcorp.familyds.com, sudo는 `echo <pw> | sudo -S`, docker는 /usr/local/bin 전체경로)

1. PC에서 최신 server 소스 전송 (NAS에는 git 없음 — scp 사용):
```powershell
# feat/nas-central-backend 최신 커밋 기준
cd F:\dev\crm-claude
scp -r server ys-lee0223@mkcorp.familyds.com:/tmp/crm-server-update
```

2. NAS에서 소스 교체 + 컨테이너 재빌드 (`.env`는 보존):
```bash
sudo -i   # 또는 각 명령에 sudo
cp -a /volume1/docker/troiareuke-crm-server /volume1/docker/troiareuke-crm-server.bak-$(date +%m%d)
# .env·docker-compose.yml 이외의 소스만 교체
rsync -a --exclude='.env' /tmp/crm-server-update/ /volume1/docker/troiareuke-crm-server/
cd /volume1/docker/troiareuke-crm-server
/usr/local/bin/docker-compose -p troiareuke-crm up -d --build auth-api
```

3. 검증:
```bash
curl -s http://127.0.0.1:8787/health
# PC에서: 슈퍼어드민 로그인 후 어드민 콘솔 → "전체 데이터" 메뉴가 지점 목록을 띄우는지 확인
```

4. 실패 시 롤백:
```bash
rsync -a /volume1/docker/troiareuke-crm-server.bak-<날짜>/ /volume1/docker/troiareuke-crm-server/
/usr/local/bin/docker-compose -p troiareuke-crm up -d --build auth-api
```

## 참고
- DB(postgres 컨테이너 `troiareuke-crm_database_1`)는 재빌드 대상 아님 — 데이터 유지.
- `crm_records`에 `consultations` 컬렉션은 스키마 변경 없이 그대로 저장됨(JSONB).
- CI(server-ci)가 실제 Postgres로 신규 API 스모크 포함 전체 통과한 커밋만 배포할 것.
