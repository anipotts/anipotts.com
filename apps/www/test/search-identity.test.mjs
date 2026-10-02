import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Run after the www build; verify emitted markup rather than source spelling.
const html = readFileSync(
  new URL("../.local/public-rendered/index.html", import.meta.url),
  "utf8",
);
const structured = [
  ...html.matchAll(
    /<script\b[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs,
  ),
].map((match) => JSON.parse(match[1]));
const profiles = [
  "https://github.com/anipotts",
  "https://www.linkedin.com/in/anipotts",
  "https://x.com/anipottsbuilds",
  "https://www.instagram.com/anipottsbuilds/",
  "https://www.tiktok.com/@anipottsbuilds",
  "https://www.youtube.com/@anipottsbuilds",
];

test("one homepage Person connects the profile and website authorship", () => {
  assert.equal(
    structured.filter((item) => item["@type"] === "ProfilePage").length,
    1,
  );
  const profile = structured.find((item) => item["@type"] === "ProfilePage");
  const website = structured.find((item) => item["@type"] === "WebSite");
  assert.equal(profile.mainEntity["@id"], "https://anipotts.com/#person");
  assert.equal(profile.mainEntity.name, "Ani Potts");
  assert.deepEqual(profile.mainEntity.alternateName, [
    "anipotts",
    "anipottsbuilds",
  ]);
  assert.equal(website.author["@id"], profile.mainEntity["@id"]);
  assert.equal(profile.isPartOf["@id"], website["@id"]);
});

test("sameAs contains only established public identity profiles", () => {
  const person = structured.find(
    (item) => item["@type"] === "ProfilePage",
  ).mainEntity;
  assert.deepEqual(person.sameAs, profiles);
  // Explicitly prevent private or unverified identity enrichment.
  assert.deepEqual(
    Object.keys(person).sort(),
    [
      "@id",
      "@type",
      "alternateName",
      "jobTitle",
      "name",
      "sameAs",
      "url",
    ].sort(),
  );
});

test("selected profiles have accessible footer links and the current contact address", () => {
  const footer = html.match(/<footer\b[^>]*>.*?<\/footer>/s)?.[0];
  assert.ok(footer, "footer is rendered");
  const anchors = [...footer.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
  for (const href of profiles.filter(
    (href) => href !== "https://www.youtube.com/@anipottsbuilds",
  )) {
    const matches = anchors.filter((anchor) =>
      anchor.includes(`href="${href}"`),
    );
    assert.equal(matches.length, 1, href);
    assert.match(matches[0], /aria-label="[^"]+"/);
    assert.match(matches[0], /title="[^"]+"/);
    assert.match(matches[0], /target="_blank"/);
    assert.match(matches[0], /rel="noopener noreferrer"/);
  }
  assert.ok(
    anchors.some((anchor) =>
      anchor.includes('href="mailto:hello@anipotts.com"'),
    ),
  );
  assert.doesNotMatch(
    footer,
    /youtube\.com|news\.anipotts\.com|contact@anipotts\.com/,
  );
  assert.match(footer, /href="\/feed\.xml"/);
});

test("homepage canonical and ordinary crawl destination remain HTTPS apex", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/anipotts\.com"/);
  const robots = readFileSync(
    new URL("../dist/client/robots.txt", import.meta.url),
    "utf8",
  );
  assert.equal(
    robots,
    "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://anipotts.com/sitemap.xml\n",
  );
});

test("homepage keeps reporting attribution in its dedicated card", () => {
  const intro = html.match(/<p class="hero-summary[^>]*>(.*?)<\/p>/s)?.[1];
  assert.ok(intro);
  assert.doesNotMatch(intro, /business insider|business-insider/i);
  assert.match(html, /read my feature in a story about coding agent limits/);
  assert.match(html, /src="\/images\/brand\/business-insider-wordmark\.svg"/);
});

// Identity must be visible in search results as well as structured data.
test("homepage uses the exact name and separates original reporting from its essay", () => {
  assert.match(
    html,
    /<title>Ani Potts \| Software Engineer Building AI Systems<\/title>/,
  );
  assert.match(html, /name="description" content="Ani Potts builds AI agents/);
  assert.match(html, /hi, i(?:&#39;|')m ani potts!/);
  const press = html.match(
    /<aside class="press-mention[^>]*>(.*?)<\/aside>/s,
  )?.[1];
  assert.ok(press, "press coverage is rendered");
  const links = [
    ...press.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs),
  ];
  assert.equal(
    links.length,
    2,
    "reporting and personal essay remain distinct actions",
  );
  const reporting = links.find((link) => link[2].includes("read the story"));
  const essay = links.find((link) => link[2].includes("my essay"));
  assert.ok(reporting, "original reporting action is rendered");
  assert.ok(essay, "personal essay action is rendered");
  assert.equal(
    reporting[1],
    "https://www.businessinsider.com/ai-usage-limits-causing-some-to-restructure-their-workday-2026-4",
  );
  assert.match(
    reporting[2],
    /src="\/images\/brand\/business-insider-favicon\.svg"/,
  );
  assert.equal(essay[1], "/writing/saturdays-are-for-claude-code");
  assert.match(essay[2], /src="\/brand\/ap-favicon\.svg"/);
  const article = readFileSync(
    new URL(
      "../.local/public-rendered/writing/saturdays-are-for-claude-code.html",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(article, /href="\/" rel="author"[^>]*>ani potts<\/a>/);
});
