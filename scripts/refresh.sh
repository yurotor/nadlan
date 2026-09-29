#!/bin/sh
# Pull the newest Tax Authority deals (over.org.il snapshot) and CBS rents, and rebuild data/site.duckdb.
#   scripts/refresh.sh              rebuild only what has new data
#   scripts/refresh.sh --rebuild    rebuild everything even when nothing is new
#   scripts/refresh.sh --allow-shrink   accept a deals snapshot with fewer rows than the current one
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
deals=$?
$PY pipeline/fetch_cbs_rent.py
rent=$?
set -e
if [ $deals -ne 0 ] && [ $deals -ne 3 ]; then exit $deals; fi
if [ $rent -ne 0 ] && [ $rent -ne 3 ]; then echo "CBS rents could not be fetched; keeping the ones we have."; fi

if [ $deals -eq 0 ] || [ -n "$REBUILD" ]; then
  $PY pipeline/build.py --reload-deals
fi
if [ $deals -eq 0 ] || [ $rent -eq 0 ] || [ -n "$REBUILD" ]; then
  $PY pipeline/build_site.py
  echo "Rebuilt data/site.duckdb. Restart a running dev server to pick it up."
else
  exit 3
fi
