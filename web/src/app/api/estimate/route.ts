import { NextRequest } from "next/server";
import { q, q1 } from "@/lib/db";
import { roomsGroup } from "@/lib/rent";

/**
 * Comparable-sales price check. Comparables = clean home sales in the same locality over the last
 * `months`, rooms within ±0.5 and area within ±25%. Same-street sales are listed first.
 *
 * Every comparable's price per m² is brought to the current quarter's market level with the
 * locality's price index (price_idx, built by pipeline/build_site.py): `adj` = ppsqm × current level
 * ÷ the level in the sale's quarter, clamped to 0.67–1.5. Sales in or after the current quarter
 * are left as they are.
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
    "clean", "t.loc = $loc", "area BETWEEN $area * 0.75 AND $area * 1.25",
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
  const streetRank = street ? `CASE WHEN street = $street THEN 0 ELSE 1 END` : "1";
  if (street) params.street = street;

  const comps = `WITH cur AS (
      SELECT p.level, p.source, m.current_q FROM meta m JOIN price_idx p ON p.loc = $loc AND p.q = m.current_q
    ), c AS (
      SELECT t.*, CASE WHEN date_trunc('quarter', t.date) >= cur.current_q OR p.level IS NULL THEN 1
                       ELSE least(1.5, greatest(0.67, cur.level / p.level)) END AS f,
             ppsqm * f AS adj
      FROM tx t CROSS JOIN cur
      LEFT JOIN price_idx p ON p.loc = t.loc AND p.q = date_trunc('quarter', t.date)
      WHERE ${conds.join(" AND ")}
    )`;

  const [summary, list, hist, streetSummary, index, rent] = await Promise.all([
    q1(
      `${comps} SELECT count(*)::INT AS n, quantile_cont(adj, [0.1,0.25,0.5,0.75,0.9]) AS ppsqm_q,
              quantile_cont(ppsqm, 0.5) AS raw_median
       FROM c`,
      params,
    ),
    q(
      `${comps} SELECT id, date::VARCHAR AS date, street, house, rooms, area, price, ppsqm, adj, year_built, lat, lon, nature
       FROM c
       ORDER BY ${streetRank}, abs(area - $area) / $area + abs(coalesce(rooms, 0) - ${rooms > 0 ? "$rooms" : "coalesce(rooms,0)"}) * 0.1, date DESC
       LIMIT 40`,
      params,
    ),
    q(`${comps} SELECT (floor(adj / 2000) * 2000)::INT AS b, count(*)::INT AS n FROM c GROUP BY 1 ORDER BY 1`, params),
    street
      ? q1(`${comps} SELECT count(*)::INT AS n, median(adj) AS ppsqm FROM c WHERE street = $street`, params)
      : Promise.resolve(null),
    // How much the local level moved from the start of the window to the current quarter.
    q1(
      `SELECT m.current_q::VARCHAR AS current_q, cur.source,
              cur.level / nullif(start.level, 0) - 1 AS change
       FROM meta m
       JOIN price_idx cur ON cur.loc = $loc AND cur.q = m.current_q
       LEFT JOIN price_idx start ON start.loc = $loc
         AND start.q = date_trunc('quarter', (SELECT max(date) FROM tx) - INTERVAL ${months} MONTH)::DATE`,
      { loc },
    ),
    // CBS average rent for this size in this city (18 big cities only).
    rooms > 0
      ? q1(`SELECT rooms, rent, rent_q FROM rent_yield WHERE loc = $loc AND rooms = $g`, { loc, g: roomsGroup(rooms) })
      : Promise.resolve(null),
  ]);
  return Response.json({ summary, comps: list, hist, street: streetSummary, index, rent: rent ?? null, months });
}
