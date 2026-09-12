import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { recordPanelMode } from "./RecordPanel";
import { ArticleSettings } from "./ArticleSettings";

describe("record inspector budgets", () => {
  it("requires both desktop viewport and enough actual document workspace", () => {
    expect(recordPanelMode(1600, 899)).toBe("drawer");
    expect(recordPanelMode(1280, 900)).toBe("inspector");
    expect(recordPanelMode(1279, 1100)).toBe("drawer");
    expect(recordPanelMode(767, 767)).toBe("sheet");
    expect(recordPanelMode(768, 768)).toBe("drawer");
  });
});

describe("article properties", () => {
  const source =
    "---\ntitle: Sample\nstatus: draft\nslug: stable-address\ntags: [math, notes]\n---\nBody stays here.\n";
  it("renders fields directly for the inspector while retaining stable address and validation", () => {
    const html = renderToStaticMarkup(
      <ArticleSettings
        disclosure={false}
        source={source}
        id="original-id"
        errors={new Map([["tags", "Too many tags"]])}
        onChange={() => {}}
        disabled
      />,
    );
    expect(html).toContain("Visibility after publication");
    expect(html).toContain("stable-address");
    expect(html).toContain("Too many tags");
    expect(html).toContain("disabled");
    expect(html).not.toContain("astryx-collapsible");
    expect(html).not.toContain("Body stays here.");
  });
  it("retains disclosure by default for existing callers", () => {
    const html = renderToStaticMarkup(
      <ArticleSettings
        source={source}
        id="original-id"
        errors={new Map()}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Properties");
    expect(html).toContain("astryx-collapsible");
  });
});
