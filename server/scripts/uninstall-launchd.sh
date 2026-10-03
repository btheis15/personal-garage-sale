#!/bin/bash
# Stops and removes this project's background jobs (the data folder is left alone).
set -uo pipefail
for label in com.garagesale.server com.garagesale.backup com.garagesale.duckdns; do
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null && echo "stopped $label"
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done
