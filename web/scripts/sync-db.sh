#!/bin/sh
# Copy the pipeline's database into web/data/ so `vercel deploy` uploads it with the app.
set -e
cd "$(dirname "$0")/.."
mkdir -p data
cp ../data/site.duckdb data/site.duckdb
