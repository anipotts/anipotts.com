import { describe, expect, it } from "vitest";
import { legacyEditRedirect } from "./editorial-collections";

describe("retired /content/edit diagnostics", () => {
  it.each([
    ["home", "/content/home/home"],
    ["making", "/content/workPage/work"],
    ["projects", "/content/workPage/work"],
    ["writing", "/content/writingPage/writing"],
    ["orchestrating", "/content/systemsPage/systems"],
    ["newsletter_archive", "/content/newsletterPage/newsletter"],
    ["writing:saturdays", "/content/writing/saturdays"],
    ["writing%3Asaturdays", "/content/writing/saturdays"],
    ["writing%3Asaturdays%3aextra", "/content/pages"],
    ["project:agents", "/content/projects/agents"],
    ["new", "/content/new"],
    ["writing:new", "/content/new"],
    [undefined, "/content/pages"],
    ["writing:../../auth", "/content/pages"],
    ["project:Bad Slug", "/content/pages"],
    ["constructor", "/content/pages"],
    ["about", "/content/pages"],
  ])("lands %s on %s", (pageKey, destination) => {
    expect(legacyEditRedirect(pageKey)).toBe(destination);
  });
});
