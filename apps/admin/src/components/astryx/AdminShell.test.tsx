import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { navItems } from "../../data/admin";
import { AdminShell } from "./AdminShell";

describe("AdminShell mobile navigation", () => {
  it("connects the native disclosure to its navigation sheet", () => {
    const markup = renderToStaticMarkup(
      <AdminShell
        chrome="admin"
        currentRoute="/work?view=now"
        navItems={navItems}
        title="work"
      >
        <div>work</div>
      </AdminShell>,
    );

    expect(markup).toContain('aria-label="Toggle navigation"');
    expect(markup).toContain('aria-controls="admin-mobile-menu-panel"');
    expect(markup).toContain('id="admin-mobile-menu-panel"');
  });

  it("keeps search desktop-only and marks retained Inbox active", () => {
    const markup = renderToStaticMarkup(
      <AdminShell
        chrome="admin"
        currentRoute="/inbox?category=work"
        navItems={navItems}
        title="Inbox"
      >
        <div />
      </AdminShell>,
    );
    expect(markup).not.toContain('class="admin-mobile-search"');
    expect(markup.match(/data-admin-search-trigger=/g)).toHaveLength(1);
    expect(markup).toContain('href="/inbox" aria-current="page"');
    expect(markup).toContain("ani potts");
    expect(markup).toContain("operations");
  });

  it("opens Work for Handoffs and names legacy content separately", () => {
    const markup = renderToStaticMarkup(
      <AdminShell
        chrome="admin"
        currentRoute="/handoffs"
        navItems={navItems}
        title="Handoffs"
      >
        <div />
      </AdminShell>,
    );
    expect(markup).toContain('data-admin-nav-group="work" open=""');
    expect(markup).toContain("Legacy content diagnostics");
    expect(markup).toContain("Personal");
    expect(markup).not.toContain('href="/content/new"');
    expect(markup).toContain('href="/content"');
  });

  it("keeps the tablet sheet opaque and scroll-contained", () => {
    const css = readFileSync(
      new URL("../../styles/admin.css", import.meta.url),
      "utf8",
    );
    const sheetRule = css.match(/\.admin-mobile-menu nav \{(?<rule>[^}]*)\}/s)
      ?.groups?.rule;

    expect(sheetRule).toContain("overscroll-behavior: contain");
    expect(sheetRule).toContain("background: var(--color-background-body)");
    expect(sheetRule).toContain("color: var(--color-text-primary)");
    expect(sheetRule).not.toContain("var(--color-background)");
  });
});
