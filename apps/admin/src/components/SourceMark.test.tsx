import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceMark } from "./SourceMark";

describe("SourceMark", () => {
  it.each([
    ["codex", "Codex", "codex"],
    ["chatgpt", "ChatGPT", "chatgpt"],
    ["claude", "Claude", "claude"],
    ["github", "GitHub", "github"],
  ] as const)(
    "renders the %s brand tile with an accessible source label",
    (provider, label, mark) => {
      const markup = renderToStaticMarkup(<SourceMark provider={provider} />);

      expect(markup).toContain(`data-provider="${provider}"`);
      expect(markup).toContain(`data-mark="${mark}"`);
      expect(markup).toContain(`aria-label="${label} source"`);
      expect(markup).toContain(`>${label}<`);
      // The name sits beside the tile, so the tile itself is hidden.
      expect(markup).toMatch(/class="brand-tile"[^>]*aria-hidden="true"/);
    },
  );

  it("draws GitHub from the sprite instead of a letter circle", () => {
    const markup = renderToStaticMarkup(<SourceMark provider="github" />);

    expect(markup).toMatch(
      /<use href="[^"#]*sprite[^"#]*\.svg(?:\?[^"#]*)?#github"/,
    );
    expect(markup).not.toContain(">GH<");
    expect(markup).not.toContain("operator-source-glyph");
  });

  it("gives handoffs the handoff glyph in the same tile", () => {
    const markup = renderToStaticMarkup(<SourceMark provider="handoff" />);

    expect(markup).toContain('data-mark="handoff"');
    expect(markup).toContain('aria-label="Handoff source"');
    expect(markup).not.toContain(">HO<");
  });
});
