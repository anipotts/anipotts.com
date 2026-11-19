import React, { type Ref } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { Button, IconButton, TextInput } from "./WorkspaceControls";

export function BracketQueryControls({
  label,
  open,
  value,
  resultId,
  inputRef,
  onOpen,
  onChange,
  onSubmit,
}: {
  label: string;
  open: boolean;
  value: string;
  resultId: string;
  inputRef: Ref<HTMLInputElement>;
  onOpen: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!open)
    return (
      <Button
        label={label}
        icon={
          <span className="workspace-bracket-query-symbol" aria-hidden="true">
            [...]
          </span>
        }
        variant="ghost"
        className="workspace-bracket-query-launcher"
        aria-expanded={false}
        onClick={onOpen}
      />
    );

  return (
    <HStack gap={2} vAlign="center" className="workspace-bracket-query">
      <TextInput
        ref={inputRef}
        label={label}
        isLabelHidden
        placeholder={label}
        containerClassName="workspace-bracket-query-field"
        aria-controls={resultId}
        value={value}
        onChange={onChange}
        onEnter={onSubmit}
      />
      <IconButton
        label="Apply query"
        tooltip="Apply query"
        variant="ghost"
        icon={<ArrowRightIcon weight="regular" aria-hidden="true" />}
        onClick={onSubmit}
      />
    </HStack>
  );
}
