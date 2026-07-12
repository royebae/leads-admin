#!/usr/bin/env bash
set -euo pipefail

REPO="/home/hermes/leads-admin"
cd "$REPO"

# Cron does not inherit the interactive shell environment. Load project-local
# Elevator credentials when present; otherwise the builder still produces a
# valid local JSON and marks records without click IDs for manual review.
if [[ -f "$REPO/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO/.env.local"
  set +a
fi

# Intentionally omit --dispatch: this job only refreshes the local artifact.
exec /usr/bin/node scripts/build-conversion-events.mjs
