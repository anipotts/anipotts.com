import React, { useEffect, useState } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";

/** Keep separators visible while typing; store only normalized tag values. */
export function TagInput({
  value,
  disabled,
  error,
  onChange,
}: {
  value: unknown;
  disabled?: boolean;
  error?: string;
  onChange: (tags: string[]) => void;
}) {
  const canonical = Array.isArray(value)
    ? value.filter((tag) => typeof tag === "string").join(", ")
    : typeof value === "string"
      ? value
      : "";
  const [text, setText] = useState(canonical);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(canonical);
  }, [canonical, focused]);
  return (
    <TextInput
      label="Tags"
      value={text}
      isDisabled={disabled}
      description="Separate tags with commas."
      status={error ? { type: "error", message: error } : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(next) => {
        setText(next);
        onChange(
          next
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
