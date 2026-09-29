import { NextRequest } from "next/server";
import { q1 } from "@/lib/db";
import { buildWhere } from "@/lib/filters";

/**
 * The nearest map location with deals matching the map's filters, within about 60 m
 * (a listing's "sales in this building").
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat")), lon = Number(sp.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Response.json(null);
  const where = buildWhere(sp);
  const row = await q1<{ lat: number; lon: number }>(
    `SELECT tx.lat, tx.lon FROM tx
     WHERE ${where.sql} AND tx.lat BETWEEN $lat - 0.00055 AND $lat + 0.00055 AND tx.lon BETWEEN $lon - 0.00065 AND $lon + 0.00065
     GROUP BY tx.lat, tx.lon
     ORDER BY pow(tx.lat - $lat, 2) + pow((tx.lon - $lon) * 0.85, 2) LIMIT 1`,
    { ...where.params, lat, lon },
  );
  return Response.json(row ?? null);
}
