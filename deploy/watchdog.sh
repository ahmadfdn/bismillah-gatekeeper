#!/bin/bash
# Watchdog for the gatekeeper agent on the VPS.
# Keeps the node server and the cloudflared quick tunnel alive.
# IMPORTANT: a quick-tunnel URL is random per cloudflared start. The tunnel
# is only restarted if its process DIED; a restart changes the public URL,
# which would break the platform registration. Any restart is logged loudly
# (logs/watchdog.log) with the new URL so it can be re-registered.
# Usage on VPS:  nohup bash /root/agentgames/deploy-watchdog.sh >> /root/agentgames/logs/watchdog.log 2>&1 &
set -u
DIR="/root/agentgames"
LOG="$DIR/logs/watchdog.log"
mkdir -p "$DIR/logs"
log() { echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") [watchdog] $*" | tee -a "$LOG"; }

cd "$DIR" || exit 1
log "watchdog started (pid $$)"

while true; do
  # NOTE: bracket trick ([.]js) so pgrep never matches its own command line.
  if ! pgrep -f "node src/server[.]js" >/dev/null 2>&1; then
    log "server DOWN — restarting"
    nohup node src/server.js >> "$DIR/logs/server.log" 2>&1 &
    sleep 2
  fi
  if ! pgrep -f "cloudflared tunnel --url http://127[.]0[.]0[.]1:8787" >/dev/null 2>&1; then
    log "!!! tunnel DOWN — restarting (PUBLIC URL WILL CHANGE — re-register in dashboard!) !!!"
    nohup cloudflared tunnel --url http://127.0.0.1:8787 >> "$DIR/logs/tunnel.log" 2>&1 &
    sleep 8
    NEW_URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" "$DIR/logs/tunnel.log" | sort -u | tail -1)
    log "!!! new tunnel URL: ${NEW_URL:-UNKNOWN} !!!"
    echo "$NEW_URL" > "$DIR/PUBLIC_URL"
    date -u +"%Y-%m-%dT%H:%M:%SZ $NEW_URL" >> "$DIR/PUBLIC_URL_HISTORY"
  fi
  sleep 20
done
