import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
  // The database is opened by path at runtime, so the tracer can't see it; include it in every server bundle.
  outputFileTracingIncludes: { "/**": ["./data/site.duckdb"] },
};

export default nextConfig;
