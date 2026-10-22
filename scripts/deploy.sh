#!/usr/bin/env bash
# Push code changes to the VPS. Live cars, photos and the admin login
# (data/ and uploads/) on the server are left untouched.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=root@102.202.208.195
PORT=222
tar --exclude=.git --exclude=node_modules --exclude=data --exclude=uploads -czf - . \
  | ssh -p "$PORT" "$HOST" 'tar -xzf - -C /opt/mrcars && cd /opt/mrcars \
      && npm ci --omit=dev --no-audit --no-fund >/dev/null \
      && chown -R mrcars:mrcars /opt/mrcars && systemctl restart mrcars \
      && sleep 1 && systemctl is-active mrcars'
echo "Deployed: https://mrcarsltd.com"
