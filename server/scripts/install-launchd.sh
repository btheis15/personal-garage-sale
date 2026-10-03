#!/bin/bash
# Installs (or reinstalls) this project's background jobs for the current user:
#   com.garagesale.server   the server, started at login and restarted if it stops
#   com.garagesale.backup   nightly backup at 3:30 am (needs BACKUP_DIR in .env)
#   com.garagesale.duckdns  keeps DUCKDNS_DOMAIN pointed at this Mac (every 5 min)
# Logs: ~/Library/Logs/garage-sale/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="${NODE:-$(command -v node)}"
LOGS="$HOME/Library/Logs/garage-sale"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$LOGS" "$AGENTS"

major=$("$NODE" -p 'process.versions.node.split(".")[0]')
if (( major < 22 )); then
  echo "Node $("$NODE" -v) at $NODE is too old (need 22+). Try: NODE=/opt/homebrew/opt/node@22/bin/node $0" >&2
  exit 1
fi
[[ -f "$ROOT/.env" ]] || { echo "Create .env first: npm run setup-env" >&2; exit 1; }

write_plist() { # label, program-args-xml, schedule-xml
  cat > "$AGENTS/$1.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key><array>$2</array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StandardOutPath</key><string>$LOGS/$1.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$1.log</string>
  $3
</dict>
</plist>
PLIST
  launchctl bootout "gui/$(id -u)/$1" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENTS/$1.plist"
  echo "loaded $1"
}

write_plist com.garagesale.server "<string>$NODE</string><string>$ROOT/src/server.js</string>" \
  "<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>"
write_plist com.garagesale.backup "<string>$NODE</string><string>$ROOT/scripts/backup.js</string>" \
  "<key>StartCalendarInterval</key><dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>30</integer></dict>"
write_plist com.garagesale.duckdns "<string>/bin/bash</string><string>$ROOT/scripts/duckdns-update.sh</string>" \
  "<key>RunAtLoad</key><true/><key>StartInterval</key><integer>300</integer>"

echo "Done. Check: tail -f $LOGS/com.garagesale.server.log"
