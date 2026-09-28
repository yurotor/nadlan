import { q } from "@/lib/db";

export const dynamic = "force-static";

export async function GET() {
  const rows = await q(
    `SELECT nature, mode(category) AS category, count(*)::INT AS n FROM tx WHERE nature IS NOT NULL
     GROUP BY 1 HAVING count(*) >= 100 ORDER BY n DESC`,
  );
  return Response.json(rows);
}
