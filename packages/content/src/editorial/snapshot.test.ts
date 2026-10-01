import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  validateEditorialSnapshot,
  type EditorialSourceRecord,
} from "./snapshot";
import { editorialRecordSchema, setEditorialField } from "./source";

function inventory(): EditorialSourceRecord[] {
  const root = new URL("../../../../content/public/", import.meta.url);
  return (
    [
      ["pages", "page"],
      ["projects", "work"],
      ["writing", "writing"],
    ] as const
  ).flatMap(([dir, kind]) =>
    readdirSync(fileURLToPath(new URL(`${dir}/`, root)))
      // Retained retired source has no route/editor identity and is not part of
      // the active content inventory. Do not restore the newsletter archive.
      .filter(
        (name) => name.endsWith(".md") && name !== "newsletter_archive.md",
      )
      .map((name) => ({
        record: editorialRecordSchema.parse({ kind, id: name.slice(0, -3) }),
        source: readFileSync(new URL(`${dir}/${name}`, root), "utf8"),
      })),
  );
}
describe("complete editorial inventory validation", () => {
  it("rejects hidden homepage work and route metadata that diverges from the slug", () => {
    const entries = inventory();
    const project = entries.find((e) => e.record.kind === "work")!;
    const hidden = entries.map((e) =>
      e === project
        ? {
            ...e,
            source: setEditorialField(
              setEditorialField(e.source, ["public_state"], "hidden"),
              ["homepage_placement"],
              "work",
            ),
          }
        : e,
    );
    expect(
      validateEditorialSnapshot(hidden).some(
        (i) => i.code === "private_homepage_selection",
      ),
    ).toBe(true);
    const mismatched = entries.map((e) =>
      e === project
        ? {
            ...e,
            source: setEditorialField(
              e.source,
              ["detail_path"],
              "/work/wrong-route",
            ),
          }
        : e,
    );
    expect(
      validateEditorialSnapshot(mismatched).some(
        (i) => i.code === "route_mismatch",
      ),
    ).toBe(true);
  });
  it("accepts canonical content and a home-subheading edit without rewriting other records", () => {
    const entries = inventory();
    expect(validateEditorialSnapshot(entries)).toEqual([]);
    const edited = entries.map((entry) =>
      entry.record.kind === "page" && entry.record.id === "home"
        ? {
            ...entry,
            source: setEditorialField(
              entry.source,
              ["sections", "intro", "subheading"],
              "my updated subheading",
            ),
          }
        : entry,
    );
    expect(validateEditorialSnapshot(edited)).toEqual([]);
    expect(entries.filter((entry, i) => entry !== edited[i])).toHaveLength(1);
  });
  it("rejects missing required pages, duplicate records and malformed private drafts", () => {
    const entries = inventory();
    expect(
      validateEditorialSnapshot(entries.filter((e) => e.record.id !== "home")),
    ).toContainEqual({
      record: { kind: "page", id: "home" },
      field: "",
      code: "required_page_missing",
    });
    expect(
      validateEditorialSnapshot([...entries, entries[0]!]).some(
        (i) => i.code === "duplicate_record",
      ),
    ).toBe(true);
    expect(
      validateEditorialSnapshot([
        ...entries,
        {
          record: { kind: "writing", id: "private-test" },
          source: "unfinished yaml",
        },
      ]).some((i) => i.code === "invalid_source"),
    ).toBe(true);
  });
  it("rejects duplicate slugs and missing featured writing before source disclosure", () => {
    const entries = inventory();
    const essays = entries.filter((e) => e.record.kind === "writing");
    const collision = entries.map((e) =>
      essays.slice(0, 2).includes(e)
        ? { ...e, source: setEditorialField(e.source, ["slug"], "duplicate") }
        : e,
    );
    for (const essay of essays.slice(0, 2))
      expect(validateEditorialSnapshot(collision)).toContainEqual({
        record: essay.record,
        field: "slug",
        code: "duplicate_slug",
      });
    const missing = entries.map((e) =>
      e.record.kind === "page" && e.record.id === "home"
        ? {
            ...e,
            source: setEditorialField(
              e.source,
              ["sections", "latest_thoughts", "writing_slugs"],
              ["not-a-record"],
            ),
          }
        : e,
    );
    expect(validateEditorialSnapshot(missing)).toContainEqual({
      record: { kind: "page", id: "home" },
      field: "sections.latest_thoughts.writing_slugs.0",
      code: "featured_writing_unavailable",
    });
  });
  it("identifies the writing field with an unknown project without exposing its value", () => {
    const entries = inventory();
    const essay = entries.find((entry) => entry.record.kind === "writing")!;
    const changed = entries.map((entry) =>
      entry === essay
        ? {
            ...entry,
            source: setEditorialField(
              entry.source,
              ["project"],
              "private-missing-project",
            ),
          }
        : entry,
    );
    const issues = validateEditorialSnapshot(changed);
    expect(issues).toEqual([
      {
        record: essay.record,
        field: "project",
        code: "unknown_project_reference",
      },
    ]);
    expect(JSON.stringify(issues)).not.toContain("private-missing-project");
  });
});
