"""Build the curated Israeli real-estate deals dataset.

Inputs (data/, see pipeline/README.md for where each comes from):
  deals.csv                      Tax Authority deals, over.org.il dataset fd06f5ae v5
  src/parcels/shape.csv.gz       Survey of Israel parcels (PARCEL_ALL) with WKT geometry
  src/parcels/cancel/CANCEL_PARCEL.dbf   parcel lineage: cancelled parcel -> replacement parcel
  src/addresses/addresses.csv    over.org.il address <-> parcel crosswalk
  src/gaztir.csv                 property gazetteer (street per sub-parcel, asset type)

Outputs:
  data/nadlan.duckdb             all intermediate + final tables
  data/curated/deals.parquet     one row per source record, enriched
  data/curated/transactions.parquet   one row per sale (multi-row sales collapsed)
  data/curated/report.json       step-by-step counts

Run:  .venv/bin/python pipeline/build.py [--reload-sources | --reload-deals]
"""

import json
import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "curated"

RESIDENTIAL = [
    "דירה בבית קומות", "ד. מגורים", "מגורים", "קוטג' דו משפחתי", "קוטג' חד משפחתי",
    "בית בודד", "דירת גן", "דירת גג", "קוטג' טורי", "דירת נופש", "דיור מוגן",
]
# Natures that describe one dwelling. Generic "מגורים" is excluded: 69% have no area and
# it is mostly used for whole residential parcels.
UNIT_NATURES = [n for n in RESIDENTIAL if n not in ("מגורים", "דיור מוגן")]
LAND = [
    "ללא תיכנון", "לא מעובדת", "קרקע", "שלחין", "פרדס", "קבוצת רכישה - קרקע מ",
    "קבוצת רכישה - חקלאית", "קרקע ל-8 יחידות ומעל", "במשק חקלאי-נחלה", "משק חקלאי",
    "בעל + זכויות מים", "בתהליכי תכנון", "בניה שאינה לחקלאות", "מבנים חקלאיים", "אופציה",
    "קומבינציה", "ניוד זכויות בניה",
]

NAME_MAP = {  # source name -> locality code
    "צור יגאל": 1224, "כוכב יאיר": 1224, "דבירה": 849, "גבעת עדה": 9800, "יהוד": 9400,
    "צורן": 195, "*קדימה-צורן*": 195, "בת חצור": 406, "מכבים-רעות": 1200, "קרית חיים": 4000, "סביון*": 587,
}


def sql_list(xs):
    return "(" + ",".join("'" + x.replace("'", "''") + "'" for x in xs) + ")"


class Build:
    def __init__(self, con):
        self.c = con
        self.report = {}

    def run(self, name, sql):
        t = time.time()
        self.c.execute(sql)
        print(f"  {name}: {time.time() - t:.1f}s", flush=True)

    def one(self, sql):
        row = self.c.execute(sql).fetchone()
        cols = [d[0] for d in self.c.description]
        return dict(zip(cols, row))

    def rows(self, sql):
        cur = self.c.execute(sql)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def load_deals(b):
    b.run("raw", f"""create or replace table raw as
        select * from read_csv('{DATA}/deals.csv', header=true, all_varchar=true)""")


def load_sources(b):
    print("loading sources")
    load_deals(b)
    b.run("parcels", f"""create or replace table parcels as
        select try_cast(GUSH_NUM as int) gush, try_cast(GUSH_SUFFI as int) gush_suffix,
               try_cast(PARCEL as int) helka, try_cast(LEGAL_AREA as double) legal_area,
               STATUS_TEX status, try_cast(LOCALITY_I as int) locality_code, LOCALITY_N locality_name,
               st_centroid(st_geomfromtext(geometry_wkt)) centroid
        from read_csv('{DATA}/src/parcels/shape.csv.gz', header=true, all_varchar=true,
                      max_line_size=50000000)""")
    b.run("addresses", f"""create or replace table addresses as
        select * from read_csv('{DATA}/src/addresses/addresses.csv', header=true, all_varchar=true)""")
    b.run("gazetteer", f"""create or replace table gazetteer as
        select try_cast(split_part(GushNum,'.',1) as int) gush,
               try_cast(split_part(ParcelNum,'.',1) as int) helka,
               try_cast(split_part(SubParcelNum,'.',1) as int) sub_parcel,
               try_cast(BuildingFloors as double)::int floors,
               try_cast(BuildingYear as double)::int building_year,
               try_cast(SettlmentID as double)::int settlement_code,
               nullif(trim(StreetNameHeb),'') street, Type asset_type
        from read_csv('{DATA}/src/gaztir.csv', header=true, all_varchar=true)""")
    import pandas as pd
    from dbfread import DBF
    lineage = pd.DataFrame(iter(DBF(DATA / "src/parcels/cancel/CANCEL_PARCEL.dbf", encoding="cp1255")))
    b.c.register("lineage_df", lineage)
    b.run("parcel_lineage", """create or replace table parcel_lineage as
        select distinct F_GUSH_NUM::int fg, F_PARCEL_N::int fp, T_GUSH_NUM::int tg, T_PARCEL_N::int tp
        from lineage_df where not (F_GUSH_NUM=T_GUSH_NUM and F_PARCEL_N=T_PARCEL_N)""")
    b.c.unregister("lineage_df")


def step_base(b):
    print("1. base")
    b.run("deals_base", """create or replace table deals_base as
        with t as (
          select try_cast(settlement_code as int) src_settlement_code, settlement src_settlement,
                 try_cast(gush as int) gush, try_cast(chelka as int) helka,
                 try_cast(sub_chelka as int) sub_parcel,
                 try_strptime(deal_date, '%d/%m/%Y')::date deal_date,
                 try_cast(deal_amount as bigint) amount_paid,
                 try_cast(declared_amount as bigint) declared_value,
                 deal_nature, try_cast(portion as double) portion_sold,
                 nullif(try_cast(year_built as int), 0) year_built,
                 nullif(try_cast(asset_area as double), 0) area_sqm,
                 nullif(try_cast(room_num as double), 0) rooms
          from raw)
        select row_number() over (order by gush, helka, sub_parcel, deal_date, declared_value,
                 amount_paid, deal_nature, src_settlement, portion_sold, area_sqm, rooms,
                 year_built, src_settlement_code) deal_id, *
        from t""")
    b.report["base"] = b.one("""select count(*) as n_rows,
        count(*) filter (where gush is null or helka is null) bad_parcel_id,
        count(*) filter (where deal_date is null) bad_date,
        min(deal_date) first_date, max(deal_date) last_date from deals_base""")


def step_geo(b):
    print("2. parcel geography")
    # One point per gush+helka. A handful exist under several gush suffixes; keep the largest.
    b.run("parcel_pt", """create or replace table parcel_pt as
        select gush, helka, count(*) n_suffix,
               arg_max(locality_code, {a: legal_area, c: locality_code}) filter (where locality_code > 0) locality_code,
               arg_max(st_transform(centroid, 'EPSG:4326', 'EPSG:2039', always_xy := true),
                       {a: legal_area, s: gush_suffix}) pt
        from parcels group by 1, 2""")
    b.run("parcel_xy", """create or replace table parcel_xy as
        select gush, helka, n_suffix, locality_code, st_x(pt) x, st_y(pt) y from parcel_pt""")
    # Follow cancelled parcels forward until reaching parcels that exist today.
    b.run("lineage_resolved", """create or replace table lineage_resolved as
        with recursive walk(fg, fp, cg, cp, depth) as (
          select fg, fp, tg, tp, 1 from parcel_lineage
          union
          select w.fg, w.fp, l.tg, l.tp, w.depth + 1
          from walk w join parcel_lineage l on l.fg = w.cg and l.fp = w.cp
          where w.depth < 8
            and not exists (select 1 from parcel_xy p where p.gush = w.cg and p.helka = w.cp))
        select distinct w.fg old_gush, w.fp old_helka, w.cg gush, w.cp helka
        from walk w join parcel_xy p on p.gush = w.cg and p.helka = w.cp""")
    b.run("lineage_pt", """create or replace table lineage_pt as
        with d as (select l.old_gush, l.old_helka, p.* from lineage_resolved l
                   join parcel_xy p using (gush, helka)),
        a as (select old_gush, old_helka, count(*) n_desc, avg(x) x, avg(y) y,
                     det_mode(list(locality_code)) locality_code,
                     any_value(gush) one_gush, any_value(helka) one_helka
              from d group by 1, 2)
        select a.*, (select max(sqrt((d.x-a.x)^2 + (d.y-a.y)^2)) from d
                     where d.old_gush = a.old_gush and d.old_helka = a.old_helka) spread_m
        from a""")
    b.run("gush_pt", """create or replace table gush_pt as
        select gush, avg(x) x, avg(y) y, det_mode(list(locality_code)) locality_code, count(*) n_parcels
        from parcel_xy group by 1""")

    b.run("deal_geo", """create or replace table deal_geo as
        select d.deal_id,
          case when p.gush is not null then 'parcel'
               when l.n_desc = 1 then 'lineage_single'
               when l.n_desc > 1 then 'lineage_multi'
               when g.gush is not null then 'gush'
               else 'none' end location_level,
          -- the current parcel whose address we use
          case when p.gush is not null then d.gush when l.n_desc = 1 then l.one_gush end cur_gush,
          case when p.gush is not null then d.helka when l.n_desc = 1 then l.one_helka end cur_helka,
          case when p.gush is not null then p.x when l.old_gush is not null then l.x else g.x end x,
          case when p.gush is not null then p.y when l.old_gush is not null then l.y else g.y end y,
          case when p.gush is null and l.n_desc > 1 then round(l.spread_m) end location_spread_m,
          l.n_desc lineage_descendants,
          case when p.gush is not null then p.locality_code when l.old_gush is not null then l.locality_code else g.locality_code end geo_locality_code,
          case when p.gush is not null then 'parcel' when l.old_gush is not null then 'lineage'
               when g.gush is not null then 'gush' end geo_locality_from
        from deals_base d
        left join parcel_xy p on p.gush = d.gush and p.helka = d.helka
        left join lineage_pt l on l.old_gush = d.gush and l.old_helka = d.helka
        left join gush_pt g on g.gush = d.gush""")
    b.report["location"] = b.rows("""select location_level, count(*) n,
        round(100.0 * count(*) / sum(count(*)) over (), 2) pct from deal_geo group by 1 order by 2 desc""")


def step_locality(b):
    print("3. locality")
    # How does the Tax Authority code deals on parcels the Survey labels with locality X?
    # e.g. Survey 'צורן' (1308) -> Tax 'קדימה-צורן' (195). Learned from coded deals.
    b.run("locality_xwalk", """create or replace table locality_xwalk as
        with m as (select g.geo_locality_code geo, d.src_settlement_code tax, count(*) n
                   from deals_base d join deal_geo g using (deal_id)
                   where d.src_settlement_code is not null and g.geo_locality_code is not null
                   group by 1, 2),
        r as (select geo, arg_max(tax, {n: n, t: tax}) tax, max(n) top, sum(n) total from m group by 1)
        select geo, case when top >= 0.8 * total and total >= 20 then tax else geo end tax_code,
               top::double / total as share, total
        from r""")
    b.run("locality_names", """create or replace table locality_names as
        with t as (select src_settlement_code code, src_settlement as name, count(*) n
                   from deals_base where src_settlement_code is not null group by 1, 2),
        p as (select locality_code code, det_mode(list(locality_name)) as name from parcels
              where locality_code > 0 group by 1)
        select coalesce(t.code, p.code) code, coalesce(t.name, p.name) as name
        from (select code, arg_max(name, {n: n, name: name}) as name from t group by 1) t
        full join p on p.code = t.code""")
    # Former or merged localities that appear without a code, mapped by hand to today's
    # locality (checked against the parcel layer). Used before the coarse gush-level fallback.
    name_map = ",".join(f"('{k}', {v})" for k, v in NAME_MAP.items())
    b.run("deal_locality", f"""create or replace table deal_locality as
        with n as (  -- uncoded names that some coded row shares
          select src_settlement as name, arg_max(src_settlement_code, {{n: n, c: src_settlement_code}}) code from (
            select src_settlement, src_settlement_code, count(*) n from deals_base
            where src_settlement_code is not null group by 1, 2) group by 1),
        m(name, code) as (values {name_map}),
        geo as (select g.deal_id, g.geo_locality_from, coalesce(x.tax_code, g.geo_locality_code) code
                from deal_geo g left join locality_xwalk x on x.geo = g.geo_locality_code)
        select d.deal_id,
          coalesce(d.src_settlement_code,
                   case when geo.geo_locality_from <> 'gush' then geo.code end,
                   m.code, n.code,
                   case when geo.geo_locality_from = 'gush' then geo.code end) locality_code,
          case when d.src_settlement_code is not null then 'tax_authority'
               when geo.geo_locality_from <> 'gush' and geo.code is not null then 'geo_' || geo.geo_locality_from
               when m.code is not null then 'name_map'
               when n.code is not null then 'name'
               when geo.code is not null then 'geo_gush'
               else 'none' end locality_source,
          d.src_settlement_code is not null and geo.geo_locality_from = 'parcel'
            and d.src_settlement_code <> geo.code locality_geo_mismatch
        from deals_base d join geo using (deal_id)
        left join m on d.src_settlement_code is null and m.name = d.src_settlement
        left join n on d.src_settlement_code is null and n.name = d.src_settlement""")
    b.report["locality"] = b.rows("""select locality_source, count(*) n from deal_locality
        group by 1 order by 2 desc""")
    b.report["locality_mismatch_rows"] = b.one("""select count(*) filter (where locality_geo_mismatch) n
        from deal_locality""")["n"]
    b.report["recovered_names_top"] = b.rows("""select d.src_settlement old_name, n.name assigned, count(*) n
        from deals_base d join deal_locality l using (deal_id) left join locality_names n on n.code = l.locality_code
        where d.src_settlement_code is null group by 1, 2 order by 3 desc limit 25""")


def step_address(b):
    print("4. addresses")
    # Address points linked to a parcel (point-in-polygon or GovMap parcel lookup).
    b.run("addr_pt", """create or replace table addr_pt as
        select try_cast(split_part(parcel_key, '-', 1) as int) gush,
               try_cast(split_part(parcel_key, '-', 3) as int) helka,
               street_name street,
               try_cast(house_num as int) house_num,
               house_num || coalesce(house_suffix, '') house,
               try_cast(itm_x as double) x, try_cast(itm_y as double) y
        from addresses
        where parcel_key is not null and try_cast(house_num as int) > 0""")
    b.run("parcel_addr", """create or replace table parcel_addr as
        with a as (select a.*, p.x px, p.y py from addr_pt a
                   left join parcel_xy p using (gush, helka)),
        s as (select gush, helka, street, house, house_num,
                     row_number() over (partition by gush, helka
                        order by coalesce(sqrt((x-px)^2 + (y-py)^2), 1e9), house_num, street, house) rk
              from a)
        select gush, helka,
               max(street) filter (where rk = 1) street,
               max(house) filter (where rk = 1) house,
               count(*) n_addresses,
               string_agg(street || ' ' || house, '; ' order by street, house_num)
                 filter (where rk <= 6) addresses_sample
        from s group by 1, 2""")
    b.run("gaz_sub", """create or replace table gaz_sub as
        select gush, helka, sub_parcel, min(street) street, min(asset_type) asset_type,
               max(floors) floors, min(building_year) building_year
        from gazetteer group by 1, 2, 3""")
    b.run("gaz_parcel", """create or replace table gaz_parcel as
        select gush, helka, det_mode(list(street)) street,
               count(*) filter (where asset_type like 'דירת מגורים%') n_dwellings,
               max(floors) floors
        from gazetteer group by 1, 2""")
    # Nearest address point (within 100 m) for parcels that have neither a point nor a street.
    b.run("need_nearest", """create or replace table need_nearest as
        select distinct p.gush, p.helka, p.x, p.y from deal_geo g
        join parcel_xy p on p.gush = g.cur_gush and p.helka = g.cur_helka
        where not exists (select 1 from parcel_addr a where a.gush = p.gush and a.helka = p.helka)""")
    b.run("parcel_nearest", """create or replace table parcel_nearest as
        with pts as (select street, house, x, y, floor(x / 100)::int cx, floor(y / 100)::int cy
                     from addr_pt where x is not null
                     union all
                     select street_name, house_num || coalesce(house_suffix, ''), try_cast(itm_x as double),
                            try_cast(itm_y as double), floor(try_cast(itm_x as double) / 100)::int,
                            floor(try_cast(itm_y as double) / 100)::int
                     from addresses where parcel_key is null and itm_x is not null
                       and try_cast(house_num as int) > 0),
        q as (select n.*, floor(x / 100)::int + dx cx, floor(y / 100)::int + dy cy
              from need_nearest n, range(-1, 2) a(dx), range(-1, 2) b(dy)),
        c as (select q.gush, q.helka, p.street, p.house,
                     sqrt((p.x - q.x)^2 + (p.y - q.y)^2) dist
              from q join pts p using (cx, cy))
        select gush, helka, a.street, a.house, dist
        from (select gush, helka, arg_min({street: street, house: house}, {d: dist, s: street, h: house}) a,
                     min(dist) dist
              from c group by 1, 2 having min(dist) <= 100)""")
    # Street for split old parcels: only when the descendants agree on one street.
    b.run("lineage_street", """create or replace table lineage_street as
        with s as (select l.old_gush, l.old_helka,
                          coalesce(a.street, gp.street) street
                   from lineage_resolved l
                   left join parcel_addr a using (gush, helka)
                   left join gaz_parcel gp using (gush, helka)),
        c as (select old_gush, old_helka, street, count(*) n,
                     sum(count(*)) over (partition by old_gush, old_helka) total
              from s group by 1, 2, 3)
        select old_gush, old_helka, arg_max(street, {n: n, s: street}) street, max(n)::double / max(total) as share
        from c where street is not null group by 1, 2
        having max(n) >= 0.8 * max(total)""")
    b.run("deal_address", """create or replace table deal_address as
        select d.deal_id,
          case when a.street is not null then 'address_point'
               when gs.street is not null then 'gazetteer_subparcel'
               when gp.street is not null then 'gazetteer_parcel'
               when nn.street is not null then 'nearest_address'
               when ls.street is not null and g.location_level = 'lineage_multi' then 'lineage_street'
               else 'none' end address_source,
          coalesce(a.street, gs.street, gp.street, nn.street,
                   case when g.location_level = 'lineage_multi' then ls.street end) street,
          coalesce(a.house, nn.house) house_number,
          round(nn.dist) nearest_address_dist_m,
          a.n_addresses addresses_on_parcel,
          a.addresses_sample
        from deals_base d join deal_geo g using (deal_id)
        left join parcel_addr a on a.gush = g.cur_gush and a.helka = g.cur_helka
        left join gaz_sub gs on gs.gush = d.gush and gs.helka = d.helka
                             and gs.sub_parcel = d.sub_parcel and gs.street is not null
        left join gaz_parcel gp on gp.gush = g.cur_gush and gp.helka = g.cur_helka
        left join parcel_nearest nn on nn.gush = g.cur_gush and nn.helka = g.cur_helka
        left join lineage_street ls on ls.old_gush = d.gush and ls.old_helka = d.helka""")
    b.report["address"] = b.rows("""select address_source, count(*) n,
        round(100.0 * count(*) / sum(count(*)) over (), 2) pct from deal_address group by 1 order by 2 desc""")
    b.report["address_by_year"] = b.rows("""select year(deal_date) yr,
        round(100.0 * count(*) filter (where address_source = 'address_point') / count(*), 1) pct_full_address,
        round(100.0 * count(*) filter (where street is not null) / count(*), 1) pct_street
        from deals_base join deal_address using (deal_id) group by 1 order by 1""")


def step_units(b):
    print("5. unit classification")
    # A sale can span several rows. Rows of one sale share parcel, date and declared value:
    #  - same sub-parcel, portions summing to 1: co-owners reported separately; declared_value is
    #    each row's share, so the sale value is the sum of amount_paid.
    #  - different sub-parcels, each sold in full: one dwelling registered across sub-parcels
    #    (flat + storage/parking/extra sub-parcel). The value is repeated on each row, and
    #    value / one row's area lands at 0.95x the local median (vs 0.48x on the summed area).
    b.run("deal_txn", f"""create or replace table deal_txn as
        select d.*, gs.asset_type gaz_asset_type, gp.n_dwellings parcel_dwellings,
          dense_rank() over (order by d.gush, d.helka, d.deal_date, d.declared_value,
                             coalesce(d.src_settlement, '')) txn_id,
          case when deal_nature in {sql_list(RESIDENTIAL)} then 'residential'
               when deal_nature in {sql_list(LAND)} then 'land'
               when deal_nature = 'בניין' then 'building'
               else 'commercial_other' end category,
          -- For a partial sale declared_value is the price of the share (equal to amount_paid in
          -- 93% of rows); the whole-property value is amount_paid / portion. Portions are rounded
          -- to 3 decimals, so tiny shares cannot be scaled up reliably.
          case when portion_sold >= 0.999 then declared_value
               when portion_sold >= 0.1 and d.sub_parcel > 0
                 then round(amount_paid / portion_sold)::bigint end full_value
        from deals_base d
        left join gaz_sub gs on gs.gush = d.gush and gs.helka = d.helka and gs.sub_parcel = d.sub_parcel
        left join gaz_parcel gp on gp.gush = d.gush and gp.helka = d.helka""")
    b.run("row_class", f"""create or replace table row_class as
        select deal_id, txn_id,
          row_number() over (partition by txn_id order by (area_sqm is null), area_sqm desc, deal_id) = 1 is_main_row,
          case
            when category <> 'residential' then category
            when deal_nature not in {sql_list(UNIT_NATURES)}
                 and (sub_parcel = 0 or area_sqm is null) then 'whole_parcel'
            when area_sqm is null then 'unit_no_area'
            when area_sqm < 15 or area_sqm > 600 or rooms > 12 then 'unit_suspect_size'
            -- Sub-parcel 0 = the parcel itself. Sold in full it is still one dwelling (flats in
            -- unregistered buildings price at 1.01x the local median). Sold in part it is
            -- ambiguous: a flat sold as a share of the parcel, or a share of a house.
            when coalesce(portion_sold, 0) < 0.999 and sub_parcel = 0 then 'share_of_parcel'
            when coalesce(portion_sold, 0) < 0.999 then 'partial_share'
            else 'single_unit'
          end row_class
        from deal_txn""")
    b.run("txn", """create or replace table txn as
        with f as (
          select t.txn_id, count(*) n_rows, count(distinct t.sub_parcel) n_subs,
                 round(sum(t.portion_sold), 9) portion_sum, min(t.portion_sold) portion_min,
                 count(*) filter (where t.rooms is not null or t.area_sqm is not null) n_sized,
                 sum(t.amount_paid) amount_sum, max(t.declared_value) declared_max,
                 max(r.row_class) filter (where r.is_main_row) main_class,
                 max(t.full_value) filter (where r.is_main_row) main_full_value,
                 max(t.area_sqm) filter (where r.is_main_row) area_sqm,
                 max(t.deal_id) filter (where r.is_main_row) main_deal_id
          from deal_txn t join row_class r using (deal_id) group by 1)
        select *,
          case
            when n_rows = 1 or main_class in ('land', 'commercial_other', 'building', 'whole_parcel',
                                              'unit_no_area', 'unit_suspect_size', 'share_of_parcel')
              then main_class
            when n_subs = 1 and abs(portion_sum - 1) < 0.02 then 'unit_multi_seller'
            when n_subs = n_rows and portion_min >= 0.999 and n_sized <= 1 then 'unit_with_annex'
            when n_subs = n_rows and portion_min >= 0.999 then 'unit_multi_subparcel'
            else 'multi_row_other'
          end txn_class
        from f""")
    b.run("txn_value", """create or replace table txn_value as
        select *,
          case when txn_class = 'unit_multi_seller' then amount_sum
               when txn_class in ('unit_with_annex', 'unit_multi_subparcel') then declared_max
               when n_rows = 1 then main_full_value end sale_value
        from txn""")
    # Price-per-m2 outliers, judged against clean single units in the same locality and year.
    b.run("txn_price", """create or replace table txn_price as
        with u as (select v.txn_id, v.txn_class, l.locality_code, year(d.deal_date) yr,
                          v.sale_value / v.area_sqm ppsqm
                   from txn_value v join deals_base d on d.deal_id = v.main_deal_id
                   join deal_locality l on l.deal_id = v.main_deal_id
                   where v.txn_class in ('single_unit', 'partial_share', 'unit_multi_seller',
                                         'unit_with_annex', 'unit_multi_subparcel')
                     and v.sale_value > 0 and v.area_sqm > 0),
        med as (select locality_code, yr, median(ppsqm) med, count(*) n from u
                where txn_class = 'single_unit' group by 1, 2)
        select u.txn_id, round(u.ppsqm) price_per_sqm, round(m.med) locality_year_median_ppsqm,
               coalesce(m.n >= 20 and (u.ppsqm < 0.25 * m.med or u.ppsqm > 4 * m.med), false) price_outlier
        from u left join med m using (locality_code, yr)""")
    b.report["txn_class"] = b.rows("""select txn_class, count(*) n, sum(n_rows) n_rows,
        round(100.0 * count(*) / sum(count(*)) over (), 2) pct from txn group by 1 order by 2 desc""")
    b.report["multi_row_price_check"] = b.rows("""select v.txn_class, count(*) n,
        round(median(p.price_per_sqm / p.locality_year_median_ppsqm), 3) median_ratio_to_local_single_units
        from txn_value v join txn_price p using (txn_id) where p.locality_year_median_ppsqm > 0
        group by 1 order by 2 desc""")


def step_final(b):
    print("6. final tables")
    b.run("transactions", """create or replace table transactions as
        select v.txn_id, d.deal_date,
          l.locality_code, n.name as locality_name, l.locality_source,
          d.gush, d.helka,
          (select string_agg(x.sub_parcel::varchar, ',' order by x.sub_parcel)
             from deals_base x join row_class rc using (deal_id) where rc.txn_id = v.txn_id) sub_parcels,
          v.n_rows, d.deal_nature, t.category, v.txn_class,
          v.sale_value, v.declared_max declared_value, v.amount_sum amount_paid,
          v.portion_sum portion_sold, v.area_sqm, d.rooms, d.year_built,
          p.price_per_sqm, p.locality_year_median_ppsqm, coalesce(p.price_outlier, false) price_outlier,
          coalesce(v.sale_value, 0) < 20000 nominal_value,
          v.txn_class in ('single_unit', 'unit_multi_seller', 'unit_with_annex')
            and d.deal_nature in """ + sql_list(UNIT_NATURES) + """
            and v.sale_value >= 20000 and not coalesce(p.price_outlier, false) is_clean_unit,
          a.street, a.house_number, a.address_source, a.nearest_address_dist_m,
          g.location_level, g.location_spread_m,
          case when g.x is not null then round(st_y(st_transform(st_point(g.x, g.y), 'EPSG:2039', 'EPSG:4326', always_xy := true)), 6) end lat,
          case when g.x is not null then round(st_x(st_transform(st_point(g.x, g.y), 'EPSG:2039', 'EPSG:4326', always_xy := true)), 6) end lon,
          v.main_deal_id
        from txn_value v
        join deals_base d on d.deal_id = v.main_deal_id
        join deal_txn t on t.deal_id = v.main_deal_id
        join deal_locality l on l.deal_id = v.main_deal_id
        left join locality_names n on n.code = l.locality_code
        join deal_geo g on g.deal_id = v.main_deal_id
        join deal_address a on a.deal_id = v.main_deal_id
        left join txn_price p on p.txn_id = v.txn_id
        order by v.txn_id""")
    b.run("deals", """create or replace table deals as
        select d.deal_id, r.txn_id, r.is_main_row, d.deal_date,
          l.locality_code, n.name as locality_name, l.locality_source, l.locality_geo_mismatch,
          d.src_settlement_code, d.src_settlement,
          d.gush, d.helka, d.sub_parcel,
          d.deal_nature, t.category, r.row_class, x.txn_class,
          d.declared_value, d.amount_paid, d.portion_sold, t.full_value,
          d.area_sqm, d.rooms, d.year_built,
          a.street, a.house_number, a.address_source, a.nearest_address_dist_m,
          a.addresses_on_parcel, a.addresses_sample,
          g.location_level, g.location_spread_m, g.lineage_descendants,
          g.cur_gush current_gush, g.cur_helka current_helka,
          case when g.x is not null then round(st_y(st_transform(st_point(g.x, g.y), 'EPSG:2039', 'EPSG:4326', always_xy := true)), 6) end lat,
          case when g.x is not null then round(st_x(st_transform(st_point(g.x, g.y), 'EPSG:2039', 'EPSG:4326', always_xy := true)), 6) end lon,
          t.gaz_asset_type, t.parcel_dwellings
        from deals_base d
        join row_class r using (deal_id)
        join deal_txn t using (deal_id)
        join txn x on x.txn_id = r.txn_id
        join deal_locality l using (deal_id)
        left join locality_names n on n.code = l.locality_code
        join deal_geo g using (deal_id)
        join deal_address a using (deal_id)
        order by d.deal_id""")
    b.report["final"] = b.one("""select (select count(*) from deals) deals,
        (select count(*) from transactions) transactions,
        (select count(*) from transactions where is_clean_unit) clean_unit_sales,
        (select count(*) from transactions where price_outlier) price_outliers,
        (select count(*) from deals where lat is not null) deals_with_location,
        (select count(*) from deals where street is not null) deals_with_street,
        (select count(*) from deals where house_number is not null) deals_with_house_number""")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DATA / "nadlan.duckdb"))
    con.execute("install spatial; load spatial; set preserve_insertion_order=false;")
    # Most frequent value, ties to the smallest. mode(), any_value() and arg_max() on a tie pick
    # whichever row a thread saw first, which made rebuilds of the same input differ.
    con.execute("""create or replace macro det_mode(l) as
        (select v from unnest(l) t(v) where v is not null group by v order by count(*) desc, v limit 1)""")
    b = Build(con)
    have = {r[0] for r in con.execute("select table_name from information_schema.tables").fetchall()}
    if "--reload-sources" in sys.argv or not {"raw", "parcels", "addresses", "gazetteer", "parcel_lineage"} <= have:
        load_sources(b)
    elif "centroid" not in {r[0] for r in con.execute("describe parcels").fetchall()}:
        load_sources(b)  # older layout
    elif "--reload-deals" in sys.argv:
        print("loading deals")
        load_deals(b)
    step_base(b)
    step_geo(b)
    step_locality(b)
    step_address(b)
    step_units(b)
    step_final(b)
    for t in ("deals", "transactions"):
        con.execute(f"copy {t} to '{OUT / (t + '.parquet')}' (format parquet, compression zstd)")
    (OUT / "report.json").write_text(json.dumps(b.report, ensure_ascii=False, indent=2, default=str))
    print(json.dumps(b.report, ensure_ascii=False, indent=1, default=str))


if __name__ == "__main__":
    main()
