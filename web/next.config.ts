import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No dev-tools badge: it sits on the page during the live demo and in review screenshots.
  devIndicators: false,
  // The demo is served by `next dev` through a Cloudflare quick tunnel; without this the
  // browser gets the HTML but Next blocks its scripts, so pages never come alive.
  allowedDevOrigins: ["*.trycloudflare.com"],
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
