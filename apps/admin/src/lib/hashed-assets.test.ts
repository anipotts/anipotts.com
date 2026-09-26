import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { HASHED_ASSET_CACHE } from "./hashed-assets";

// @astrojs/cloudflare writes a public `/_astro/*` Cache-Control into the
// emitted _headers unless one is already set. Admin sets its own private one,
// the same policy src/worker.ts applies.
it("the assets service _headers carries the private hashed-asset policy", () => {
  expect(
    readFileSync(new URL("../../public/_headers", import.meta.url), "utf8"),
  ).toBe(`/_astro/*\n  Cache-Control: ${HASHED_ASSET_CACHE}\n`);
});
