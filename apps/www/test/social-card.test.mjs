import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  CARD_PADDING,
  cardInkBounds,
  renderCard,
} from "../src/lib/social-card/card.mjs";
const name = "ani potts";
test("canonical card is a compact 1200 by 630 PNG", () => {
  const png = renderCard({ name });
  assert.equal(png.readUInt32BE(16), CARD_WIDTH);
  assert.equal(png.readUInt32BE(20), CARD_HEIGHT);
  assert.ok(png.length < 150 * 1024);
});
test("opposite corners have equal optical padding", () => {
  const bounds = cardInkBounds({ name });
  assert.equal(bounds.left, CARD_PADDING);
  assert.equal(bounds.top, CARD_PADDING);
  assert.equal(bounds.right, CARD_WIDTH - CARD_PADDING);
  assert.equal(bounds.bottom, CARD_HEIGHT - CARD_PADDING);
});
test("titles and route seeds cannot change the canonical artwork", () => {
  assert.deepEqual(
    renderCard({ name, title: "first", seed: "first" }),
    renderCard({ name, title: "second", seed: "second" }),
  );
});
test("the shared shell always selects the canonical card", () => {
  const shell = readFileSync(
    new URL("../src/layouts/Shell.astro", import.meta.url),
    "utf8",
  );
  assert.ok(shell.includes("cardPath(SITE_CARD)"));
});
