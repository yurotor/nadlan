#!/bin/sh
# Rebuild data/site.duckdb from the parts staged by sync-db.sh. No parts (plain local dev): nothing to do.
set -e
cd "$(dirname "$0")/.."
ls data/parts/site.duckdb.part-* >/dev/null 2>&1 || exit 0
cat data/parts/site.duckdb.part-* > data/site.duckdb
