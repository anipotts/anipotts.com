import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { builtPages, startTags } from "./built-html.mjs";
import { DETAIL_VIEWBOX, detailCurves } from "../src/lib/wave-geometry.ts";

// Hooks the writing card choreography selects in the built pages. A markup
// change that drops one silently turns the motion into a plain swap.
const pages = builtPages();
const articles = pages.filter((page) =>
  /^\/writing\/[^/]+\.html$/.test(page.path),
);
const has = (tag, name) =>
  (tag.attributes.class || "").split(/\s+/).includes(name);

test("the listing has one writing card per article, each with one current", () => {
  const listing = pages.find((page) => page.path === "/writing.html");
  assert.ok(listing, "writing listing is built");
  assert.ok(articles.length > 0, "writing articles are built");
  const html = listing.html;
  const cards = [
    ...html.matchAll(/<a\b[^>]*class="[^"]*\bwriting-card\b[^"]*"/g),
  ];
  assert.equal(cards.length, articles.length);
  const hrefs = startTags(html)
    .filter((tag) => tag.name === "a" && has(tag, "writing-card"))
    .map((tag) => tag.attributes.href)
    .sort();
  assert.deepEqual(
    hrefs,
    articles.map((page) => page.path.replace(/\.html$/, "")).sort(),
  );
  // Each card body runs from its opening tag to the next card or list end.
  const bodies = html.split(/<a\b[^>]*class="[^"]*\bwriting-card\b/).slice(1);
  for (const body of bodies) {
    const card = body.slice(0, body.indexOf("</a>"));
    assert.equal(card.match(/data-shared-current/g)?.length, 1);
    for (const hook of ['class="title"', 'class="sub"', "<time"])
      assert.ok(card.includes(hook), `card carries ${hook}`);
  }
});

test("every article has the hooks the runner selects", () => {
  for (const page of articles) {
    const tags = startTags(page.html);
    const hooks = tags.filter(
      (tag) => "data-writing-article" in tag.attributes,
    );
    assert.equal(hooks.length, 1, `${page.path} article hook`);
    assert.equal(
      tags.filter((tag) => has(tag, "detail-waves")).length,
      1,
      `${page.path} header waves`,
    );
    const article = page.html.slice(page.html.indexOf("data-writing-article"));
    const header = article.slice(0, article.indexOf("</header>"));
    assert.equal(header.match(/<h1\b/g)?.length, 1, `${page.path} h1`);
    assert.equal(
      header.match(/class="summary"/g)?.length,
      1,
      `${page.path} summary`,
    );
    assert.equal(header.match(/<time\b/g)?.length, 1, `${page.path} time`);
    assert.ok(header.includes("back"), `${page.path} back link`);
    assert.ok(article.includes('class="article-body"'), `${page.path} body`);
  }
});

test("header waves are the seeded curves the idle warm-up flattens", () => {
  for (const page of articles) {
    const slug = page.path.slice("/writing/".length, -".html".length);
    const block = page.html.match(
      /class="detail-waves[^"]*"[^>]*>\s*<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/svg>/,
    );
    assert.ok(block, `${page.path} waves`);
    const [x, y, width, height] = block[1].split(/[\s,]+/).map(Number);
    assert.deepEqual({ x, y, width, height }, DETAIL_VIEWBOX);
    const built = [...block[2].matchAll(/\sd="([^"]+)"/g)].map(([, d]) => d);
    assert.deepEqual(built, detailCurves(`writing/${slug}`).toReversed());
  }
});

test("the transition scripts use getPointAtLength only as the arc fallback", () => {
  const read = (name) =>
    readFileSync(new URL(`../src/scripts/${name}`, import.meta.url), "utf8");
  assert.ok(!read("writing-transitions.ts").includes("getPointAtLength"));
  const ghost = read("writing-ghost.ts");
  const uses = ghost.match(/getPointAtLength/g) || [];
  assert.equal(uses.length, 1);
  const fallback = ghost.slice(ghost.indexOf("export function contourOf"));
  const body = fallback.slice(0, fallback.indexOf("\n}\n"));
  assert.ok(body.includes("getPointAtLength"));
  assert.ok(
    body.indexOf("if (contour) return contour") <
      body.indexOf("getPointAtLength"),
  );
});

test("built styles acknowledge a pending card in both themes and drop the pointer focus ring", () => {
  const dir = new URL("../dist/client/_astro/", import.meta.url);
  const css = readdirSync(dir)
    .filter((name) => name.endsWith(".css"))
    .map((name) => readFileSync(new URL(name, dir), "utf8"))
    .join("\n");
  // The minifier may merge rules that share declarations into one selector
  // list, so a selector matches as any complete member of that list.
  const rule = (selector) =>
    css.match(
      new RegExp(
        `(?:^|[{},])(?:[^{},]+,)*${selector}(?:,[^{},]+)*\\{([^}]*)\\}`,
      ),
    )?.[1] ?? null;
  const pending = "a\\.writing-card\\[data-writing-pending\\] \\.affordance";
  assert.match(rule(pending) ?? "", /color:var\(--flow-3\)/);
  assert.match(
    rule(`html\\[data-theme=(?:"dark"|dark)\\] ${pending}`) ?? "",
    /color:var\(--flow-1\)/,
  );
  // Keyed on the marker a tap or a click sets, never on the tabindex the
  // heading always carries: keyed on the tabindex the rule also hid the ring
  // after a keyboard open, leaving a keyboard visitor no sign focus moved.
  assert.match(
    rule(
      "\\[data-writing-article\\]>header h1\\[data-pointer-focus\\]:focus",
    ) ?? "",
    /outline:none/,
  );
  assert.equal(
    rule(
      '\\[data-writing-article\\]>header h1\\[tabindex=(?:"-1"|\\\\-1)\\]:focus',
    ),
    null,
  );
});

test("the incoming page is inert from before the swap until the motion releases it", () => {
  const script = readFileSync(
    new URL("../src/scripts/writing-transitions.ts", import.meta.url),
    "utf8",
  );
  const swap = script.slice(script.indexOf('"astro:before-swap"'));
  assert.ok(
    swap.indexOf('setAttribute("inert", "")') < swap.indexOf("motion(event"),
  );
  const release = script.slice(script.indexOf("const release = () =>"));
  assert.ok(release.slice(0, 200).includes("main.inert = false"));
  assert.ok(script.includes("void settled.then(release)"));
});
