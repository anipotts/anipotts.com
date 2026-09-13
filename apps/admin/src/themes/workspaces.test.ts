import { describe, expect, it } from "vitest";
import { workspaceThemes } from "./workspaces";

function schemes(value: unknown): string[] {
  const color = String(value);
  const pair = /^light-dark\((#[\da-f]+), (#[\da-f]+)\)$/i.exec(color);
  return pair ? [pair[1], pair[2]] : [color, color];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort(
    (left, right) => right - left,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("workspace themes", () => {
  it("scopes the sidebar tint to the shell without adding an unknown framework token", () => {
    for (const theme of Object.values(workspaceThemes)) {
      expect(theme.tokens["--color-workspace-sidebar"]).toBeUndefined();
      expect(
        theme.components?.["app-shell"]?.base?.["--color-workspace-sidebar"],
      ).toMatch(/^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
    }
  });
  it("keeps semantic status and neutral document tokens identical across workspaces", () => {
    const baseline = workspaceThemes.content.tokens;
    for (const theme of Object.values(workspaceThemes)) {
      for (const [token, value] of Object.entries(baseline)) {
        if (
          /--color-(?:success|error|warning|on-success|on-error|on-warning)/.test(
            token,
          ) ||
          /--color-background-(?:surface|card|popover)$/.test(token) ||
          token.startsWith("--font-")
        ) {
          expect(theme.tokens[token], `${theme.name}: ${token}`).toEqual(value);
        }
      }
    }
  });

  it("keeps small accent text readable on sidebar, selected, and document surfaces in both modes", () => {
    for (const theme of Object.values(workspaceThemes)) {
      const accent = schemes(theme.tokens["--color-accent"]);
      const foreground = schemes(theme.tokens["--color-on-accent"]);
      for (const token of [
        "--color-workspace-sidebar",
        "--color-accent-muted",
        "--color-background-surface",
      ]) {
        const surface = schemes(
          token === "--color-workspace-sidebar"
            ? theme.components?.["app-shell"]?.base?.[token]
            : theme.tokens[token],
        );
        for (let mode = 0; mode < 2; mode++) {
          expect(
            contrast(accent[mode], surface[mode]),
            `${theme.name}: ${token} mode ${mode}`,
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            contrast(accent[mode], foreground[mode]),
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
