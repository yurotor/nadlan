import { NextRequest } from "next/server";
import { q } from "@/lib/db";
import { buildWhere } from "@/lib/filters";

/** All deals at one map location (lat/lon are stored rounded to 6 dp, so equality is exact). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const where = buildWhere(sp);
  const rows = await q(
    `SELECT id, date::VARCHAR AS date, nature, cls, price, declared::DOUBLE AS declared, portion, area, rooms, year_built,
            ppsqm, street, house, address_source, location_level, spread_m, gush, helka, sub_parcels,
            l.name_he, l.name_en
     FROM tx LEFT JOIN localities l ON l.code = tx.loc
     WHERE ${where.sql} AND tx.lat = $lat AND tx.lon = $lon
     ORDER BY date DESC LIMIT 300`,
    { ...where.params, lat, lon },
  );
  return Response.json(rows);
}
