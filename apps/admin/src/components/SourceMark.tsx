import React from "react";
import { BrandTile } from "./BrandTile";
import { markLabel, sourceMark } from "../lib/marks";

type Props = {
  provider: "codex" | "claude" | "github" | "handoff" | "chatgpt";
  compact?: boolean;
};

/** A work item's provider: its brand tile and name. Handoffs have no brand,
 * so they take the handoff glyph in the same tile. */
export function SourceMark({ provider, compact = false }: Props) {
  const tile = sourceMark(provider);
  const label = markLabel(tile) ?? "Handoff";

  return (
    <span
      className="operator-source-mark"
      data-provider={provider}
      aria-label={`${label} source`}
      title={`${label} source`}
    >
      <BrandTile {...tile} size={20} />
      <span className="operator-source-label">{label}</span>
      {!compact && <span className="sr-only"> provider</span>}
    </span>
  );
}
