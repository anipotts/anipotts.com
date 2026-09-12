import type { SaveState } from "./home-autosave";

export type ReviewedDraft = Readonly<{ source: string; revision: number }>;

/** Call after draining local buffers and awaiting the save acknowledgment. */
export function captureReviewedDraft(
  state: SaveState | null,
): ReviewedDraft | null {
  if (
    !state ||
    state.status !== "saved" ||
    state.saveFailed ||
    state.conflict ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 1
  )
    return null;
  return { source: state.source, revision: state.revision };
}

/** Equal text at another revision still requires a new explicit review. */
export function matchesReviewedDraft(
  review: ReviewedDraft | null,
  state: SaveState | null,
): boolean {
  const saved = captureReviewedDraft(state);
  return Boolean(
    review &&
    saved &&
    review.source === saved.source &&
    review.revision === saved.revision,
  );
}
