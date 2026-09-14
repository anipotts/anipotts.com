import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests opt in per case with vi.stubGlobal, matching a local owner build.
  define: { __LOCAL_OWNER_BUILD__: "false" },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
