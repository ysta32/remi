import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: every API route reads SQLite at request time, and the
  // contract requires `export const runtime = 'nodejs'`, which Cache Components forbids.
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    // The repo root has its own bun.lock (Chert CLI); web/ is the app root.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
