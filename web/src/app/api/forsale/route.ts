import { hasDemo, qc, q1c } from "@/lib/db";
import { compareSql, type Compared } from "@/lib/listings";

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
