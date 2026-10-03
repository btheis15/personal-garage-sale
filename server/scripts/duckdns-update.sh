#!/bin/bash
# Points DUCKDNS_DOMAIN at this Mac's current public IP. Run every 5 minutes
# by launchd (com.garagesale.duckdns). Only touches this project's subdomain.
set -euo pipefail
cd "$(dirname "$0")/.."
DUCKDNS_DOMAIN=$(grep -E '^DUCKDNS_DOMAIN=' .env | cut -d= -f2- || true)
DUCKDNS_TOKEN=$(grep -E '^DUCKDNS_TOKEN=' .env | cut -d= -f2- || true)
if [[ -z "$DUCKDNS_DOMAIN" || -z "$DUCKDNS_TOKEN" ]]; then
  echo "$(date -u +%FT%TZ) DUCKDNS_DOMAIN / DUCKDNS_TOKEN not set in .env; skipping"
  exit 0
fi
result=$(curl -fsS --max-time 20 "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=" || echo "CURL-FAILED")
echo "$(date -u +%FT%TZ) ${DUCKDNS_DOMAIN}: ${result}"
[[ "$result" == "OK" ]]
