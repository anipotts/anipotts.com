import { describe, expect, it } from "vitest";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { inlineHtml } from "@anipotts/content/public/inline";
import {
  editorialFixtures,
  publicationRecoverySources,
} from "../../test/support/editorial-fixtures";

describe("reusable synthetic editorial inputs", () => {
  it("covers wrapping titles and distinct compact copy", () => {
    expect(editorialFixtures.longTitle.title.length).toBeGreaterThan(120);
    expect(editorialFixtures.compactCopy.cardCopy.length).toBeLessThan(
      editorialFixtures.compactCopy.summary.length,
    );
    const ids = Object.values(editorialFixtures).map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("qa-"))).toBe(true);
  });
  it("renders formatting and links through the sanitized renderer", () => {
    const html = inlineHtml(editorialFixtures.formattedLinks.markdown);
    expect(html).toContain("<strong>Synthetic bold</strong>");
    expect(html).toContain('href="https://example.com/qa"');
    expect(html).toContain('src="/images/brand/structured-ai-mark.svg"');
  });
  it("preserves a newer private body independently of the acknowledged publication", () => {
    const sources = publicationRecoverySources();
    const published = parseEditorialSource(sources.acknowledged);
    const newer = parseEditorialSource(sources.newerPrivate);
    expect(published.body.trim()).toBe(
      editorialFixtures.publicationRecovery.publishedBody.trim(),
    );
    expect(newer.body.trim()).toBe(
      editorialFixtures.publicationRecovery.subsequentBody.trim(),
    );
    expect(published.data).toEqual(newer.data);
    expect(sources.acknowledged).not.toBe(sources.newerPrivate);
  });
});
