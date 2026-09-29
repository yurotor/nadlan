#!/bin/sh
# Refresh the deals (scripts/refresh.sh) and, if anything was rebuilt, deploy the site to production.
# Takes the same flags as refresh.sh; --rebuild also forces a deploy.
set -e
cd "$(dirname "$0")/.."
SITE=https://nadlan-iota.vercel.app

set +e
scripts/refresh.sh "$@"
status=$?
set -e
if [ $status -eq 3 ]; then echo "No new deals, so nothing to deploy."; exit 0; fi
[ $status -eq 0 ] || exit $status

cd web
./scripts/sync-db.sh
vercel deploy --prod --yes
curl -fsS -o /dev/null "$SITE/about" && echo "Deployed: $SITE"
