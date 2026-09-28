import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";

// Deployments ship a copy in web/data/ (see scripts/sync-db.sh); local dev reads the pipeline's output directly.
const BUNDLED = path.resolve(process.cwd(), "data/site.duckdb");
const DB_PATH = process.env.NADLAN_DB ?? (fs.existsSync(BUNDLED) ? BUNDLED : path.resolve(process.cwd(), "../data/site.duckdb"));

const g = globalThis as unknown as { __nadlanDb?: Promise<DuckDBInstance> };

function instance() {
  g.__nadlanDb ??= DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY", threads: "4" });
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
