import React, { useEffect, useRef, useState, type RefObject } from "react";
import { AutoSizeTextArea } from "./AutoSizeTextArea";

/** A title is one line of front matter: Return and pasted breaks never
 * reach the YAML. */
const oneLine = (value: string) => value.replace(/[\r\n]+/gu, " ");

/** The keyboard a title wants: no capitals forced, and Return moves on. */
const TITLE_HINTS: Record<string, string> = {
  enterkeyhint: "next",
  autocapitalize: "off",
};

/**
 * A record's title as the large first line of the document, for every kind.
 * Native typing stays local; serialization happens only at a save boundary.
 * Return moves to the next field.
 */
export function DocumentTitle({
  label = "Title",
  value,
  disabled,
  error,
  resetGeneration = 0,
  flushRef,
  onDirty,
  onDraftTitle,
  onCommit,
  onEnter,
}: {
  label?: string;
  value: string;
  disabled?: boolean;
  error?: string;
  resetGeneration?: number;
  flushRef: RefObject<(() => void) | null>;
  onDirty: () => void;
  onDraftTitle: (value: string) => void;
  onCommit: (value: string) => void;
  /** Return in the title: usually focus the next field. */
  onEnter?: () => void;
}) {
  const [text, setText] = useState(value);
  const pending = useRef(value);
  const committed = useRef(value);
  const lastReset = useRef(resetGeneration);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const field = host.current?.querySelector("textarea");
    if (field)
      for (const [name, hint] of Object.entries(TITLE_HINTS))
        field.setAttribute(name, hint);
  }, []);
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
    <div
      ref={host}
      className="document-title"
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        onEnter?.();
      }}
    >
      <AutoSizeTextArea
        label={label}
        isLabelHidden
        placeholder={label}
        rows={1}
        value={text}
        isDisabled={disabled}
        status={error ? { type: "error", message: error } : undefined}
        onChange={(input) => {
          const next = oneLine(input);
          pending.current = next;
          setText(next);
          onDraftTitle(next);
          onDirty();
        }}
      />
    </div>
  );
}
