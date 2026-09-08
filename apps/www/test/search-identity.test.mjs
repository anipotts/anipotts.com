import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Run after the www build; verify emitted markup rather than source spelling.
const html = readFileSync(
  new URL("../dist/index.html", import.meta.url),
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
  for (const href of profiles.filter((href) => !href.includes("youtube.com"))) {
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
    new URL("../dist/robots.txt", import.meta.url),
    "utf8",
  );
  assert.equal(
    robots,
    "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://anipotts.com/sitemap.xml\n",
  );
});
