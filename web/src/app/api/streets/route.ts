import { NextRequest } from "next/server";
import { q } from "@/lib/db";

/** Streets with sales in a locality, most active first. */
export async function GET(req: NextRequest) {
  const loc = Number(req.nextUrl.searchParams.get("loc"));
  if (!Number.isFinite(loc)) return Response.json([]);
  const rows = await q(
    `SELECT street, count(*)::INT AS n FROM tx WHERE loc = $loc AND street IS NOT NULL AND clean
     GROUP BY 1 ORDER BY n DESC LIMIT 800`,
    { loc },
  );
  return Response.json(rows);
}
