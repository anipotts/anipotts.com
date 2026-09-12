import React, { useEffect, useRef, useState, type RefObject } from "react";
import { TextArea } from "@astryxdesign/core/TextArea";

/** Native typing stays local. Serialization happens only at a save boundary. */
export function DocumentTitle({
  value,
  disabled,
  error,
  resetGeneration = 0,
  flushRef,
  onDirty,
  onDraftTitle,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  error?: string;
  resetGeneration?: number;
  flushRef: RefObject<(() => void) | null>;
  onDirty: () => void;
  onDraftTitle: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const pending = useRef(value);
  const committed = useRef(value);
  const lastReset = useRef(resetGeneration);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    if (value === committed.current && resetGeneration === lastReset.current)
      return;
    lastReset.current = resetGeneration;
    committed.current = value;
    pending.current = value;
    setText(value);
  }, [value, resetGeneration]);
  useEffect(() => {
    const flush = () => {
      if (pending.current === committed.current) return;
      committed.current = pending.current;
      commit.current(pending.current);
    };
    flushRef.current = flush;
    return () => {
      flush();
      if (flushRef.current === flush) flushRef.current = null;
    };
  }, [flushRef]);
  return (
    <TextArea
      label="Title"
      isLabelHidden
      className="document-title"
      rows={1}
      value={text}
      isDisabled={disabled}
      status={error ? { type: "error", message: error } : undefined}
      onChange={(next) => {
        pending.current = next;
        setText(next);
        onDraftTitle(next);
        onDirty();
      }}
    />
  );
}
