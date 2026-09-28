import { q } from "@/lib/db";

export const dynamic = "force-static";

export async function GET() {
  const rows = await q(
    `SELECT code, name_he, name_en, n_all::INT AS n, lat, lon FROM localities WHERE name_he IS NOT NULL ORDER BY n_all DESC`,
  );
  return Response.json(rows);
}
