import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@bucket-command/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@bucket-command/storage": fileURLToPath(new URL("./packages/storage/src/index.ts", import.meta.url))
    }
  }
});
