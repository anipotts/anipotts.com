import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  editorialRecordPath,
  MAX_SOURCE_BYTES,
  parseEditorialSource,
  setEditorialField,
  validateEditorialSource,
} from "./source.js";

const source = `---\n# keep this comment\ntitle: 'hello 🪴' # inline\nsummary: |\n  first line\n  second line\nstatus: published\npublished_at: 2026-04-07\n---\n\n\`\`\`yaml\n---\ntitle: not frontmatter\n\`\`\`\n`;

describe("editorial source fidelity", () => {
  for (const directory of ["projects", "writing"]) {
    const root = new URL(
      `../../../../content/public/${directory}/`,
      import.meta.url,
    );
    for (const file of readdirSync(root).filter((name) =>
      name.endsWith(".md"),
    )) {
      it(`round trips the actual ${directory}/${file} source`, () => {
        const raw = readFileSync(new URL(file, root), "utf8");
        const parsed = parseEditorialSource(raw);
        const title = parsed.document.get("title");
        expect(setEditorialField(raw, ["title"], title)).toBe(raw);
        expect(
          parseEditorialSource(setEditorialField(raw, ["title"], "test title"))
            .body,
        ).toBe(parsed.body);
        const field = directory === "projects" ? "subtitle" : "summary";
        const edited = parseEditorialSource(
          setEditorialField(raw, [field], "my own words"),
        );
        expect(edited.document.get(field)).toBe("my own words");
        for (const preserved of [
          "status",
          "public_state",
          "published_at",
          "slug",
          "card_copy",
        ]) {
          expect(edited.document.get(preserved)).toEqual(
            parsed.document.get(preserved),
          );
        }
        expect(edited.body).toBe(parsed.body);
      });
    }
  }
  it("returns identical bytes for a no-op", () => {
    expect(setEditorialField(source, ["title"], "hello 🪴")).toBe(source);
  });
  it("keeps comments, quoting, dates, and the entire body on a field edit", () => {
    const changed = setEditorialField(source, ["title"], "new title");
    expect(changed).toContain("# keep this comment");
    expect(changed).toContain("title: 'new title' # inline");
    expect(changed).toContain("published_at: 2026-04-07");
    expect(parseEditorialSource(changed).body).toBe(
      parseEditorialSource(source).body,
    );
    expect(
      validateEditorialSource({ kind: "writing", id: "hello" }, changed)
        .success,
    ).toBe(true);
  });
  it("preserves CRLF in header and body", () => {
    const crlf = source.replaceAll("\n", "\r\n");
    const changed = setEditorialField(crlf, ["title"], "new");
    expect(changed.replaceAll("\r\n", "")).not.toContain("\n");
    expect(parseEditorialSource(changed).body).toBe(
      parseEditorialSource(crlf).body,
    );
  });
  it.each([
    "---\ntitle: a\ntitle: b\n---\n",
    "---\na: &a [x]\nb: *a\n---\n",
    "---\na: !execute something\n---\n",
    "---\n- list\n---\n",
    "no frontmatter",
  ])("rejects malformed or executable YAML", (raw) => {
    expect(() => parseEditorialSource(raw)).toThrow();
  });
  it("bounds source bytes, not JavaScript string length", () => {
    expect(() =>
      parseEditorialSource(
        `---\na: ${"🪴".repeat(MAX_SOURCE_BYTES / 4)}\n---\n`,
      ),
    ).toThrow("source_too_large");
  });
  it("rejects prototype paths", () => {
    expect(() => setEditorialField(source, ["__proto__", "x"], true)).toThrow(
      "invalid_field",
    );
  });
  it("does not silently repair invalid record fields", () => {
    expect(
      validateEditorialSource(
        { kind: "writing", id: "hello" },
        source.replace("published_at: 2026-04-07", "published_at: nonsense"),
      ).success,
    ).toBe(false);
  });
});

describe("server-owned record paths", () => {
  it("maps stable IDs rather than user-provided paths", () => {
    expect(editorialRecordPath({ kind: "work", id: "example" })).toBe(
      "content/public/projects/example.md",
    );
  });
  it.each(["../secret", "/etc/passwd", "hello.md", "%2e%2e", "a/b", ""])(
    "rejects unsafe IDs",
    (id) => {
      expect(() => editorialRecordPath({ kind: "writing", id })).toThrow();
    },
  );
  it("rejects unrecognized page records and extra path parameters", () => {
    expect(() => editorialRecordPath({ kind: "page", id: "auth" })).toThrow();
    expect(() =>
      editorialRecordPath({ kind: "work", id: "example", path: "secret" }),
    ).toThrow();
  });
});
