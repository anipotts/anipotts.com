import {
  resolvedTheme,
  saveTheme as persistTheme,
  type ThemePreference,
} from "@anipotts/brand/theme";
import { editorialTheme } from "../themes/editorial.js";
export { resolvedTheme, themedUrl } from "@anipotts/brand/theme";
export type { ThemePreference } from "@anipotts/brand/theme";

/**
 * The canvas: one colour for html, body, main, the phone top bar and the
 * browser's status bar, as [light, dark]. Read from the editorial theme's
 * `--color-background-body`, so the theme stays the one declaration.
 */
export const ADMIN_CANVAS = (() => {
  const pair = /^light-dark\((#[\da-f]{6}), (#[\da-f]{6})\)$/i.exec(
    String(editorialTheme.tokens["--color-background-body"]),
  );
  if (!pair) throw new Error("editorial --color-background-body is not a pair");
  return [pair[1]!, pair[2]!] as const;
})();

/** The canvas colour for a preference, as the browser resolves it now. */
export function themeColor(preference: ThemePreference): string {
  let dark = preference === "dark";
  if (preference === "system")
    try {
      dark = resolvedTheme("system") === "dark";
    } catch {
      /* No matchMedia: light, the server's first guess. */
    }
  return dark ? ADMIN_CANVAS[1] : ADMIN_CANVAS[0];
}

/** iOS status-bar text over the canvas, as [light, dark]: dark text on the
 * light canvas (`default`, which iOS tints with theme-color) and light text
 * drawn over the dark canvas (`black-translucent`). An installed app reads
 * it when it launches. */
export const STATUS_BAR_STYLES = ["default", "black-translucent"] as const;

/** `canvas` (#rrggbb) as it shows under a backdrop colour (rgb or rgba), so
 * the status bar dims with the page while a modal is open. */
export function dimmedCanvas(canvas: string, backdrop: string): string {
  const scrim =
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(
      backdrop,
    );
  const base = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(canvas);
  if (!scrim || !base) return canvas;
  const alpha = scrim[4] === undefined ? 1 : Number(scrim[4]);
  return `#${[1, 2, 3]
    .map((i) =>
      Math.round(
        parseInt(base[i]!, 16) * (1 - alpha) + Number(scrim[i]) * alpha,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Light, then dark, then system: the order of the one theme button. */
export const THEME_CYCLE = ["light", "dark", "system"] as const;
export function nextTheme(preference: ThemePreference): ThemePreference {
  return THEME_CYCLE[(THEME_CYCLE.indexOf(preference) + 1) % 3]!;
}

export function initialAdminTheme(...candidates: unknown[]): ThemePreference {
  return (
    candidates.find(
      (value): value is ThemePreference =>
        value === "light" || value === "dark" || value === "system",
    ) ?? "system"
  );
}

/** Self-contained so the exact client resolver also runs before first paint.
 * The serialized script passes the canvas pair as its one argument. */
export function prepaintAdminTheme(
  canvas: readonly [string, string] = ADMIN_CANVAS,
): ThemePreference {
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
  // The status bar takes the canvas colour the page is about to paint, and
  // text that reads on it (STATUS_BAR_STYLES, written out here because the
  // script is serialized on its own).
  try {
    const dark =
      preference === "dark" ||
      (preference === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? canvas[1] : canvas[0]);
    document
      .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      ?.setAttribute("content", dark ? "black-translucent" : "default");
  } catch {
    /* The meta is cosmetic; the page paints the same without it. */
  }
  return preference;
}

export const adminThemePrepaintScript = `(${prepaintAdminTheme.toString()})(${JSON.stringify(ADMIN_CANVAS)});`;

/** The open modal's backdrop colour, or null while no modal is open. */
function modalBackdrop(): string | null {
  try {
    const modal = document.querySelector("dialog:modal");
    return modal
      ? getComputedStyle(modal, "::backdrop").backgroundColor || null
      : null;
  } catch {
    return null;
  }
}

/** Points the theme-color meta at the canvas for this preference, dimmed
 * while a modal's backdrop covers the page, and the status-bar style at
 * text that reads on it. */
export function syncThemeColor(preference: ThemePreference) {
  const canvas = themeColor(preference);
  const backdrop = modalBackdrop();
  try {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        backdrop ? dimmedCanvas(canvas, backdrop) : canvas,
      );
    document
      .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      ?.setAttribute(
        "content",
        STATUS_BAR_STYLES[canvas === ADMIN_CANVAS[1] ? 1 : 0],
      );
  } catch {
    /* No document to update. */
  }
}

let followed: ThemePreference = "system";
let systemScheme: MediaQueryList | null = null;
let modals: MutationObserver | null = null;
/** In system mode the status bar follows the OS between light and dark, and
 * in every mode it dims while a modal dialog (the palette, a sheet) is open
 * and returns when it closes. */
function followCanvas(preference: ThemePreference) {
  followed = preference;
  if (!modals && typeof MutationObserver === "function")
    try {
      modals = new MutationObserver(() => syncThemeColor(followed));
      modals.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ["open"],
      });
    } catch {
      modals = null;
    }
  if (systemScheme || typeof matchMedia !== "function") return;
  try {
    systemScheme = matchMedia("(prefers-color-scheme: dark)");
    systemScheme.addEventListener?.("change", () => {
      if (followed === "system") syncThemeColor("system");
    });
  } catch {
    systemScheme = null;
  }
}

export function saveTheme(preference: ThemePreference) {
  persistTheme(preference);
  document.documentElement.style.colorScheme =
    preference === "system" ? "light dark" : preference;
  if (preference === "system") delete document.documentElement.dataset.theme;
  syncThemeColor(preference);
  followCanvas(preference);
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
  followCanvas(preference);
  return preference;
}
