import { describe, expect, it } from "vitest";
import {
  inlineHtml,
  inlinePlainText,
  parseInline,
  safeInlineUrl,
} from "./inline";

describe("inline editorial text", () => {
  it("keeps link destinations independent of label spelling and case", () => {
    const text =
      "[![](/images/brand/bad-habit-favicon.png)Our bad habits](https://ourbadhabit.com/)";
    expect(inlineHtml(text)).toContain('href="https://ourbadhabit.com/"');
    expect(inlineHtml(text)).toContain("bad habits</a>");
    expect(inlinePlainText(text)).toBe("Our bad habits");
  });
  it("renders bold, underline, italic, links and images while keeping metadata plain", () => {
    const value =
      "**Build** *carefully* with <u>time</u> ([![YC](/images/yc.ico)F25](https://ycombinator.com)).";
    const html = inlineHtml(value);
    expect(html).toContain("<strong>Build</strong>");
    expect(html).toContain("<em>carefully</em>");
    expect(html).toContain("<u>time</u>");
    expect(html).toContain("F25</span></a>).");
    expect(inlinePlainText(value)).toBe("Build carefully with time (YC F25).");
  });
  it("escapes raw HTML and drops unsafe destinations", () => {
    const value =
      "<script>alert(1)</script> [bad](javascript:alert) ![alt](data:image/png;base64,abcd)";
    const html = inlineHtml(value);
    expect(html).not.toMatch(/<script|href=|src=/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("alt");
    for (const href of [
      "//evil.com",
      "javascript:alert(1)",
      "data:image/svg+xml,test",
      "/\\evil.com",
      "https://user:password@host.com",
    ])
      expect(safeInlineUrl(href)).toBe(false);
  });
  it("does not nest anchors in clickable cards", () => {
    expect(inlineHtml("[**more**](https://example.com)", false)).toBe(
      "<strong>more</strong>",
    );
  });
  it("keeps parentheses adjacent to the badge without injected whitespace", () => {
    expect(inlineHtml("(![YC](/images/yc.ico)F25)")).toMatch(
      />F25\)<\/|>F25\)$/,
    );
    expect(
      parseInline("hello\nthere").some((node) => node.type === "break"),
    ).toBe(true);
  });
});
