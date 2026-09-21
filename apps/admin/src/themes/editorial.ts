import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

export const editorialTheme = defineTheme({
  name: "editorial",
  extends: neutralTheme,
  tokens: {
    "--font-family-body": '"Instrument Sans Variable", sans-serif',
    "--font-family-heading": '"Instrument Sans Variable", sans-serif',
    "--color-background-body": ["#f4f5f7", "#090b0e"],
    "--color-background-surface": ["#ffffff", "#111419"],
    "--color-background-card": ["#ffffff", "#111419"],
    "--color-background-popover": ["#ffffff", "#15191f"],
    "--color-background-muted": ["#eceef2", "#171b22"],
    "--color-text-primary": ["#202631", "#eef0f4"],
    "--color-text-secondary": ["#586271", "#aab3c1"],
    "--color-icon-primary": "var(--color-text-primary)",
    "--color-icon-secondary": "var(--color-text-secondary)",
    "--color-accent": ["#245dbe", "#90baff"],
    "--color-text-accent": "var(--color-accent)",
    "--color-icon-accent": "var(--color-accent)",
    "--color-on-accent": ["#ffffff", "#13233d"],
    "--color-accent-muted": ["#e8effc", "#17263b"],
    "--color-border": ["#d9dee6", "#252b35"],
    "--color-border-emphasized": ["#8795a8", "#485365"],
    "--color-overlay-hover": ["#0000000d", "#ffffff08"],
    "--color-overlay-pressed": ["#0000001a", "#ffffff10"],
    "--color-neutral": ["#2026310d", "#eef0f40a"],
  },
  components: {
    // Shell-local CSS property; the closed Astryx token registry remains unchanged.
    "app-shell": {
      base: { "--color-workspace-sidebar": "light-dark(#f1f4fa, #0d1015)" },
    },

    "top-nav": { base: { backgroundColor: "var(--color-background-surface)" } },
    button: {
      base: {
        minHeight: "var(--spacing-9)",
        borderRadius: "var(--radius-element)",
      },
    },
    tab: { base: { minHeight: "var(--spacing-9)" } },
    "segmented-control-item": { base: { minHeight: "var(--spacing-9)" } },
    "text-input": {
      base: {
        backgroundColor: "var(--color-background-surface)",
        color: "var(--color-text-primary)",
      },
    },
    textarea: {
      base: {
        backgroundColor: "var(--color-background-surface)",
        color: "var(--color-text-primary)",
      },
    },
    "collapsible-trigger": { base: { minHeight: "var(--spacing-11)" } },

    // Table language shared by every workspace. Column labels are quiet so
    // the rows carry the weight, figures line up as tabular numerals, and
    // chips read as chips.
    table: { base: { fontVariantNumeric: "tabular-nums" } },
    "table-header-cell": {
      base: {
        fontWeight: "500",
        fontSize: "var(--text-supporting-size)",
        letterSpacing: "0.02em",
        color: "var(--color-text-secondary)",
      },
    },
    token: { base: { fontWeight: "500" } },
  },
});
