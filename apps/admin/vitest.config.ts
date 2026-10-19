import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite 8 transforms with Oxc; component tests use the automatic JSX runtime.
  oxc: { jsx: { runtime: "automatic" } },
  // Tests opt in per case with vi.stubGlobal, matching a local owner build.
  define: { __LOCAL_OWNER_BUILD__: "false" },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/support/browser-environment.ts"],
    // Hundreds of DOM suites share a host with the durable review previews.
    // Bound memory/CPU contention while preserving the default timeout limits.
    maxWorkers: 2,
  },
});
