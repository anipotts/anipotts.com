import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandTile, TILE_GLYPHS } from "./BrandTile";
import { GLYPH_KINDS, deviceMark, opsMark } from "../lib/marks";

const render = (element: React.ReactElement) => renderToStaticMarkup(element);

describe("BrandTile", () => {
  it("has a Phosphor glyph for every fallback kind", () => {
    expect(Object.keys(TILE_GLYPHS).sort()).toEqual([...GLYPH_KINDS].sort());
  });

  it("paints a sprite glyph in its brand colour with the dark ink swap", () => {
    const markup = render(<BrandTile id="github" size={24} />);

    expect(markup).toContain('data-mark="github"');
    expect(markup).toContain('data-fit="glyph"');
    expect(markup).toContain("--brand-tile-size:24px");
    expect(markup).toContain("--brand-mark-color:#181717");
    expect(markup).toContain("--brand-mark-dark:#EEF0F4");
    expect(markup).toMatch(/<use href="[^"#]*\.svg(?:\?[^"#]*)?#github"/);
  });

  it("serves app artwork lazily as WebP with a PNG fallback", () => {
    const markup = render(<BrandTile id="messages" size={28} />);

    expect(markup).toContain('data-fit="fill"');
    expect(markup).toMatch(
      /<source type="image\/webp" srcSet="[^"]*messages-56\.webp[^"]* 56w, [^"]*messages-112\.webp[^"]* 112w" sizes="28px"/,
    );
    expect(markup).toMatch(/<img[^>]*src="[^"]*messages-112\.png[^"]*"/);
    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('alt=""');
    expect(markup).not.toContain("data:image");
  });

  it("draws devices from their renders", () => {
    const markup = render(<BrandTile {...deviceMark("ap-plus")} />);

    expect(markup).toContain('data-mark="ap-plus"');
    // The render is the icon: brand-tile.css drops the fill for this kind.
    expect(markup).toContain('data-kind="device"');
    expect(markup).toMatch(/ap-plus-112\.png/);
    // No size: the tile follows RowTitle's --row-mark-size.
    expect(markup).not.toContain("--brand-tile-size");
  });

  it("keeps a standalone vector in its own document", () => {
    const markup = render(<BrandTile id="claude" size={20} />);

    expect(markup).toMatch(/<img[^>]*src="[^"]*claude\.svg[^"]*"/);
    expect(markup).not.toContain("<use");
  });

  it("falls back to the Phosphor glyph for the kind in the same tile", () => {
    const markup = render(
      <BrandTile {...opsMark({ id: "weather.daily", kind: "job" })} />,
    );

    expect(markup).toContain('class="brand-tile"');
    expect(markup).toContain('data-mark="job"');
    expect(markup).toContain('data-fit="glyph"');
    expect(markup).toContain("brand-tile-glyph");
    expect(markup).not.toContain("<img");
  });

  it("names itself only when no text beside it does", () => {
    const hidden = render(<BrandTile id="tailscale" />);
    expect(hidden).toContain('aria-hidden="true"');
    expect(hidden).not.toContain('role="img"');

    const named = render(<BrandTile id="tailscale" label="Tailscale" />);
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Tailscale"');
    expect(named).toContain('title="Tailscale"');
  });
});
