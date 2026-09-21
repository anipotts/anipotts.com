import { describe, expect, it } from "vitest";
import {
  workspaceReturnPath,
  workspaces,
  type Workspace,
} from "./workspace-navigation";

describe("workspace return destinations", () => {
  it.each(Object.keys(workspaces) as Workspace[])(
    "rejects foreign or malformed destinations for %s",
    (workspace) => {
      for (const value of [
        "https://evil.example/content",
        "//evil.example/content",
        "/\\evil.example/content",
        "javascript:alert(1)",
        "/api/admin/inbox",
        "/auth/passkey",
        "/unknown",
      ]) {
        expect(workspaceReturnPath(workspace, value)).toBe(
          workspaces[workspace].href,
        );
      }
    },
  );
  it("keeps useful content filters but discards search, record payloads and fragments", () => {
    expect(
      workspaceReturnPath(
        "content",
        "/content?group=writing&status=draft&sort=updated&query=private&q=private&body=secret#draft",
      ),
    ).toBe("/content?group=writing&status=draft&sort=updated");
    expect(
      workspaceReturnPath(
        "content",
        "/content/writing/my-post?returnTo=%2Fcontent%3Fq%3Dsecret",
      ),
    ).toBe("/content/writing/my-post");
    expect(workspaceReturnPath("content", "/newsletter/my-newsletter")).toBe(
      "/newsletter/my-newsletter",
    );
  });
  it("keeps creation routes without retaining private form values", () => {
    for (const path of ["/content/new", "/content/new-project"]) {
      expect(
        workspaceReturnPath("content", `${path}?title=private#draft`),
      ).toBe(path);
      expect(workspaceReturnPath("life", path)).toBe("/life");
    }
  });
  it.each([
    ["projects", "chainedchat"],
    ["home", "home"],
    ["workPage", "work"],
    ["writingPage", "writing"],
    ["systemsPage", "systems"],
    ["newsletterPage", "newsletter"],
    ["writing", "my-post"],
  ])(
    "remembers the %s editor without retaining private queries",
    (collection, id) => {
      const path = `/content/${collection}/${id}`;
      expect(
        workspaceReturnPath("content", `${path}?view=review&q=private#draft`),
      ).toBe(`${path}?view=review`);
      expect(workspaceReturnPath("life", path)).toBe("/life");
    },
  );
  it("keeps an operational view without retaining item or private query identities", () => {
    expect(
      workspaceReturnPath(
        "operations",
        "/operations/observability?view=machines&panel=traces&q=secret&item=private",
      ),
    ).toBe("/operations/observability?view=machines&panel=traces");
    expect(workspaceReturnPath("operations", "/work?view=now")).toBe(
      "/work?view=now",
    );
  });
  it("keeps Life section navigation only, never private queries, record ids or cursors", () => {
    expect(
      workspaceReturnPath(
        "life",
        "/life/people?q=private&record=person-123&cursor=42&view=details#private",
      ),
    ).toBe("/life/people");
    expect(workspaceReturnPath("life", "/life/person-123")).toBe("/life");
  });
  it("cannot cross workspace boundaries through remembered state", () => {
    expect(workspaceReturnPath("content", "/life/people")).toBe("/content");
    expect(workspaceReturnPath("life", "/content/writing/my-post")).toBe(
      "/life",
    );
    expect(workspaceReturnPath("operations", "/life")).toBe(
      "/operations/observability",
    );
  });
});

describe("Operations route filters", () => {
  it.each([
    "all",
    "people",
    "project",
    "decision",
    "concept",
    "place",
    "system",
  ])(
    "remembers the supported knowledge kind %s without private data",
    (kind) => {
      expect(
        workspaceReturnPath(
          "operations",
          `/knowledge?kind=${kind}&q=private&item=secret&card=private#secret`,
        ),
      ).toBe(`/knowledge?kind=${kind}`);
    },
  );
  it("returns a retired Inbox path to the Operations home", () => {
    expect(
      workspaceReturnPath("operations", "/inbox?category=work&view=urgent"),
    ).toBe("/operations/observability");
  });
  it.each([
    "/knowledge?kind=person",
    "/knowledge?kind=projects",
    "/knowledge?kind=private-record",
    "/knowledge/locations?kind=place",
    "/knowledge?category=work",
    "/system?kind=system&category=system",
  ])("discards unsupported or misplaced filters in %s", (path) => {
    expect(workspaceReturnPath("operations", path)).toBe(path.split("?")[0]);
  });
  it("does not add Operations filters to other workspaces", () => {
    expect(
      workspaceReturnPath("content", "/content?kind=project&category=work"),
    ).toBe("/content");
    expect(workspaceReturnPath("life", "/life?kind=people&category=life")).toBe(
      "/life",
    );
  });
});
