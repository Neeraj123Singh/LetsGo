#!/usr/bin/env bash
# Stop and remove the running stack. Does NOT delete data volumes (postgres_data,
# caddy_data, caddy_config). Pass --volumes to wipe everything.
#
# Usage:
#   bash scripts/down.sh
#   bash scripts/down.sh --volumes        # ⚠ destroys the database

source "$(dirname "$0")/lib.sh"

if [[ "${1:-}" == "--volumes" ]]; then
  warn "Removing volumes — Postgres data and TLS certs will be wiped."
  read -rp "Type DELETE to confirm: " confirm
  [[ "$confirm" == "DELETE" ]] || die "Aborted."
  compose down --volumes --remove-orphans
else
  compose down --remove-orphans
fi

ok "Stack stopped."
