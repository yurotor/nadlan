# Nadlan website

Next.js app over the curated deals data. Pages: overview, map, deals table, trends, cities (rankings and
per-city profiles), price check (comparable sales), and a methodology page.

## Run

```sh
.venv/bin/python pipeline/build.py        # curated parquet (see pipeline/README.md)
.venv/bin/python pipeline/build_site.py   # data/site.duckdb, the file the site reads
cd web && npm install && npm run dev      # http://localhost:3000
```

`build_site.py` needs `data/src/localities.json` (CBS locality list with English names):
`curl -o data/src/localities.json "https://data.gov.il/api/3/action/datastore_search?resource_id=5c78e9fa-c2e2-4771-93ff-7f400a12f7ba&limit=5000"`

The app opens `../data/site.duckdb` read-only (override with `NADLAN_DB`). Restart the server after
rebuilding the file. Basemap tiles come from OpenFreeMap (no key).

## Deploy

Hosted on Vercel (project `yurotors-projects/nadlan`, https://nadlan-iota.vercel.app). There's no database
service: the DuckDB file ships inside every function bundle. Deploys go from this machine with the CLI,
because `data/` isn't in git.

```sh
./scripts/sync-db.sh          # stage ../data/site.duckdb as <100 MB parts (Vercel's per-file upload limit)
vercel deploy                 # preview; add --prod for production
```

On Vercel, `prebuild` (scripts/join-db.sh) joins the parts into `data/site.duckdb`, and `next.config.ts` adds
that file and DuckDB's `libduckdb.so` to the traced function files. Neither is picked up automatically.

## Languages

Hebrew (right-to-left) is the default and English is the alternative. The choice is stored in the `lang` cookie
and read by the root layout, which sets `<html lang dir>`. Strings are written inline as pairs:
`t("Map", "מפה")` (`getLang()` on the server, `useLang()` in client components). The CSS uses logical
properties (`inset-inline-start`, `padding-inline`, `text-align: start`), so the same rules work in both
directions. Charts keep time running left to right; in RTL the value axis moves to the right. The map's place
names switch language, and Hebrew labels are shaped by the self-hosted RTL text plugin in `public/vendor/`.

## Layout

- `src/app/api/*`: JSON endpoints. Every filterable endpoint shares `src/lib/filters.ts`.
- `src/app/map`: MapLibre map. Below zoom 15 deals are binned on the server. At zoom 15 and above
  each distinct location is a point; hollow points are approximate (old or split parcels).
- `src/components/EChart.tsx`: chart wrapper. Colours come from the CSS tokens in `globals.css`.
