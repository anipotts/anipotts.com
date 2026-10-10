import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse, stringify } from "yaml";
import { collectGitSeed } from "../../../scripts/content/content-d1-seed.mjs";
import { contentDatabase, contentEnv } from "./content-database.mjs";
import { serve } from "./worker-runtime.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const seeds = (await collectGitSeed(root)).records;
function database() {
  const db = contentDatabase();
  for (const row of seeds)
    db.publish({ kind: row.record.kind, id: row.record.id, text: row.source });
  return db;
}
const home = seeds.find(
  (row) => row.record.kind === "page" && row.record.id === "home",
).source;
const front = home.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
function override(settings) {
  return `---\n${stringify({ ...parse(front[1]), site_settings: settings })}---\n${home.slice(front[0].length)}`;
}

test("one reviewed home publication changes shared shell and feed without changing other records", async () => {
  const db = database();
  db.publish({
    kind: "page",
    id: "home",
    text: override({
      navigation: { work: "Synthetic projects" },
      footer: {
        prompt: "Synthetic contact",
        profiles: {
          github: {
            label: "Synthetic code",
            href: "https://github.com/example",
          },
        },
        admin_label: "Synthetic workspace",
      },
      seo: {
        homepage_title: "Synthetic homepage title",
        description: "Synthetic search description",
        title_suffix: "Synthetic site",
        feed_description: "Synthetic feed description",
      },
    }),
  });
  for (const path of ["/", "/work", "/writing/awareness-is-alpha"]) {
    const response = await serve(path, contentEnv(db));
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, /Synthetic projects/);
    assert.match(html, /Synthetic contact/);
    assert.match(html, /href="https:\/\/github.com\/example"/);
    assert.match(html, /aria-label="Synthetic code"/);
    assert.match(html, /href="\/admin"[^>]*aria-label="Synthetic workspace"/);
    assert.match(
      html,
      path === "/"
        ? /<title>Synthetic homepage title<\/title>/
        : /<title>[^<]+ \/ Synthetic site<\/title>/,
    );
    if (path === "/")
      assert.match(
        html,
        /name="description" content="Synthetic search description"/,
      );
  }
  const feed = await serve("/feed.xml", contentEnv(db));
  assert.equal(feed.status, 200);
  assert.match(await feed.text(), /Synthetic feed description/);
});

test("publishing home without overrides restores the existing shared defaults", async () => {
  const db = database();
  db.publish({
    kind: "page",
    id: "home",
    text: override({ navigation: { work: "Synthetic projects" } }),
  });
  db.publish({ kind: "page", id: "home", text: home });
  const response = await serve("/work", contentEnv(db));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /Synthetic projects/);
  assert.match(html, /have a question\?/);
  assert.match(html, /href="https:\/\/github.com\/anipotts"/);
  assert.match(html, / \/ ani potts<\/title>/);
});
