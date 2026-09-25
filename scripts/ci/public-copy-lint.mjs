#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  analyzePublicCopy,
  DEFAULT_HOMEPAGE_CONTENT,
  DEFAULT_SYSTEMS_CONTENT,
} from "../../packages/content/dist/public/index.js";

const surfaces = [
  {
    id: "homepage-default",
    text: JSON.stringify(DEFAULT_HOMEPAGE_CONTENT),
    source: "packages/content/src/public/defaults.ts",
  },
  {
    id: "systems-default",
    text: JSON.stringify(DEFAULT_SYSTEMS_CONTENT),
    source: "packages/content/src/public/defaults.ts",
  },
  ...[
    "apps/www/src/pages/index.astro",
    "apps/www/src/pages/systems.astro",
    "apps/www/src/pages/links.astro",
    "apps/www/src/pages/business.astro",
    "apps/www/src/pages/404.astro",
    "apps/www/src/components/Footer.astro",
  ].map((source) => ({
    id: source,
    text: readFileSync(source, "utf8"),
    source,
  })),
];

const findings = surfaces.flatMap((surface) =>
  analyzePublicCopy(surface.text, {
    surfaceId: surface.id,
    context: "evergreen",
    sourceRef: surface.source,
  }),
);

if (findings.length > 0) {
  for (const finding of findings) {
    process.stderr.write(
      `${finding.sourceRef}: ${finding.rule}: ${JSON.stringify(finding.excerpt)}. ${finding.suggestedRewrite}\n`,
    );
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `public copy policy passed for ${surfaces.length} surfaces\n`,
  );
}
