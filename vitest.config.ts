import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}", "db/**/*.test.{ts,tsx}"],
    exclude: ["apps/clinical/**", "node_modules/**", "dist/**"],
    environment: "node",
    coverage: {
      reporter: ["text", "html"],
      include: ["apps/**/*.ts", "packages/**/*.ts"],
    },
  },
});
