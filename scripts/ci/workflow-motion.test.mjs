import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  marqueeDuration,
  motionPaused,
} from "../../apps/www/src/scripts/workflow-motion.ts";
assert.equal(marqueeDuration(540), 27, "constant 20px per second");
assert.equal(
  marqueeDuration(20),
  1,
  "one cycle per iteration wraps seamlessly",
);
assert.equal(marqueeDuration(0), 0, "empty strips do not produce NaN");

// The drift belongs to the compositor: no frame loop may write the transform.
const animation = readFileSync(
  "apps/www/src/scripts/workflow-animation.ts",
  "utf8",
);
assert.equal(
  /requestAnimationFrame|cancelAnimationFrame|style\.transform/.test(animation),
  false,
  "the marquee runs on a CSS keyframe, not a per-frame transform write",
);
// Safari resolves a keyframe's var() when the animation starts and never
// re-reads it, so a changed cycle must detach the keyframe rather than edit it.
assert.match(
  animation,
  /delete root\.dataset\.animated;\s*void track\.offsetWidth;/,
  "a changed cycle detaches and re-attaches the keyframe instead of editing it",
);
assert.ok(
  animation.includes("--source-cycle") &&
    animation.includes("--source-cycle-duration"),
  "the script supplies the keyframe distance and duration",
);
const workflow = readFileSync(
  "apps/www/src/components/SystemMap.astro",
  "utf8",
);
assert.match(
  workflow,
  /@keyframes source-drift\s*\{\s*from\s*\{\s*transform:\s*translate3d\(0, 0, 0\);\s*\}\s*to\s*\{\s*transform:\s*translate3d\(calc\(-1 \* var\(--source-cycle, 0px\)\), 0, 0\);/,
  "one keyframe translates the strip by exactly one cycle",
);
assert.match(
  workflow,
  /\[data-motion="paused"\] \.source-track\s*\{\s*animation-play-state:\s*paused/,
  "the existing pause preference stops the keyframe",
);
assert.match(
  workflow,
  /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.workflow \.source-track\s*\{\s*animation:\s*none/,
  "reduced motion removes the keyframe outright",
);
const active = [false, true, false, false];
assert.equal(motionPaused(...active), false);
for (let i = 0; i < active.length; i++) {
  const paused = [...active];
  paused[i] = !paused[i];
  assert.equal(
    motionPaused(...paused),
    true,
    `pause cause ${i} wins independently`,
  );
}
console.log(
  "workflow marquee: css keyframe speed, wrap, and explicit/environmental pause passed",
);
