import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: every API route reads SQLite at request time, and the
  // contract requires `export const runtime = 'nodejs'`, which Cache Components forbids.
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
