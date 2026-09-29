"""Fetch CBS average rents by city and room count into data/src/cbs_rent.csv.

Source: Central Bureau of Statistics, Price Statistics Monthly, table 4.9 "Average Monthly Prices of
Rent (NIS), by Residential District, Big Cities and Size Group (Rooms)". It covers the country, the 6
residential districts and the 19 cities over 100K residents, in rooms groups 1-2, 2.5-3, 3.5-4 and
4.5+ (4.5-6 before 2026). Rents are averages over the CPI rent sample (all leases, not only new ones).
Each monthly issue repeats the last ~2 years; figures change once a quarter.

Every issue lives at /he/publications/Madad/DocLib/{year}/price{month}a/a4_9_e.xlsx. A missing issue
answers 200 with an HTML page, so the file is checked for the xlsx (zip) signature. cbs.gov.il resets
connections that come quickly or without a browser User-Agent, so requests go one at a time.

Quarters from each new file replace the same quarters in the CSV; older quarters are kept.
Reuse is allowed under the CBS open licence with attribution.

Run:  .venv/bin/python pipeline/fetch_cbs_rent.py
Exit: 0 new or changed figures, 3 nothing new, 1 error.
"""

import csv
import io
import re
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "src"
OUT = SRC / "cbs_rent.csv"
RAW = SRC / "cbs_rent"
BASE = "https://www.cbs.gov.il/he/publications/Madad/DocLib"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
FIELDS = ["area_code", "area_name", "kind", "rooms", "quarter", "rent", "sampling_error", "source_file"]
QUARTERS = {"I-III": 1, "IV-VI": 4, "VII-IX": 7, "X-XII": 10}
ROOMS = {"1-2": "1-2", "2.5-3": "2.5-3", "3.5-4": "3.5-4", "4.5 +": "4.5+", "4.5+": "4.5+", "4.5-6": "4.5+"}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def latest_file(months_back=8):
    """The newest monthly issue that has the table, as (name, bytes)."""
    y, m = date.today().year, date.today().month
    for _ in range(months_back):
        name = f"{y}_price{m:02d}a"
        try:
            body = fetch(f"{BASE}/{y}/price{m:02d}a/a4_9_e.xlsx")
            if body[:2] == b"PK":
                return name, body
            print(f"{name}: not published yet")
        except OSError as e:
            print(f"{name}: {e}")
        time.sleep(3)
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return None, None


def parse(body, source):
    ws = openpyxl.load_workbook(io.BytesIO(body), data_only=True).active
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    # Header: a row of years, then a row of periods; each period spans an average and an error column.
    # The year labels sit in merged cells that don't line up with their periods, so only the first
    # year is read and the rest follow the quarters: the year advances whenever the quarter wraps.
    yi = next(i for i, r in enumerate(rows) if any(str(v).strip().isdigit() for v in r[1:] if v))
    year = next(int(str(v).strip()) for v in rows[yi][1:] if v and str(v).strip().isdigit())
    cols, last = [], 0
    for j, pv in enumerate(rows[yi + 1]):
        month = QUARTERS.get(str(pv).strip()) if pv else None
        if month:
            if month <= last:
                year += 1
            cols.append((j, date(year, month, 1)))
            last = month
    out, area = [], None
    for r in rows[yi + 3:]:
        label = str(r[0]).strip() if r[0] is not None else ""
        if not label:
            continue
        if label in ROOMS:
            pass  # a rooms row of the current area ("1-2" would also match the "name - code" pattern)
        elif label == "Total":
            area = (0, "Total", "country")
        elif m := re.match(r"(.+?)\s*-\s*(\d+)$", label):
            name, code = m.group(1).strip(), int(m.group(2))
            area = (code, re.sub(r"\s*District$", "", name, flags=re.I), "district" if "district" in name.lower() else "city")
        else:
            continue  # section headings
        if area is None:
            continue
        rooms = ROOMS.get(label, "all")
        for j, q in cols:
            rent, err = r[j], r[j + 1] if j + 1 < len(r) else None
            if isinstance(rent, (int, float)):
                out.append({"area_code": area[0], "area_name": area[1], "kind": area[2], "rooms": rooms,
                            "quarter": q.isoformat(), "rent": round(rent, 1),
                            "sampling_error": round(err, 1) if isinstance(err, (int, float)) else "",
                            "source_file": source})
    return out


def main():
    name, body = latest_file()
    if body is None:
        print("no CBS rent table found in the last 8 monthly issues")
        return 1
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / f"a4_9_e_{name}.xlsx").write_bytes(body)
    new = parse(body, name)
    if not new:
        print(f"{name}: could not read any figures; the table layout may have changed")
        return 1

    key = lambda r: (str(r["kind"]), str(r["area_code"]), r["rooms"], r["quarter"])
    old = {key(r): r for r in csv.DictReader(open(OUT))} if OUT.exists() else {}
    merged = dict(old)
    changed = 0
    for r in new:
        prev = old.get(key(r))
        if prev is None or float(prev["rent"]) != r["rent"]:
            changed += 1
        merged[key(r)] = r
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        w.writerows(sorted(merged.values(), key=key))
    qs = sorted({r["quarter"] for r in new})
    cities = len({r["area_code"] for r in new if r["kind"] == "city"})
    print(f"CBS rents from {name}: {cities} cities, quarters {qs[0]} to {qs[-1]}, {changed} new or changed figures")
    return 0 if changed else 3


if __name__ == "__main__":
    sys.exit(main())
