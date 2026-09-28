import { NextRequest } from "next/server";
import { q, q1 } from "@/lib/db";

/**
 * Comparable-sales price check. Comparables = clean home sales in the same locality over the last
 * `months`, rooms within ±0.5 and area within ±25%. Same-street sales are listed first.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const loc = Number(sp.get("loc"));
  const rooms = Number(sp.get("rooms"));
  const area = Number(sp.get("area"));
  const months = Math.min(60, Math.max(6, Number(sp.get("months") ?? 24)));
  const street = (sp.get("street") ?? "").trim();
  if (!Number.isFinite(loc) || !(area > 0)) return Response.json({ error: "Choose a city and enter the area." }, { status: 400 });

  const conds = [
    "clean", "loc = $loc", "area BETWEEN $area * 0.75 AND $area * 1.25",
    `date >= (SELECT max(date) FROM tx) - INTERVAL ${months} MONTH`,
  ];
  const params: Record<string, string | number> = { loc, area };
  if (rooms >= 6) {
    conds.push("rooms >= 5.5");
    params.rooms = rooms;
  } else if (rooms > 0) {
    conds.push("rooms BETWEEN $rooms - 0.5 AND $rooms + 0.5");
    params.rooms = rooms;
  }
  const where = conds.join(" AND ");
  const streetRank = street ? `CASE WHEN street = $street THEN 0 ELSE 1 END` : "1";
  if (street) params.street = street;

  const [summary, comps, hist, streetSummary] = await Promise.all([
    q1(
      `SELECT count(*)::INT AS n, quantile_cont(ppsqm, [0.1,0.25,0.5,0.75,0.9]) AS ppsqm_q,
              quantile_cont(price, [0.25,0.5,0.75]) AS price_q
       FROM tx WHERE ${where}`,
      params,
    ),
    q(
      `SELECT id, date::VARCHAR AS date, street, house, rooms, area, price, ppsqm, year_built, lat, lon, nature
       FROM tx WHERE ${where}
       ORDER BY ${streetRank}, abs(area - $area) / $area + abs(coalesce(rooms, 0) - ${rooms > 0 ? "$rooms" : "coalesce(rooms,0)"}) * 0.1, date DESC
       LIMIT 40`,
      params,
    ),
    q(
      `SELECT (floor(ppsqm / 2000) * 2000)::INT AS b, count(*)::INT AS n FROM tx WHERE ${where} GROUP BY 1 ORDER BY 1`,
      params,
    ),
    street
      ? q1(`SELECT count(*)::INT AS n, median(ppsqm) AS ppsqm FROM tx WHERE ${where} AND street = $street`, params)
      : Promise.resolve(null),
  ]);
  return Response.json({ summary, comps, hist, street: streetSummary, months });
}
