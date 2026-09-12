import { describe, expect, it } from "vitest";
import {
  libraryReturnPath,
  libraryStateUrl,
  readLibraryState,
  recordLibraryHref,
} from "./content-library-state";

describe("library URL state", () => {
  it("restores recognized filters and rejects unknown values", () => {
    expect(
      readLibraryState(
        "?group=writing&q=lean&status=changes&sort=title&sections=writing,work",
      ),
    ).toEqual({
      group: "writing",
      q: "lean",
      status: "changes",
      sort: "title",
      sections: ["writing", "work"],
    });
    expect(readLibraryState("?group=admin&status=secret&sort=reverse")).toEqual(
      {
        group: "pages",
        q: "",
        status: "all",
        sort: "attention",
        sections: undefined,
      },
    );
  });
  it("preserves theme while updating filters and distinguishes no sections from all", () => {
    const next = libraryStateUrl("/content", "?theme=dark&unknown=discard", {
      ...readLibraryState("?group=writing"),
      q: "navier stokes",
      sections: [],
    });
    expect(next).toBe(
      "/content?theme=dark&group=writing&q=navier+stokes&sections=",
    );
    expect(readLibraryState(next.split("?")[1]).sections).toEqual([]);
    expect(
      libraryStateUrl("/content", "?status=draft", readLibraryState("")),
    ).toBe("/content");
  });
  it("allows only local library return destinations with bounded parameters", () => {
    for (const value of [
      "https://evil.test/content",
      "//evil.test/content",
      "/inbox",
      "/content/new",
      "/content/../auth",
      "/content\\bad",
      "/content?x=\n",
    ])
      expect(libraryReturnPath(value)).toBe("/content");
    expect(libraryReturnPath("/newsletter?q=lean&theme=light&token=bad")).toBe(
      "/newsletter?q=lean&theme=light",
    );
    expect(readLibraryState(`?q=${"x".repeat(600)}`).q.length).toBe(512);
  });
  it("preserves record identity and existing mode with encoded return context", () => {
    const href = recordLibraryHref(
      "/content/writing/a-post?view=preview",
      "/content?group=writing&status=draft&q=hello",
    );
    const parsed = new URL(href, "https://admin.test");
    expect(parsed.pathname).toBe("/content/writing/a-post");
    expect(parsed.searchParams.get("view")).toBe("preview");
    expect(parsed.searchParams.get("returnTo")).toBe(
      "/content?group=writing&status=draft&q=hello",
    );
  });
});
