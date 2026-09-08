export type ColorTheme = "light" | "dark";
export type ThemePreference = ColorTheme | "system";
export const resolvedTheme = (theme: ThemePreference): ColorTheme =>
  theme === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : theme;

export function savedTheme(): ThemePreference {
  const incoming = new URL(location.href).searchParams.get("theme");
  if (incoming === "light" || incoming === "dark" || incoming === "system") {
    saveTheme(incoming);
    const url = new URL(location.href);
    url.searchParams.delete("theme");
    try {
      history.replaceState(history.state, "", url);
    } catch {
      /* Sandboxed previews cannot rewrite history. */
    }
    return incoming;
  }
  let cookie: string | undefined;
  try {
    cookie = document.cookie.match(
      /(?:^|;\s*)ap-theme=(light|dark|system)(?:;|$)/,
    )?.[1];
  } catch {
    /* Sandboxed previews cannot read cookies. */
  }
  if (cookie === "light" || cookie === "dark" || cookie === "system")
    return cookie;
  try {
    const value = localStorage.getItem("theme");
    return value === "dark" || value === "system" ? value : "light";
  } catch {
    return "light";
  }
}

export function saveTheme(theme: ThemePreference) {
  document.documentElement.dataset.theme = resolvedTheme(theme);
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* Storage is optional. */
  }
  const host = location.hostname;
  const domain =
    host === "anipotts.com" || host.endsWith(".anipotts.com")
      ? "; Domain=anipotts.com"
      : host === "anipotts.localhost" || host.endsWith(".anipotts.localhost")
        ? "; Domain=anipotts.localhost"
        : "";
  try {
    document.cookie = `ap-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    /* Theme changes remain usable without cookie access. */
  }
}

export function themedUrl(destination: string, theme: ThemePreference) {
  const url = new URL(
    destination,
    typeof location === "undefined" ? undefined : location.href,
  );
  url.searchParams.set("theme", theme);
  return url.href;
}
