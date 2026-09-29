"""Build the compact database the website reads (data/site.duckdb).

Input:  data/curated/transactions.parquet (from build.py)
        data/src/localities.json  CBS locality list with English names (data.gov.il resource
        5c78e9fa-c2e2-4771-93ff-7f400a12f7ba, `datastore_search?limit=5000`)
        data/src/cbs_rent.csv     CBS average rents by city and rooms (fetch_cbs_rent.py); optional
Output: data/site.duckdb with
  tx          one row per sale, only the columns the site uses, sorted by locality and date
  localities  one row per locality: names, district, centre point, headline stats
  price_idx   quarterly price level per locality, for adjusting older sales to today (meta.current_q)
  rent, rent_yield   CBS rents, and gross yield against local sale prices, for the 18 big cities

Run:  .venv/bin/python pipeline/build_site.py
"""

import json
import re
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "site.duckdb"


# CBS transliterations that differ from the spelling most readers know.
EN_OVERRIDES = {
    "Herzeliyya": "Herzliya", "Petah Tiqwa": "Petah Tikva", "Rishon Leziyyon": "Rishon LeZion",
    "Ashqelon": "Ashkelon", "Giv'atayim": "Givatayim", "Be'er Sheva": "Beersheba", "Nazerat Illit": "Nof HaGalil",
    "Kefar Sava": "Kfar Saba", "Ra'anana": "Ra'anana", "Tel Aviv - Yafo": "Tel Aviv-Yafo", "Modi'in-Makkabbim-Re'ut": "Modi'in",
    "Nes Ziyyona": "Ness Ziona", "Bene Beraq": "Bnei Brak", "Modi'in-Makkabbim-Re": "Modi'in", "Nahariyya": "Nahariya", "Kiryat Atta": "Kiryat Ata", "Yehud-Monoson": "Yehud-Monosson", "Zefat": "Safed", "Teverya": "Tiberias", "Akko": "Acre",
    "Rosh Haayin": "Rosh HaAyin", "Hod Hasharon": "Hod HaSharon", "Ramat Hasharon": "Ramat HaSharon", "Ma'alot-Tarshiha": "Ma'alot-Tarshiha",
    "Karmi'el": "Karmiel", "Elat": "Eilat", "Bet Shemesh": "Beit Shemesh", "Bet She'an": "Beit She'an",
    "Mevasseret Ziyyon": "Mevaseret Zion", "Or Yehuda": "Or Yehuda", "Giv'at Shemu'el": "Givat Shmuel", "Qiryat Ono": "Kiryat Ono",
}


def english_name(raw):
    n = title_case(raw)
    if not n:
        return None
    n = EN_OVERRIDES.get(n, n)
    n = re.sub(r"\bQiryat\b", "Kiryat", n)
    return EN_OVERRIDES.get(n, n)


def title_case(s):
    s = s.strip().lower()
    return re.sub(r"(^|[\s\-(])([a-z])", lambda m: m.group(1) + m.group(2).upper(), s)


def main():
    if OUT.exists():
        OUT.unlink()
    c = duckdb.connect(str(OUT))

    recs = json.load(open(DATA / "src/localities.json"))["result"]["records"]
    c.execute("CREATE TABLE cbs (code INTEGER, name_en VARCHAR, district VARCHAR)")
    c.executemany(
        "INSERT INTO cbs VALUES (?, ?, ?)",
        [(int(r["סמל_ישוב"]), english_name(r["שם_ישוב_לועזי"]), r["שם_נפה"].strip() or None) for r in recs],
    )

    c.execute(f"""
    CREATE TABLE tx AS
    SELECT
      txn_id                                    AS id,
      deal_date                                 AS date,
      locality_code                             AS loc,
      deal_nature                               AS nature,
      category,
      txn_class                                 AS cls,
      is_clean_unit                             AS clean,
      sale_value                                AS price,
      declared_value                            AS declared,
      portion_sold                              AS portion,
      area_sqm                                  AS area,
      rooms,
      year_built,
      CASE WHEN is_clean_unit THEN price_per_sqm END AS ppsqm,
      street,
      house_number                              AS house,
      address_source,
      location_level,
      location_level IN ('parcel', 'lineage_single') AS exact_loc,
      location_spread_m                         AS spread_m,
      round(lat, 6)                             AS lat,
      round(lon, 6)                             AS lon,
      gush, helka, sub_parcels
    FROM '{DATA / "curated/transactions.parquet"}'
    WHERE deal_date IS NOT NULL
    ORDER BY locality_code, deal_date
    """)

    # Localities: names from the deals, English name + district from CBS, centre = median point.
    c.execute("""
    CREATE TABLE localities AS
    WITH names AS (
      SELECT locality_code AS code, mode(locality_name) AS name_he
      FROM read_parquet(?) WHERE locality_code IS NOT NULL GROUP BY 1
    ),
    stats AS (
      SELECT loc AS code,
             count(*) AS n_all,
             count(*) FILTER (clean) AS n_clean,
             count(*) FILTER (clean AND date >= (SELECT max(date) FROM tx) - INTERVAL 12 MONTH) AS n_12m,
             median(price) FILTER (clean AND date >= (SELECT max(date) FROM tx) - INTERVAL 12 MONTH) AS med_price_12m,
             median(ppsqm) FILTER (clean AND date >= (SELECT max(date) FROM tx) - INTERVAL 12 MONTH) AS med_ppsqm_12m,
             median(ppsqm) FILTER (clean AND date >= (SELECT max(date) FROM tx) - INTERVAL 72 MONTH
                                         AND date <  (SELECT max(date) FROM tx) - INTERVAL 60 MONTH) AS med_ppsqm_5y_ago,
             median(lat) AS lat, median(lon) AS lon,
             min(date) AS first_date, max(date) AS last_date
      FROM tx WHERE loc IS NOT NULL GROUP BY 1
    )
    SELECT s.code, n.name_he, cbs.name_en, cbs.district, s.* EXCLUDE (code)
    FROM stats s JOIN names n USING (code) LEFT JOIN cbs ON cbs.code = s.code
    ORDER BY n_all DESC
    """, [str(DATA / "curated/transactions.parquet")])

    # Quarterly price level per locality, used to bring older comparable sales to today's prices.
    # Level = median price per m² of clean sales over three quarters centred on the quarter, from the
    # locality when it has ≥45 such sales, else its sub-district (נפה), else the whole country.
    # The current quarter is the last one whose sales are ≥70% of the typical count: deals take
    # months to be reported, so the latest quarters are incomplete.
    c.execute("""
    CREATE TABLE price_idx AS
    WITH clean AS (
      SELECT t.loc, cbs.district, date_trunc('quarter', t.date)::DATE AS q, t.ppsqm
      FROM tx t LEFT JOIN cbs ON cbs.code = t.loc
      WHERE t.clean AND t.date >= DATE '2012-01-01'
    ),
    qs AS (SELECT DISTINCT q FROM clean),
    win AS (  -- every sale counted in its own quarter and the two neighbouring ones
      SELECT c.*, qs.q AS wq FROM clean c JOIN qs ON c.q BETWEEN qs.q - INTERVAL 3 MONTH AND qs.q + INTERVAL 3 MONTH
    ),
    l AS (SELECT loc, wq AS q, median(ppsqm) AS v, count(*) AS n FROM win GROUP BY ALL),
    d AS (SELECT district, wq AS q, median(ppsqm) AS v, count(*) AS n FROM win WHERE district IS NOT NULL GROUP BY ALL),
    k AS (SELECT wq AS q, median(ppsqm) AS v FROM win GROUP BY ALL),
    locs AS (SELECT l.code AS loc, cbs.district FROM localities l LEFT JOIN cbs USING (code))
    SELECT locs.loc, qs.q,
           CASE WHEN l.n >= 45 THEN l.v WHEN d.n >= 45 THEN d.v ELSE k.v END AS level,
           CASE WHEN l.n >= 45 THEN 'locality' WHEN d.n >= 45 THEN 'district' ELSE 'country' END AS source
    FROM locs CROSS JOIN qs
    LEFT JOIN l ON l.loc = locs.loc AND l.q = qs.q
    LEFT JOIN d ON d.district = locs.district AND d.q = qs.q
    JOIN k ON k.q = qs.q
    ORDER BY 1, 2
    """)
    c.execute("""
    CREATE TABLE meta AS
    WITH n AS (SELECT date_trunc('quarter', date)::DATE AS q, count(*) AS n FROM tx
               WHERE clean AND date >= DATE '2012-01-01' GROUP BY 1),
    typical AS (SELECT median(n) AS m FROM n WHERE q >= (SELECT max(q) FROM n) - INTERVAL 30 MONTH)
    SELECT (SELECT max(q) FROM n, typical WHERE n >= 0.7 * m) AS current_q
    """)

    rent_csv = DATA / "src/cbs_rent.csv"  # from fetch_cbs_rent.py; optional
    if rent_csv.exists():
        c.execute("""
        CREATE TABLE rent AS
        SELECT kind, CASE WHEN kind = 'city' THEN area_code END AS loc, area_code, area_name, rooms,
               quarter::DATE AS q, rent, try_cast(sampling_error AS DOUBLE) AS se
        FROM read_csv(?, header = true)
        ORDER BY kind, area_code, rooms, q
        """, [str(rent_csv)])
        # Gross yield = a year of the latest average rent ÷ the median clean sale price of the same
        # city and rooms group over the four quarters up to the current quarter. Rooms group 4.5+
        # was 4.5-6 before 2026, so its year-on-year change is left out.
        c.execute("""
        CREATE TABLE rent_yield AS
        WITH latest AS (SELECT max(q) AS q FROM rent),
        r AS (
          SELECT r.loc, r.rooms, r.q, r.rent, r.se, prev.rent AS rent_year_ago
          FROM rent r JOIN latest USING (q)
          LEFT JOIN rent prev ON prev.kind = r.kind AND prev.area_code = r.area_code AND prev.rooms = r.rooms
                             AND prev.q = r.q - INTERVAL 12 MONTH
          WHERE r.kind = 'city' AND r.rooms <> 'all'
        ),
        s AS (
          SELECT loc, CASE WHEN rooms <= 2 THEN '1-2' WHEN rooms <= 3 THEN '2.5-3'
                           WHEN rooms <= 4 THEN '3.5-4' ELSE '4.5+' END AS rooms,
                 count(*) AS n, median(price) AS price, median(area) AS area
          FROM tx, meta
          WHERE clean AND rooms >= 1 AND date >= current_q - INTERVAL 9 MONTH AND date < current_q + INTERVAL 3 MONTH
          GROUP BY ALL
        )
        SELECT r.loc, r.rooms, r.q::VARCHAR AS rent_q, r.rent, r.se,
               CASE WHEN r.rooms <> '4.5+' THEN r.rent / r.rent_year_ago - 1 END AS rent_change,
               s.n::INT AS n_sales, s.price AS med_price, s.area AS med_area,
               CASE WHEN s.n >= 20 THEN 12 * r.rent / s.price END AS gross_yield
        FROM r LEFT JOIN s USING (loc, rooms)
        ORDER BY r.loc, r.rooms
        """)
        print("rent_yield", c.execute("SELECT count(*), count(gross_yield) FROM rent_yield").fetchone())
    else:  # the site expects the tables; without the CBS file they are empty
        c.execute("CREATE TABLE rent (kind VARCHAR, loc INT, area_code INT, area_name VARCHAR, rooms VARCHAR, q DATE, rent DOUBLE, se DOUBLE)")
        c.execute("""CREATE TABLE rent_yield (loc INT, rooms VARCHAR, rent_q VARCHAR, rent DOUBLE, se DOUBLE, rent_change DOUBLE,
                     n_sales INT, med_price DOUBLE, med_area DOUBLE, gross_yield DOUBLE)""")

    c.execute("DROP TABLE cbs")
    c.execute("CHECKPOINT")
    for t in ("tx", "localities"):
        print(t, c.execute(f"SELECT count(*) FROM {t}").fetchone()[0])
    print(c.execute("SELECT count(*) FILTER (name_en IS NULL) FROM localities").fetchone())
    c.close()
    print(f"{OUT} {OUT.stat().st_size / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
