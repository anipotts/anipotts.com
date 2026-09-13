import React from "react";
import type { SaveState } from "../../lib/home-autosave";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Token } from "@astryxdesign/core/Token";

export type SaveStatusState =
  | "unchanged"
  | "changed"
  | "saving"
  | "saved-locally"
  | "saved-privately"
  | "save-failed"
  | "conflict"
  | "session-expired"
  | "discarded";

const states = {
  unchanged: { label: "No changes", variant: "neutral" },
  changed: { label: "Unsaved changes", variant: "neutral" },
  saving: { label: "Saving…", variant: "neutral" },
  "saved-locally": { label: "Saved locally", variant: "success" },
  "saved-privately": { label: "Saved privately", variant: "success" },
  "save-failed": { label: "Save failed", variant: "error" },
  conflict: { label: "Resolve conflict", variant: "warning" },
  "session-expired": { label: "Session expired", variant: "warning" },
  discarded: { label: "Draft discarded", variant: "neutral" },
} as const;

export type SaveStatusProps = {
  /**
   * Evidence for the current editor contents, supplied by the save controller.
   * Use a saved state only after those exact contents are persisted at the
   * named destination. An unchanged base is not evidence of a saved draft.
   * This component does not infer persistence from time, connectivity or mode.
   */
  state: SaveStatusState;
  /** ID of an existing explanation or recovery message, when applicable. */
  describedBy?: string;
};

/** Shared presentation of the current autosave controller evidence. */
export function saveStatusFromController(
  state: SaveState,
  {
    discarded = false,
    bodyDirty = false,
    localPreview = false,
  }: { discarded?: boolean; bodyDirty?: boolean; localPreview?: boolean } = {},
): SaveStatusState {
  if (discarded) return "discarded";
  if (state.status === "conflict") return "conflict";
  if (state.saveFailed) return "save-failed";
  if (bodyDirty) return "changed";
  if (state.status === "saving") return "saving";
  if (state.status !== "saved") return "changed";
  if (state.revision === 0) return "unchanged";
  return localPreview ? "saved-locally" : "saved-privately";
}

/** Persistence status only. Publication and public verification are separate. */
export function SaveStatus({ state, describedBy }: SaveStatusProps) {
  const { label, variant } = states[state];
  return (
    <HStack
      as="span"
      gap={0}
      role="status"
      aria-label="Draft save status"
      aria-live="polite"
      aria-atomic="true"
      aria-describedby={describedBy}
      className="editor-save-status"
      data-save-state={state}
      style={{
        inlineSize: "max-content",
        maxInlineSize: "100%",
        flexShrink: 0,
      }}
    >
      <Token
        label={label}
        size="sm"
        icon={
          <StatusDot
            variant={variant}
            label={label}
            aria-hidden="true"
            isPulsing={false}
          />
        }
        style={{
          inlineSize: "max-content",
          maxInlineSize: "100%",
          height: "auto",
          minBlockSize: "var(--spacing-6)",
          gap: "var(--spacing-2)",
          color: "var(--color-text-secondary)",
        }}
      />
    </HStack>
  );
}
