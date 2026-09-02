#!/bin/sh
# DSM 작업 스케줄러 'CRM-server-update' 스크립트 (root)
# 개선판(2026-09-02): 고정 커밋 해시 대신 GitHub 최신 릴리스 태그를 자동 조회 —
# 릴리스 후 이 작업만 실행하면(또는 스케줄 활성화 시 자동) 항상 최신이 배포된다.
# 적용법: DSM > 제어판 > 작업 스케줄러 > CRM-server-update > 편집 > 작업 설정에 전체 붙여넣기.
LOG=/volume1/docker/crm-deploy-log.txt
{
echo "=== CRM server update start $(date) ==="
TAG=$(wget -qO- https://api.github.com/repos/MKUNIVERSAL-LOCAL/troiareuke-crm/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p')
[ -n "$TAG" ] || { echo "tag lookup FAIL"; exit 1; }
echo "deploy tag: $TAG"
VER=${TAG#v}
cd /tmp
rm -rf crm-src.tar.gz troiareuke-crm-$VER
wget -qO crm-src.tar.gz https://github.com/MKUNIVERSAL-LOCAL/troiareuke-crm/archive/refs/tags/$TAG.tar.gz || { echo "download FAIL"; exit 1; }
tar xzf crm-src.tar.gz
SRC=/tmp/troiareuke-crm-$VER/server
[ -d "$SRC" ] || { echo "src dir missing - abort"; exit 1; }
cp -a /volume1/docker/troiareuke-crm-server /volume1/docker/troiareuke-crm-server.bak-$(date +%m%d%H%M)
rsync -a --exclude='.env' "$SRC"/ /volume1/docker/troiareuke-crm-server/
cd /volume1/docker/troiareuke-crm-server
/usr/local/bin/docker-compose -p troiareuke-crm up -d --build auth-api
sleep 8
echo "health: $(curl -s http://127.0.0.1:8787/health)"
echo "=== done $(date) ==="
} > "$LOG" 2>&1
