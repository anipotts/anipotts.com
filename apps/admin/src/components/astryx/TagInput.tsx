import React, { useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";

/** The stored tags, whatever shape the front matter holds. */
function tagList(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((tag): tag is string => typeof tag === "string");
  if (typeof value === "string")
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  return [];
}

/** Tags as chips with their own remove targets. A comma or Return turns
 * the typed text into a chip; only normalized values are stored. */
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
  const tags = tagList(value);
  const [draft, setDraft] = useState("");
  const add = (text: string) => {
    const typed = text
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (typed.length) onChange([...new Set([...tags, ...typed])]);
    setDraft("");
  };
  return (
    <VStack gap={2} className="editor-tags">
      <TextInput
        label="Tags"
        value={draft}
        isDisabled={disabled}
        status={error ? { type: "error", message: error } : undefined}
        onChange={(next) => (next.includes(",") ? add(next) : setDraft(next))}
        onEnter={() => add(draft)}
        onBlur={() => draft.trim() && add(draft)}
      />
      {tags.length > 0 && (
        <HStack gap={1} wrap="wrap" role="list" aria-label="Tags">
          {tags.map((tag) => (
            <span key={tag} role="listitem" className="editor-tag">
              <Token
                size="sm"
                label={tag}
                isDisabled={disabled}
                onRemove={
                  disabled
                    ? undefined
                    : () => onChange(tags.filter((item) => item !== tag))
                }
              />
            </span>
          ))}
        </HStack>
      )}
    </VStack>
  );
}
