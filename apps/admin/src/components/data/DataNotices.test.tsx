// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DataResult } from "../../data/personal-context";
import { ReadNotice } from "./DataNotices";

type Failed = Exclude<DataResult, { state: "ready" }>;
const notice = (result: Failed) => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    <ReadNotice result={result} onRetry={() => {}} />,
  );
  return host;
};
const retry = (host: Element) =>
  [...host.querySelectorAll("button")].some(
    (button) => button.textContent === "Try again",
  );

describe("a failed Data read", () => {
  it("offers no Try again on a definitive not found (A-25)", () => {
    const host = notice({ state: "not_found", message: "" });
    expect(host.textContent).toContain("Record not found");
    expect(retry(host)).toBe(false);
  });

  it("keeps Try again for transport and reader failures", () => {
    for (const hop of ["unanswered", "timeout", "reader"] as const)
      expect(retry(notice({ state: "unavailable", message: "", hop }))).toBe(
        true,
      );
    expect(retry(notice({ state: "denied", message: "" }))).toBe(true);
    expect(retry(notice({ state: "invalid", message: "" }))).toBe(true);
  });

  it("names the hop that failed, and ap-mini only when unreachable (A-26)", () => {
    const title = (hop?: Failed["hop"]) =>
      notice({ state: "unavailable", message: "", ...(hop ? { hop } : {}) })
        .textContent;
    expect(title("timeout")).toContain("ap-mini unreachable");
    expect(title("unanswered")).toContain("No answer from ap-mini");
    expect(title("blocked")).toContain("Blocked by this browser");
    expect(title("offline")).toContain("Browser offline");
    expect(title("reader")).toContain("Reader unavailable");
    expect(title()).toContain("Reader unavailable");
  });
});
