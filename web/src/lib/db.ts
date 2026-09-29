import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";

// Deployments ship a copy in web/data/ (scripts/sync-db.sh stages it, prebuild joins it); local dev reads the pipeline's output directly.
const BUNDLED = path.resolve(process.cwd(), "data/site.duckdb");
const DB_PATH = process.env.NADLAN_DB ?? (fs.existsSync(BUNDLED) ? BUNDLED : path.resolve(process.cwd(), "../data/site.duckdb"));

// Demo data: a one-time Yad2 for-sale snapshot (pipeline/build_demo.py). Deploys ship a copy in web/data/
// (scripts/sync-db.sh); without the file the for-sale snapshot layer is simply absent.
const DEMO_BUNDLED = path.resolve(process.cwd(), "data/demo.duckdb");
const DEMO_PATH = process.env.NADLAN_DEMO_DB
  ?? (fs.existsSync(DEMO_BUNDLED) ? DEMO_BUNDLED : path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../data/demo.duckdb"));
export const hasDemo = fs.existsSync(/*turbopackIgnore: true*/ DEMO_PATH);

const g = globalThis as unknown as { __nadlanDb?: Promise<DuckDBInstance> };

function instance() {
  g.__nadlanDb ??= DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY", threads: "4" }).then(async (db) => {
    if (hasDemo) {
      const conn = await db.connect();
      await conn.run(`ATTACH '${DEMO_PATH.replaceAll("'", "''")}' AS demo (READ_ONLY)`);
      conn.closeSync();
    }
    return db;
  });
  return g.__nadlanDb;
}

export type Params = Record<string, DuckDBValue>;

/** Run a query and return plain JSON rows. Cast counts to INT/DOUBLE in SQL: BIGINTs come back as strings. */
export async function q<T = Record<string, unknown>>(sql: string, params: Params = {}): Promise<T[]> {
  const conn = await (await instance()).connect();
  try {
    // DuckDB rejects named params the statement doesn't use, so pass only the referenced ones.
    const used = new Set([...sql.matchAll(/\$([a-zA-Z_]\w*)/g)].map((m) => m[1]));
    const p = Object.fromEntries(Object.entries(params).filter(([k]) => used.has(k)));
    const reader = await conn.runAndReadAll(sql, p);
    return reader.getRowObjectsJson() as T[];
  } finally {
    conn.closeSync();
  }
}

export async function q1<T = Record<string, unknown>>(sql: string, params: Params = {}): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

const memo = new Map<string, Promise<unknown[]>>();

/** Like q(), but remembers the result for the life of the server. The data file is read-only. */
export function qc<T = Record<string, unknown>>(sql: string, params: Params = {}): Promise<T[]> {
  const key = sql + JSON.stringify(params);
  if (!memo.has(key)) {
    const p = q<T>(sql, params);
    p.catch(() => memo.delete(key));
    memo.set(key, p);
  }
  return memo.get(key) as Promise<T[]>;
}

export async function q1c<T = Record<string, unknown>>(sql: string, params: Params = {}): Promise<T | undefined> {
  return (await qc<T>(sql, params))[0];
}
