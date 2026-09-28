import "server-only";
import { qc, q1c } from "./db";

export const SPARK_YEARS = Array.from({ length: 15 }, (_, i) => 2011 + i); // 2011–2025, complete years

export type CityRow = {
  code: number; name_he: string; name_en: string | null; district: string | null;
  n_all: number; n_12m: number; med_price_12m: number | null; med_ppsqm_12m: number | null;
  med_ppsqm_5y_ago: number | null; spark: (number | null)[];
};

export async function cityRankings(): Promise<CityRow[]> {
  const [rows, spark] = await Promise.all([
    qc<Omit<CityRow, "spark">>(
      `SELECT code, name_he, name_en, district, n_all::INT AS n_all, n_12m::INT AS n_12m,
              med_price_12m, med_ppsqm_12m, med_ppsqm_5y_ago
       FROM localities WHERE n_clean >= 50 ORDER BY n_12m DESC`,
    ),
    qc<{ loc: number; y: number; p: number }>(
      `SELECT loc, year(date)::INT AS y, median(ppsqm)::INT AS p FROM tx
       WHERE clean AND year(date) BETWEEN ${SPARK_YEARS[0]} AND ${SPARK_YEARS.at(-1)}
       GROUP BY ALL HAVING count(*) >= 8`,
    ),
  ]);
  const by = new Map<number, Map<number, number>>();
  for (const r of spark) {
    if (!by.has(r.loc)) by.set(r.loc, new Map());
    by.get(r.loc)!.set(r.y, r.p);
  }
  return rows.map((r) => ({ ...r, spark: SPARK_YEARS.map((y) => by.get(r.code)?.get(y) ?? null) }));
}

export async function lastDate() {
  return (await q1c<{ d: string }>(`SELECT max(date)::VARCHAR AS d FROM tx`))!.d;
}
