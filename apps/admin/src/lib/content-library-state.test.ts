import { describe, expect, it } from "vitest";
import {
  libraryGroupForPath,
  libraryPath,
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
        group: "website",
        q: "",
        status: "all",
        sort: "attention",
        sections: undefined,
      },
    );
  });
  it("names the library in the route, never as a group parameter", () => {
    expect(libraryPath("website")).toBe("/content/pages");
    expect(libraryPath("writing")).toBe("/content/writing");
    expect(libraryPath("work")).toBe("/content/projects");
    expect(libraryPath("newsletter")).toBe("/content/newsletter");
    // The mixed overview and the systems subset have no route of their own.
    expect(libraryPath("pages")).toBe("/content/pages");
    expect(libraryPath("systems")).toBe("/content/pages");
    expect(libraryGroupForPath("/content/projects")).toBe("work");
    expect(libraryGroupForPath("/newsletter")).toBe("newsletter");
    expect(libraryGroupForPath("/content")).toBe("website");
    expect(libraryGroupForPath("/content/new")).toBeUndefined();
  });
  it("preserves theme while updating filters and distinguishes no sections from all", () => {
    const next = libraryStateUrl("/content", "?theme=dark&unknown=discard", {
      ...readLibraryState("?group=writing"),
      q: "navier stokes",
      sections: [],
    });
    expect(next).toBe("/content/writing?theme=dark&q=navier+stokes&sections=");
    expect(readLibraryState(next.split("?")[1]).sections).toEqual([]);
    expect(
      libraryStateUrl("/content", "?status=draft", readLibraryState("")),
    ).toBe("/content/pages");
  });
  it("turns legacy group links into their library route", () => {
    expect(
      libraryStateUrl(
        "/content",
        "?group=work&status=draft",
        readLibraryState("?group=work&status=draft"),
      ),
    ).toBe("/content/projects?status=draft");
    expect(
      libraryStateUrl("/newsletter", "?q=lean", readLibraryState("?q=lean")),
    ).toBe("/content/newsletter?q=lean");
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
      expect(libraryReturnPath(value)).toBe("/content/pages");
    expect(libraryReturnPath("/newsletter?q=lean&theme=light&token=bad")).toBe(
      "/content/newsletter?q=lean&theme=light",
    );
    expect(libraryReturnPath("/content?group=writing&q=lean")).toBe(
      "/content/writing?q=lean",
    );
    expect(libraryReturnPath("/content/projects?sort=title")).toBe(
      "/content/projects?sort=title",
    );
    expect(readLibraryState(`?q=${"x".repeat(600)}`).q.length).toBe(512);
  });
  it("preserves record identity and existing mode with encoded return context", () => {
    const href = recordLibraryHref(
      "/content/writing/a-post?view=preview",
      "/content/writing?status=draft&q=hello",
    );
    const parsed = new URL(href, "https://admin.test");
    expect(parsed.pathname).toBe("/content/writing/a-post");
    expect(parsed.searchParams.get("view")).toBe("preview");
    expect(parsed.searchParams.get("returnTo")).toBe(
      "/content/writing?status=draft&q=hello",
    );
  });
});
