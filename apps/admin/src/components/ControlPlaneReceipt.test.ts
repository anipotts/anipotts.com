import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("control-plane proof viewer", () => {
  it("retains observations without promising a command through retired CSRF setup", () => {
    const source = readFileSync(
      new URL("./ControlPlaneReceipt.astro", import.meta.url),
      "utf8",
    );
    expect(source).toContain("readControlPlane");
    expect(source).toContain("latest?.proof");
    expect(source).toContain('href="/proof"');
    expect(source).not.toContain("adminMutationFetch");
    expect(source).not.toContain("data-control-plane-submit");
    expect(source).not.toContain("<script>");
  });

  it("does not infer idle execution or pending proof from missing observations", () => {
    const source = readFileSync(
      new URL("./ControlPlaneReceipt.astro", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain('?? "idle"');
    expect(source).not.toContain("<span>idle</span>");
    expect(source).not.toContain('"proof pending"');
    expect(source).toContain('state.available ? "unknown" : "unavailable"');
    expect(source).toContain("No journal proof recorded");
  });
});
