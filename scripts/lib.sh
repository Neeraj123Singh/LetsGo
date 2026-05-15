# Shared helpers sourced by the other scripts in this directory.
# Not directly executable.

# Stricter shell defaults for any script that sources this file.
set -euo pipefail

# Resolve repo root regardless of where the caller invoked us from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="$REPO_ROOT/.env.prod"
COMPOSE_FILE="$REPO_ROOT/docker-compose.prod.yml"

# Colourful but $TERM-aware logging.
if [[ -t 1 ]]; then
  C_RESET=$'\e[0m'
  C_BOLD=$'\e[1m'
  C_RED=$'\e[31m'
  C_GREEN=$'\e[32m'
  C_YELLOW=$'\e[33m'
  C_BLUE=$'\e[34m'
else
  C_RESET="" C_BOLD="" C_RED="" C_GREEN="" C_YELLOW="" C_BLUE=""
fi

log()  { printf '%s%s==> %s%s\n' "$C_BOLD" "$C_BLUE"  "$*" "$C_RESET" >&2; }
ok()   { printf '%s%s✓ %s%s\n'  "$C_BOLD" "$C_GREEN" "$*" "$C_RESET" >&2; }
warn() { printf '%s%s! %s%s\n'  "$C_BOLD" "$C_YELLOW" "$*" "$C_RESET" >&2; }
die()  { printf '%s%s✗ %s%s\n'  "$C_BOLD" "$C_RED"   "$*" "$C_RESET" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}
