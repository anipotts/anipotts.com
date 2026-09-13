import { editorialTheme } from "./editorial.js";
import { operationsTheme } from "./operations.js";
import { lifeTheme } from "./life.js";

/** Pair these built themes with all three generated stylesheets in the shell. */
export const workspaceThemes = {
  content: editorialTheme,
  operations: operationsTheme,
  life: lifeTheme,
} as const;
