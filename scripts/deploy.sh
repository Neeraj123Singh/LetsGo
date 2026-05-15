#!/usr/bin/env bash
# Build and (re)launch the production stack on this VM.
#
# Idempotent: re-running picks up a `git pull`-ed code change. Safe to run
# without arguments; CI/cron friendly.
#
# Usage:
#   bash scripts/deploy.sh

source "$(dirname "$0")/lib.sh"

require_cmd docker
docker compose version >/dev/null 2>&1 || die "docker compose plugin missing"

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found — run \`make setup\` first."
[[ -f "$COMPOSE_FILE" ]] || die "$COMPOSE_FILE not found — wrong directory?"

log "Pulling base images"
compose pull --ignore-pull-failures || warn "Some base images could not be pulled; continuing."

log "Building and starting services"
compose up -d --build --remove-orphans

ok "Stack is up. Recent log lines:"
compose ps
echo
compose logs --tail=20
