import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL("./src/preload/preload.ts", import.meta.url)),
      formats: ["cjs"],
      fileName: () => "preload.cjs"
    },
    outDir: fileURLToPath(new URL("./dist/preload", import.meta.url)),
    rollupOptions: {
      external: ["electron"]
    }
  }
});
