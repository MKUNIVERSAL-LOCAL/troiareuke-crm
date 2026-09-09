#!/bin/sh
# [오너 1회 실행 — DSM > 제어판 > 작업 스케줄러 > 생성 > 예약된 작업 > 사용자 정의 스크립트 > 사용자 root]
# 목적: 작업 PC(Claude)가 SSH로 서버 재배포까지 자동 수행할 수 있게, ys-lee0223 계정에
#       "배포 스크립트 1개만" 비밀번호 없이 sudo 실행할 권한을 준다. 다른 root 권한은 주지 않는다.
# 되돌리기: rm /etc/sudoers.d/crm-deploy /volume1/docker/crm-server-deploy.sh
set -e

# 1) 배포 스크립트(root 소유, 수정 불가) — CRM-server-update.sh와 같은 내용을 파일로 고정
cat > /volume1/docker/crm-server-deploy.sh <<'EOF'
#!/bin/sh
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
cat "$LOG"
EOF
chown root:root /volume1/docker/crm-server-deploy.sh
chmod 755 /volume1/docker/crm-server-deploy.sh

# 2) sudoers 규칙 — 이 스크립트 하나만, 비밀번호 없이
mkdir -p /etc/sudoers.d
echo 'ys-lee0223 ALL=(root) NOPASSWD: /volume1/docker/crm-server-deploy.sh' > /etc/sudoers.d/crm-deploy
chmod 440 /etc/sudoers.d/crm-deploy
visudo -c -f /etc/sudoers.d/crm-deploy && echo "sudo rule OK"

# 3) 즉시 1회 배포 실행(최신 릴리스 반영)
/volume1/docker/crm-server-deploy.sh
