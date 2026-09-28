import { NextRequest } from "next/server";
import { q } from "@/lib/db";
import { buildWhere } from "@/lib/filters";

const SORTS: Record<string, string> = {
  date: "date", price: "price", ppsqm: "ppsqm", area: "area", rooms: "rooms", city: "l.name_he", year_built: "year_built",
};
const COLS = `tx.id, date::VARCHAR AS date, loc, l.name_he, l.name_en, nature, cls, clean, price, declared::DOUBLE AS declared, portion,
  area, rooms, year_built, ppsqm, street, house, address_source, exact_loc, tx.lat, tx.lon, gush, helka, sub_parcels`;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const where = buildWhere(sp);
  const sort = SORTS[sp.get("sort") ?? "date"] ?? "date";
  const dir = sp.get("dir") === "asc" ? "ASC" : "DESC";
  const order = `ORDER BY ${sort} ${dir} NULLS LAST, tx.id DESC`;
  const from = `FROM tx LEFT JOIN localities l ON l.code = tx.loc WHERE ${where.sql}`;

  if (sp.get("format") === "csv") {
    const rows = await q<Record<string, unknown>>(`SELECT ${COLS} ${from} ${order} LIMIT 100000`, where.params);
    const head = Object.keys(rows[0] ?? { id: 0 });
    const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const body = "﻿" + [head.join(","), ...rows.map((r) => head.map((h) => esc(r[h])).join(","))].join("\n");
    return new Response(body, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="nadlan-deals.csv"' },
    });
  }

  const size = Math.min(200, Math.max(10, Number(sp.get("size") ?? 50)));
  const page = Math.max(0, Number(sp.get("page") ?? 0));
  const [rows, agg] = await Promise.all([
    q(`SELECT ${COLS} ${from} ${order} LIMIT ${size} OFFSET ${page * size}`, where.params),
    q<{ total: number; med_price: number; med_ppsqm: number }>(
      `SELECT count(*)::INT AS total, median(price) AS med_price, median(ppsqm) AS med_ppsqm ${from}`,
      where.params,
    ),
  ]);
  return Response.json({ rows, ...agg[0], page, size });
}
