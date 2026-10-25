import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    // Tests share a process-wide DB singleton; run files sequentially.
    fileParallelism: false,
  },
});
