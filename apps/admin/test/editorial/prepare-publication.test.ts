import { describe, expect, it } from "vitest";
import {
  preparePublication,
  type GitBase,
} from "../../src/editorial/prepare-publication";
import type { Publication } from "../../src/editorial/publication";

const publication: Publication = {
  id: "40c949e1-0e1e-40a1-8eca-2b1b0202a1e5",
  record: { kind: "page", id: "home" },
  path: "content/public/pages/home.md",
  source: "authorized bytes",
  revision: 1,
  baseCommit: "a".repeat(40),
  baseFileHash: "b".repeat(40),
  createdAt: 1,
};
const base: GitBase = {
  head: "c".repeat(40),
  tree: "d".repeat(40),
  file: {
    path: publication.path,
    sha: "b".repeat(40),
    mode: "100644",
    type: "blob",
  },
};
describe("publication Git conflict planning", () => {
  it("preserves unrelated newer main changes and exact authorized bytes", () => {
    expect(preparePublication(publication, base)).toEqual({
      ok: true,
      parent: base.head,
      baseTree: base.tree,
      branch: `codex/editorial-${publication.id}`,
      file: {
        path: publication.path,
        mode: "100644",
        type: "blob",
        content: publication.source,
      },
    });
  });
  it("blocks overlapping edits, symlinks, and renamed or deleted sources", () => {
    for (const file of [
      { ...base.file!, sha: "e".repeat(40) },
      { ...base.file!, mode: "120000" },
      { ...base.file!, path: "content/public/pages/renamed.md" },
    ])
      expect(preparePublication(publication, { ...base, file })).toEqual({
        ok: false,
        code: "record_changed",
      });
    expect(preparePublication(publication, { ...base, file: null })).toEqual({
      ok: false,
      code: "record_removed",
    });
  });
  it("does not overwrite an independently created record", () => {
    expect(
      preparePublication({ ...publication, baseFileHash: null }, base),
    ).toEqual({ ok: false, code: "record_already_exists" });
  });
  it("rejects a substituted path or unresolved main snapshot", () => {
    expect(
      preparePublication(
        { ...publication, path: ".github/workflows/deploy.yml" },
        base,
      ),
    ).toEqual({ ok: false, code: "invalid_publication_path" });
    expect(preparePublication(publication, { ...base, head: "main" })).toEqual({
      ok: false,
      code: "invalid_git_snapshot",
    });
  });
});
