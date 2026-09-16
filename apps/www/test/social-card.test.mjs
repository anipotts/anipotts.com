import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  SAFE_LEFT,
  SAFE_RIGHT,
  cardInkBounds,
  renderCard,
} from "../src/lib/social-card/card.mjs";

const NAME = "ani potts";
const LONGEST = "i built a monitor for my claude code sessions";
const BUDGET = 150 * 1024;

function header(png) {
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "not a PNG",
  );
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test("the site card is a 1200 by 630 PNG inside the unfurl budget", () => {
  const png = renderCard({ name: NAME, seed: "site" });
  assert.deepEqual(header(png), { width: CARD_WIDTH, height: CARD_HEIGHT });
  assert.ok(png.length < BUDGET, `site card is ${png.length} bytes`);
});

test("an essay card is a 1200 by 630 PNG inside the unfurl budget", () => {
  const png = renderCard({ title: LONGEST, name: NAME, seed: "monitor" });
  assert.deepEqual(header(png), { width: CARD_WIDTH, height: CARD_HEIGHT });
  assert.ok(png.length < BUDGET, `essay card is ${png.length} bytes`);
});

test("every card keeps its type inside the square safe area", () => {
  for (const title of [null, LONGEST, "awareness is really alpha"]) {
    const ink = cardInkBounds({ title, name: NAME });
    assert.ok(ink.left >= SAFE_LEFT, `${title}: ink starts at ${ink.left}`);
    assert.ok(ink.right <= SAFE_RIGHT, `${title}: ink ends at ${ink.right}`);
    assert.ok(ink.top >= 0 && ink.bottom <= CARD_HEIGHT, `${title}: off card`);
  }
});

// A title no line break can help, and one far longer than anything published,
// still has to land on the card: the painter breaks the word and keeps
// shrinking rather than letting ink run off the canvas.
test("an unbreakable word and an overlong title stay on the card", () => {
  const cases = [
    "https://anipotts.com/writing/an-extremely-long-unbroken-slug-name",
    `a title that is quite a lot longer than any essay currently published on
     the site today and it keeps going for another clause and then one more`,
  ];
  for (const title of cases) {
    const ink = cardInkBounds({ title, name: NAME });
    assert.ok(ink.left >= SAFE_LEFT, `${title}: ink starts at ${ink.left}`);
    assert.ok(ink.right <= SAFE_RIGHT, `${title}: ink ends at ${ink.right}`);
    assert.ok(ink.top >= 0 && ink.bottom <= CARD_HEIGHT, `${title}: off card`);
    const png = renderCard({ title, name: NAME, seed: "long" });
    assert.deepEqual(header(png), { width: CARD_WIDTH, height: CARD_HEIGHT });
    assert.ok(png.length < BUDGET, `${title}: ${png.length} bytes`);
  }
});

// The titles Ani has actually written, drafts included, so a new one that
// would break the card fails here before it can ship.
test("every writing title in the repo paints inside the safe area", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const writing = join(here, "..", "..", "..", "content", "public", "writing");
  const titles = readdirSync(writing)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const line = readFileSync(join(writing, file), "utf8").match(
        /^title:\s*(.+)$/m,
      );
      assert.ok(line, `${file} has no title`);
      return line[1].trim().replace(/^"(.*)"$/, "$1");
    });
  assert.ok(titles.length >= 5, `found ${titles.length} writing titles`);
  for (const title of titles) {
    const ink = cardInkBounds({ title, name: NAME });
    assert.ok(ink.left >= SAFE_LEFT, `${title}: ink starts at ${ink.left}`);
    assert.ok(ink.right <= SAFE_RIGHT, `${title}: ink ends at ${ink.right}`);
    assert.ok(ink.top >= 0 && ink.bottom <= CARD_HEIGHT, `${title}: off card`);
  }
});

test("each title paints a different card", () => {
  const first = renderCard({ title: LONGEST, name: NAME, seed: "a" });
  const second = renderCard({
    title: "awareness is really alpha",
    name: NAME,
    seed: "b",
  });
  assert.notEqual(first.toString("base64"), second.toString("base64"));
});

test("the same title and seed paint the same bytes twice", () => {
  const once = renderCard({ title: LONGEST, name: NAME, seed: "monitor" });
  const twice = renderCard({ title: LONGEST, name: NAME, seed: "monitor" });
  assert.equal(once.toString("base64"), twice.toString("base64"));
});
