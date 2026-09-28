import { NextRequest } from "next/server";
import { q } from "@/lib/db";
import { buildWhere, csv } from "@/lib/filters";

/**
 * Time series per locality (or all of Israel when loc is empty).
 * grain=month|quarter|year. Returns count, median price, median ₪/m², and new-build share
 * (dwelling finished in the sale year or the year before) for every period.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const grain = ["month", "quarter", "year"].includes(sp.get("grain") ?? "") ? sp.get("grain")! : "quarter";
  const locs = csv(sp.get("loc")).map(Number).filter(Number.isFinite).slice(0, 6);
  const where = buildWhere(sp, { skip: ["loc"] });
  const series = locs.length ? locs : [null];

  const out = await Promise.all(
    series.map(async (loc) => {
      const cond = loc == null ? "" : ` AND loc = ${loc}`;
      const rows = await q(
        `SELECT strftime(date_trunc('${grain}', date), '%Y-%m-%d') AS t, count(*)::INT AS n,
                median(price)::INT AS price, median(ppsqm)::INT AS ppsqm,
                avg(CASE WHEN year_built >= year(date) - 1 THEN 1.0 WHEN year_built IS NOT NULL THEN 0.0 END) AS new_share
         FROM tx WHERE ${where.sql}${cond} GROUP BY 1 ORDER BY 1`,
        where.params,
      );
      return { loc, points: rows };
    }),
  );
  const last = await q<{ d: string }>(`SELECT max(date)::VARCHAR AS d FROM tx`);
  return Response.json({ grain, series: out, lastDate: last[0].d });
}
