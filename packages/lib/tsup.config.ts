import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "admin-control/index": "src/admin-control/index.ts",
    "admin-control/dev-fixtures": "src/admin-control/dev-fixtures.ts",
  },
  format: ["esm"],
  clean: true,
  dts: true,
  splitting: true,
  sourcemap: false,
});
