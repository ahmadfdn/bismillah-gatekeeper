#!/bin/bash
# Deploy the bismillah Proof Gatekeeper agent to the VPS and expose it via
# Caddy (automatic Let's Encrypt HTTPS) on a stable sslip.io hostname derived
# from the VPS IP — no account, no tunnel, URL never changes on restart.
#   Public URL: https://gatekeeper.209-50-61-232.sslip.io/agent
# Run from the LOCAL machine. Deploys to /root/agentgames on the VPS.
set -euo pipefail

WORK_DIR="/home/hatch/workspace/agentgames"
VPS="root@209.50.61.232"
SSH_KEY="/home/hatch/.ssh/id_ed25519"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/home/hatch/.ssh/known_hosts"
HOST="gatekeeper.209-50-61-232.sslip.io"
TARBALL="/home/hatch/workspace/agentgames-deploy.tar.gz"

cd "$WORK_DIR"
rm -f "$TARBALL"
tar czf "$TARBALL" \
  --exclude=node_modules --exclude=.env --exclude=tests/tmp-*.json \
  --exclude=data --exclude=agentgames-deploy.tar.gz \
  .

echo "== uploading =="
scp $SSH_OPTS "$TARBALL" "$VPS:/root/agentgames-deploy.tar.gz"

echo "== installing on VPS =="
ssh $SSH_OPTS "$VPS" <<'REMOTE'
set -euo pipefail
mkdir -p /root/agentgames
cd /root/agentgames
tar xzf /root/agentgames-deploy.tar.gz
rm -f /root/agentgames-deploy.tar.gz
mkdir -p logs data circuits
cp deploy/watchdog.sh deploy-watchdog.sh
chmod +x deploy-watchdog.sh
if [ ! -d node_modules/snarkjs ]; then
  npm init -y >/dev/null 2>&1 || true
  npm install snarkjs@0.7.6 --no-audit --no-fund
fi
if ! command -v caddy >/dev/null 2>&1; then
  curl -sL --max-time 120 -o /tmp/caddy.tar.gz https://github.com/caddyserver/caddy/releases/download/v2.11.9/caddy_2.11.9_linux_amd64.tar.gz
  tar -xzf /tmp/caddy.tar.gz -C /usr/local/bin caddy
  chmod +x /usr/local/bin/caddy
fi
# Dev secret ONLY so the public URL can be tested end-to-end now.
# MUST be replaced with the real dashboard secret (Rotate Secret) after
# Jon registers, then restart the server.
if [ ! -f .env ]; then
  printf 'AGENT_GAMES_HMAC_SECRET=dev-secret-deploy-test-ONLY\n' > .env
  chmod 600 .env
fi
echo "installed; node $(node --version); caddy $(caddy version | head -1)"
REMOTE

echo "== (re)starting watchdog v2 (server + caddy) =="
ssh $SSH_OPTS "$VPS" <<'REMOTE'
set -euo pipefail
cd /root/agentgames
# Stop any v1 watchdog (it manages the dead cloudflared route).
pkill -f "deploy-watchdog[.]sh" || true
sleep 1
nohup bash deploy-watchdog.sh >> logs/watchdog.log 2>&1 &
echo "watchdog v2 started pid $!"
sleep 25
echo "--- processes ---"
ps aux | grep -E "node src/server[.]js|caddy reverse-proxy|deploy-watchdog[.]sh" | grep -v grep | awk '{print $2, $11, $12, $13, $14}'
echo "--- public URL ---"
echo "https://gatekeeper.209-50-61-232.sslip.io/agent" | tee PUBLIC_URL
REMOTE

echo "== health check through the public URL =="
curl -s --max-time 30 --resolve "$HOST:443:209.50.61.232" "https://$HOST/agent" || echo "health check FAILED"
echo
rm -f "$TARBALL"
echo "== deploy done =="
