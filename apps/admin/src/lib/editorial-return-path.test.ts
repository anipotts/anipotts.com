import { describe, expect, it } from "vitest";
import { editorialReturnPath, safeReturnPath } from "./editorial-return-path";

describe("editorial sign-in destination", () => {
  it.each([
    "/content",
    "/content/projects/quantercise?view=preview#summary",
    "/newsletter/first-thing-agents-need-control-plane",
  ])("preserves the editorial destination %s", (path) => {
    expect(editorialReturnPath(path)).toBe(path);
  });

  it.each([
    null,
    "",
    "/",
    "https://admin.anipotts.com/content",
    "//example.com/content",
    "/\\example.com/content",
    "/auth",
    "/auth/passkey?next=%2F",
    "/cdn-cgi/access/logout",
    "/api/mcp",
    "/content/../auth",
    "/content/%2e%2e/auth",
    "/content\n",
    "/contentious",
    "/.//evil.com/content",
    "/..//evil.com/content",
    "/%2e//evil.com/content",
  ])("rejects external, unsafe, or non-editorial destination %s", (path) => {
    expect(editorialReturnPath(path)).toBe("/content/pages");
  });

  it.each([
    "/.//evil.com",
    "/..//evil.com",
    "/%2e//evil.com",
    "/%2E%2E//evil.com/x",
    "/content/..//evil.com",
  ])("never returns a path that normalizes to scheme-relative: %s", (path) => {
    expect(safeReturnPath(path)).toBeNull();
  });

  it("keeps a same-site path with an inner double slash", () => {
    expect(safeReturnPath("/content//pages")?.pathname).toBe("/content//pages");
  });

  it.each([
    "http://localhost:4311",
    "http://admin.anipotts.localhost:1355",
    "https://admin-preview.example.com",
    "https://admin.anipotts.com",
  ])("never changes environment from %s", (origin) => {
    const destination = new URL(
      editorialReturnPath("/newsletter?review=1"),
      origin,
    );
    expect(destination.origin).toBe(origin);
    expect(destination.pathname + destination.search).toBe(
      "/newsletter?review=1",
    );
  });
});
