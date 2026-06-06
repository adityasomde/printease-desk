#!/usr/bin/env bash
set -euo pipefail

# ================================
# PrintEase safer shared frontend sync
# ================================
#
# Usage:
#   ./sync-shared-frontend.sh status
#   ./sync-shared-frontend.sh mvp-to-desk
#   ./sync-shared-frontend.sh mvp-to-desk --apply
#   ./sync-shared-frontend.sh desk-to-mvp
#   ./sync-shared-frontend.sh desk-to-mvp --apply
#   ./sync-shared-frontend.sh mvp-to-desk --apply --build-desk
#
# Rule:
#   MVP frontend is normally source of truth.
#   Desk frontend fixes can be pushed back using desk-to-mvp.
#
# This script intentionally does NOT copy:
#   backend/
#   .env*
#   node_modules/
#   dist/
#   frontend-dist/
#   desktop-shell/
#   release files

ROOT="/home/adisssss/Desktop/web_dev/printhub"

MVP_FRONTEND="$ROOT/printease-mvp-main/frontend"
DESK_FRONTEND="$ROOT/printease-desk/frontend"
DESK_REPO="$ROOT/desk"
MVP_REPO="$ROOT/printease"

MODE="${1:-status}"
APPLY="false"
BUILD_DESK="false"

for arg in "$@"; do
  case "$arg" in
    --apply)
      APPLY="true"
      ;;
    --build-desk)
      BUILD_DESK="true"
      ;;
  esac
done

important_files=(
  "README.md"
  "index.html"
  "package.json"
  "package-lock.json"
  "vite.config.js"
  "vitest.config.js"
  "vitest.setup.js"
  "tailwind.config.js"
  "postcss.config.js"
  "eslint.config.js"
  "vercel.json"
  "src/"
  "public/"
)

rsync_excludes=(
  "--exclude=node_modules"
  "--exclude=dist"
  "--exclude=.vite"
  "--exclude=.cache"
  "--exclude=.env"
  "--exclude=.env.*"
  "--exclude=*.log"
  "--exclude=npm-debug.log*"
  "--exclude=yarn-debug.log*"
  "--exclude=yarn-error.log*"
  "--exclude=pnpm-debug.log*"
  "--exclude=.DS_Store"
  "--exclude=Thumbs.db"
  "--exclude=coverage"
  "--exclude=test-results"
  "--exclude=playwright-report"
)

real_secret_pattern='(DATABASE_URL=|SUPABASE_SERVICE_ROLE_KEY=|SUPABASE_SERVICE_KEY=|JWT_SECRET=|RAZORPAY_SECRET=|AGENT_TOKEN_SECRET=|PRIVATE_KEY=|SECRET_KEY=|ACCESS_TOKEN=|REFRESH_TOKEN=)'

die() {
  echo "ERROR: $*" >&2
  exit 1
}

check_paths() {
  [[ -d "$MVP_FRONTEND" ]] || die "MVP frontend not found: $MVP_FRONTEND"
  [[ -d "$DESK_FRONTEND" ]] || die "Desktop frontend not found: $DESK_FRONTEND"
}

check_git_clean_or_warn() {
  local repo="$1"
  local label="$2"

  if [[ -d "$repo/.git" ]]; then
    local dirty
    dirty="$(git -C "$repo" status --short || true)"
    if [[ -n "$dirty" ]]; then
      echo
      echo "WARNING: $label repo has uncommitted changes:"
      echo "$dirty"
      echo
      echo "This is allowed, but review carefully before applying sync."
      echo
    fi
  fi
}

secret_scan() {
  local target="$1"

  echo "Checking for real secret patterns in: $target"

  if grep -RniE "$real_secret_pattern" "$target" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude-dir=.vite \
    --exclude-dir=.cache \
    --exclude='*.log' \
    2>/dev/null; then

    echo
    die "Real secret-like pattern found. Remove it before syncing/pushing."
  fi

  echo "Secret scan passed."
}

show_diff_summary() {
  echo
  echo "Changed/different important files:"
  for item in "${important_files[@]}"; do
    if [[ -e "$MVP_FRONTEND/$item" || -e "$DESK_FRONTEND/$item" ]]; then
      if ! diff -qr "$MVP_FRONTEND/$item" "$DESK_FRONTEND/$item" >/dev/null 2>&1; then
        echo "  DIFF: $item"
      fi
    fi
  done
}

sync_dir() {
  local src="$1"
  local dst="$2"

  echo
  echo "Source: $src"
  echo "Target: $dst"
  echo "Apply : $APPLY"
  echo

  local dry_run_flag="--dry-run"
  if [[ "$APPLY" == "true" ]]; then
    dry_run_flag=""
  fi

  # Important: do not delete target first.
  # Use --delete only inside selected important folders/files via filtered rsync.
  # This avoids wiping unrelated desktop-only files accidentally.

  for item in "${important_files[@]}"; do
    if [[ -e "$src/$item" ]]; then
      echo "Syncing important item: $item"
      rsync -av --delete $dry_run_flag "${rsync_excludes[@]}" "$src/$item" "$dst/$item"
    fi
  done

  if [[ "$APPLY" != "true" ]]; then
    echo
    echo "Dry run only. Nothing was changed."
    echo "To actually sync, rerun with --apply"
  fi
}

build_desk_frontend() {
  if [[ "$BUILD_DESK" == "true" && "$APPLY" == "true" ]]; then
    echo
    echo "Building desktop frontend bundle..."
    cd "$DESK_REPO"
    npm install --prefix frontend
    npm run build:frontend
    echo "Desktop frontend-dist rebuilt."
  fi
}

check_paths

case "$MODE" in
  status)
    echo "=== PrintEase shared frontend status ==="
    echo "MVP : $MVP_FRONTEND"
    echo "Desk: $DESK_FRONTEND"

    check_git_clean_or_warn "$MVP_REPO" "MVP"
    check_git_clean_or_warn "$DESK_REPO" "Desktop"

    show_diff_summary
    echo
    echo "Use one of:"
    echo "  ./sync-shared-frontend.sh mvp-to-desk --apply"
    echo "  ./sync-shared-frontend.sh desk-to-mvp --apply"
    ;;

  mvp-to-desk)
    echo "=== Sync MVP frontend → Desktop frontend ==="
    check_git_clean_or_warn "$DESK_REPO" "Desktop"
    secret_scan "$MVP_FRONTEND"
    sync_dir "$MVP_FRONTEND" "$DESK_FRONTEND"
    build_desk_frontend
    ;;

  desk-to-mvp)
    echo "=== Sync Desktop frontend → MVP frontend ==="
    check_git_clean_or_warn "$MVP_REPO" "MVP"
    secret_scan "$DESK_FRONTEND"
    sync_dir "$DESK_FRONTEND" "$MVP_FRONTEND"
    ;;

  *)
    die "Unknown mode: $MODE. Use status, mvp-to-desk, or desk-to-mvp."
    ;;
esac
