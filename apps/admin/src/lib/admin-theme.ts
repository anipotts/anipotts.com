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
  // Do not introduce nested functions here. Worker bundling can wrap them in
  // name-preservation helpers that would escape into the serialized script.
  let cookie: string | undefined;
  try {
    const raw = document.cookie.match(/(?:^|;\s*)ap-theme=([^;]*)/)?.[1];
    cookie = raw === undefined ? undefined : decodeURIComponent(raw);
  } catch {
    /* Optional storage. */
  }
  const candidates = [new URL(location.href).searchParams.get("theme"), cookie];
  for (const key of ["theme", "admin-theme:v1"]) {
    try {
      candidates.push(localStorage.getItem(key));
    } catch {
      // Storage is optional; the first valid earlier candidate still wins.
    }
  }
  let preference: ThemePreference = "system";
  for (const candidate of candidates) {
    if (
      candidate === "light" ||
      candidate === "dark" ||
      candidate === "system"
    ) {
      preference = candidate;
      break;
    }
  }
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
