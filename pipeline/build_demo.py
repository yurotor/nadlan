"""Build data/demo.duckdb: a one-time Yad2 for-sale snapshot for the map demo.

Input:  data/src/yad2/forsale_snapshot.json  {"taken_at": ISO time, "items": [...]} saved from a browser session
Output: data/demo.duckdb with table `forsale`, one row per listing.

The web app attaches it when it exists (web/src/lib/db.ts), and web/scripts/sync-db.sh ships it with
deploys, so the demo map shows the listings in production too.

Area: Yad2 has an advertised size and a built size ("מ״ר בנוי"); the built size is closer to the
registered area in the deals, so it is used when present.

Run:  .venv/bin/python pipeline/build_demo.py
"""

import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
SNAP = ROOT / "data/src/yad2/forsale_snapshot.json"
OUT = ROOT / "data/demo.duckdb"


def main():
    snap = json.loads(SNAP.read_text())
    items = snap["items"]
    if OUT.exists():
        OUT.unlink()
    c = duckdb.connect(str(OUT))
    c.execute("CREATE TABLE raw (j JSON)")
    c.executemany("INSERT INTO raw VALUES (?)", [(json.dumps(i, ensure_ascii=False),) for i in items])
    c.execute("""
    CREATE TABLE forsale AS
    SELECT j->>'t' AS id, (j->>'city')::INT AS loc, j->>'nb' AS neighborhood, j->>'st' AS street,
           j->>'h' AS house, try_cast(j->>'fl' AS INT) AS floor,
           try_cast(j->>'lat' AS DOUBLE) AS lat, try_cast(j->>'lon' AS DOUBLE) AS lon,
           try_cast(j->>'price' AS BIGINT) AS price, try_cast(j->>'rooms' AS DOUBLE) AS rooms,
           coalesce(nullif(try_cast(j->>'sqmb' AS DOUBLE), 0), nullif(try_cast(j->>'sqm' AS DOUBLE), 0)) AS area,
           j->>'prop' AS property, j->>'ad' AS seller,
           CAST(j->'tags' AS VARCHAR[]) AS tags
    FROM raw
    """)
    # Keep homes with a price, a size and a location; drop placeholders and obvious typos.
    c.execute("""
    DELETE FROM forsale WHERE price IS NULL OR price < 300000 OR area IS NULL OR area < 20 OR area > 600
        OR lat IS NULL OR lon IS NULL
    """)
    c.execute("DROP TABLE raw")
    c.execute("CREATE TABLE meta AS SELECT ?::TIMESTAMP AS taken_at, count(*)::INT AS n FROM forsale", [snap["taken_at"]])
    print(c.execute("SELECT loc, count(*), median(price), median(area) FROM forsale GROUP BY 1").fetchall())
    c.close()


if __name__ == "__main__":
    main()
