#!/usr/bin/env bash
# One-shot post-bootstrap setup. Generates secrets and deploys the stack.
# Intended to run on a freshly provisioned VM the first time.
#
# Usage (on the VM):
#   cd /home/ubuntu/letsgo
#   bash scripts/setup.sh

source "$(dirname "$0")/lib.sh"

log "Step 1/2 — generate .env.prod with fresh secrets"
if [[ -f "$ENV_FILE" ]]; then
  warn "$ENV_FILE already exists; skipping secret generation."
  warn "Delete it first if you want a clean regeneration."
else
  bash "$SCRIPT_DIR/generate-env.sh"
fi

log "Step 2/2 — deploy the stack"
bash "$SCRIPT_DIR/deploy.sh"

ok "Setup complete."
log "Next steps:"
echo "  • Point your DNS A record at this VM if you haven't already." >&2
echo "  • Wait ~30s for Caddy to obtain a Let's Encrypt cert." >&2
echo "  • Open https://$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)" >&2
echo "  • Tail logs:  make logs" >&2
