#!/usr/bin/env bash
set -euo pipefail

HOST="${M2I_VPS_HOST:-m2i@46.225.14.124}"
SSH_KEY="${M2I_SSH_KEY:-$HOME/.ssh/m2i-key.pem}"
APP_DIR="${M2I_PWA_DIR:-/home/m2i/m2i-stopwatch-pwa}"
RELEASE="$(date -u +%Y%m%d%H%M%S)"
ARCHIVE="/tmp/m2i-pwa-dist-${RELEASE}.tgz"
REMOTE_ARCHIVE="/tmp/m2i-pwa-dist-${RELEASE}.tgz"

SSH_ARGS=()
if [[ -f "$SSH_KEY" ]]; then
  SSH_ARGS=(-i "$SSH_KEY")
fi

cd "$(dirname "$0")/.."

printf '==> Running tests\n'
npm test

printf '==> Building dist\n'
npm run build

printf '==> Creating archive %s\n' "$ARCHIVE"
tar -C dist -czf "$ARCHIVE" .

printf '==> Uploading to %s\n' "$HOST"
scp "${SSH_ARGS[@]}" "$ARCHIVE" "$HOST:$REMOTE_ARCHIVE"

printf '==> Installing release on VPS\n'
ssh "${SSH_ARGS[@]}" "$HOST" "set -euo pipefail
  mkdir -p '$APP_DIR/releases/$RELEASE'
  tar -C '$APP_DIR/releases/$RELEASE' -xzf '$REMOTE_ARCHIVE'
  ln -sfn '$APP_DIR/releases/$RELEASE' '$APP_DIR/current'
  rm -f '$REMOTE_ARCHIVE'
  find '$APP_DIR/releases' -maxdepth 1 -mindepth 1 -type d | sort | head -n -5 | xargs -r rm -rf
  ls -la '$APP_DIR/current'
"

rm -f "$ARCHIVE"

cat <<EOF

Static PWA release uploaded.

Next on VPS, nginx/certbot must point pwa.move2improve.io to:
  $APP_DIR/current

Verify after nginx setup:
  curl -I https://pwa.move2improve.io/
  curl -I https://pwa.move2improve.io/sw.js
  curl -I https://pwa.move2improve.io/manifest.webmanifest

EOF
