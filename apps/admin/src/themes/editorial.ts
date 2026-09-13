import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

export const editorialTheme = defineTheme({
  name: "editorial",
  extends: neutralTheme,
  tokens: {
    "--font-family-body": '"Instrument Sans Variable", sans-serif',
    "--font-family-heading": '"Instrument Sans Variable", sans-serif',
    "--color-background-body": ["#f4f5f7", "#111317"],
    "--color-background-surface": ["#ffffff", "#1a1d23"],
    "--color-background-card": ["#ffffff", "#1a1d23"],
    "--color-background-popover": ["#ffffff", "#23272f"],
    "--color-background-muted": ["#eceef2", "#242932"],
    "--color-text-primary": ["#202631", "#eef0f4"],
    "--color-text-secondary": ["#586271", "#aab3c1"],
    "--color-icon-primary": "var(--color-text-primary)",
    "--color-icon-secondary": "var(--color-text-secondary)",
    "--color-accent": ["#245dbe", "#90baff"],
    "--color-text-accent": "var(--color-accent)",
    "--color-icon-accent": "var(--color-accent)",
    "--color-on-accent": ["#ffffff", "#13233d"],
    "--color-accent-muted": ["#e8effc", "#263650"],
    "--color-border": ["#d9dee6", "#343b47"],
    "--color-border-emphasized": ["#8795a8", "#707f94"],
    "--color-neutral": ["#2026310d", "#eef0f410"],
  },
  components: {
    // Shell-local CSS property; the closed Astryx token registry remains unchanged.
    "app-shell": {
      base: { "--color-workspace-sidebar": "light-dark(#f1f4fa, #131820)" },
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
  },
});
