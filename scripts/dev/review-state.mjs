import { readFileSync } from "node:fs";
export function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}
export function syncHealth(sync, now = Date.now()) {
  if (!sync)
    return { state: "unavailable", label: "published content not synced" };
  const checked = Date.parse(sync.checkedAt ?? sync.syncedAt);
  if (sync.error)
    return { state: "error", label: `sync blocked: ${sync.error}` };
  if (!Number.isFinite(checked) || now - checked > 30000)
    return { state: "stale", label: "published content sync stale" };
  return {
    state: "current",
    label: `published v${sync.version} · checked ${Math.max(0, Math.floor((now - checked) / 1000))}s ago`,
  };
}
export function nodeSupported(version) {
  const [major, minor, patch] = version
    .replace(/^v/, "")
    .split(".")
    .map(Number);
  return (
    major === 25 ||
    (major === 24 && (minor > 19 || (minor === 19 && patch >= 0)))
  );
}
