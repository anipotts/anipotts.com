// One definition of "does this destination leave the site?", shared by every
// public component that renders an authored link.
//
// Structured content fields (project link_live/link_repo, artifact_url) accept
// internal paths and fragments as well as absolute URLs, so a component cannot
// assume an authored destination is external. Only an absolute https:// target
// opens in a new tab; internal paths and fragments stay in the current tab.
// Scheme safety is enforced upstream by @anipotts/content's URL validators;
// this predicate only classifies an already-validated destination.
export function isExternalDestination(
  href: string | undefined | null,
): boolean {
  return Boolean(href && /^https:\/\//iu.test(href));
}
