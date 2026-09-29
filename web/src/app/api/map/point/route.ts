import { NextRequest } from "next/server";
import { q, q1 } from "@/lib/db";
import { buildWhere } from "@/lib/filters";

/**
 * All deals at one map location (lat/lon are stored rounded to 6 dp, so equality is exact).
 * With snap=1, returns instead the nearest location within about 60 m that has deals matching the
 * filters, as {lat, lon} or null (a listing's "sales in this building").
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const where = buildWhere(sp);
  if (sp.get("snap") === "1") {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Response.json(null);
    const row = await q1<{ lat: number; lon: number }>(
      `SELECT tx.lat, tx.lon FROM tx
       WHERE ${where.sql} AND tx.lat BETWEEN $lat - 0.00055 AND $lat + 0.00055 AND tx.lon BETWEEN $lon - 0.00065 AND $lon + 0.00065
       GROUP BY tx.lat, tx.lon
       ORDER BY pow(tx.lat - $lat, 2) + pow((tx.lon - $lon) * 0.85, 2) LIMIT 1`,
      { ...where.params, lat, lon },
    );
    return Response.json(row ?? null);
  }
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
