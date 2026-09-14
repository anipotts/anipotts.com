import instrumentSans from "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url";
import apStructural from "@anipotts/brand/ap-structural/fonts/APStructuralDisplayBlack-v0.2.0-candidate.1.woff2?url";

/** Font files every admin page renders with, preloaded from the document
 * head so they are fetched alongside the HTML rather than after the
 * stylesheet is parsed. styles/fonts.css declares the faces with
 * `font-display: optional`, which only holds without a flash when the files
 * arrive early. The URLs go through the same asset pipeline as the
 * stylesheet's `url()` references, so a preload is always the file the face
 * uses. */
export const preloadedFontUrls: readonly string[] = [
  instrumentSans,
  apStructural,
];
