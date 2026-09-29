"""Replace data/deals.csv with the newest over.org.il snapshot of the Tax Authority deals.

over.org.il re-scrapes the Tax Authority's deals system (nadlan.taxes.gov.il) about once a week and
stores each changed result as a numbered version of dataset fd06f5ae. Every version is a full
snapshot, so a refresh swaps the whole file rather than appending to it.

A scrape in progress publishes partial versions (on 2026-09-18 versions 1-3 had 85K, 1.29M and
2.49M rows before version 4 reached 3.2M), so a version smaller than the current file is refused.

State: data/deals.version.json records the version the current deals.csv came from.
The previous file is kept as data/deals.prev.csv.

Run:  .venv/bin/python pipeline/refresh_deals.py [--allow-shrink]
Exit: 0 new data written, 3 already up to date, 1 error or refused.
"""

import json
import shutil
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DEALS = DATA / "deals.csv"
STATE = DATA / "deals.version.json"
VERSIONS_DIR = DATA / "deals_versions"

DATASET = "fd06f5ae-8a4f-4120-b275-8a514ad23499"
API = "https://over.org.il/api"
COLUMNS = ["settlement_code", "settlement", "gush", "chelka", "sub_chelka", "deal_date", "deal_amount",
           "declared_amount", "deal_nature", "portion", "year_built", "asset_area", "room_num"]
MIN_RATIO = 0.99  # a new snapshot may lose a few rows (corrections), not 1%+

UP_TO_DATE, REFUSED = 3, 1


def get(url, dest=None):
    req = urllib.request.Request(url, headers={"User-Agent": "nadlan-refresh"})
    with urllib.request.urlopen(req, timeout=600) as r:
        if dest is None:
            return json.load(r)
        with open(dest, "wb") as f:
            shutil.copyfileobj(r, f)


def version_rows(v):
    return sum(r.get("rows") or 0 for r in v["change_summary"].get("resources", []))


def main():
    allow_shrink = "--allow-shrink" in sys.argv
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    con = duckdb.connect()

    versions = get(f"{API}/datasets/{DATASET}/versions")
    latest = max(versions, key=lambda v: v["version_number"])
    ds = next((d for d in get(f"{API}/datasets") if d["id"] == DATASET), {})
    print(f"over.org.il: latest version {latest['version_number']} (source changed {latest['metadata_modified']}), "
          f"last checked {ds.get('last_polled_at', '?')[:16]}")

    if state.get("version_id") == latest["id"]:
        print(f"deals.csv is already version {state['version_number']}: nothing new")
        return UP_TO_DATE

    current_rows = state.get("rows") or con.execute(
        f"select count(*) from read_csv('{DEALS}', header=true, all_varchar=true)").fetchone()[0]
    listed = version_rows(latest)
    if listed < current_rows * MIN_RATIO and not allow_shrink:
        print(f"refused: version {latest['version_number']} lists {listed:,} rows, deals.csv has {current_rows:,}. "
              "It's probably a scrape still in progress; try again later (or pass --allow-shrink).")
        return REFUSED

    VERSIONS_DIR.mkdir(exist_ok=True)
    zpath = VERSIONS_DIR / f"v{latest['version_number']}.zip"
    print(f"downloading {zpath.name}")
    get(f"{API}/versions/{latest['id']}/download.zip", zpath)
    xdir = VERSIONS_DIR / f"v{latest['version_number']}"
    shutil.rmtree(xdir, ignore_errors=True)
    with zipfile.ZipFile(zpath) as z:
        z.extractall(xdir)

    # One CSV per locality plus _index.csv (a file list, not deals).
    files = sorted(str(p) for p in xdir.glob("*.csv") if not p.name.startswith("_"))
    con.execute(f"create table new as select * from read_csv({files}, header=true, all_varchar=true, union_by_name=true)")
    have = {r[0] for r in con.execute("describe new").fetchall()}
    if missing := [c for c in COLUMNS if c not in have]:
        print(f"refused: the new files lack columns {missing}")
        return REFUSED
    rows, last_date = con.execute(
        "select count(*), max(try_strptime(deal_date, '%d/%m/%Y'))::date from new").fetchone()
    if rows < current_rows * MIN_RATIO and not allow_shrink:
        print(f"refused: the download has {rows:,} rows, deals.csv has {current_rows:,}")
        return REFUSED

    tmp = DATA / "deals.csv.tmp"
    con.execute(f"copy (select {', '.join(COLUMNS)} from new) to '{tmp}' (header, delimiter ',')")
    if DEALS.exists():
        DEALS.replace(DATA / "deals.prev.csv")
    tmp.replace(DEALS)
    shutil.rmtree(xdir)

    STATE.write_text(json.dumps({
        "version_id": latest["id"], "version_number": latest["version_number"],
        "source_modified": latest["metadata_modified"], "rows": rows, "last_deal_date": str(last_date),
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }, indent=1))
    print(f"deals.csv: version {latest['version_number']}, {rows:,} rows ({rows - current_rows:+,}), "
          f"latest deal {last_date}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
