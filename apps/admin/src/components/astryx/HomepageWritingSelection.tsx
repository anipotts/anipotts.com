import React from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { Selector } from "@astryxdesign/core/Selector";
import { CaretDownIcon, CaretUpIcon, XIcon } from "@phosphor-icons/react";

export type HomepageWritingOption = {
  /** Published public slug, which may differ from the record id. */
  slug: string;
  title: string;
  status: string;
};

export function HomepageWritingSelection({
  value,
  options,
  disabled = false,
  limit = 3,
  onChange,
}: {
  value: readonly string[];
  options: readonly HomepageWritingOption[];
  disabled?: boolean;
  limit?: number;
  onChange: (value: string[]) => void;
}) {
  const available = options.filter(
    (option, index) =>
      option.status === "published" &&
      !value.includes(option.slug) &&
      options.findIndex((other) => other.slug === option.slug) === index,
  );
  const move = (index: number, direction: -1 | 1) => {
    const next = [...value];
    [next[index], next[index + direction]] = [
      next[index + direction]!,
      next[index]!,
    ];
    onChange(next);
  };
  return (
    <VStack gap={1} className="editor-homepage-writing">
      <HStack gap={2} vAlign="center">
        <Heading level={2} className="editor-sections-title">
          Homepage writing
        </Heading>
        <Text color="secondary" className="workspace-count">
          {value.length} of {limit}
        </Text>
      </HStack>
      {value.map((slug, index) => {
        const record = options.find((option) => option.slug === slug);
        const exception = !record
          ? "Unresolved"
          : record.status !== "published"
            ? "Not published"
            : null;
        return (
          <HStack
            key={`${index}:${slug}`}
            gap={1}
            vAlign="center"
            className="editor-homepage-row"
          >
            <span className="editor-section-name" title={slug}>
              <Text>{record?.title || slug}</Text>
            </span>
            {exception && (
              <Token size="sm" label={exception} className="workspace-state" />
            )}
            {/* Up, down and remove keep fixed columns: a move that does not
                apply leaves its slot empty. */}
            {index > 0 ? (
              <IconButton
                label={`Move selection ${index + 1} up`}
                tooltip="Move up"
                size="sm"
                variant="ghost"
                icon={<CaretUpIcon weight="regular" aria-hidden="true" />}
                isDisabled={disabled}
                onClick={() => move(index, -1)}
              />
            ) : (
              <span className="editor-homepage-slot" aria-hidden="true" />
            )}
            {index < value.length - 1 ? (
              <IconButton
                label={`Move selection ${index + 1} down`}
                tooltip="Move down"
                size="sm"
                variant="ghost"
                icon={<CaretDownIcon weight="regular" aria-hidden="true" />}
                isDisabled={disabled}
                onClick={() => move(index, 1)}
              />
            ) : (
              <span className="editor-homepage-slot" aria-hidden="true" />
            )}
            <IconButton
              label={`Remove selection ${index + 1}`}
              tooltip="Remove"
              size="sm"
              variant="ghost"
              icon={<XIcon weight="regular" aria-hidden="true" />}
              isDisabled={disabled}
              onClick={() =>
                onChange(value.filter((_, position) => position !== index))
              }
            />
          </HStack>
        );
      })}
      {/* Choosing an article adds it; there is no separate Add step. */}
      <Selector
        label="Add an article"
        isLabelHidden
        size="sm"
        value=""
        isDisabled={disabled || available.length === 0}
        options={[
          { value: "", label: "Add an article" },
          ...available.map((option) => ({
            value: option.slug,
            label: option.title,
          })),
        ]}
        onChange={(slug) => {
          if (!disabled && available.some((option) => option.slug === slug))
            onChange([...value, slug]);
        }}
      />
    </VStack>
  );
}
