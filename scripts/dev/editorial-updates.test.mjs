import assert from "node:assert/strict";
import { test } from "node:test";
import { editorialUpdates, parseContentHistory } from "./editorial-updates.mjs";

test("Git history keeps the most recent content update, never unrelated code dates", () => {
  const result = parseContentHistory(`updated:2026-09-08T15:00:00Z

content/public/pages/systems.md
apps/admin/src/pages/index.astro
content/editorial/newsletter/example.md
updated:2026-07-01T15:00:00Z
content/public/pages/systems.md
content/public/writing/example.md
`);
  assert.deepEqual(result, {
    "content/public/pages/systems.md": {
      at: "2026-09-08T15:00:00Z",
      source: "git",
    },
    "content/editorial/newsletter/example.md": {
      at: "2026-09-08T15:00:00Z",
      source: "git",
    },
    "content/public/writing/example.md": {
      at: "2026-07-01T15:00:00Z",
      source: "git",
    },
  });
});

test("missing history stays unknown rather than inventing update dates", () => {
  assert.deepEqual(parseContentHistory(""), {});
  assert.deepEqual(parseContentHistory("content/public/pages/home.md"), {});
});

test("a canonical content edit invalidates cached update metadata", () => {
  const plugin = editorialUpdates();
  const metadata = { id: "metadata" };
  const content = { id: "content" };
  const invalidated = [];
  const context = {
    file: "/repo/content/editorial/newsletter/example.md",
    modules: [content],
    server: {
      moduleGraph: {
        getModuleById: (id) =>
          id === "\0virtual:editorial-updates" ? metadata : null,
        invalidateModule: (module) => invalidated.push(module),
      },
    },
  };
  assert.deepEqual(plugin.handleHotUpdate(context), [content, metadata]);
  assert.deepEqual(invalidated, [metadata]);
  assert.equal(
    plugin.handleHotUpdate({ ...context, file: "/repo/apps/admin/page.tsx" }),
    undefined,
  );
});
