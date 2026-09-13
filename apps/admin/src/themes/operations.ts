import { defineTheme } from "@astryxdesign/core/theme";
import { editorialTheme } from "./editorial.ts";

export const operationsTheme = defineTheme({
  name: "operations",
  extends: editorialTheme,
  tokens: {
    "--color-accent": ["#286c65", "#8ac8bd"],
    "--color-accent-muted": ["#e8f1ee", "#223b36"],
    "--color-text-accent": "var(--color-accent)",
    "--color-icon-accent": "var(--color-accent)",
    "--color-on-accent": ["#ffffff", "#152d28"],
  },
  components: {
    "app-shell": {
      base: { "--color-workspace-sidebar": "light-dark(#f1f6f4, #131b19)" },
    },
  },
});
