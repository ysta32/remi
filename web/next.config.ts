import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: every API route reads SQLite at request time, and the
  // contract requires `export const runtime = 'nodejs'`, which Cache Components forbids.
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    // Repo root, so lib/api.ts can import ../fixtures/demo/*.json (D builds against fixtures).
    root: path.join(__dirname, ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
