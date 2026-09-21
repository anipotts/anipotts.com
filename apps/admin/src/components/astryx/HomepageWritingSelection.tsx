import React, { useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";

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
  const [candidate, setCandidate] = useState("");
  const available = options.filter(
    (option, index) =>
      option.status === "published" &&
      !value.includes(option.slug) &&
      options.findIndex((other) => other.slug === option.slug) === index,
  );
  const canAdd = available.some((option) => option.slug === candidate);
  const move = (index: number, direction: -1 | 1) => {
    const next = [...value];
    [next[index], next[index + direction]] = [
      next[index + direction]!,
      next[index]!,
    ];
    onChange(next);
  };
  return (
    <VStack gap={2}>
      <Text>Homepage writing</Text>
      <Text>
        {value.length} selected. The homepage shows up to {limit} published
        articles in this order.
      </Text>
      {value.length === 0 && <Text>No articles selected.</Text>}
      {value.some(
        (slug) =>
          !options.some(
            (option) => option.slug === slug && option.status === "published",
          ),
      ) && (
        <Text>
          Unresolved or unpublished selections are retained until you remove
          them. Publish the referenced article first, or remove its selection
          before publishing this page.
        </Text>
      )}
      {value.map((slug, index) => {
        const record = options.find((option) => option.slug === slug);
        return (
          <VStack key={`${index}:${slug}`} gap={1}>
            <Text wordBreak="break-word">
              {index + 1}. {record?.title || slug}
              {!record
                ? " (unresolved selection)"
                : record.status !== "published"
                  ? " (not published)"
                  : ""}
            </Text>
            {record && record.title !== slug && (
              <Text color="secondary" wordBreak="break-word">
                {slug}
              </Text>
            )}
            <HStack gap={1} wrap="wrap" vAlign="center">
              <Button
                label={`Move selection ${index + 1} up`}
                children="Up"
                size="sm"
                variant="ghost"
                isDisabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              />
              <Button
                label={`Move selection ${index + 1} down`}
                children="Down"
                size="sm"
                variant="ghost"
                isDisabled={disabled || index === value.length - 1}
                onClick={() => move(index, 1)}
              />
              <Button
                label={`Remove selection ${index + 1}`}
                children="Remove"
                size="sm"
                variant="ghost"
                isDisabled={disabled}
                onClick={() =>
                  onChange(value.filter((_, position) => position !== index))
                }
              />
            </HStack>
          </VStack>
        );
      })}
      <HStack gap={1} wrap="wrap" vAlign="center">
        <Selector
          label="Published article"
          size="sm"
          value={canAdd ? candidate : ""}
          isDisabled={disabled || available.length === 0}
          options={[
            { value: "", label: "Choose an article" },
            ...available.map((option) => ({
              value: option.slug,
              label: `${option.title} (${option.slug})`,
            })),
          ]}
          onChange={setCandidate}
        />
        <Button
          label="Add article"
          size="sm"
          variant="ghost"
          isDisabled={disabled || !canAdd}
          onClick={() => {
            if (canAdd && !disabled) {
              onChange([...value, candidate]);
              setCandidate("");
            }
          }}
        />
      </HStack>
    </VStack>
  );
}
