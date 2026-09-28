"""Build the compact database the website reads (data/site.duckdb).

Input:  data/curated/transactions.parquet (from build.py)
        data/src/localities.json  CBS locality list with English names (data.gov.il resource
        5c78e9fa-c2e2-4771-93ff-7f400a12f7ba, `datastore_search?limit=5000`)
Output: data/site.duckdb with
  tx          one row per sale, only the columns the site uses, sorted by locality and date
  localities  one row per locality: names, district, centre point, headline stats

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

    c.execute("DROP TABLE cbs")
    c.execute("CHECKPOINT")
    for t in ("tx", "localities"):
        print(t, c.execute(f"SELECT count(*) FROM {t}").fetchone()[0])
    print(c.execute("SELECT count(*) FILTER (name_en IS NULL) FROM localities").fetchone())
    c.close()
    print(f"{OUT} {OUT.stat().st_size / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
