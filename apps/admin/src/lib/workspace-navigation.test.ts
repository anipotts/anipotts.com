import { describe, expect, it } from "vitest";
import {
  workspaceReturnPath,
  workspaces,
  type Workspace,
} from "./workspace-navigation";

describe("workspace return destinations", () => {
  it("lands each workspace on its first page", () => {
    expect(workspaces.content.href).toBe("/content/pages");
    expect(workspaces.data.href).toBe("/data/records");
    expect(workspaces.observability.href).toBe("/observability/status");
  });
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
        "/content/writing?group=writing&status=draft&sort=updated&query=private&q=private&body=secret#draft",
      ),
    ).toBe("/content/writing?status=draft&sort=updated");
    for (const library of ["pages", "projects", "newsletter"])
      expect(
        workspaceReturnPath("content", `/content/${library}?sort=title`),
      ).toBe(`/content/${library}?sort=title`);
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
  it("returns the retired Content overview and Newsletter library to Pages", () => {
    for (const path of ["/content?group=writing", "/content", "/newsletter"])
      expect(workspaceReturnPath("content", path)).toBe("/content/pages");
  });
  it("keeps creation routes without retaining private form values", () => {
    for (const path of ["/content/new", "/content/new-project"]) {
      expect(
        workspaceReturnPath("content", `${path}?title=private#draft`),
      ).toBe(path);
      expect(workspaceReturnPath("data", path)).toBe("/data/records");
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
      expect(workspaceReturnPath("data", path)).toBe("/data/records");
    },
  );
  it("keeps an Observability view without retaining item or private query identities", () => {
    for (const view of ["status", "activity", "alerts"])
      expect(
        workspaceReturnPath(
          "observability",
          `/observability/${view}?panel=traces&q=secret&item=private`,
        ),
      ).toBe(`/observability/${view}?panel=traces`);
  });
  it("keeps Data navigation only, never private queries, record ids or cursors", () => {
    expect(
      workspaceReturnPath(
        "data",
        "/data/records?kind=contact&q=private&record=person-123&cursor=42#private",
      ),
    ).toBe("/data/records?kind=contact");
    // The retired Life taxonomy is no filter.
    expect(workspaceReturnPath("data", "/data/records?kind=people")).toBe(
      "/data/records",
    );
    expect(workspaceReturnPath("data", "/data/records?kind=private")).toBe(
      "/data/records",
    );
    expect(workspaceReturnPath("data", "/data/sources?offset=20")).toBe(
      "/data/sources",
    );
    expect(
      workspaceReturnPath(
        "data",
        "/data/records/rec-00000000000000000000000000000001",
      ),
    ).toBe("/data/records");
  });
  it("cannot cross workspace boundaries through remembered state", () => {
    expect(workspaceReturnPath("content", "/data/records")).toBe(
      "/content/pages",
    );
    expect(workspaceReturnPath("data", "/content/writing/my-post")).toBe(
      "/data/records",
    );
    expect(workspaceReturnPath("observability", "/data/records")).toBe(
      "/observability/status",
    );
  });
});

describe("retired routes", () => {
  it.each([
    "/life",
    "/life/people",
    "/knowledge?kind=people",
    "/knowledge/locations",
  ])("returns the retired %s to the workspace's first page", (path) => {
    expect(workspaceReturnPath("data", path)).toBe("/data/records");
    expect(workspaceReturnPath("observability", path)).toBe(
      "/observability/status",
    );
  });
  it.each([
    "/work",
    "/system",
    "/proof",
    "/ops/destructive",
    "/content/review",
    "/fleet",
    "/deploys",
    "/repos",
    "/handoffs",
    "/mutations",
    "/inbox?category=work&view=urgent",
    "/operations/observability?view=machines",
  ])("returns the retired %s to Observability Status", (path) => {
    expect(workspaceReturnPath("observability", path)).toBe(
      "/observability/status",
    );
  });
  it("discards misplaced filters on operational pages", () => {
    expect(
      workspaceReturnPath(
        "observability",
        "/observability/alerts?kind=system&category=system",
      ),
    ).toBe("/observability/alerts");
  });
});
