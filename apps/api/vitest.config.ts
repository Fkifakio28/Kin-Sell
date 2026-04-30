import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globals: true,
    setupFiles: ["src/__tests__/setup.ts"],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/modules/**/*.ts", "src/shared/**/*.ts"],
      exclude: ["src/__tests__/**"],
    },
  },
});
