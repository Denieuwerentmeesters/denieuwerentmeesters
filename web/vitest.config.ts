import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // Zelfde alias als tsconfig: "@/..." wijst naar de web-map.
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
