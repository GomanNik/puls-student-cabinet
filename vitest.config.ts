import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)) } },
  test: { coverage: {
    provider: "v8",
    include: ["src/**/*.{ts,tsx}", "scripts/**/*.{ts,mjs}", "prisma/**/*.ts"],
    exclude: ["src/generated/**", "**/*.d.ts", "scripts/generate-test-matrix.mjs"],
    reporter: ["text-summary", "json-summary", "html"],
    reportsDirectory: "coverage/vitest",
  }, projects: [
    { extends: true, test: { name: "unit", environment: "node", include: ["tests/unit/**/*.test.ts"] } },
    { extends: true, test: { name: "integration", environment: "node", include: ["tests/integration/**/*.test.ts"], fileParallelism: false, testTimeout: 20000, hookTimeout: 30000 } },
  ] },
});
