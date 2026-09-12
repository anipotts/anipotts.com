import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorialApp } from "./EditorialApp";
import {
  workspaceSelection,
  websiteNavigation,
} from "./EditorialWorkspaceShell";

describe("Website workspace navigation", () => {
  it("keeps record identity and newsletter selection independent of library filters", () => {
    expect(workspaceSelection("content", "pages", "writing")).toBe("writing");
    expect(workspaceSelection("content", "pages", "home")).toBe("website");
    expect(workspaceSelection("content", undefined, "work")).toBe("work");
    expect(workspaceSelection("newsletter", "writing")).toBe("newsletter");
    expect(workspaceSelection("content", "systems")).toBe("website");
    expect(workspaceSelection("content")).toBe("pages");
  });
  it("defines only supported Website destinations", () => {
    expect(websiteNavigation.map((item) => item.href)).toEqual([
      "/content",
      "/content?group=writing",
      "/content?group=website",
      "/content?group=work",
      "/newsletter",
    ]);
  });
  it("renders one workspace shell with navigation, preserves private logout boundary", () => {
    const render = (localPreview: boolean) =>
      renderToStaticMarkup(
        <EditorialApp
          title="Content"
          area="content"
          localPreview={localPreview}
          siteUrl="https://anipotts.com/"
        />,
      );
    const local = render(true);
    expect(local).toContain('aria-label="Website"');
    expect(local).toContain("Pages");
    expect(local).not.toContain("/cdn-cgi/access/logout");
    expect(render(false)).toContain("/cdn-cgi/access/logout");
    expect(local).not.toContain('class="editorial-nav-actions"');
  });
});
