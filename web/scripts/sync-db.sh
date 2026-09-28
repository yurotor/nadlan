#!/bin/sh
# Stage the pipeline's database for `vercel deploy`. Vercel rejects uploaded files over 100 MB, so the file
# goes up in parts and `npm run build` (prebuild) joins them back into data/site.duckdb.
set -e
cd "$(dirname "$0")/.."
rm -rf data && mkdir -p data/parts
split -b 90m ../data/site.duckdb data/parts/site.duckdb.part-
