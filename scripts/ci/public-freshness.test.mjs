import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const turbo = JSON.parse(readFileSync("turbo.json", "utf8"));
assert.ok(
  turbo.tasks["@anipotts/www#build"].inputs.includes(
    "$TURBO_ROOT$/content/public/**",
  ),
  "canonical Markdown outside the app must invalidate the public build cache",
);
const feed = readFileSync("apps/www/src/pages/feed.xml.ts", "utf8");
assert.ok(feed.includes("<lastBuildDate>"));
assert.ok(feed.includes("entry.data.published_at?.getTime()"));
assert.ok(feed.includes("new Date(latestPublication).toUTCString()"));
assert.match(
  feed,
  /await publishedWriting\(publicContentContext\(context\.locals\)\)/u,
);
assert.ok(
  feed.includes("prerender = false"),
  "RSS reads active publications at request time",
);
assert.ok(
  !feed.includes("new Date()"),
  "feed freshness reflects publication, not every request",
);
console.log(
  "public freshness: canonical cache inputs and publication-based RSS date passed",
);
