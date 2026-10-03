#!/usr/bin/env bash
# Updates the server on the Mac mini from the MacBook, over Tailscale SSH (`ssh mini`):
# backup, pull main, install dependencies if they changed, restart, check.
#   MINI_HOST=mini scripts/update-mini.sh
set -euo pipefail
HOST="${MINI_HOST:-mini}"
ssh -o BatchMode=yes "$HOST" "bash -s" <<'REMOTE'
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(plutil -extract WorkingDirectory raw ~/Library/LaunchAgents/com.garagesale.server.plist)"
npm run --silent backup || true
before=$(git rev-parse HEAD)
git checkout -q main
git pull -q --ff-only
after=$(git rev-parse HEAD)
if ! git diff --quiet "$before" "$after" -- package-lock.json; then echo "== installing dependencies"; npm ci --omit=dev --silent; fi
launchctl kickstart -k "gui/$(id -u)/com.garagesale.server"
for i in $(seq 1 30); do
  if curl -fs -o /dev/null http://127.0.0.1:8797/health; then echo "== running $(git log --oneline -1)"; exit 0; fi
  sleep 1
done
echo "== the server didn't come back up; see ~/Library/Logs/garage-sale/" >&2
exit 1
REMOTE
