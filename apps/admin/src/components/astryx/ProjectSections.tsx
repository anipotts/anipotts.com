import React from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import type { ProjectSectionEdit } from "../../lib/project-sections";

export function ProjectSections({
  source,
  errors = new Map(),
  disabled,
  onEdit,
}: {
  source: string;
  errors?: Map<string, string>;
  disabled?: boolean;
  onEdit: (edit: ProjectSectionEdit) => void;
}) {
  const data = parseEditorialSource(source).data as Record<string, unknown>;
  const status = (path: string) =>
    errors.has(path)
      ? { type: "error" as const, message: errors.get(path) }
      : undefined;
  return (
    <VStack gap={2}>
      <Text>Sections</Text>
      {(["story", "technical"] as const).map((kind) => {
        const entries = Array.isArray(data[kind])
          ? (data[kind] as Array<{ title?: string; paragraphs?: string[] }>)
          : [];
        return (
          <VStack key={kind} gap={1}>
            {entries.map((entry, index) => (
              <HStack key={index} gap={1} wrap="wrap" vAlign="center">
                <Text>
                  {entry.title ||
                    `${kind === "story" ? "Story" : "Technical"} ${index + 1}`}
                </Text>
                <Button
                  label={`Move ${kind} ${index + 1} up`}
                  children="Up"
                  size="sm"
                  variant="ghost"
                  isDisabled={disabled || index === 0}
                  onClick={() =>
                    onEdit({ type: "move", kind, index, direction: -1 })
                  }
                />
                <Button
                  label={`Move ${kind} ${index + 1} down`}
                  children="Down"
                  size="sm"
                  variant="ghost"
                  isDisabled={disabled || index === entries.length - 1}
                  onClick={() =>
                    onEdit({ type: "move", kind, index, direction: 1 })
                  }
                />
                <Button
                  label={`Remove ${kind} section ${index + 1}`}
                  children="Remove section"
                  size="sm"
                  variant="ghost"
                  isDisabled={disabled}
                  onClick={() => onEdit({ type: "remove", kind, index })}
                />
                {kind === "story" &&
                  Array.isArray(entry.paragraphs) &&
                  entry.paragraphs.length > 1 &&
                  entry.paragraphs.map((_, paragraph) => (
                    <Button
                      key={paragraph}
                      label={`Remove story ${index + 1} paragraph ${paragraph + 1}`}
                      children={`Remove paragraph ${paragraph + 1}`}
                      size="sm"
                      variant="ghost"
                      isDisabled={disabled}
                      onClick={() =>
                        onEdit({ type: "remove-paragraph", index, paragraph })
                      }
                    />
                  ))}
                {kind === "story" && (
                  <Button
                    label="Add paragraph"
                    size="sm"
                    variant="ghost"
                    isDisabled={disabled}
                    onClick={() => onEdit({ type: "paragraph", index })}
                  />
                )}
              </HStack>
            ))}
            <Button
              label={
                kind === "story" ? "Add story section" : "Add technical section"
              }
              size="sm"
              variant="ghost"
              isDisabled={disabled}
              onClick={() => onEdit({ type: "add", kind })}
            />
          </VStack>
        );
      })}
      <Text>Roadmap</Text>
      {(Array.isArray(data.roadmap)
        ? (data.roadmap as Array<{ text?: string; status?: string }>)
        : []
      ).map((item, index, items) => (
        <VStack key={index} gap={1}>
          <TextInput
            label={`Roadmap item ${index + 1}`}
            value={item.text ?? ""}
            status={status(`roadmap.${index}.text`)}
            isDisabled={disabled}
            onChange={(value) =>
              onEdit({ type: "roadmap-field", index, field: "text", value })
            }
          />
          <HStack gap={1} wrap="wrap" vAlign="center">
            <Selector
              label={`Roadmap item ${index + 1} status`}
              value={item.status ?? "planned"}
              status={status(`roadmap.${index}.status`)}
              options={[
                { value: "planned", label: "Planned" },
                { value: "in-progress", label: "In progress" },
                { value: "done", label: "Done" },
              ]}
              isDisabled={disabled}
              onChange={(value) =>
                onEdit({ type: "roadmap-field", index, field: "status", value })
              }
            />
            <Button
              label={`Move roadmap item ${index + 1} up`}
              children="Up"
              size="sm"
              variant="ghost"
              isDisabled={disabled || index === 0}
              onClick={() =>
                onEdit({ type: "move", kind: "roadmap", index, direction: -1 })
              }
            />
            <Button
              label={`Move roadmap item ${index + 1} down`}
              children="Down"
              size="sm"
              variant="ghost"
              isDisabled={disabled || index === items.length - 1}
              onClick={() =>
                onEdit({ type: "move", kind: "roadmap", index, direction: 1 })
              }
            />
            <Button
              label={`Remove roadmap item ${index + 1}`}
              children="Remove item"
              size="sm"
              variant="ghost"
              isDisabled={disabled}
              onClick={() => onEdit({ type: "remove", kind: "roadmap", index })}
            />
          </HStack>
        </VStack>
      ))}
      <Button
        label="Add roadmap item"
        size="sm"
        variant="ghost"
        isDisabled={disabled}
        onClick={() => onEdit({ type: "add", kind: "roadmap" })}
      />
    </VStack>
  );
}
