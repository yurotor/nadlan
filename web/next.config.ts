import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
  // The tracer can't see either of these: the database is opened by path at runtime, and duckdb.node loads
  // libduckdb.so from its own folder. Include both in every server bundle (Vercel runs linux-x64).
  outputFileTracingIncludes: { "/**": ["./data/site.duckdb", "./data/demo.duckdb", "./node_modules/@duckdb/node-bindings-linux-x64/*"] },
};

export default nextConfig;
