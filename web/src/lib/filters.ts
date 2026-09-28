import type { Params } from "./db";
import { APARTMENT_NATURES, HOUSE_NATURES } from "./natures";

/**
 * Filters shared by every data endpoint, read from URL search params:
 *   loc=5000,3000   locality codes         kind=homes|residential|all (default homes)
 *   type=apartment|house                    nature=<hebrew>,<hebrew>   exact deal natures
 *   from, to=YYYY-MM-DD                     rmin, rmax = rooms          amin, amax = m²
 *   exact=1  only deals located on their own parcel
 *
 * "homes" = clean single-dwelling sales with a trustworthy price (is_clean_unit).
 */
export type Where = { sql: string; params: Params };

export function buildWhere(sp: URLSearchParams, opts: { skip?: string[] } = {}): Where {
  const parts: string[] = [];
  const params: Params = {};
  const skip = new Set(opts.skip ?? []);
  let i = 0;
  const list = (col: string, values: (string | number)[]) => {
    const names = values.map((v) => {
      const k = `p${i++}`;
      params[k] = v;
      return `$${k}`;
    });
    parts.push(`${col} IN (${names.join(",")})`);
  };
  const cmp = (expr: string, op: string, v: string | number) => {
    const k = `p${i++}`;
    params[k] = v;
    parts.push(`${expr} ${op} $${k}`);
  };

  const locs = csv(sp.get("loc")).map(Number).filter(Number.isFinite);
  if (locs.length && !skip.has("loc")) list("loc", locs);

  const kind = sp.get("kind") ?? "homes";
  if (kind === "homes") parts.push("clean");
  else if (kind === "residential") parts.push("category = 'residential'");

  const type = sp.get("type");
  if (type === "apartment") list("nature", APARTMENT_NATURES);
  else if (type === "house") list("nature", HOUSE_NATURES);

  const natures = csv(sp.get("nature"));
  if (natures.length) list("nature", natures);

  const date = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.get("from");
  const to = sp.get("to");
  if (from && date.test(from)) cmp("date", ">=", from);
  if (to && date.test(to)) cmp("date", "<=", to);

  num(sp.get("rmin"), (v) => cmp("rooms", ">=", v));
  num(sp.get("rmax"), (v) => cmp("rooms", "<=", v));
  num(sp.get("amin"), (v) => cmp("area", ">=", v));
  num(sp.get("amax"), (v) => cmp("area", "<=", v));
  num(sp.get("pmin"), (v) => cmp("price", ">=", v));
  num(sp.get("pmax"), (v) => cmp("price", "<=", v));

  if (sp.get("exact") === "1") parts.push("exact_loc");

  // DATE params arrive as strings; cast them so zone maps on the sorted date column prune.
  const sql = (parts.length ? parts.join(" AND ") : "TRUE").replace(/date ([<>]=) (\$p\d+)/g, "date $1 CAST($2 AS DATE)");
  return { sql, params };
}

export function csv(s: string | null): string[] {
  return s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];
}

function num(s: string | null, f: (v: number) => void) {
  if (s == null || s === "") return;
  const v = Number(s);
  if (Number.isFinite(v)) f(v);
}
