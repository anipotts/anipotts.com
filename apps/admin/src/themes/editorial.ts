import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

const insetSurfaceText = {
  "--color-text-primary": "light-dark(#0b1220, #f7faff)",
  "--color-text-secondary": "light-dark(#263c55, #abb2be)",
  "--color-icon-primary": "var(--color-text-primary)",
  "--color-icon-secondary": "var(--color-text-secondary)",
  "--color-neutral": "light-dark(#123d6510, #ffffff12)",
  color: "var(--color-text-primary)",
};

export const editorialTheme = defineTheme({
  name: "editorial",
  extends: neutralTheme,
  tokens: {
    "--font-family-body": '"Instrument Sans Variable", sans-serif',
    "--font-family-heading": '"Instrument Sans Variable", sans-serif',
    "--color-background-body": ["#61abea", "#080b10"],
    "--color-background-surface": ["#61abea", "#080b10"],
    "--color-background-card": ["#f7faff", "#11151d"],
    "--color-background-popover": ["#f7faff", "#11151d"],
    "--color-background-muted": ["#e4effa", "#1b2636"],
    "--color-text-primary": ["#ffffff", "#f7faff"],
    "--color-text-secondary": ["#f1f7ff", "#abb2be"],
    "--color-icon-primary": "var(--color-text-primary)",
    "--color-icon-secondary": "var(--color-text-secondary)",
    "--color-accent": ["#123d65", "#61abea"],
    "--color-text-accent": "var(--color-accent)",
    "--color-icon-accent": "var(--color-accent)",
    "--color-on-accent": ["#ffffff", "#07111a"],
    "--color-accent-muted": ["#e4effa", "#172c40"],
    "--color-border": ["#123d6533", "#ffffff26"],
    "--color-border-emphasized": ["#123d6566", "#ffffff55"],
    "--color-neutral": ["#123d6540", "#ffffff12"],
  },
  components: {
    "top-nav": { base: { backgroundColor: "var(--color-background-body)" } },
    button: { base: { minHeight: "var(--spacing-9)" } },
    tab: { base: { minHeight: "var(--spacing-9)" } },
    "segmented-control-item": { base: { minHeight: "var(--spacing-9)" } },
    card: { base: insetSurfaceText },
    "dropdown-menu": { base: insetSurfaceText },
    "text-input": {
      base: {
        backgroundColor: "#ffffff",
        "--color-text-primary": "#0b1220",
        "--color-text-secondary": "#526174",
        "--color-icon-primary": "#526174",
        "--color-icon-secondary": "#526174",
        color: "var(--color-text-primary)",
      },
    },
    "collapsible-trigger": { base: { minHeight: "var(--spacing-11)" } },
  },
});
