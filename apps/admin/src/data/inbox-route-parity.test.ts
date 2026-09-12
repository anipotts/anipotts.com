import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { navItems } from "./admin";

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
  it("keeps Operations navigation and filtered attention links on the retained Inbox", async () => {
    expect(navItems.find((item) => item.label === "Inbox")?.href).toBe(
      "/inbox",
    );
    const [home, life] = await Promise.all([
      readFile(
        new URL("../components/AdminHome.astro", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../pages/life/index.astro", import.meta.url), "utf8"),
    ]);
    expect(home).toContain('href="/inbox"');
    expect(home).toContain('href="/inbox?view=urgent"');
    expect(home).toContain('href="/inbox?view=waiting"');
    expect(home).toContain("href={`/inbox?category=${category}`}");
    expect(life).toContain(
      "href={`/inbox?item=${encodeURIComponent(item.id)}`}",
    );
    expect(home).not.toMatch(/href=["{]`?\/\?/);
    expect(life).not.toMatch(/href=["{]`?\/\?item=/);
  });
});
