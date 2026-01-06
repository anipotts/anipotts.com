import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "components/window/index": "src/components/window/index.ts",
    "components/animation/index": "src/components/animation/index.ts",
    "components/layout/index": "src/components/layout/index.ts",
    "components/feedback/index": "src/components/feedback/index.ts",
    "context/index": "src/context/index.ts",
    "hooks/index": "src/hooks/index.ts",
    "providers/index": "src/providers/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "next"],
  banner: {
    js: '"use client";',
  },
});
