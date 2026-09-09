import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Editorial entry and retained inbox", () => {
  it("opens content from the root while retaining the legacy inbox route", async () => {
    const [root, inbox] = await Promise.all([
      readFile(new URL("../pages/index.astro", import.meta.url), "utf8"),
      readFile(new URL("../pages/inbox.astro", import.meta.url), "utf8"),
    ]);

    expect(root).toContain(
      "Astro.redirect(`/content${Astro.url.search}`, 302)",
    );
    expect(root).not.toContain("<AdminHome />");
    expect(inbox).toContain("<AdminHome />");
  });
});
