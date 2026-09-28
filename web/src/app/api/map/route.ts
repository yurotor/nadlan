import { NextRequest } from "next/server";
import { q } from "@/lib/db";
import { buildWhere } from "@/lib/filters";

/**
 * Map data for the current viewport.
 *  - zoom < POINT_ZOOM: deals binned into a square grid (~30px cells), with count and median ₪/m².
 *  - zoom ≥ POINT_ZOOM: one feature per distinct location (building / parcel centre).
 * `breaks` are ₪/m² quantiles over the deals in view, so the colours show contrast at any zoom level.
 */
const POINT_ZOOM = 15;
const MAX_POINTS = 6000;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const [w, s, e, n] = (sp.get("bbox") ?? "34.2,29.4,35.9,33.4").split(",").map(Number);
  const z = Math.max(5, Math.min(20, Number(sp.get("z") ?? 8)));
  const where = buildWhere(sp);
  const params = { ...where.params, w, s, e, n };
  const bbox = `lat BETWEEN $s AND $n AND lon BETWEEN $w AND $e`;

  const breaksP = q<{ b: number[] }>(
    `SELECT quantile_cont(ppsqm, [0.1,0.25,0.4,0.55,0.7,0.85])::INT[] AS b FROM tx
     WHERE ${where.sql} AND ppsqm IS NOT NULL AND lat BETWEEN $s AND $n AND lon BETWEEN $w AND $e`,
    { ...where.params, w, s, e, n },
  );

  if (z >= POINT_ZOOM) {
    const [rows, breaks] = await Promise.all([
      q(
        `SELECT lat, lon, count(*)::INT AS n, median(ppsqm)::INT AS p, bool_and(exact_loc) AS exact,
                max(date)::VARCHAR AS last, any_value(street) AS street, any_value(house) AS house
         FROM tx WHERE ${where.sql} AND ${bbox}
         GROUP BY lat, lon ORDER BY n DESC LIMIT ${MAX_POINTS}`,
        params,
      ),
      breaksP,
    ]);
    return Response.json({ mode: "points", features: rows, breaks: breaks[0]?.b ?? [] });
  }

  const cell = (30 * 360) / (256 * 2 ** z); // degrees per ~30 screen px
  const [rows, breaks] = await Promise.all([
    q(
      `SELECT avg(lat) AS lat, avg(lon) AS lon, count(*)::INT AS n, median(ppsqm)::INT AS p,
              count(*) FILTER (exact_loc)::INT AS n_exact
       FROM tx WHERE ${where.sql} AND ${bbox} AND lat IS NOT NULL
       GROUP BY floor(lat / ${cell}), floor(lon / ${cell})`,
      params,
    ),
    breaksP,
  ]);
  return Response.json({ mode: "cells", cell, features: rows, breaks: breaks[0]?.b ?? [] });
}
