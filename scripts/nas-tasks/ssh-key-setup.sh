#!/bin/sh
# DSM 작업 스케줄러 'ssh-key-setup' (사용자 ys-lee0223) — 작업 PC들의 SSH 공개키 등록.
# 목적: PC에서 `npm run release:all`이 채널 게시(publish-nas-channel.mjs)·서버 재배포(deploy-nas-server.mjs)까지
#       DSM 로그인 없이 자동 완료되게 한다. 공개키만 담고 있어 유출 위험 없음(개인키는 각 PC에만).
# 전제: 제어판 > 사용자 및 그룹 > 고급 > "사용자 홈 서비스 활성화" 가 켜져 있어야 $HOME(/var/services/homes/ys-lee0223)이
#       실제로 존재하고 sshd가 authorized_keys를 읽는다. 꺼져 있으면 키 등록해도 "Permission denied (publickey)".
# ⚠️ 기존 DSM 작업의 스크립트는 키 한 줄이 여러 줄로 쪼개져(붙여넣기 줄바꿈) 무효였다(2026-09-22 발견). 키는 반드시 한 줄.
set -e
mkdir -p "$HOME/.ssh"
[ -f "$HOME/.ssh/authorized_keys" ] && cp -f "$HOME/.ssh/authorized_keys" "$HOME/.ssh/authorized_keys.bak-$(date +%m%d%H%M)"
cat > "$HOME/.ssh/authorized_keys" <<'KEYS'
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMdrFuV3zpO1oV/HtW3ICHP01IrHb+JHeO8EotS4ws25 crm-deploy-claude
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJmLpAMxaCR0NaO5Og0YUQvhcqAfy1joXiYDJ2ETg9AT jarvis-mainpc-2026
KEYS
chmod 700 "$HOME/.ssh"
chmod 600 "$HOME/.ssh/authorized_keys"
echo "authorized_keys 등록 완료: $(wc -l < "$HOME/.ssh/authorized_keys")개 키, HOME=$HOME"
