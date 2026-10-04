/** One supported theme contract shared by our SDK boundary and ChatKit.
 * ChatKit renders in its own hosted frame; these are options, not CSS overrides. */
export type AdminColorMode = "light" | "dark";
export const ADMIN_FONT_FAMILY =
  'ui-sans-serif, -apple-system, system-ui, "Segoe UI", sans-serif';
export function chatkitTheme(colorScheme: AdminColorMode) {
  return {
    colorScheme,
    radius: "soft" as const,
    density: "normal" as const,
    typography: { fontFamily: ADMIN_FONT_FAMILY, baseSize: 16 as const },
  };
}
