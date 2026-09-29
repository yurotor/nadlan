# Curated Israeli real-estate deals

`build.py` turns the Tax Authority deals file (מיסוי מקרקעין, 1998–2026) into two analysis-ready
tables. Setup: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`, then download
the inputs below into `data/` (not in git). Run it with `.venv/bin/python pipeline/build.py` (about 30 seconds). Add `--reload-sources`
after replacing any input file (`--reload-deals` when only `deals.csv` changed). The build is deterministic:
the same inputs give identical outputs, so a diff between two builds is a change in the data.

## Refreshing the deals and rents

over.org.il re-scrapes the Tax Authority's deals system about once a week and publishes each changed
snapshot as a new version. To pick one up:

```sh
scripts/refresh.sh              # new deals or rents? fetch them and rebuild data/site.duckdb
scripts/refresh-and-deploy.sh   # the same, then deploy the site to production (see web/README.md)
```

Both do nothing when neither source has anything new (`refresh.sh` exits with status 3); `--rebuild` rebuilds
(and deploys) anyway. `pipeline/refresh_deals.py` refuses a snapshot with over 1% fewer rows than the current
file, because a scrape in progress publishes partial versions; `--allow-shrink` overrides that.
`data/deals.version.json` records which version `deals.csv` came from, the previous file is kept as
`data/deals.prev.csv`, and downloaded zips go to `data/deals_versions/`. New deals show up in the source
weeks after signing and take about three months to be complete, so the last few months always look thin.

Rents come from the Central Bureau of Statistics: `pipeline/fetch_cbs_rent.py` downloads table 4.9 of the
newest Price Statistics Monthly (average rent by rooms for the 18 largest cities; figures change quarterly)
into `data/src/cbs_rent.csv`, keeping earlier quarters. cbs.gov.il resets quick or non-browser requests, so
it fetches one file at a time; if it fails, the refresh carries on with the rents already on disk.

## Inputs (`data/`)

| File | What | Where it came from |
|---|---|---|
| `deals.csv` | 3,217,592 deal rows (version 5) | over.org.il dataset `fd06f5ae…` (a weekly scrape of nadlan.taxes.gov.il), per-locality files of the newest version merged by `refresh_deals.py` |
| `src/parcels/shape.csv.gz` | 1,097,775 current parcels with polygons and locality | over.org.il dataset `ff3176b1…` (Survey of Israel "חלקות shape"), version 9 zip |
| `src/parcels/cancel/CANCEL_PARCEL.dbf` | 1.29M cancelled-parcel → replacement-parcel links | same zip |
| `src/addresses/addresses.csv` | 686,707 addresses, 489K linked to a parcel | over.org.il dataset `88670e58…` (נדל"ן לעם addresses), version 22 zip |
| `src/cbs_rent.csv` | CBS average rents by city and rooms, per quarter | `fetch_cbs_rent.py` (CBS Price Statistics Monthly, table 4.9) |
| `src/gaztir.csv` | 3.65M properties (street per sub-parcel, property type) | גזטיר נכסים on odata.org.il (Google Drive file `1GkoEH7_…`) |

The over.org.il "3.84M deals" figure double-counts rows that were appended twice (once without a
locality code, once with). Version 5 is the de-duplicated snapshot and contains every row of the
live table.

## Demo: homes for sale (local only)

`data/src/yad2/forsale_snapshot.json` is a one-time snapshot of Yad2 for-sale listings in Givatayim and Ramat
Gan (29 Sep 2026, 1,078 listings; the map endpoint caps each answer, so it is a large sample, not every ad),
saved from a normal browser session for a demo. `build_demo.py` turns it into `data/demo.duckdb`
(`.venv/bin/python pipeline/build_demo.py`). The web app attaches that file when it exists and shows the
listings on the map, each compared with recent sales. Deploys ship only `site.duckdb`, so the public site
never carries the listings. Yad2's terms forbid automated collection, so this is not refreshed or extended.

## Outputs (`data/curated/`)

- `deals.parquet`: one row per source record, enriched.
- `transactions.parquet`: one row per sale. Use this for any counts or prices.
- `report.json`: counts from every step.

Everything is also in `data/nadlan.duckdb`, including the intermediate tables.

### Location (`location_level`)

| Value | Meaning | Deals |
|---|---|---|
| `parcel` | gush+helka exists in today's parcel layer | 84.0% |
| `lineage_single` | old parcel, replaced by exactly one current parcel | 0.7% |
| `lineage_multi` | old parcel that was split. The point is the centre of its descendants; `location_spread_m` says how far they spread | 12.9% |
| `gush` | parcel unknown; the point is the centre of the gush | 2.4% |

### Address (`address_source`, in priority order)

| Value | Street | House no. | Deals |
|---|---|---|---|
| `address_point` | ✓ | ✓ | 64.6% |
| `gazetteer_subparcel` | ✓ | – | 5.7% |
| `gazetteer_parcel` | ✓ | – | 0.8% |
| `nearest_address` (≤100 m from parcel centre, see `nearest_address_dist_m`) | ✓ | ✓ approx. | 4.1% |
| `lineage_street` (split parcel whose descendants ≥80% share one street) | ✓ | – | 0.2% |
| `none` | | | 24.6% |

Most of the `none` rows are old split parcels, rural parcels without street addresses, and land.
Among clean single-unit sales, 82.7% have a street and 79.8% have a house number.

### Locality (`locality_code`, `locality_source`)

The code is the official locality code (סמל יישוב). In priority order: the Tax Authority's own code,
then the locality of the deal's parcel (or of the parcel's descendants), then a hand-made name map
(`NAME_MAP`: e.g. יהוד → יהוד-מונוסון, קרית חיים → חיפה, צורן → קדימה-צורן), then the gush.
Parcel-layer codes are translated to the Tax Authority's codes wherever the two disagree
systematically (`locality_xwalk`). `locality_geo_mismatch` flags coded deals whose parcel sits in a
different locality, mostly parcels on a town border.

### Sale type (`txn_class`)

Rows that share a parcel, date and declared value are one sale. Each class was checked by comparing
its price per m² with the median for clean single units in the same locality and year
(`multi_row_price_check` in `report.json`).

| Class | Meaning | Value used | Price vs local median |
|---|---|---|---|
| `single_unit` | one dwelling sold in full | `declared_value` | 1.00 |
| `unit_multi_seller` | one sub-parcel, co-owners reported on separate rows, portions sum to 1 | sum of `amount_paid` | 1.16 |
| `unit_with_annex` | several sub-parcels; only one has area or rooms (e.g. flat + parking) | `declared_value` (same on every row) | 0.97 |
| `unit_multi_subparcel` | several sub-parcels, all with area or rooms. Priced like **one** dwelling (0.94× on one row's area vs 0.48× on the summed area) | `declared_value` | 0.94 |
| `partial_share` | a share of a registered unit (sub-parcel > 0) | `amount_paid / portion` when portion ≥ 0.1 | 1.00 |
| `share_of_parcel` | a share of sub-parcel 0. Ambiguous: a flat in an unregistered building, or a share of a house | none | – |
| `whole_parcel` | generic "מגורים" or similar with no unit identity | – | – |
| `unit_no_area`, `unit_suspect_size` | dwelling without area, or area <15 / >600 m², or >12 rooms | – | – |
| `land`, `commercial_other`, `building` | non-residential | – | – |
| `multi_row_other` | multi-row sales that fit none of the patterns above | – | – |

`is_clean_unit` = `single_unit`, `unit_multi_seller` or `unit_with_annex` + a dwelling type + value
≥ ₪20,000 + price per m² within 0.25–4× of the locality-year median. That leaves 1,728,915 sales.

### Value fields (important)

- `declared_value` is **the price of what was sold**. For a partial sale it is the price of the
  share, not of the whole property; `amount_paid` equals it in 93% of rows.
- `full_value` (deals) and `sale_value` (transactions) are the whole-property values.
- `area_sqm` is the area of the whole unit, even when only a share was sold.

## Known limitations

- No house number for 20% of clean sales; recent years are worst (new buildings are missing from
  the address register).
- Parcel lineage stops at 8 generations; a split parcel only gets an approximate point.
- `unit_multi_subparcel` is inferred from prices. A few of these could be genuine multi-flat sales.
- 1,387 rows have no locality (almost all name only a regional council, "מ. א. …").
