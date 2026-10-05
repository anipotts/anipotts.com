/** Project identity assets already owned by the public site. URL imports let
 * each app emit/cache the same source artwork without duplicating files or
 * fetching remote favicons. Prefer small existing favicons to full logos. */
import agents from "../../../apps/www/public/images/brand/agents-favicon.svg?url&no-inline";
import chainedchat from "../../../apps/www/public/images/brand/chainedchat-logo.png?url&no-inline";
import npm from "../../../apps/www/public/images/brand/npm-icon.svg?url&no-inline";
import chrome from "../../../apps/www/public/images/brand/google-chrome-logo.svg?url&no-inline";
import nyu from "../../../apps/www/public/images/brand/nyu-purity-test-favicon.png?url&no-inline";
import habit from "../../../apps/www/public/images/brand/bad-habit-favicon.png?url&no-inline";
import paragon from "../../../apps/www/public/images/brand/paragon-favicon.png?url&no-inline";
import quantercise from "../../../apps/www/public/images/brand/quantercise-legacy-icon.png?url&no-inline";
import structured from "../../../apps/www/public/images/brand/structured-ai-favicon.png?url&no-inline";
const PROJECT_MARKS: Readonly<Record<string, string>> = {
  agents,
  chainedchat,
  "imessage-mcp": npm,
  "quantercise-extension": chrome,
  "nyu-purity-test": nyu,
  "habittracker-obh": habit,
  "pgi-research-platform": paragon,
  quantercise,
  "structured-ai": structured,
};
export function projectMark(id: string | undefined): string | null {
  return id && Object.hasOwn(PROJECT_MARKS, id) ? PROJECT_MARKS[id] : null;
}

/** Resolve configured owned artwork to this app's hashed asset, preserving
 * identity choices while avoiding a cross-origin request or a copied file. */
const OWNED_ARTWORK = import.meta.glob<string>(
  "../../../apps/www/public/images/brand/*.{png,svg}",
  { eager: true, query: "?url&no-inline", import: "default" },
);
export function ownedProjectArtwork(src: string | undefined): string | null {
  const prefix = "/images/brand/";
  if (!src?.startsWith(prefix)) return null;
  const key =
    "../../../apps/www/public/images/brand/" + src.slice(prefix.length);
  return Object.hasOwn(OWNED_ARTWORK, key) ? OWNED_ARTWORK[key] : null;
}
