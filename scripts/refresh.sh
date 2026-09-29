#!/bin/sh
# Pull the newest Tax Authority deals (over.org.il snapshot) and rebuild data/site.duckdb.
#   scripts/refresh.sh              rebuild only when there's a new version
#   scripts/refresh.sh --rebuild    rebuild even when there isn't
#   scripts/refresh.sh --allow-shrink   accept a snapshot with fewer rows than the current one
# Exit status 3 means there was nothing new (and nothing was rebuilt).
set -e
cd "$(dirname "$0")/.."
PY=.venv/bin/python
REBUILD=
PASS=
for a in "$@"; do
  case $a in
    --rebuild) REBUILD=1 ;;
    *) PASS="$PASS $a" ;;
  esac
done

set +e
$PY pipeline/refresh_deals.py $PASS
status=$?
set -e
if [ $status -eq 3 ] && [ -z "$REBUILD" ]; then exit 3; fi
if [ $status -ne 0 ] && [ $status -ne 3 ]; then exit $status; fi

$PY pipeline/build.py --reload-deals
$PY pipeline/build_site.py
echo "Rebuilt data/site.duckdb. Restart a running dev server to pick it up."
