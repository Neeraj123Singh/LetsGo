#!/usr/bin/env bash
# Tail logs across all services (or a specific one if passed as $1).
#
# Usage:
#   bash scripts/logs.sh                # all services
#   bash scripts/logs.sh meeting-go     # one service

source "$(dirname "$0")/lib.sh"

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found — run \`make setup\` first."

if [[ $# -gt 0 ]]; then
  compose logs -f --tail=100 "$@"
else
  compose logs -f --tail=100
fi
