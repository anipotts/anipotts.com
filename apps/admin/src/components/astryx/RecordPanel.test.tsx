import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { recordPanelMode } from "./RecordPanel";
import { ArticleSettings } from "./ArticleSettings";

describe("record inspector budgets", () => {
  it("measures the main region, not the capped writing column", () => {
    expect(recordPanelMode(1600, 1039)).toBe("drawer");
    expect(recordPanelMode(1280, 1040)).toBe("inspector");
    expect(recordPanelMode(1100, 1060)).toBe("inspector");
    expect(recordPanelMode(640, 640)).toBe("sheet");
    expect(recordPanelMode(641, 641)).toBe("drawer");
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
  it("keeps the direct publisher's limits in the options, not in helper copy", () => {
    const html = renderToStaticMarkup(
      <ArticleSettings
        source={source}
        id="original-id"
        errors={new Map()}
        publicationMode="direct"
        onChange={() => {
          throw new Error("must not rewrite source");
        }}
      />,
    );
    expect(html).not.toContain("use Unpublish in the document actions");
    expect(html).toContain("Draft, hidden from the website");
    expect(html).toContain("/writing/stable-address");
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
