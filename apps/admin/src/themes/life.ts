import { defineTheme } from "@astryxdesign/core/theme";
import { editorialTheme } from "./editorial.ts";

export const lifeTheme = defineTheme({
  name: "life",
  extends: editorialTheme,
  tokens: {
    "--color-accent": ["#70559b", "#c3ade5"],
    "--color-accent-muted": ["#f0ebf7", "#352c43"],
    "--color-text-accent": "var(--color-accent)",
    "--color-icon-accent": "var(--color-accent)",
    "--color-on-accent": ["#ffffff", "#2b203c"],
  },
  components: {
    "app-shell": {
      base: { "--color-workspace-sidebar": "light-dark(#f5f3f8, #19161e)" },
    },
  },
});
