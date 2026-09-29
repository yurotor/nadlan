import "server-only";

/**
 * Compare asking prices with recent sales. `input` is SQL returning (id, loc, rooms, area, lat, lon, price).
 *
 * Comparables are clean home sales in the same locality over the last 24 months, rooms within ±½
 * and area within ±25%, each brought to the current quarter's price level with price_idx (as in the
 * price check). The benchmark is their median price per m²: from sales within 750 m when there are at
 * least 8, otherwise from the whole locality (at least 5), otherwise none.
 * `diff` is the listing's price per m² relative to that benchmark (+0.12 = 12% above).
 */
export function compareSql(input: string) {
  return `
  WITH inp AS (${input}),
  m AS (SELECT current_q, (SELECT max(date) FROM tx) AS last FROM meta),
  c AS (
    SELECT i.id,
           t.ppsqm * CASE WHEN date_trunc('quarter', t.date) >= m.current_q OR p.level IS NULL THEN 1
                          ELSE least(1.5, greatest(0.67, cur.level / p.level)) END AS adj,
           12742000 * asin(sqrt(pow(sin(radians(t.lat - i.lat) / 2), 2)
             + cos(radians(i.lat)) * cos(radians(t.lat)) * pow(sin(radians(t.lon - i.lon) / 2), 2))) AS dist
    FROM inp i CROSS JOIN m
    JOIN tx t ON t.loc = i.loc AND t.clean AND t.area BETWEEN i.area * 0.75 AND i.area * 1.25
             AND (i.rooms IS NULL OR t.rooms BETWEEN i.rooms - 0.5 AND i.rooms + 0.5)
             AND t.date >= m.last - INTERVAL 24 MONTH
    JOIN price_idx cur ON cur.loc = i.loc AND cur.q = m.current_q
    LEFT JOIN price_idx p ON p.loc = t.loc AND p.q = date_trunc('quarter', t.date)
  ),
  agg AS (
    SELECT id, count(*) FILTER (dist <= 750) AS n_near, median(adj) FILTER (dist <= 750) AS near,
           count(*) AS n_city, median(adj) AS city
    FROM c GROUP BY id
  ),
  r AS (
    SELECT i.id,
           CASE WHEN n_near >= 8 THEN near WHEN n_city >= 5 THEN city END AS comp_ppsqm,
           (CASE WHEN n_near >= 8 THEN n_near ELSE n_city END)::INT AS n_comps,
           CASE WHEN n_near >= 8 THEN 'nearby' WHEN n_city >= 5 THEN 'city' END AS scope
    FROM inp i LEFT JOIN agg USING (id)
  )
  SELECT i.id, i.loc, i.rooms, i.area, i.lat, i.lon, i.price::DOUBLE AS price, i.price / i.area AS ppsqm,
         r.comp_ppsqm, coalesce(r.n_comps, 0) AS n_comps, r.scope,
         i.price / i.area / r.comp_ppsqm - 1 AS diff
  FROM inp i JOIN r USING (id)`;
}

export type Compared = {
  id: string; loc: number; rooms: number | null; area: number; lat: number; lon: number; price: number; ppsqm: number;
  comp_ppsqm: number | null; n_comps: number; scope: "nearby" | "city" | null; diff: number | null;
};
