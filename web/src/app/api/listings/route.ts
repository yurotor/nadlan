import { NextRequest } from "next/server";
import { hasDemo, q, qc, q1c } from "@/lib/db";
import { compareSql, type Compared } from "@/lib/listings";

// Listings for sale, compared with recent sales. GET: the local Yad2 snapshot. POST: the user's own listings.
// One route for both keeps the deployment under Vercel Hobby's 12-function limit.

export type ForSale = Compared & {
  street: string | null; house: string | null; floor: number | null; neighborhood: string | null;
  property: string | null; seller: string | null;
};

/**
 * The local Yad2 snapshot (data/demo.duckdb), each listing compared with recent sales.
 * Not deployed: without the demo file this answers { available: false }.
 */
export async function GET() {
  if (!hasDemo) return Response.json({ available: false });
  const [meta, rows] = await Promise.all([
    q1c<{ taken_at: string; n: number }>(`SELECT taken_at::VARCHAR AS taken_at, n FROM demo.meta`),
    qc<ForSale>(
      `WITH cmp AS (${compareSql(`SELECT id, loc, rooms, area, lat, lon, price FROM demo.forsale`)})
       SELECT cmp.*, f.street, f.house, f.floor, f.neighborhood, f.property, f.seller
       FROM cmp JOIN demo.forsale f USING (id)`,
    ),
  ]);
  return Response.json({ available: true, taken_at: meta?.taken_at, listings: rows });
}

type In = { id: string; loc: number; street?: string; house?: string; rooms?: number | null; area: number; price: number };
export type Placed = Compared & { located: "address" | "street" | "city" };

/**
 * Listings a user adds (kept in their browser): place each on the map from our deals' addresses
 * (same street and house number, else the street, else the city centre), then compare with recent sales.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { items?: In[] } | null;
  const items = (body?.items ?? []).slice(0, 200).filter((i) => i && i.id && Number(i.loc) > 0 && Number(i.area) > 0 && Number(i.price) > 0);
  if (!items.length) return Response.json({ listings: [] });
  const json = JSON.stringify(items.map((i) => ({
    id: String(i.id), loc: Number(i.loc), street: (i.street ?? "").trim(), house: String(i.house ?? "").trim(),
    rooms: i.rooms ? Number(i.rooms) : null, area: Number(i.area), price: Number(i.price),
  })));
  const input = `
    WITH raw AS (SELECT unnest(from_json($items, '[{"id":"VARCHAR","loc":"INTEGER","street":"VARCHAR","house":"VARCHAR","rooms":"DOUBLE","area":"DOUBLE","price":"DOUBLE"}]'), recursive := true)),
    a AS (SELECT loc, street, house, median(lat) AS lat, median(lon) AS lon FROM tx
          WHERE (loc, street) IN (SELECT loc, street FROM raw) AND lat IS NOT NULL GROUP BY ALL),
    s AS (SELECT loc, street, median(lat) AS lat, median(lon) AS lon FROM a GROUP BY ALL)
    SELECT raw.id, raw.loc, raw.rooms, raw.area,
           coalesce(a.lat, s.lat, l.lat) AS lat, coalesce(a.lon, s.lon, l.lon) AS lon, raw.price,
           CASE WHEN a.lat IS NOT NULL THEN 'address' WHEN s.lat IS NOT NULL THEN 'street' ELSE 'city' END AS located
    FROM raw
    LEFT JOIN a ON a.loc = raw.loc AND a.street = raw.street AND a.house = raw.house
    LEFT JOIN s ON s.loc = raw.loc AND s.street = raw.street
    JOIN localities l ON l.code = raw.loc`;
  const rows = await q<Placed>(
    `WITH placed AS (${input}), cmp AS (${compareSql(`SELECT id, loc, rooms, area, lat, lon, price FROM placed`)})
     SELECT cmp.*, placed.located FROM cmp JOIN placed USING (id)`,
    { items: json },
  );
  return Response.json({ listings: rows });
}
