import {
  saveTheme as persistTheme,
  type ThemePreference,
} from "@anipotts/brand/theme";
export { resolvedTheme, themedUrl } from "@anipotts/brand/theme";
export type { ThemePreference } from "@anipotts/brand/theme";

export function initialAdminTheme(...candidates: unknown[]): ThemePreference {
  return (
    candidates.find(
      (value): value is ThemePreference =>
        value === "light" || value === "dark" || value === "system",
    ) ?? "system"
  );
}

/** Self-contained so the exact client resolver also runs before first paint. */
export function prepaintAdminTheme(): ThemePreference {
  const valid = (value: unknown): value is ThemePreference =>
    value === "light" || value === "dark" || value === "system";
  const read = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  let cookie: string | undefined;
  try {
    const raw = document.cookie.match(/(?:^|;\s*)ap-theme=([^;]*)/)?.[1];
    cookie = raw === undefined ? undefined : decodeURIComponent(raw);
  } catch {
    /* Optional storage. */
  }
  const candidates = [
    new URL(location.href).searchParams.get("theme"),
    cookie,
    read("theme"),
    read("admin-theme:v1"),
  ];
  const preference = candidates.find(valid) ?? "system";
  const root = document.documentElement;
  root.style.colorScheme = preference === "system" ? "light dark" : preference;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
  root.dataset.font = "instrument";
  return preference;
}

export const adminThemePrepaintScript = `(${prepaintAdminTheme.toString()})();`;

export function saveTheme(preference: ThemePreference) {
  persistTheme(preference);
  document.documentElement.style.colorScheme =
    preference === "system" ? "light dark" : preference;
  if (preference === "system") delete document.documentElement.dataset.theme;
}

export function savedTheme(): ThemePreference {
  const preference = prepaintAdminTheme();
  const url = new URL(location.href);
  const incoming = url.searchParams.get("theme");
  if (incoming === "light" || incoming === "dark" || incoming === "system") {
    saveTheme(preference);
    url.searchParams.delete("theme");
    try {
      history.replaceState(history.state, "", url);
    } catch {
      /* Sandboxed preview. */
    }
  }
  return preference;
}
